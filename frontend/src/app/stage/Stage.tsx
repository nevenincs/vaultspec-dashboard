// The stage (W02.P06.S21, ADR G3.a/G3.d): mounts the assembled GPU field
// behind the SceneController seam and feeds it the initial feature
// constellation — feature nodes plus engine-aggregated meta-edges, never
// client-flattened doc edges. React sends commands and subscribes to
// events; the field owns every frame.

import { useEffect, useMemo, useRef, useState } from "react";

import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";

import { createDashboardScene } from "../../scene/field/fieldAssembly";
import { graphDeltaToScene, sliceToScene } from "../../scene/sceneMapping";
import { engineClient } from "../../stores/server/engine";
import { useGraphLiveSync } from "../../stores/server/graphSync";
import { useLiveStatusStore } from "../../stores/server/liveStatus";
import {
  engineKeys,
  useGraphSlice,
  useGraphSliceAvailability,
  usePutSession,
  useSession,
  useWorkspaceMap,
} from "../../stores/server/queries";
import { computeVisibility, useFilterStore } from "../../stores/view/filters";
import { useLensStore } from "../../stores/view/lenses";
import { bindPinsToScene, usePinStore } from "../../stores/view/pins";
import { bindSelectionToScene, selectFromScene } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";
import { useSurfaceStates } from "../degradation/useDegradation";
import { IslandLayer } from "../islands/IslandLayer";
import { TimeTravelChip } from "../timeline/Playhead";
import { useTimeTravel } from "../timeline/timeTravel";
import { AlgorithmPanel } from "./AlgorithmPanel";
import { CanvasStateOverlay, resolveCanvasState } from "./CanvasStateOverlay";
import { Discover } from "./Discover";
import { useGraphWalkKeyboard } from "./graphWalk";
import { FilterBar } from "./FilterBar";
import { FilterSidebar } from "./FilterSidebar";
import { MinimapWidget } from "./MinimapWidget";
import { NavToolbar } from "./NavToolbar";
import { WorkingSet, mergeSlices } from "./WorkingSet";

// One scene per app lifetime — survives route remounts; destroyed never.
const scene = createDashboardScene();

/** The map's default corpus-bearing worktree (the cold-start fallback when no
 *  session has been persisted yet): the default vault worktree, else the first
 *  vault-bearing one. Null when the map has no vault-bearing worktree. */
function mapDefaultScope(map: ReturnType<typeof useWorkspaceMap>): string | null {
  for (const repo of map.data?.repositories ?? []) {
    const preferred =
      repo.worktrees.find((w) => w.is_default && w.has_vault) ??
      repo.worktrees.find((w) => w.has_vault);
    if (preferred) return preferred.id;
  }
  return null;
}

/**
 * The active scope, restored on load (user-state-persistence W04.P09.S29).
 *
 * Pure READ hook — precedence, highest first:
 *  1. the user's explicit in-session pick (`viewStore.scope`, set by the worktree
 *     picker) — a fresh selection always wins;
 *  2. the PERSISTED session's `active_scope` (read through the `useSession`
 *     stores hook) — this is the reload-amnesia cure: a reload restores the last
 *     selected worktree instead of recomputing a default;
 *  3. the map's default corpus-bearing worktree — the cold-start fallback when no
 *     session scope exists yet; `useRestoreSessionScope` (mounted once in Stage)
 *     persists that initial choice so the next reload takes path (2).
 *
 * The restore flows entirely through the `useSession` stores hook; the chrome
 * never fetches and never reads the raw tiers block (dashboard-layer-ownership).
 * This hook has NO side effects — it is read by ~nine surfaces, so the cold-start
 * persist lives in one place (`useRestoreSessionScope`), not here.
 */
export function useActiveScope(): string | null {
  const picked = useViewStore((s) => s.scope);
  const map = useWorkspaceMap();
  const session = useSession();

  const persisted = session.data?.active_scope || null;
  const fallback = mapDefaultScope(map);

  return useMemo(() => {
    if (picked) return picked;
    if (persisted) return persisted;
    return fallback;
  }, [picked, persisted, fallback]);
}

/**
 * Persist the cold-start default scope ONCE (W04.P09.S29). Mounted exactly once,
 * in Stage (one scene per app lifetime), so the write fires from a single owner
 * rather than from every `useActiveScope` consumer. The effect runs only when
 * the session has loaded with no active scope, the user has not picked one, and
 * a vault-bearing default exists; the mutation's non-idle state then latches it
 * off, and `onSuccess` flips `active_scope` truthy so it never re-fires. This is
 * what makes the first ever choice durable — every subsequent reload restores it
 * through `useSession` instead of recomputing the map default.
 */
function useRestoreSessionScope(): void {
  const picked = useViewStore((s) => s.scope);
  const map = useWorkspaceMap();
  const session = useSession();
  const putSession = usePutSession();
  // Explicit one-shot latch: the cold-start default is persisted at most once
  // per mount, independent of the mutation object's per-render identity. The
  // `!isIdle`/`persisted` guards still hold, but the ref makes the intent
  // explicit rather than relying on mutation state for re-entry safety.
  const attemptedRef = useRef(false);

  const persisted = session.data?.active_scope || null;
  const fallback = mapDefaultScope(map);

  useEffect(() => {
    if (attemptedRef.current) return;
    if (picked) return;
    if (!session.isSuccess) return;
    if (persisted) return;
    if (!fallback) return;
    if (!putSession.isIdle) return;
    attemptedRef.current = true;
    putSession.mutate({ active_scope: fallback });
  }, [picked, session.isSuccess, persisted, fallback, putSession]);
}

/**
 * Seed the view store's scope + folder context from the restored session
 * (W04.P09.S30). Mounted once in Stage. On the FIRST successful session load it
 * mirrors the durable `{ active_scope, scope_context }` into the view store via
 * `seedFromSession` — restoring "which worktree, which folder, which contexts"
 * without triggering the wholesale scope-swap reset (that is for a user pick).
 * A `seededRef` latch makes this a one-shot per mount, so a later session
 * re-fetch (e.g. after a mutation) never clobbers the user's in-session edits.
 */
function useSeedSessionContext(): void {
  const session = useSession();
  const seedFromSession = useViewStore((s) => s.seedFromSession);
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    if (!session.isSuccess || !session.data) return;
    seededRef.current = true;
    const data = session.data;
    seedFromSession({
      scope: data.active_scope || null,
      folder: data.scope_context.folder,
      featureTags: data.scope_context.feature_tags,
    });
  }, [session.isSuccess, session.data, seedFromSession]);
}

export function Stage() {
  const hostRef = useRef<HTMLDivElement>(null);
  // The host element is tracked as state so the keyboard graph-walk binds once
  // it is in the DOM (a ref alone never re-runs the binding effect).
  const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);
  // Restore the persisted session on load: the scope cold-start persist (S29)
  // and the scope+folder context seed (S30) both fire from this single owner,
  // since Stage mounts once per app lifetime.
  useRestoreSessionScope();
  useSeedSessionContext();
  const scope = useActiveScope();
  const [filterSidebarOpen, setFilterSidebarOpen] = useState(false);
  const [algorithmPanelOpen, setAlgorithmPanelOpen] = useState(false);
  // Granularity is user-switchable (NavToolbar toggle): "feature" renders the
  // constellation overview (~12 nodes, ADR D4.1); "document" renders the
  // full document graph (~200 nodes, the Obsidian mental model). Resets to
  // "feature" on scope swap (viewStore.setScope).
  const granularity = useViewStore((s) => s.granularity);
  const slice = useGraphSlice(scope, undefined, undefined, granularity);
  const availability = useGraphSliceAvailability(scope, granularity);
  const surfaces = useSurfaceStates();
  const openNode = useViewStore((s) => s.openNode);
  const addToWorkingSet = useViewStore((s) => s.addToWorkingSet);
  const workingSet = useViewStore((s) => s.workingSet);
  const pinnedDiscoveries = useViewStore((s) => s.pinnedDiscoveries);

  // Stable graph-walk handlers reading live store state (so the keyboard binding
  // never re-mounts): walk and open route through `selectFromScene` (the scene-
  // origin path that selects WITHOUT bouncing the camera focus the user is
  // already on), open also unfolds the island, expand adds the ego to the
  // working set. All are instant shared-store writes — no animation (ADR motion
  // law: keyboard actions never animate).
  const walkHandlersRef = useRef({
    selectedId: () => {
      const sel = useViewStore.getState().selection;
      return sel?.kind === "node" ? sel.id : null;
    },
    select: (id: string | null) => selectFromScene(id),
    open: (id: string) => {
      selectFromScene(id);
      useViewStore.getState().openNode(id);
    },
    expand: (id: string) => useViewStore.getState().addToWorkingSet(id),
  });

  // Each working-set entry materializes its ego network on stage (G3.b).
  const expansions = useQueries({
    queries: workingSet.map((id) => ({
      queryKey: engineKeys.neighbors(id, 1),
      queryFn: () => engineClient.nodeNeighbors(id, { depth: 1 }),
    })),
  });

  // Mount the field into the host; resize observation keeps it fitted.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    scene.controller.mount(host);
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) scene.controller.resize(rect.width, rect.height);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // Seam events → the shared view state (selection is one concept, G2.b);
  // store selections from OTHER regions flow back as focus commands.
  useEffect(() => {
    const offEvents = scene.controller.on((event) => {
      if (event.kind === "select") selectFromScene(event.id);
      if (event.kind === "open") {
        selectFromScene(event.id);
        openNode(event.id);
      }
      if (event.kind === "expand") addToWorkingSet(event.id);
    });
    const offBind = bindSelectionToScene(scene.controller);
    const offPins = bindPinsToScene(scene.controller);
    return () => {
      offEvents();
      offBind();
      offPins();
    };
  }, [openNode, addToWorkingSet]);

  // Constellation + working-set expansions → seam command (keyframe path).
  const expansionData = expansions
    .map((q) => q.data)
    .filter((d): d is NonNullable<typeof d> => d !== undefined);
  // Content signature (P-LOW-5): `dataUpdatedAt` bumps on every successful
  // (re)fetch, so a neighbors refetch returning DIFFERENT data for the same id
  // recomputes `merged` even when the expansion count is unchanged — the old
  // `expansionData.length` proxy missed same-count content changes.
  const expansionSig = expansions.map((q) => q.dataUpdatedAt).join(",");
  const merged = useMemo(
    () =>
      slice.data
        ? mergeSlices(slice.data, [
            ...expansionData,
            // Session-pinned discovery candidates ride the haze (G3.c).
            { nodes: [], edges: pinnedDiscoveries },
          ])
        : null,
    [slice.data, expansionSig, pinnedDiscoveries],
  );
  // Persistence re-keys on EVERY scope change, independent of timeline
  // mode and slice readiness (finding pin-rekey-gated-on-live-023): a swap
  // during time travel must never leave pins or lenses writing under the
  // previous scope's storage key.
  useEffect(() => {
    if (!scope) return;
    scene.field.setPersistenceScope("default", scope);
    usePinStore.getState().setScopeKey("default", scope);
    useLensStore.getState().setScopeKey("default", scope);
  }, [scope]);

  // While time travelling the driver owns the stage's data (S34); the
  // live keyframe path resumes — and re-pushes — on return to LIVE.
  const timelineMode = useViewStore((s) => s.timelineMode);
  useTimeTravel(scope, scene.controller);
  const queryClient = useQueryClient();
  // LIVE-mode reactivity (live-state D3 / constellation-live-delta S06):
  // subscribe with `since=keyframeSeq` when available so only new deltas
  // arrive; feature-granularity entries come back as `featureDeltas` for
  // direct scene splice; `gapCount` increments on seq discontinuity.
  const { featureDeltas, gapCount } = useGraphLiveSync(
    scope,
    timelineMode.kind === "live",
    slice.data?.last_seq ?? null,
  );
  useEffect(() => {
    if (!merged || !scope || timelineMode.kind !== "live") return;
    const mapped = sliceToScene(merged);
    scene.controller.command({
      kind: "set-data",
      nodes: mapped.nodes,
      edges: mapped.edges,
    });
  }, [merged, scope, timelineMode.kind]);

  // spliceLive: route feature-granularity deltas directly to the scene so
  // feature-node and meta-edge changes animate without a constellation refetch.
  useEffect(() => {
    if (!featureDeltas.length || !scope || timelineMode.kind !== "live") return;
    const deltas = featureDeltas
      .map((entry) => graphDeltaToScene(entry))
      .filter((d): d is NonNullable<typeof d> => d !== null);
    if (!deltas.length) return;
    scene.controller.command({
      kind: "apply-deltas",
      deltas,
      seq: deltas[deltas.length - 1]!.seq,
    });
  }, [featureDeltas, scope, timelineMode.kind]);

  // Gap fallback: a seq discontinuity means we missed deltas. Invalidate the
  // constellation so TanStack refetches a fresh keyframe (the resilient floor
  // from the live-state ADR). `gapCount` increments once per gap, so this
  // effect fires exactly once per event.
  useEffect(() => {
    if (!gapCount || !scope) return;
    void queryClient.invalidateQueries({
      queryKey: [...engineKeys.all, "graph", scope],
      exact: false,
    });
  }, [gapCount, scope, queryClient]);

  // One filter model, applied as a visibility membership diff (RL-5a):
  // the scene animates what the filter removed (G3.f). Subscribe ONLY to the
  // choice fields (not the setters) via a shallow selector (P-MED-14), so a
  // setter-identity change or an unrelated store write does not re-render the
  // stage - the heaviest component and owner of the scene effects.
  const filterChoices = useFilterStore(
    useShallow((s) => ({
      tiers: s.tiers,
      minConfidence: s.minConfidence,
      docTypes: s.docTypes,
      featureTags: s.featureTags,
      relations: s.relations,
      structuralStates: s.structuralStates,
      textMatch: s.textMatch,
      dateRange: s.dateRange,
    })),
  );
  const membership = useMemo(
    () =>
      merged ? computeVisibility(merged.nodes, merged.edges, filterChoices) : null,
    [merged, filterChoices],
  );
  useEffect(() => {
    // Membership computes over the LIVE slice; while the scene holds a
    // historical set-data it must not be overwritten (finding
    // timetravel-visibility-stale-021).
    if (!membership || timelineMode.kind !== "live") return;
    scene.controller.command({
      kind: "set-visibility",
      visibleNodeIds: membership.visibleNodeIds,
      visibleEdgeIds: membership.visibleEdgeIds,
    });
  }, [membership, timelineMode.kind]);

  // Surface the structural-broken degradation truth (live-state D4): a pure
  // reduction over the held slice's broken edges feeds the degradation matrix,
  // replacing the old hardwired zero (GUI finding 036). Empty when no slice is
  // held, so a scope swap never leaves a stale count.
  useEffect(() => {
    const broken = merged
      ? merged.edges.filter((edge) => edge.state === "broken").length
      : 0;
    useLiveStatusStore.getState().setBrokenLinkCount(broken);
  }, [merged]);

  // Keyboard graph-walk (node-canvas ADR "Keyboard operability"): the focused
  // node walks its edges across the held slice; select/open/expand have keyboard
  // equivalents, all INSTANT shared-store state. The graph and handlers are read
  // lazily so the binding survives across slice refetches without re-running.
  // mergedRef keeps the latest slice readable from the bound listener.
  const mergedRef = useRef(merged);
  mergedRef.current = merged;
  // Stable getter (a ref) so the keyboard binding keys on the host alone and is
  // not re-bound each render; it reads the latest held slice at call time.
  const graphGetterRef = useRef(() => mergedRef.current ?? { nodes: [], edges: [] });
  useGraphWalkKeyboard(hostEl, graphGetterRef.current, walkHandlersRef.current);

  // Resolve the one designed canvas state from stores-derived truth — the
  // chrome half of the ADR's "every wire condition is a designed state" mandate.
  const canvasState = resolveCanvasState({
    scope,
    granularity,
    stageSurface: surfaces.stage,
    slice: slice.data ?? null,
    availability,
  });

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={(el) => {
          hostRef.current = el;
          setHostEl(el);
        }}
        // Focusable so keyboard graph-walk can own the canvas (ADR keyboard
        // operability). aria-label names the surface for screen readers.
        tabIndex={0}
        role="application"
        aria-label="node canvas — arrow keys walk the graph, Enter opens, e expands"
        className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-state-active/40"
        data-stage-host
      />
      <FilterBar
        hidden={{
          nodes: membership?.hiddenNodeCount ?? 0,
          edges: membership?.hiddenEdgeCount ?? 0,
        }}
        sidebarOpen={filterSidebarOpen}
        onSidebarToggle={() => setFilterSidebarOpen((v) => !v)}
      />
      <NavToolbar
        algorithmPanelOpen={algorithmPanelOpen}
        onAlgorithmPanelToggle={() => setAlgorithmPanelOpen((v) => !v)}
      />
      <FilterSidebar
        open={filterSidebarOpen}
        onClose={() => setFilterSidebarOpen(false)}
        scope={scope}
        hidden={{
          nodes: membership?.hiddenNodeCount ?? 0,
          edges: membership?.hiddenEdgeCount ?? 0,
        }}
      />
      {algorithmPanelOpen && (
        <AlgorithmPanel onClose={() => setAlgorithmPanelOpen(false)} />
      )}
      <MinimapWidget />
      <WorkingSet />
      <Discover />
      <TimeTravelChip />
      <IslandLayer scene={scene.controller} />
      <CanvasStateOverlay state={canvasState} />
    </div>
  );
}

/** Exposed for consumers outside the component tree (timeline, palette). */
export function getScene() {
  return scene;
}
