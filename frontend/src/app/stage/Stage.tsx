// The stage (W02.P06.S21, ADR G3.a/G3.d): mounts the assembled GPU field
// behind the SceneController seam and feeds it the initial feature
// constellation — feature nodes plus engine-aggregated meta-edges, never
// client-flattened doc edges. React sends commands and subscribes to
// events; the field owns every frame.

import { useEffect, useMemo, useRef, useState } from "react";

import { useQueries, useQueryClient } from "@tanstack/react-query";

import { createDashboardScene } from "../../scene/field/fieldAssembly";
import { graphDeltaToScene, sliceToScene } from "../../scene/sceneMapping";
import { engineClient } from "../../stores/server/engine";
import { useGraphLiveSync } from "../../stores/server/graphSync";
import { useLiveStatusStore } from "../../stores/server/liveStatus";
import {
  engineKeys,
  useGraphSlice,
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
import { Discover } from "./Discover";
import { FilterBar } from "./FilterBar";
import { FilterSidebar } from "./FilterSidebar";
import { MinimapWidget } from "./MinimapWidget";
import { NavToolbar } from "./NavToolbar";
import { WorkingSet, mergeSlices } from "./WorkingSet";

// One scene per app lifetime — survives route remounts; destroyed never.
const scene = createDashboardScene();

/** The active scope: the user's pick (worktree picker, G2.a) or the
 * map's default corpus-bearing worktree. */
export function useActiveScope(): string | null {
  const picked = useViewStore((s) => s.scope);
  const map = useWorkspaceMap();
  return useMemo(() => {
    if (picked) return picked;
    for (const repo of map.data?.repositories ?? []) {
      const preferred =
        repo.worktrees.find((w) => w.is_default && w.has_vault) ??
        repo.worktrees.find((w) => w.has_vault);
      if (preferred) return preferred.id;
    }
    return null;
  }, [picked, map.data]);
}

export function Stage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const scope = useActiveScope();
  const [filterSidebarOpen, setFilterSidebarOpen] = useState(false);
  const [algorithmPanelOpen, setAlgorithmPanelOpen] = useState(false);
  // The top-level stage is the feature constellation (contract §4, ADR
  // D4.1): feature-convergence nodes + engine-aggregated meta-edges. Document
  // structure arrives on descent via the working-set ego expansions below.
  const slice = useGraphSlice(scope, undefined, undefined, "feature");
  const surfaces = useSurfaceStates();
  const openNode = useViewStore((s) => s.openNode);
  const addToWorkingSet = useViewStore((s) => s.addToWorkingSet);
  const workingSet = useViewStore((s) => s.workingSet);
  const pinnedDiscoveries = useViewStore((s) => s.pinnedDiscoveries);

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
  const merged = useMemo(
    () =>
      slice.data
        ? mergeSlices(slice.data, [
            ...expansionData,
            // Session-pinned discovery candidates ride the haze (G3.c).
            { nodes: [], edges: pinnedDiscoveries },
          ])
        : null,
    // expansionData is identity-unstable per render; length plus the base
    // slice identity capture every meaningful change.
    [slice.data, expansionData.length, pinnedDiscoveries],
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
  // the scene animates what the filter removed (G3.f).
  const filterChoices = useFilterStore();
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

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={hostRef} className="absolute inset-0" data-stage-host />
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
      {surfaces.stage === "empty-invitation" ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-sm text-stone-400">
          <span className="text-3xl">✎</span>
          <p>this worktree has no vault corpus yet</p>
          <p className="text-xs text-stone-300">
            run vaultspec-core install to start a second brain here
          </p>
        </div>
      ) : (
        !slice.data && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-stone-300">
            {scope ? "loading the constellation…" : "waiting for a worktree scope…"}
          </div>
        )
      )}
    </div>
  );
}

/** Exposed for consumers outside the component tree (timeline, palette). */
export function getScene() {
  return scene;
}
