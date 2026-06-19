// The stage (W02.P06.S21, ADR G3.a/G3.d): mounts the assembled GPU field
// behind the SceneController seam and feeds it the initial feature
// constellation — feature nodes plus engine-aggregated meta-edges, never
// client-flattened doc edges. React sends commands and subscribes to
// events; the field owns every frame.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createDashboardScene } from "../../scene/field/fieldAssembly";
import { graphDeltasToApplyCommand } from "../../scene/sceneMapping";
import { useDashboardStageSceneIntent } from "../../stores/server/dashboardStageSceneIntent";
import { useGraphLiveSync } from "../../stores/server/graphSync";
import {
  countBrokenLinks,
  setLiveBrokenLinkCount,
} from "../../stores/server/liveStatus";
import {
  useActiveScope,
  useActiveWorkspace,
  useDashboardFilterChoices,
  useDashboardStageSceneView,
  useGraphSlice,
  useGraphSliceAvailability,
  useNodeNeighborsBulk,
} from "../../stores/server/queries";
import {
  useRestoreSessionScope,
  useSeedSessionContext,
} from "../../stores/server/sessionContext";
import { computeVisibility, visibilitySceneCommand } from "../../stores/view/filters";
import {
  stageBoundsCommand,
  stageOverlaysCommand,
  stageRepresentationCommand,
  stageSetDataCommand,
} from "../../stores/view/stageSceneCommands";
import { reconcileGraphAffordances } from "../../stores/view/graphAffordances";
import { useGraphOverlays } from "../../stores/view/graphOverlays";
import { usePinnedDiscoveries } from "../../stores/view/discoveries";
import { bindPinsToScene } from "../../stores/view/pins";
import {
  focusFromWalk,
  openNodeIslandFromWalk,
  projectDashboardSelectionToScene,
  selectFromScene,
} from "../../stores/view/selection";
import { handleStageSceneEvent } from "../../stores/view/stageSceneEvents";
import { expandWorkingSet, useWorkingSet } from "../../stores/view/workingSet";
import { useSurfaceStates } from "../degradation/useDegradation";
import { HoverCardLayer } from "../islands/HoverCardLayer";
import { IslandLayer } from "../islands/IslandLayer";
import { TimeTravelChip } from "../timeline/Playhead";
import { useTimeTravel } from "../timeline/timeTravel";
import { CanvasStateOverlay, resolveCanvasState } from "./CanvasStateOverlay";
import { CategoryLegend } from "./CategoryLegend";
import { MinimapWidget } from "./MinimapWidget";
import { Discover } from "./Discover";
import { useGraphWalkKeyboard } from "./graphWalk";
import { StageNavBar } from "./StageNavBar";
import { WorkingSet, mergeSlices } from "./WorkingSet";

// One scene singleton per app lifetime: the object survives route remounts, but
// its renderer is released on unmount (F#1) and rebuilt on remount.
const scene = createDashboardScene();

export function useSceneSelectionBridge(
  scope: string | null,
  sceneSelectionOriginatedRef: { current: boolean },
): void {
  useEffect(() => {
    const offEvents = scene.controller.on((event) => {
      if (event.kind !== "select") return;
      void selectFromScene(event.id, scope, (originated = true) => {
        sceneSelectionOriginatedRef.current = originated;
      }).catch(() => undefined);
    });
    return offEvents;
  }, [scope, sceneSelectionOriginatedRef]);
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
  const activeWorkspace = useActiveWorkspace();
  const stageView = useDashboardStageSceneView(scope);
  const stageSceneIntent = useDashboardStageSceneIntent(scope);
  const {
    selectedIds,
    selectedNodeId,
    graphQuery,
    granularity,
    activeRepresentationMode,
    graphBounds,
    liveTimeline,
  } = stageView;
  const graphScope = graphQuery?.scope ?? null;
  const slice = useGraphSlice(
    graphScope,
    graphQuery?.filter,
    graphQuery?.asOf,
    graphQuery?.granularity,
    graphQuery?.lens,
    graphQuery?.focus,
  );
  // The active representation mode + overlay visibility (graph-representation
  // ADR): view state the chrome owns and emits to the scene. A mode switch
  // re-lays-out the CURRENT set (no re-query); the lens re-query is the slice key
  // change above. Composition sequencing (lens re-query then mode re-layout) is
  // realized by these two being independent reactive inputs.
  const overlays = useGraphOverlays();
  const availability = useGraphSliceAvailability(slice, graphScope !== null);
  const surfaces = useSurfaceStates();
  const workingSet = useWorkingSet();
  const pinnedDiscoveries = usePinnedDiscoveries();
  const sceneSelectionOriginatedRef = useRef(false);
  useSceneSelectionBridge(scope, sceneSelectionOriginatedRef);
  const scopeRef = useRef(scope);
  const activeRepresentationModeRef = useRef(activeRepresentationMode);
  const stageSceneIntentRef = useRef(stageSceneIntent);
  scopeRef.current = scope;
  activeRepresentationModeRef.current = activeRepresentationMode;
  stageSceneIntentRef.current = stageSceneIntent;

  // Stable graph-walk handlers reading canonical dashboard state (so the
  // keyboard binding never re-mounts): a walk emits the dashboard selection
  // mutation and instantly re-centers the camera (`focus-node animate:false`).
  // Open re-centers and unfolds the island; expand adds the ego to the working
  // set; clearing deselects through canonical state.
  const walkHandlersRef = useRef({
    selectedId: () => {
      return selectedNodeId;
    },
    select: (id: string | null) => {
      void focusFromWalk(scene.controller, id, scope, (originated = true) => {
        sceneSelectionOriginatedRef.current = originated;
      }).catch(() => undefined);
    },
    open: (id: string) => {
      void openNodeIslandFromWalk(scene.controller, id, scope, (originated = true) => {
        sceneSelectionOriginatedRef.current = originated;
      }).catch(() => undefined);
    },
    expand: (id: string) => expandWorkingSet(id),
  });
  walkHandlersRef.current = {
    selectedId: () => selectedNodeId,
    select: (id: string | null) => {
      void focusFromWalk(scene.controller, id, scope, (originated = true) => {
        sceneSelectionOriginatedRef.current = originated;
      }).catch(() => undefined);
    },
    open: (id: string) => {
      void openNodeIslandFromWalk(scene.controller, id, scope, (originated = true) => {
        sceneSelectionOriginatedRef.current = originated;
      }).catch(() => undefined);
    },
    expand: (id: string) => expandWorkingSet(id),
  };

  // Each working-set entry materializes its ego network on stage (G3.b). The
  // fan-out lives behind the stores boundary (useNodeNeighborsBulk, F-H1) so the
  // app layer never calls the engine client directly (dashboard-layer-ownership).
  const expansions = useNodeNeighborsBulk(workingSet, scope, 1);

  // Mount the field into the host; resize observation keeps it fitted.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    scene.controller.mount(host);
    // Dev-only handle for the adverse/visual/interaction test harness (mirrors
    // main.tsx's __platformRingBuffer/__liveStatusControls dev globals). Never
    // exposed in a production build. Lets the browser automation drive the seam
    // and read field internals without crossing the layer boundary in app code.
    if (import.meta.env.DEV) {
      (globalThis as unknown as { __scene?: typeof scene }).__scene = scene;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) scene.controller.resize(rect.width, rect.height);
    });
    observer.observe(host);
    // Reversible teardown: on unmount, release the Cosmos canvas and listeners.
    // The scene singleton survives; its renderer is rebuilt on the next mount.
    return () => {
      observer.disconnect();
      scene.controller.destroy();
    };
  }, []);

  // Seam events → shared dashboard-state and view-local chrome metadata. Scene
  // selection is bridged by `useSceneSelectionBridge`; the remaining gestures
  // and renderer echoes are interpreted by the stores/view event bridge.
  useEffect(() => {
    const offEvents = scene.controller.on((event) => {
      handleStageSceneEvent(event, {
        scope: scopeRef.current,
        activeRepresentationMode: activeRepresentationModeRef.current,
        stageSceneIntent: stageSceneIntentRef.current,
        markSceneOriginated: (originated = true) => {
          sceneSelectionOriginatedRef.current = originated;
        },
      });
    });
    const offPins = bindPinsToScene(scene.controller);
    return () => {
      offEvents();
      offPins();
    };
  }, [sceneSelectionOriginatedRef]);

  useEffect(() => {
    projectDashboardSelectionToScene(
      scene.controller,
      selectedIds,
      selectedNodeId,
      sceneSelectionOriginatedRef,
    );
  }, [selectedIds, selectedNodeId]);

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
  const mergedNodeIds = useMemo(
    () => (merged ? merged.nodes.map((node) => node.id) : null),
    [merged],
  );
  useEffect(() => {
    if (!mergedNodeIds) return;
    reconcileGraphAffordances(mergedNodeIds);
  }, [mergedNodeIds]);
  // Scene persistence follows the active workspace+scope; client-side pin/lens
  // store keys are owned by viewStore scope actions, including session restore.
  useEffect(() => {
    if (!activeWorkspace || !scope) return;
    scene.field.setPersistenceScope(activeWorkspace, scope);
  }, [activeWorkspace, scope]);

  // While time travelling the driver owns the stage's data (S34); the
  // live keyframe path resumes — and re-pushes — on return to LIVE.
  useTimeTravel(scope, scene.controller);
  // LIVE-mode reactivity (live-state D3 / constellation-live-delta S06):
  // subscribe with `since=keyframeSeq` when available so only new deltas
  // arrive; feature-granularity entries come back as `featureDeltas` for
  // direct scene splice. Gap fallback invalidation stays in the stores hook.
  const { featureDeltas } = useGraphLiveSync(
    scope,
    liveTimeline,
    slice.data?.last_seq ?? null,
  );
  useEffect(() => {
    if (!merged || !scope || !liveTimeline) return;
    scene.controller.command(stageSetDataCommand(merged));
  }, [merged, scope, liveTimeline]);

  // Representation mode -> scene (graph-representation ADR): a mode switch
  // re-lays-out the current set with id-keyed object constancy (no re-query). The
  // scene echoes `representation-mode-changed` with the APPLIED mode (a held
  // semantic mode downgrades honestly). Emitted whenever the mode changes; the
  // animated incremental transition is the scene's job.
  useEffect(() => {
    scene.controller.command(stageRepresentationCommand(activeRepresentationMode));
  }, [activeRepresentationMode]);

  useEffect(() => {
    const command = stageBoundsCommand(graphBounds);
    if (command) scene.controller.command(command);
  }, [graphBounds]);

  // Overlay visibility -> scene: toggling never re-lays-out (set overlays are
  // projections that do not move nodes).
  useEffect(() => {
    scene.controller.command(stageOverlaysCommand(overlays));
  }, [overlays]);

  // spliceLive: route feature-granularity deltas directly to the scene so
  // feature-node and meta-edge changes animate without a constellation refetch.
  useEffect(() => {
    if (!featureDeltas.length || !scope || !liveTimeline) return;
    const command = graphDeltasToApplyCommand(featureDeltas);
    if (command) scene.controller.command(command);
  }, [featureDeltas, scope, liveTimeline]);

  // One filter model, applied as a visibility membership diff (RL-5a). The
  // graph query and scene visibility now project through the shared stores-owned
  // dashboard filter-choice snapshot so no local projection can drift.
  const filterChoices = useDashboardFilterChoices(scope);
  const membership = useMemo(
    () =>
      merged ? computeVisibility(merged.nodes, merged.edges, filterChoices) : null,
    [merged, filterChoices],
  );
  useEffect(() => {
    // Membership computes over the LIVE slice; while the scene holds a
    // historical set-data it must not be overwritten (finding
    // timetravel-visibility-stale-021).
    if (!membership || !liveTimeline) return;
    scene.controller.command(visibilitySceneCommand(membership));
  }, [membership, liveTimeline]);

  // Surface the structural-broken degradation truth (live-state D4): the LIVE
  // keyframe path reduces the live held slice here; while time travelling, the
  // time-travel target reduces the exact replayed slice it pushes to the scene.
  useEffect(() => {
    if (!liveTimeline) return;
    setLiveBrokenLinkCount(merged ? countBrokenLinks(merged.edges) : 0);
  }, [merged, liveTimeline]);

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
  const setStageHost = useCallback((el: HTMLDivElement | null) => {
    hostRef.current = el;
    setHostEl((current) => (current === el ? current : el));
  }, []);

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
        ref={setStageHost}
        // Focusable so keyboard graph-walk can own the canvas (ADR keyboard
        // operability). aria-label names the surface for screen readers.
        tabIndex={0}
        role="application"
        aria-label="node canvas — arrow keys walk the graph, Enter opens, e expands"
        className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-state-active/40"
        data-stage-host
      />
      {/* The unified stage top bar (graph-timeline-workspace): all graph + timeline
          navigation as horizontal items. Search, filtering, and the layout/mode
          switch are retired for visual clarity — the bar carries navigation only. */}
      <StageNavBar />
      <CategoryLegend />
      {/* The overview minimap is a DOCKED card bottom-right (binding stage layout
          "minimap card bottom-right", AppShell 117:2) — it owns the bottom-right
          corner directly rather than hiding inside a controls popover. The scene
          owns every pixel inside its canvas through the unchanged seam. */}
      <MinimapWidget />
      <WorkingSet selectedId={selectedNodeId} />
      <Discover selectedId={selectedNodeId} scope={scope} />
      <TimeTravelChip scope={scope} />
      {/* The hover-bloom card (third LOD rung) sits BELOW the opened islands so a
          card never paints over an opened interior; open-suppression keeps the
          two from ever targeting the same node anyway. */}
      <HoverCardLayer scene={scene.controller} scope={scope} />
      <IslandLayer scene={scene.controller} scope={scope} />
      <CanvasStateOverlay state={canvasState} />
    </div>
  );
}

/** Exposed for consumers outside the component tree (timeline, palette). */
export function getScene() {
  return scene;
}
