// The stage (W02.P06.S21, ADR G3.a/G3.d): mounts the assembled GPU field
// behind the SceneController seam and feeds it the initial feature
// constellation — feature nodes plus engine-aggregated meta-edges, never
// client-flattened doc edges. React sends commands and subscribes to
// events; the field owns every frame.

import { useEffect, useMemo, useRef } from "react";

import { useQueries } from "@tanstack/react-query";

import { createDashboardScene } from "../../scene/field/fieldAssembly";
import { sliceToScene } from "../../scene/sceneMapping";
import { engineClient } from "../../stores/server/engine";
import {
  engineKeys,
  useGraphSlice,
  useWorkspaceMap,
} from "../../stores/server/queries";
import { computeVisibility, useFilterStore } from "../../stores/view/filters";
import { bindPinsToScene, usePinStore } from "../../stores/view/pins";
import { bindSelectionToScene, selectFromScene } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";
import { IslandLayer } from "../islands/IslandLayer";
import { TimeTravelChip } from "../timeline/Playhead";
import { Discover } from "./Discover";
import { FilterBar } from "./FilterBar";
import { WorkingSet, mergeSlices } from "./WorkingSet";

// One scene per app lifetime — survives route remounts; destroyed never.
const scene = createDashboardScene();

/** The active scope: the map's default corpus-bearing worktree until the
 * worktree picker (W03.P09) takes over. */
export function useActiveScope(): string | null {
  const map = useWorkspaceMap();
  return useMemo(() => {
    for (const repo of map.data?.repositories ?? []) {
      const preferred =
        repo.worktrees.find((w) => w.is_default && w.has_vault) ??
        repo.worktrees.find((w) => w.has_vault);
      if (preferred) return preferred.id;
    }
    return null;
  }, [map.data]);
}

export function Stage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const scope = useActiveScope();
  const slice = useGraphSlice(scope);
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
  useEffect(() => {
    if (!merged || !scope) return;
    scene.field.setPersistenceScope("default", scope);
    usePinStore.getState().setScopeKey("default", scope);
    const mapped = sliceToScene(merged);
    scene.controller.command({
      kind: "set-data",
      nodes: mapped.nodes,
      edges: mapped.edges,
    });
  }, [merged, scope]);

  // One filter model, applied as a visibility membership diff (RL-5a):
  // the scene animates what the filter removed (G3.f).
  const filterChoices = useFilterStore();
  const membership = useMemo(
    () =>
      merged ? computeVisibility(merged.nodes, merged.edges, filterChoices) : null,
    [merged, filterChoices],
  );
  useEffect(() => {
    if (!membership) return;
    scene.controller.command({
      kind: "set-visibility",
      visibleNodeIds: membership.visibleNodeIds,
      visibleEdgeIds: membership.visibleEdgeIds,
    });
  }, [membership]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={hostRef} className="absolute inset-0" data-stage-host />
      <FilterBar
        hidden={{
          nodes: membership?.hiddenNodeCount ?? 0,
          edges: membership?.hiddenEdgeCount ?? 0,
        }}
      />
      <WorkingSet />
      <Discover />
      <TimeTravelChip />
      <IslandLayer scene={scene.controller} />
      {!slice.data && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-stone-300">
          {scope ? "loading the constellation…" : "waiting for a worktree scope…"}
        </div>
      )}
    </div>
  );
}

/** Exposed for consumers outside the component tree (timeline, palette). */
export function getScene() {
  return scene;
}
