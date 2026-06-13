// Time travel (W02.P08.S34, ADR G4.b): the playhead drives the stage's
// temporal state through asof keyframes plus client-held diff-log replay —
// 60fps scrub with zero per-frame queries; full re-keyframe only on jumps
// outside the loaded range. The DeltaLog (S06, seq-driven cursor per
// finding 005) does the replay; this driver owns fetching, range policy,
// and pushing materialized slices through the seam.

import { useEffect, useRef } from "react";

import type { SceneGraphModel } from "../../scene/graphModel";
import { DeltaLog } from "../../scene/deltaLog";
import { engineClient } from "../../stores/server/engine";
import { useViewStore } from "../../stores/view/viewStore";
import type {
  SceneController,
  SceneDelta,
  SceneEdgeData,
  SceneNodeData,
} from "../../scene/sceneController";
import type { EngineClient, GraphDeltaEntry } from "../../stores/server/engine";
import { engineEdgeToScene, engineNodeToScene } from "../../scene/sceneMapping";

/** Loaded-range margin behind the requested T (local backward scrub room). */
export const KEYFRAME_BACK_MARGIN_MS = 14 * 24 * 3600_000;

/** Map one wire diff entry onto the seam's delta shape. */
export function mapDelta(entry: GraphDeltaEntry): SceneDelta {
  return {
    op: entry.op,
    node: entry.node ? engineNodeToScene(entry.node) : undefined,
    edge: entry.edge ? engineEdgeToScene(entry.edge) : undefined,
    t: entry.t,
    seq: entry.seq,
  };
}

export interface TimeTravelTarget {
  /** Push a materialized historical slice to the scene. */
  pushSlice(nodes: SceneNodeData[], edges: SceneEdgeData[], at: number | "live"): void;
}

/** Default target: set-data + set-time through the locked seam. */
export function sceneTarget(scene: SceneController): TimeTravelTarget {
  return {
    pushSlice(nodes, edges, at) {
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
    private client: EngineClient,
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
    const asof = await this.client.graphAsof({ scope: this.scope, t: anchor });
    const diff = await this.client.graphDiff({
      scope: this.scope,
      from: anchor,
      to: now,
    });
    // A newer scrub superseded this load; let it win.
    if (this.loadingFor !== t) return;
    const diffDeltas = diff.deltas.map(mapDelta);
    // Normalize wire fields: `t` is echoed as a string when the caller passed
    // a ms-timestamp; `last_seq` is null on historical views (engine does not
    // yet carry the seq position at the snapshot — S50 gap). Derive a
    // splice-safe keyframe seq from the diff batch's first entry so the
    // `append` call below never sees a gap (diff starts exactly where the
    // asof snapshot ends on the shared clock).
    const keyframeSeq =
      asof.last_seq != null ? asof.last_seq : (diffDeltas[0]?.seq ?? 1) - 1;
    this.log.setKeyframe({
      nodes: asof.nodes.map(engineNodeToScene),
      edges: asof.edges.map(engineEdgeToScene),
      t: Number(asof.t),
      seq: keyframeSeq,
    });
    const result = this.log.append(diffDeltas);
    this.loaded = { from: anchor, to: result.gap ? anchor : now };
    this.loadingFor = null;
    this.pushAt(t, this.log.replayTo(t));
  }

  /** Splice live graph-channel deltas (same clock, same code path). */
  spliceLive(entries: readonly GraphDeltaEntry[]): void {
    if (this.log.needsKeyframe) return;
    const result = this.log.append(entries.map(mapDelta));
    if (!result.gap && this.loaded) this.loaded.to = Date.now();
  }

  /** The resume point for the live stream's since= (§7). */
  get lastSeq(): number | null {
    return this.log.lastSeq;
  }

  private pushAt(t: number, model: SceneGraphModel): void {
    this.target.pushSlice([...model.nodes], [...model.edges], t);
  }
}

/**
 * Bind the shared timeline mode to the scene: time-travel scrubs drive
 * historical slices through the driver; returning to live hands the stage
 * back to the live keyframe path (the Stage's own data effect).
 */
export function useTimeTravel(scope: string | null, scene: SceneController): void {
  const mode = useViewStore((s) => s.timelineMode);
  const driver = useRef<TimeTravelDriver | null>(null);

  useEffect(() => {
    driver.current = scope
      ? new TimeTravelDriver(engineClient, scope, sceneTarget(scene))
      : null;
  }, [scope, scene]);

  useEffect(() => {
    if (mode.kind === "time-travel") {
      void driver.current?.scrubTo(mode.at);
    } else {
      scene.command({ kind: "set-time", at: "live" });
    }
  }, [mode, scene]);
}
