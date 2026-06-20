// Time travel (W02.P08.S34, re-affirmed W03.P07.S44; ADR G4.b + dashboard-
// timeline ADR "Time-travel mode (inherited, re-affirmed)"): the playhead drives
// the stage's temporal state through asof keyframes plus client-held diff-log
// replay — 60fps scrub with zero per-frame queries; full re-keyframe only on
// jumps outside the loaded range. The DeltaLog (S06, seq-driven cursor per
// finding 005) does the replay; this driver owns fetching, range policy, and
// pushing materialized slices through the seam.
//
// Retained-and-adapted to the scroll-strip representation (S44): the driver is
// coordinate-model-agnostic by design — it operates on absolute epoch-ms instants
// (the `mode.at` the playhead writes), never on window/positioning, so the
// scroll-strip supersession of the fit-to-window model changes nothing here. The
// invariants are re-affirmed unchanged: the keyframe-plus-diff replay runs on the
// ONE shared delta clock (no second clock — the LIVE splice stays in
// `useGraphLiveSync`), the local DeltaLog replays when the range is loaded, an
// out-of-range jump re-keyframes, and dashboard `timeline_mode` binds to the
// scene seam.

import { useEffect, useRef } from "react";

import type { SceneGraphModel } from "../../scene/graphModel";
import { DeltaLog } from "../../scene/deltaLog";
import { useDashboardTimelineModeView } from "../../stores/server/queries";
import { normalizeTimelineScope } from "../../stores/view/timeline";
import {
  timeTravelSource,
  type TimeTravelSource,
} from "../../stores/server/timeTravelSource";
import { setLiveBrokenLinkCountFromEdges } from "../../stores/server/liveStatus";
import type {
  SceneController,
  SceneDelta,
  SceneEdgeData,
  SceneNodeData,
} from "../../scene/sceneController";
import type { DashboardTimelineMode } from "../../stores/server/engine";
import { graphDeltaToScene, sliceToScene } from "../../scene/sceneMapping";

/** Loaded-range margin behind the requested T (local backward scrub room). */
export const KEYFRAME_BACK_MARGIN_MS = 14 * 24 * 3600_000;

// --- time-travel honesty: read off the ONE shared mode (S61) -------------------
//
// Time-travel honesty (ADR "Time-travel mode") is driven from a SINGLE truth:
// canonical dashboard `timeline_mode`, written through `movePlayhead`
// (Playhead.tsx). Every honesty cue reads that one mode and never re-derives the
// state per-surface:
//   - the stage warm tint + the "viewing {date} — return to live" chip
//     (TimeTravelChip) render off dashboard state;
//   - operational verbs disable off the same mode (OpsPanel);
//   - the semantic tier renders INAPPLICABLE off the same mode (TierDial,
//     `isTierInapplicable`);
//   - this driver scrubs the stage's historical slice off the same mode
//     (`useTimeTravel` below).
// The predicates here name that single reading so no surface invents its own
// "are we time travelling?" test or guesses the disable from a transport state.

/**
 * True when the shared mode is time-travel — the one honesty predicate (S61). A
 * type predicate so a single reading both gates the honesty cues AND narrows the
 * mode to its `time-travel` variant, so callers reach `mode.at` off the same one
 * reading rather than re-testing `mode.kind`.
 */
export function isTimeTravel(
  mode: DashboardTimelineMode,
): mode is Extract<DashboardTimelineMode, { kind: "time-travel" }> {
  return mode.kind === "time-travel";
}

/** True when the live keyframe/delta path owns the scene. */
export function isLiveTimelineMode(
  mode: DashboardTimelineMode,
): mode is Extract<DashboardTimelineMode, { kind: "live" }> {
  return !isTimeTravel(mode);
}

/**
 * True when operational verbs must be DISABLED (S61): history is read-only, so
 * any time-travel mode disables ops. A single reading of the shared mode — the
 * disable is never guessed from an error or re-derived per panel.
 */
export function opsDisabledFor(mode: DashboardTimelineMode): boolean {
  return isTimeTravel(mode);
}

/** The historical instant for selectors that re-query in time-travel; live is undefined. */
export function timeTravelAsOf(mode: DashboardTimelineMode): number | undefined {
  return isTimeTravel(mode) ? mode.at : undefined;
}

/** Map one wire diff entry onto the seam's delta shape. */
export function mapDelta(entry: unknown): SceneDelta | null {
  return graphDeltaToScene(entry);
}

export interface TimeTravelTarget {
  /** Push a materialized historical slice to the scene. */
  pushSlice(nodes: SceneNodeData[], edges: SceneEdgeData[], at: number | "live"): void;
}

/** Default target: set-data + set-time through the locked seam. */
export function sceneTarget(scene: SceneController): TimeTravelTarget {
  return {
    pushSlice(nodes, edges, at) {
      setLiveBrokenLinkCountFromEdges(edges);
      scene.command({ kind: "set-data", nodes, edges });
      scene.command({ kind: "set-time", at });
    },
  };
}

export class TimeTravelDriver {
  private log = new DeltaLog();
  private loaded: { from: number; to: number } | null = null;
  private loadingFor: number | null = null;

  constructor(
    private source: TimeTravelSource,
    private scope: string,
    private target: TimeTravelTarget,
  ) {}

  /** True when T can be served locally (no fetch needed). */
  hasRange(t: number): boolean {
    return (
      this.loaded !== null &&
      !this.log.needsKeyframe &&
      t >= this.loaded.from &&
      t <= this.loaded.to
    );
  }

  /**
   * Scrub to T: local replay when the range is loaded, otherwise a
   * re-keyframe fetch (asof at T minus margin + diff to now) and then the
   * replay. Concurrent scrubs while loading coalesce to the latest T.
   */
  async scrubTo(t: number): Promise<void> {
    if (this.hasRange(t)) {
      this.pushAt(t, this.log.replayTo(t));
      return;
    }
    this.loadingFor = t;
    const anchor = t - KEYFRAME_BACK_MARGIN_MS;
    const now = Date.now();
    const asof = await this.source.asof(this.scope, anchor);
    const diff = await this.source.diff(this.scope, anchor, now);
    // A newer scrub superseded this load; let it win.
    if (this.loadingFor !== t) return;
    const diffDeltas = diff.deltas
      .map(mapDelta)
      .filter((delta): delta is SceneDelta => delta !== null);
    // Normalize wire fields: `t` is echoed as a string when the caller passed
    // a ms-timestamp; `last_seq` is null on historical views (engine does not
    // yet carry the seq position at the snapshot — S50 gap). Derive a
    // splice-safe keyframe seq from the diff batch's first entry so the
    // `append` call below never sees a gap (diff starts exactly where the
    // asof snapshot ends on the shared clock).
    const keyframeSeq =
      asof.last_seq != null ? asof.last_seq : (diffDeltas[0]?.seq ?? 1) - 1;
    const keyframe = sliceToScene(asof);
    this.log.setKeyframe({
      nodes: keyframe.nodes,
      edges: keyframe.edges,
      t: Number(asof.t),
      seq: keyframeSeq,
    });
    const result = this.log.append(diffDeltas);
    this.loaded = { from: anchor, to: result.gap ? anchor : now };
    this.loadingFor = null;
    this.pushAt(t, this.log.replayTo(t));
  }

  // NB: the LIVE feature-delta splice runs in `useGraphLiveSync` + Stage
  // (apply-deltas), the single production live path. The earlier
  // DeltaLog-based `spliceLive` here was a second, unused contract and was
  // removed (review LOW-1); this driver owns time-travel scrub only.

  private pushAt(t: number, model: SceneGraphModel): void {
    this.target.pushSlice([...model.nodes], [...model.edges], t);
  }
}

/**
 * Bind the shared timeline mode to the scene: time-travel scrubs drive
 * historical slices through the driver; returning to live hands the stage
 * back to the live keyframe path (the Stage's own data effect).
 */
export function useTimeTravel(scope: unknown, scene: SceneController): void {
  const normalizedScope = normalizeTimelineScope(scope);
  const timeline = useDashboardTimelineModeView(normalizedScope);
  const mode = timeline.mode;
  const driver = useRef<TimeTravelDriver | null>(null);

  useEffect(() => {
    driver.current = normalizedScope
      ? new TimeTravelDriver(timeTravelSource, normalizedScope, sceneTarget(scene))
      : null;
  }, [normalizedScope, scene]);

  useEffect(() => {
    if (isTimeTravel(mode)) {
      void driver.current?.scrubTo(mode.at);
    } else {
      scene.command({ kind: "set-time", at: "live" });
    }
  }, [mode, scene]);
}
