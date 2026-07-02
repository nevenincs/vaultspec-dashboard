// The stage (W02.P06.S21, ADR G3.a/G3.d): mounts the assembled GPU field
// behind the SceneController seam and feeds it the initial feature
// constellation — feature nodes plus engine-aggregated meta-edges, never
// client-flattened doc edges. React sends commands and subscribes to
// events; the field owns every frame.

import { useCallback, useEffect, useRef } from "react";

import { getThemeController } from "../../platform/theme/themeController";
import { createDashboardScene } from "../../scene/field/fieldAssembly";
import { graphDeltasToApplyCommand } from "../../scene/sceneMapping";
import { useDashboardStageSceneIntent } from "../../stores/server/dashboardStageSceneIntent";
import { useGraphLiveSync } from "../../stores/server/graphSync";
import { useLiveBrokenLinkCountFromEdges } from "../../stores/server/liveStatus";
import {
  useActiveScope,
  useActiveWorkspace,
  useDashboardStageSceneView,
  useGraphSlice,
  useGraphSliceAvailability,
  useNodeNeighborsBulk,
} from "../../stores/server/queries";
import {
  useRestoreSessionScope,
  useSeedSessionContext,
} from "../../stores/server/sessionContext";
import {
  stageBoundsCommand,
  stageOverlaysCommand,
  stageRepresentationCommand,
  stageSetDataCommand,
} from "../../stores/view/stageSceneCommands";
import { useGraphAffordanceReconciliation } from "../../stores/view/graphAffordances";
import { useGraphOverlays } from "../../stores/view/graphOverlays";
import { useRenderCapability } from "../../stores/view/renderCapability";
import { bindPinsToScene } from "../../stores/view/pins";
import {
  focusFromWalk,
  openTabFromWalk,
  projectDashboardSelectionToScene,
  selectFromScene,
} from "../../stores/view/selection";
import { activateEntity } from "../../stores/view/activateEntity";
import { useDisplaySlice } from "../../stores/view/displaySlice";
import { handleStageSceneEvent } from "../../stores/view/stageSceneEvents";
import { docSurfaceForNodeId } from "../../stores/view/tabs";
import { expandWorkingSet, useWorkingSet } from "../../stores/view/workingSet";
import { useSurfaceStates } from "../degradation/useDegradation";
import { HoverCardLayer } from "../islands/HoverCardLayer";
import { IslandLayer } from "../islands/IslandLayer";
import { TimeTravelChip } from "../timeline/TimeTravelChip";
import { useTimeTravel } from "../timeline/timeTravel";
import { CanvasStateOverlay, resolveCanvasState } from "./CanvasStateOverlay";
import { MinimapWidget } from "./MinimapWidget";
import { CANVAS_KEYMAP_CONTEXT, useGraphWalkKeybindings } from "./graphWalkKeybindings";
import { GraphNavControls, GraphSettingsPanel } from "./GraphControls";
import { useGraphControlsPersistenceSync } from "./graphControlsPersistence";

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
      // A scene click ORIGINATES selection here → mark it scene-originated so the
      // dashboard→scene projection skips the focus bounce (no camera yank on a node
      // already on screen).
      const mark = (originated = true) => {
        sceneSelectionOriginatedRef.current = originated;
      };
      mark();
      // SINGLE-CLICK routes an addressable doc/code node through the ONE canonical
      // activate seam (selection + a PROVISIONAL preview tab, frame:false = no
      // recenter) — VS Code single-click preview; double-click pegs via the `open`
      // event. A synthesized `feature:` node owns no document, so it just gets the
      // canonical selection write (no tab, no descent — descent is the double-click).
      if (docSurfaceForNodeId(event.id) !== null) {
        void activateEntity(event.id, scope, {
          permanent: false,
          frame: false,
        }).catch(() => undefined);
      } else {
        void selectFromScene(event.id, scope, mark).catch(() => undefined);
      }
    });
    return offEvents;
  }, [scope, sceneSelectionOriginatedRef]);
}

/** Enroll the GPU field in the theme-change global signal. The field reads its colours as
 *  literal-hex scene tokens via getComputedStyle and BAKES them into GL buffers/uniforms at
 *  build time, so a `[data-theme]` flip does not reach them (only the per-frame label +
 *  minimap reads re-theme on their own). The framework-free `themeController` is the single
 *  observable theme signal — its `subscribe` fires on a manual theme pin AND on an OS
 *  "system" flip — so on every resolved-theme change we dispatch the scene's refresh-theme
 *  command, which re-reads every token and repaints with the layout preserved. */
export function useSceneThemeRefresh(): void {
  useEffect(
    () =>
      getThemeController().subscribe(() => {
        scene.controller.command({ kind: "refresh-theme" });
      }),
    [],
  );
}

export function Stage() {
  const hostRef = useRef<HTMLDivElement>(null);
  useSceneThemeRefresh();
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
  const renderCapability = useRenderCapability();
  const availability = useGraphSliceAvailability(slice, graphScope !== null);
  const surfaces = useSurfaceStates();
  const workingSet = useWorkingSet();
  const sceneSelectionOriginatedRef = useRef(false);
  useSceneSelectionBridge(scope, sceneSelectionOriginatedRef);
  // Persist + restore the graph-control VALUES via the global graph_controls
  // setting (graph-control-standardisation round-trip; echo-safe /settings channel).
  useGraphControlsPersistenceSync(scene.controller);
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
    select: (id: unknown) => {
      void focusFromWalk(scene.controller, id, scope, (originated = true) => {
        sceneSelectionOriginatedRef.current = originated;
      }).catch(() => undefined);
    },
    open: (id: unknown) => {
      void openTabFromWalk(scene.controller, id, scope, (originated = true) => {
        sceneSelectionOriginatedRef.current = originated;
      }).catch(() => undefined);
    },
    expand: (id: unknown) => expandWorkingSet(id),
  });
  walkHandlersRef.current = {
    selectedId: () => selectedNodeId,
    select: (id: unknown) => {
      void focusFromWalk(scene.controller, id, scope, (originated = true) => {
        sceneSelectionOriginatedRef.current = originated;
      }).catch(() => undefined);
    },
    open: (id: unknown) => {
      void openTabFromWalk(scene.controller, id, scope, (originated = true) => {
        sceneSelectionOriginatedRef.current = originated;
      }).catch(() => undefined);
    },
    expand: (id: unknown) => expandWorkingSet(id),
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
    // Reversible teardown: on unmount, release the graph canvas and listeners.
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

  // Constellation + working-set expansions → merged/display slice (keyframe path).
  // The slice union and the reflow-filter composition are stores-owned MODEL
  // derivation (useDisplaySlice, GIR-007 / dashboard-layer-ownership); the stage
  // just consumes them. The reflow set-data carries the `reflow` hint below so the
  // field warm-starts (no cold re-explode / refit) on the topology change.
  const { merged, displaySlice, reflow, visibilityCommand } = useDisplaySlice(
    scope,
    slice,
    expansions,
  );
  useGraphAffordanceReconciliation(merged);
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
    if (!displaySlice || !scope || !liveTimeline) return;
    scene.controller.command(stageSetDataCommand(displaySlice, { reflow }));
  }, [displaySlice, scope, liveTimeline, reflow]);

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

  // One filter model, applied as a visibility membership diff (RL-5a). The graph
  // query and scene visibility project through the same stores-owned dashboard
  // filter-choice snapshot so no local projection can drift. In REFLOW mode the
  // filtered-out nodes are removed from the set-data above instead of masked, so the
  // mask is suppressed here (a reflow set-data resets the scene's visibility to
  // all-shown). `visibilityCommand` is computed once above and shared by both modes.
  useEffect(() => {
    // Membership computes over the LIVE slice; while the scene holds a
    // historical set-data it must not be overwritten (finding
    // timetravel-visibility-stale-021). Reflow mode owns removal via set-data.
    if (!visibilityCommand || !liveTimeline || reflow) return;
    scene.controller.command(visibilityCommand);
  }, [visibilityCommand, liveTimeline, reflow]);

  // Surface the structural-broken degradation truth (live-state D4): the
  // liveStatus seam reduces the LIVE held slice; while time travelling, the
  // time-travel target reduces the exact replayed slice it pushes to the scene.
  useLiveBrokenLinkCountFromEdges(merged?.edges ?? null, liveTimeline);

  // Keyboard graph-walk (node-canvas ADR "Keyboard operability", keymap W03.P09):
  // the focused node walks its edges across the held slice; select/open/expand
  // have keyboard equivalents, all INSTANT shared-store state. The verbs are
  // enrolled on the ONE central keymap registry as `context: "canvas"` bindings
  // (the stage host declares that context below), so the single global dispatcher
  // owns the listener and a canvas binding overrides the colliding global
  // neighbour/feature-cycle binding when the canvas is focused — no second host
  // listener, no double-fire. The graph and handlers are stable refs read lazily
  // so the enrollment mounts once and survives slice refetches.
  // mergedRef keeps the latest slice readable from the resolver thunks.
  const mergedRef = useRef(merged);
  mergedRef.current = merged;
  const graphGetterRef = useRef(() => mergedRef.current ?? { nodes: [], edges: [] });
  useGraphWalkKeybindings(graphGetterRef.current, walkHandlersRef.current);
  const setStageHost = useCallback((el: HTMLDivElement | null) => {
    hostRef.current = el;
  }, []);

  // Resolve the one designed canvas state from stores-derived truth — the
  // chrome half of the ADR's "every wire condition is a designed state" mandate.
  const canvasState = resolveCanvasState({
    scope,
    granularity,
    stageSurface: surfaces.stage,
    slice: slice.data ?? null,
    queriedScope: graphScope,
    availability,
    renderCapability,
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
        // Declares the canvas keymap context: when focus is on/within the canvas
        // host, the central dispatcher activates the "canvas" context so the
        // graph-walk bindings resolve and override the colliding global
        // neighbour/feature-cycle bindings (keymap W03.P09).
        data-keymap-context={CANVAS_KEYMAP_CONTEXT}
      />
      {/* Graph overlays (binding graph/Hero 213:505): every remaining graph affordance
          is a canvas overlay and the field reads as the whole surface. The category
          legend (the node-fill key + canonical doc-type filter) has moved OUT of the
          canvas into the graph dock-header's left (DockWorkspace's prefix-actions slot),
          sharing that header with the visibility toggles; the vertical camera cluster
          zooms / fits / recenters (bottom-left); the graph settings panel drops the Sim
          + Display controls from a top-right trigger. create-doc, timeline navigation,
          and the working-set chip trail were all removed from the graph (not in the
          binding design; their features and data flow are preserved, their UX home
          decided elsewhere). The remaining mounts are transient runtime layers, not
          chrome: the time-travel chip (a mode indicator), the hover-bloom card and
          opened-island layer (node hover/open interactions), and the designed canvas
          states (which the binding DOES define: loading / empty / degraded). */}
      <GraphNavControls />
      <GraphSettingsPanel />
      {/* The overview minimap is a DOCKED card bottom-right (binding graph/Hero
          minimap 212:521) — it owns the bottom-right corner directly. The scene owns
          every pixel inside its canvas through the unchanged seam. */}
      <MinimapWidget />
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
