// Field assembly (W02.P06.S21): composes the W01 parts — Pixi application,
// node sprites, tier-treated edges, camera + gestures, FA2 layout worker,
// anchor driver, visibility trackers, glyphs, position cache — into one
// SceneFieldRenderer driven entirely by seam commands. React never reaches
// past the SceneController. Scene-layer module: framework-free by design.

import { logger } from "../../platform/logger/logger";
import type { SceneGraphModel } from "../graphModel";
import { SceneGraphModel as Model } from "../graphModel";
import type { NodePosition } from "../positionCache";
import { defaultPositionCache } from "../positionCache";
import type {
  SceneCommand,
  SceneController,
  SceneEdgeData,
  SceneFieldRenderer,
  SceneNodeData,
} from "../sceneController";
import { SceneController as Controller } from "../sceneController";
import { VisibilityTracker } from "../visibility";
import { AnchorDriver } from "./anchors";
import { circularArrange } from "./circularLayout";
import { computeEgo } from "./egoHighlight";
import { Camera, HIT_RADIUS_WORLD, PointerGestures, SpatialHitTester } from "./camera";
import { ARROW_VISIBLE_SCALE, EdgeMeshLayer } from "./edgeMeshes";
import type { LayoutParams } from "./forceLayout";
import { FieldLayout } from "./forceLayout";
import { MinimapLayer } from "./minimapLayer";
import { NodeSpriteLayer, nodeRadius } from "./nodeSprites";
import { PixiField } from "./pixiField";
import { splitBackbone } from "./backbone";
import type { RepresentationMode } from "./representationLayout";
import { representationLayout } from "./representationLayout";
import { OverlayLayer } from "./overlayLayer";

const POSITION_SAVE_INTERVAL_MS = 5_000;
/** Cross-highlight pulse duration (G2.b event click). */
export const PULSE_MS = 1200;
/** Per-node movement (world units) below which a frame is skipped (D4 gate). */
const MOVE_EPSILON = 0.4;

/** Node count above which the whole per-frame VISUAL update is throttled during
 *  an active settle — the document graph runs to thousands of nodes, where
 *  re-uploading every edge buffer + re-rendering each tick dominates the frame
 *  budget and is the entire settle crawl. Below it, every frame paints fully. */
const LARGE_FIELD_THRESHOLD = 800;
/** On a large field, paint the moving field once every N settle ticks (the sim
 *  still ticks every frame; only the visual repaint is throttled). A final exact
 *  paint always runs on settle, so the resting frame is never throttled. */
const VISUAL_FRAME_EVERY = 3;

/** Pad added to the salience-driven sprite radius for the per-node collision
 *  radius (graph-force-stability D4). Small constant so collision tracks the
 *  visual body (nodeRadius range 6→15.6px) plus breathing room, instead of the
 *  old fixed 18 that fought both the sprite size and the link distance (40). */
const COLLIDE_PAD = 4;

/** Full-field content signature of a `set-data` payload (perf-sweep F#5). A
 * constellation refetch or re-keyframe re-issues `set-data` with byte-identical
 * data whenever the corpus did not change, yet `applyModelToLayers(true)` does a
 * full edge-mesh rebuild + sprite sync + hit-test rebuild every time. Hashing the
 * serialized nodes+edges lets the assembly skip that redundant rebuild when
 * nothing changed. Length/count-prefixed so a hash collision cannot alias a
 * different payload; serializing the whole slice means NO rendered field
 * (status, lifecycle, tier, …) can change without changing the signature. */
function dataSignature(nodes: readonly unknown[], edges: readonly unknown[]): string {
  const s = JSON.stringify(nodes) + "" + JSON.stringify(edges);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) | 0;
  return `${nodes.length}.${edges.length}.${s.length}.${(h >>> 0).toString(36)}`;
}

/** Reduced motion collapses the field's fade band to imperceptible (G7.d). */
function fadeDuration(): number | undefined {
  const reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reduced ? 1 : undefined;
}

export class DashboardField implements SceneFieldRenderer {
  private base = new PixiField();
  private model: SceneGraphModel = new Model();
  private nodeVisibility = new VisibilityTracker(fadeDuration());
  private edgeVisibility = new VisibilityTracker(fadeDuration());
  private pinned = new Set<string>();
  private positionCache = defaultPositionCache();
  private cacheKey: { workspace: string; scope: string } = {
    workspace: "default",
    scope: "default",
  };

  // Live after mount/assembly:
  private layout: FieldLayout | null = null;
  private sprites: NodeSpriteLayer | null = null;
  private edges: EdgeMeshLayer | null = null;
  private camera: Camera | null = null;
  private anchors: AnchorDriver | null = null;
  private minimap: MinimapLayer | null = null;
  private overlayLayer: OverlayLayer | null = null;
  private lastLevel: import("./camera").SemanticLevel = "constellation";
  /** Canvas registered before onReady fires — applied once the layer exists. */
  private pendingMinimapCanvas: HTMLCanvasElement | null = null;
  private hitTester = new SpatialHitTester();
  /** The hit-test index is rebuilt lazily (not per settle frame): set true on
   *  every position frame, consumed by ensureHitTest() at pointer time. */
  private hitTestDirty = false;
  /** Throttle counter for the ancillary per-frame work on a large field. */
  private heavyFrame = 0;
  private detachListeners: (() => void)[] = [];
  /** Guard: mount() is idempotent — only the first call assembles the scene (S06). */
  private assemblyMounted = false;
  /** Bumped each mount; the async onReady bails if it no longer matches (D9). */
  private mountGen = 0;
  /** The shared assembly logger (used by the per-frame loop and apply path). */
  private assemblyLog = logger.child("scene.field-assembly");
  /** Last rendered frame, for the movement gate (D4); a reference, never copied. */
  private lastFrame: ReadonlyMap<string, NodePosition> | null = null;
  private lastSave = 0;
  /** Render-on-demand present loop (replaces the idle-FPS ticker floor). A frame
   * is presented only when something is dirty; when nothing requests a render the
   * RAF is not armed and the GPU goes fully idle. */
  private renderRafId: number | null = null;
  /** Signature of the last applied `set-data` payload (perf-sweep F#5): an
   * identical re-issue skips the full layer rebuild. Invalidated (null) whenever
   * `apply-deltas` mutates the model, so a later same-as-before keyframe still
   * resets the model from its delta-mutated state. */
  private lastSetDataSig: string | null = null;
  private layoutMode: "force" | "circular" = "force";
  private layoutParams: LayoutParams = {};
  // --- graph-representation: representation mode + overlay state (W03) ----------
  private representationMode: RepresentationMode = "connectivity";
  private overlays = { featureCountries: true, featureHulls: true };
  /** The current scene selection ids (set-selected). The first selected id (by
   *  selection order) is threaded into representationLayout so the radial mode's
   *  selected-root override (graph-layout-catalog D5) can fire — the ADR-committed
   *  focus+context behaviour. Empty when nothing is selected. */
  private selectedIds: string[] = [];
  /** The node-id set currently handed to the solver/seed (graph-force-stability
   *  D1). The incremental-reheat diff is computed against this: when a set-data /
   *  filter delta only adds/removes around a non-empty surviving intersection and
   *  no scope/mode swap is in flight, the delta routes through applyChanges at the
   *  low reheat instead of a full re-init. Empty until the first layout. */
  private laidOutIds = new Set<string>();
  /** The representation mode the solver was last laid out in (D6): set-data is the
   *  single connectivity initializer on first load, so set-representation-mode is a
   *  no-op when the requested mode already equals this and the model is laid out. */
  private appliedMode: RepresentationMode | null = null;
  /** The persistence scope the current layout was built for (D1): a change here is
   *  a scope/workspace SWAP — a new mental map — that forces a full re-init rather
   *  than an incremental reheat. */
  private laidOutScope: string | null = null;
  /** Set by the controller on attach (events flow back through the seam). */
  controller: SceneController | null = null;

  /** Called by SceneController.setMinimapCanvas() — chrome owns the canvas.
   * The minimap layer is created inside onReady (async Pixi init). If called
   * before Pixi is ready, the canvas is held in pendingMinimapCanvas and
   * applied once the layer exists. */
  setMinimapCanvas(canvas: HTMLCanvasElement | null): void {
    if (this.minimap) {
      this.minimap.setCanvas(canvas);
    } else {
      this.pendingMinimapCanvas = canvas;
    }
  }

  /** Scope the warm-start persistence (the worktree picker drives this). */
  setPersistenceScope(workspace: string, scope: string): void {
    this.cacheKey = { workspace, scope };
  }

  // --- lifecycle -------------------------------------------------------------

  mount(host: HTMLElement): void {
    // Idempotency guard (S06): a second mount() before destroy() is a no-op.
    // Without this, each call registers another onReady callback and pushes
    // another offReady entry into detachListeners, leaking duplicate canvas
    // event listeners, ticker callbacks, and theme observers.
    if (this.assemblyMounted) return;
    this.assemblyMounted = true;
    const gen = ++this.mountGen;
    this.base.mount(host);
    const offReady = this.base.onReady((app) => {
      // Pixi init is async; if a destroy/remount interleaved in that window the
      // generation no longer matches and this stale assembly must not run (D9).
      if (gen !== this.mountGen) return;
      const world = this.base.worldContainer;
      // Overlay layer sits behind the edges/nodes (added first to the world).
      this.overlayLayer = new OverlayLayer(world);
      this.overlayLayer.setFlags(this.overlays);
      this.edges = new EdgeMeshLayer(world);
      this.sprites = new NodeSpriteLayer(world);
      this.camera = new Camera(world);
      this.layout = new FieldLayout();
      this.anchors = new AnchorDriver({
        trackedIds: () => this.controller?.trackedNodeIds() ?? [],
        positionOf: (id) => this.sprites?.positionOf(id),
        worldToScreen: (wx, wy) => this.camera!.worldToScreen(wx, wy),
        scale: () => this.camera!.current.scale,
        emitAnchor: (id, anchor) => this.controller?.emitAnchor(id, anchor),
      });

      // Layout frames drive sprites, edges, hit-testing, anchors, and the
      // periodic warm-start save.
      const offPositions = this.layout.onPositions((positions) => {
        // One throwing consumer must never wedge the frame loop (D8).
        try {
          // Movement gate (D4): skip the heavy per-frame work once motion drops
          // below the epsilon; it ceases entirely when the simulation freezes
          // (no tick -> no frame). No camera fit here — the camera is fit ONCE
          // on settle, then it belongs to the user (D5).
          if (!this.frameMoved(positions)) return;
          // Visual-update throttle for a LARGE field (graph-scale). The d3 sim
          // ticks EVERY frame (its own loop drives it, so settle timing is
          // unchanged), but on a thousands-of-nodes / tens-of-thousands-of-edges
          // document graph the per-tick VISUAL work — re-uploading every edge
          // position buffer, re-syncing every sprite, then the Pixi present — is
          // ~100ms and was the entire settle crawl (~21s). Painting the moving
          // field every Nth tick instead keeps the motion legible while cutting
          // that wall-clock ~Nx; the EXACT resting frame always paints on settle.
          const big = this.model.nodeCount > LARGE_FIELD_THRESHOLD;
          if (big && this.heavyFrame++ % VISUAL_FRAME_EVERY !== 0) return;
          this.lastFrame = positions;
          this.sprites?.updatePositions((id) => positions.get(id));
          this.edges?.update((id) => positions.get(id));
          // Hit-test rebuild is DEFERRED, not run per frame: a large field
          // re-hashing its whole spatial index every painted tick is pure waste —
          // no pointer interaction happens mid-settle. Mark it dirty here;
          // `ensureHitTest()` rebuilds lazily on the next pointer gesture (and
          // onSettle), so the cost is paid once when actually needed.
          this.hitTestDirty = true;
          this.minimap?.updatePositions(positions, this.model.nodes);
          this.overlayLayer?.render(
            [...this.model.nodes],
            (id) => positions.get(id),
            this.lastLevel,
          );
          this.anchors?.update();
          const now = Date.now();
          if (this.positionCache && now - this.lastSave > POSITION_SAVE_INTERVAL_MS) {
            this.lastSave = now;
            this.positionCache.save(
              this.cacheKey.workspace,
              this.cacheKey.scope,
              positions,
              now,
            );
          }
          // A layout tick moved the field — present this frame (render-on-demand).
          this.requestRender();
        } catch (err) {
          this.assemblyLog.error(`position frame threw: ${(err as Error).message}`);
        }
      });

      // Fit ONCE when the layout cools to a freeze, then the camera is the
      // user's (D5). A user pan/zoom before settle disarms this, so the fit
      // never yanks the view back from where the user moved it.
      const offSettle = this.layout.onSettle(() => {
        if (this.autoFitArmed && this.layout) {
          this.autoFitArmed = false;
          this.fitToContent(this.layout.positions, true);
        }
        // Settle is the exact resting frame: run the ancillary visuals once more
        // (they were throttled mid-settle on a large field) and mark the hit-test
        // dirty so the next gesture rebuilds against the final positions.
        const settled = this.layout?.positions;
        if (settled) {
          this.minimap?.updatePositions(settled, this.model.nodes);
          this.overlayLayer?.render(
            [...this.model.nodes],
            (id) => settled.get(id),
            this.lastLevel,
          );
        }
        this.hitTestDirty = true;
        // Present the final settled frame even if the fit was disarmed.
        this.requestRender();
      });

      this.minimap = new MinimapLayer();
      this.minimap.setNavigateCallback((wx, wy) => {
        this.navigateToWorld(wx, wy);
      });
      // Apply any canvas that was registered before Pixi was ready.
      if (this.pendingMinimapCanvas !== null) {
        this.minimap.setCanvas(this.pendingMinimapCanvas);
        this.pendingMinimapCanvas = null;
      }

      const offCamera = this.camera.onChange((state, level) => {
        this.lastLevel = level;
        this.sprites?.setLod(state.scale, this.focusedIds());
        this.edges?.setArrowVisibility(state.scale >= ARROW_VISIBLE_SCALE);
        // LOD changed which overlay applies (countries vs hulls) — re-render.
        this.overlayLayer?.render(
          [...this.model.nodes],
          (id) => this.sprites?.positionOf(id),
          level,
        );
        this.anchors?.update();
        this.minimap?.updateViewport(state, app.screen.width, app.screen.height);
        this.controller?.emit({ kind: "camera-change", scale: state.scale, level });
        // Camera moved (pan/zoom/wheel/animate) — present this frame.
        this.requestRender();
      });

      // Pointer gestures on the canvas emit the locked seam events; hover
      // additionally drives the ego-highlight (G3.b) inside the field.
      const gestures = new PointerGestures({
        emit: (event) => {
          if (event.kind === "hover") this.applyEgoHighlight(event.id);
          this.controller?.emit(event);
          // Hover ego-lift / pointer activity changed visible treatment — present.
          this.requestRender();
        },
        panBy: (dx, dy) => {
          this.autoFitArmed = false;
          this.camera?.panBy(dx, dy);
        },
        hitTestScreen: (sx, sy) => {
          this.ensureHitTest();
          const world = this.camera!.screenToWorld(sx, sy);
          const radius = HIT_RADIUS_WORLD / Math.max(0.2, this.camera!.current.scale);
          return this.hitTester.hitTest(world.x, world.y, radius);
        },
        // Free-drag (D3): the world point under the pointer drives the dragged
        // node's fx/fy each move; the held alphaTarget (begun inside dragNode)
        // lets the neighbourhood reflow around it. On drop the node is RELEASED
        // back into the simulation (no auto-pin — see nodeDragEnd). The drag is a
        // no-op when a representation mode swap left no live solver (connectivity-
        // only fence, D8).
        screenToWorld: (sx, sy) => this.camera!.screenToWorld(sx, sy),
        nodeDragTo: (id, wx, wy) => {
          // Connectivity-only (D8): a deterministic mode holds the solver stopped,
          // so a node-drag has no live field to reflow — ignore it there.
          if (this.representationMode !== "connectivity") return;
          this.autoFitArmed = false; // the user is moving the field — don't snap-fit
          this.layout?.dragNode(id, wx, wy);
          this.requestRender();
        },
        nodeDragEnd: (id, moved) => {
          if (this.representationMode !== "connectivity") return;
          // Free-drag DROP — a drag MOVES a node, it does not pin it. Release the
          // node back into the live simulation so it eases into the cooling layout
          // (releaseNode keeps it fixed ONLY if it is already an explicitly pinned
          // node), then let the field re-cool. Pinning is a SEPARATE, deliberate
          // gesture (context-menu "Pin" → pins store → set-pinned); a drag never
          // auto-pins. `moved` only distinguishes a real drag from a below-
          // threshold press, which the gesture layer already routed as a select.
          void moved;
          this.layout?.releaseNode(id);
          this.layout?.endInteraction();
          this.requestRender();
        },
      });
      const canvas = app.canvas;
      const local = (e: PointerEvent | MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
      };
      const onDown = (e: PointerEvent) => gestures.pointerDown(local(e));
      const onMove = (e: PointerEvent) => gestures.pointerMove(local(e));
      const onUp = (e: PointerEvent) => gestures.pointerUp(local(e));
      const onDbl = (e: MouseEvent) => gestures.doubleClick(local(e));
      const onContext = (e: MouseEvent) => {
        // Right-click: suppress the native menu and report the gesture; the
        // app-chrome menu host opens from the SceneController event (W04.P10).
        e.preventDefault();
        gestures.contextMenu(local(e), { x: e.clientX, y: e.clientY });
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        this.autoFitArmed = false;
        const p = local(e);
        this.camera?.zoomAt(p.x, p.y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
      };
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("dblclick", onDbl);
      canvas.addEventListener("contextmenu", onContext);
      canvas.addEventListener("wheel", onWheel, { passive: false });

      // Re-render node and edge colours when the user toggles the theme.
      // applyModelToLayers(false) is enough: sprites.sync() updates tints and
      // rebuilds any open anatomy containers; edges.setEdges() full-rebuilds
      // the mesh groups so groupColor() picks up the new tier/paper CSS vars.
      // (The canvas background itself is handled by pixiField's own observer.)
      const themeObserver = new MutationObserver(() => {
        this.applyModelToLayers(false);
        this.requestRender();
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });

      this.detachListeners.push(
        offPositions,
        offSettle,
        offCamera,
        () => canvas.removeEventListener("pointerdown", onDown),
        () => canvas.removeEventListener("pointermove", onMove),
        () => canvas.removeEventListener("pointerup", onUp),
        () => canvas.removeEventListener("dblclick", onDbl),
        () => canvas.removeEventListener("contextmenu", onContext),
        () => canvas.removeEventListener("wheel", onWheel),
        () => themeObserver.disconnect(),
      );

      // Data may have arrived before the renderer was live.
      this.applyModelToLayers(true);
      // Present the initial frame (paints the background ground + any seeded
      // layout) — render-on-demand has no auto first frame.
      this.requestRender();
    });
    this.detachListeners.push(offReady);
  }

  /**
   * Render-on-demand: request a single COALESCED present on the next animation
   * frame. Many sources (a layout tick, a camera move, a hover lift, a fade,
   * a theme flip, a data change) can mark the field dirty within one frame; they
   * all collapse to one render. When nothing requests a render, the RAF is not
   * armed and the GPU presents zero frames — the idle field costs nothing.
   */
  private requestRender(): void {
    if (this.renderRafId !== null) return;
    if (typeof requestAnimationFrame !== "function") {
      // Non-DOM host (tests): present synchronously so a single command still
      // produces one render without a frame scheduler.
      this.presentFrame();
      return;
    }
    this.renderRafId = requestAnimationFrame(this.presentFrame);
  }

  /** Present exactly one frame: advance any in-flight visibility fade, draw the
   *  stage once, and re-arm only while a fade is still animating. */
  private presentFrame = (): void => {
    this.renderRafId = null;
    const app = this.base.application;
    if (!app) return;
    try {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const nodeSample = this.nodeVisibility.sample(now);
      const edgeSample = this.edgeVisibility.sample(now);
      const fading = nodeSample.animating || edgeSample.animating;
      if (fading || this.lastAnimating) {
        this.sprites?.applyVisibility(
          nodeSample.progress,
          this.nodeVisibility.visibleIds,
          Date.now(),
        );
        this.edges?.applyVisibility(edgeSample.progress);
      }
      this.lastAnimating = fading;
      app.render();
      // A fade still in flight needs the next frame too; everything else is
      // event-driven and re-requests as needed.
      if (fading) this.requestRender();
    } catch (err) {
      this.assemblyLog.error(`present frame threw: ${(err as Error).message}`);
    }
  };

  resize(width: number, height: number): void {
    this.base.resize(width, height);
    this.requestRender();
  }

  destroy(): void {
    // Bump the generation so any onReady still in flight from this mount bails.
    this.mountGen++;
    for (const detach of this.detachListeners) detach();
    this.detachListeners = [];
    this.assemblyMounted = false;
    this.lastFrame = null;
    // Cancel any pending present so a destroyed assembly never renders into a
    // torn-down app, and reset per-mount caches so a remount rebuilds cleanly:
    // the set-data signature must not skip the first rebuild against the fresh,
    // empty layers (F#5).
    if (this.renderRafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.renderRafId);
    }
    this.renderRafId = null;
    this.lastAnimating = false;
    this.hitTestDirty = false;
    this.heavyFrame = 0;
    this.lastSetDataSig = null;
    // Reset the incremental-reheat tracking (D1/D6): a remount must full-init the
    // fresh, empty layers rather than diff against a stale laid-out set.
    this.laidOutIds = new Set();
    this.appliedMode = null;
    this.laidOutScope = null;
    this.layout?.destroy();
    this.layout = null;
    this.sprites = null;
    this.edges = null;
    this.camera = null;
    this.anchors = null;
    this.minimap?.destroy();
    this.minimap = null;
    this.overlayLayer?.destroy();
    this.overlayLayer = null;
    this.base.destroy();
  }

  // --- seam commands ------------------------------------------------------------

  private lastAnimating = false;
  private pulseToken = 0;

  command(cmd: SceneCommand): void {
    // Any command may mutate the scene (data, focus, camera, time, selection,
    // overlays) — request a present so the resulting frame is drawn. Commands
    // that also move the camera or layout will additionally request via their own
    // change handlers; requestRender coalesces them into one frame.
    this.requestRender();
    switch (cmd.kind) {
      case "set-data": {
        // Skip the full rebuild when the payload is byte-identical to the last
        // one applied (F#5): a refetch/re-keyframe over an unchanged corpus is a
        // no-op for the scene. Any real change (any field) changes the signature.
        const sig = dataSignature(cmd.nodes, cmd.edges);
        if (sig === this.lastSetDataSig) break;
        this.lastSetDataSig = sig;
        // Incremental-reheat routing (D1): a content delta — a live keyframe, a
        // working-set expansion, or a filter that changed the SERVED node set —
        // that only adds/removes nodes around a NON-EMPTY surviving intersection,
        // with no scope/mode swap in flight, perturbs the field at the LOW reheat
        // through applyChanges with every survivor's position preserved. A first
        // load, a scope swap, or a deterministic representation mode is a new
        // mental map and re-inits. The decision is mechanical (intersection
        // non-empty + connectivity + same scope + already laid out).
        if (this.tryIncrementalReheat(cmd.nodes, cmd.edges)) break;
        this.model.setData(cmd.nodes, cmd.edges);
        this.autoFitArmed = true;
        this.applyModelToLayers(true);
        break;
      }
      case "apply-deltas": {
        // Deltas mutate the model away from the last set-data snapshot, so a
        // later identical-to-before keyframe must NOT be skipped (F#5).
        this.lastSetDataSig = null;
        for (const delta of cmd.deltas) this.model.applyDelta(delta);
        // Try incremental edge updates: if every edge delta can be patched
        // in place (op:"change" with same group key), skip the full rebuild.
        // Node-only deltas are handled by sprites.sync which is always called.
        // Any unhandled edge delta falls back to the full applyModelToLayers.
        let allEdgesHandled = true;
        for (const delta of cmd.deltas) {
          if (!delta.edge) continue; // node-only; sprites.sync handles it
          if (!this.edges?.updateEdge(delta.edge, delta.op)) {
            allEdgesHandled = false;
            break;
          }
        }
        if (allEdgesHandled) {
          // Fast path: only sprite sync needed; edge meshes already consistent.
          this.sprites?.sync(this.model, Date.now());
        } else {
          this.applyModelToLayers(false);
        }
        break;
      }
      case "set-visibility": {
        const now = performance.now();
        this.nodeVisibility.setVisible(cmd.visibleNodeIds, now);
        this.edgeVisibility.setVisible(cmd.visibleEdgeIds, now);
        // Both entity classes fade through their trackers; the present loop
        // re-arms each frame until the fade completes (requestRender at the top
        // of command() kicks the first frame).
        this.lastAnimating = true;
        break;
      }
      case "focus-node": {
        const p = this.sprites?.positionOf(cmd.id);
        if (p && this.camera && this.base.application) {
          const screen = this.base.application.screen;
          const scale = Math.max(this.camera.current.scale, 1.6);
          // `animate:false` (keyboard walk) snaps instantly; the camera also
          // snaps under prefers-reduced-motion regardless (base motion law).
          this.camera.animateTo(
            {
              scale,
              x: screen.width / 2 - p.x * scale,
              y: screen.height / 2 - p.y * scale,
            },
            undefined,
            { instant: cmd.animate === false },
          );
        }
        break;
      }
      case "set-pinned": {
        // Solver-level pinning (D7): the simulation fixes pinned nodes via
        // fx/fy and holds them itself, so nothing fights. The display-overwrite
        // of the authoritative frame is gone. The set is also kept for the
        // pinned-node LOD focus treatment.
        this.pinned = new Set(cmd.ids);
        this.layout?.setPinned(this.pinned);
        break;
      }
      case "set-selected": {
        // The canvas SELECTED state (graph/Node-items "selected"): the sprite
        // layer draws the concentric accent ring on each selected body. Pure
        // visual treatment — no re-layout, no camera move (focus-node owns the
        // camera; the two compose). The selection is also retained so a later
        // radial-mode (re)layout can root on the focused node (D5 focus+context).
        this.selectedIds = [...cmd.ids];
        this.sprites?.setSelected(cmd.ids);
        break;
      }
      case "set-time":
        // Time travel (S34) drives the scene through set-data/apply-deltas;
        // the mode itself carries no renderer state yet.
        break;
      case "pulse": {
        // Transient lift of the named nodes (timeline cross-highlight):
        // borrows the ego treatment, then clears unless superseded.
        this.pulseToken += 1;
        const token = this.pulseToken;
        this.sprites?.setHighlight(new Set(cmd.ids));
        this.edges?.setHighlight(new Set());
        setTimeout(() => {
          if (token !== this.pulseToken) return;
          this.sprites?.setHighlight(null);
          this.edges?.setHighlight(null);
          this.requestRender();
        }, PULSE_MS);
        break;
      }
      // --- graph-quality camera commands (P01.S02) ------------------------------
      case "zoom-in": {
        if (this.camera && this.base.application) {
          const s = this.base.application.screen;
          this.camera.zoomAt(s.width / 2, s.height / 2, 1.25);
        }
        break;
      }
      case "zoom-out": {
        if (this.camera && this.base.application) {
          const s = this.base.application.screen;
          this.camera.zoomAt(s.width / 2, s.height / 2, 0.8);
        }
        break;
      }
      case "fit-to-view": {
        if (this.layout) {
          this.autoFitArmed = true;
          this.fitToContent(this.layout.positions);
        }
        break;
      }
      case "reset-view": {
        this.autoFitArmed = false;
        this.camera?.set({ x: 0, y: 0, scale: 1 });
        break;
      }
      // --- graph-quality layout commands (P01.S02 / S03) ------------------------
      case "set-layout-params": {
        this.layoutParams = { ...this.layoutParams, ...cmd.params };
        this.layout?.setParams(cmd.params);
        this.controller?.emit({
          kind: "layout-changed",
          mode: this.layoutMode,
          params: { ...this.layoutParams },
        });
        break;
      }
      case "set-layout-mode": {
        this.layoutMode = cmd.mode;
        if (cmd.mode === "circular") {
          // Switch to circular: seed positions on a circle, stop the solver.
          if (this.layout && this.model.nodeCount > 0) {
            const nodeIds = [...this.model.nodes].map((n) => n.id);
            const positions = circularArrange(nodeIds);
            this.layout.stop();
            this.layout.init(nodeIds, [], positions, this.radiusOf);
            // Don't restart in circular mode — positions are already set.
          }
        } else {
          // Switch back to force: re-init from the layout backbone (the circular
          // switch cleared the link force) and warm-start from current positions,
          // so the springs return rather than re-settling a disconnected blob.
          if (this.layout && this.model.nodeCount > 0) {
            const nodeIds = [...this.model.nodes].map((n) => n.id);
            const backboneRefs = splitBackbone([...this.model.edges]).backbone.map(
              (e) => ({ id: e.id, src: e.src, dst: e.dst }),
            );
            this.layout.init(
              nodeIds,
              backboneRefs,
              this.layout.positions,
              this.radiusOf,
            );
            this.layout.start();
          }
        }
        this.controller?.emit({
          kind: "layout-changed",
          mode: this.layoutMode,
          params: { ...this.layoutParams },
        });
        break;
      }
      // --- graph-force-stability: held-warmth interaction seam (W01.P01) -------
      case "begin-interaction": {
        // A slider-tune drag begins (D2): hold the alphaTarget floor so the
        // set-layout-params during the drag reflow continuously, no per-onChange
        // kick. Connectivity-only (D8) — a deterministic mode has no live solver.
        if (this.representationMode === "connectivity") this.layout?.beginInteraction();
        break;
      }
      case "end-interaction": {
        this.layout?.endInteraction();
        break;
      }
      // --- graph-force-stability: freeze toggle (W01.P03.S14) ------------------
      case "set-frozen": {
        // Obsidian's pause (D7): stop the solver where it is, or resume it at a
        // low alpha. The cooling schedule stays fixed; this is a pure stop/start.
        // Connectivity-only (D8): a deterministic mode already holds the solver
        // stopped, so a freeze toggle is meaningless there.
        if (this.representationMode === "connectivity" && this.layout) {
          if (cmd.frozen) {
            this.layout.stop();
          } else {
            this.layout.unfreeze();
          }
        }
        break;
      }
      // --- graph-representation: representation mode switch (W03.P08) ----------
      case "set-representation-mode": {
        this.applyRepresentationMode(cmd.mode);
        break;
      }
      case "set-overlays": {
        this.overlays = {
          featureCountries: cmd.featureCountries,
          featureHulls: cmd.featureHulls,
        };
        // Toggling overlays never re-lays-out (set overlays are projections that
        // do not move nodes); re-render the overlay layer immediately.
        this.overlayLayer?.setFlags(this.overlays);
        this.refreshOverlays();
        break;
      }
    }
  }

  /**
   * Switch the representation mode (graph-representation ADR). Connectivity hands
   * positions to the FA2 solver (restart from current positions); lineage and
   * semantic seed explicit static positions and stop the solver. OBJECT
   * CONSTANCY: every mode seeds the SAME id-keyed nodes — no node is re-keyed, so
   * the sprite/island reconcilers carry identity across the switch and the
   * transition animates from the prior positions. A gated mode (semantic) may
   * DOWNGRADE to connectivity; the applied mode is echoed honestly.
   */
  private applyRepresentationMode(mode: RepresentationMode): void {
    // Double-init collapse (D6): on mount both the set-data effect and the
    // set-representation-mode:connectivity effect fire, and the latter would
    // re-init + reheat a field set-data already laid out. set-data is the single
    // connectivity initializer on first load, so this is a NO-OP when the
    // requested mode already equals the applied connectivity mode and the model
    // is laid out — no second reheat, no second fit. Still echo the applied mode
    // so the chrome stays in sync.
    if (
      mode === "connectivity" &&
      this.appliedMode === "connectivity" &&
      this.laidOutIds.size > 0
    ) {
      this.representationMode = mode;
      this.controller?.emit({
        kind: "representation-mode-changed",
        requested: mode,
        applied: "connectivity",
      });
      return;
    }
    this.representationMode = mode;
    let applied: RepresentationMode = mode;
    let downgradeReason: string | undefined;
    if (this.layout && this.model.nodeCount > 0) {
      const nodes = [...this.model.nodes];
      const edges = [...this.model.edges];
      const result = representationLayout(mode, nodes, edges, this.layoutSelectedId());
      applied = result.applied;
      downgradeReason = result.downgradeReason;
      // Lineage routes the edge layer through its dummy-node waypoints (W03 D6);
      // every other mode clears them so edges fall back to straight line-list.
      // NOTE (W03 review): result.lineageDetail.nodes carries per-node
      // depth/onSpine/dangling honesty flags whose POSITION effect is already
      // applied (off-spine lanes, dangling columns), but whose fade/dangling-marker
      // VISUAL TREATMENT is a deferred enhancement — it needs a field→sprite flag
      // channel and sprite-layer changes (see LineageRenderDetail.nodes). Only the
      // routes are consumed here today.
      this.edges?.setRoutes(result.lineageDetail?.routes ?? new Map());
      const nodeIds = nodes.map((n) => n.id);
      if (result.positions) {
        // Deterministic mode: seed the explicit positions (id-keyed) and stop the
        // solver, exactly like the circular mode but with the mode's layout.
        const seeds = new Map(
          nodeIds
            .filter((id) => result.positions!.has(id))
            .map((id) => [id, result.positions!.get(id)!] as const),
        );
        this.layout.stop();
        this.layout.init(nodeIds, [], seeds, this.radiusOf);
        // Deterministic mode: solver held stopped; animate the camera once to
        // frame the new arrangement.
        this.lastFrame = null;
        this.autoFitArmed = false;
        this.fitToContent(this.layout.positions, true);
      } else {
        // Connectivity: feed ONLY the layout backbone to the solver (anti-hairball
        // discipline, W02.P07) and warm-start from the CURRENT positions so the
        // switch animates from where the nodes are (object constancy). Arm the
        // settle fit so the camera frames the cooled layout once, without snapping
        // away from the mental map mid-transition.
        const backbone = splitBackbone(edges).backbone;
        const edgeRefs = backbone.map((e) => ({ id: e.id, src: e.src, dst: e.dst }));
        this.layout.init(nodeIds, edgeRefs, this.layout.positions, this.radiusOf);
        this.layout.start();
        this.lastFrame = null;
        this.autoFitArmed = true;
      }
      this.laidOutIds = new Set(nodeIds);
      this.appliedMode = applied;
      this.laidOutScope = this.cacheKey.scope;
    }
    this.controller?.emit({
      kind: "representation-mode-changed",
      requested: mode,
      applied,
      downgradeReason,
    });
  }

  /** Re-render the overlay layer from the current overlay flags (no re-layout). */
  private refreshOverlays(): void {
    this.overlayLayer?.render(
      [...this.model.nodes],
      (id) => this.sprites?.positionOf(id),
      this.lastLevel,
    );
  }

  // --- internals -------------------------------------------------------------------

  /** Whether the next settle should fit the camera (disarmed once the user
   *  takes the camera, or after the one-shot fit fires). */
  private autoFitArmed = true;

  /** Rebuild the spatial hit-test index from the latest frame if it went stale
   *  (deferred from the per-frame loop). Called at pointer time so a large field
   *  pays the rehash once, when a gesture actually needs it, not every settle
   *  tick. A no-op when already current. */
  private ensureHitTest(): void {
    if (!this.hitTestDirty) return;
    const frame = this.lastFrame ?? this.layout?.positions;
    if (frame) this.hitTester.rebuild(frame.entries());
    this.hitTestDirty = false;
  }

  /** True when this frame moved enough to be worth re-rendering (D4 gate). */
  private frameMoved(positions: ReadonlyMap<string, NodePosition>): boolean {
    const prev = this.lastFrame;
    if (!prev || prev.size !== positions.size) return true;
    for (const [id, p] of positions) {
      const q = prev.get(id);
      if (
        !q ||
        Math.abs(q.x - p.x) > MOVE_EPSILON ||
        Math.abs(q.y - p.y) > MOVE_EPSILON
      ) {
        return true;
      }
    }
    return false;
  }

  /** Center and scale the camera to the field's content bounds. When `animate`
   *  the camera eases to the target; otherwise it snaps (initial one-shot). */
  private fitToContent(
    positions: ReadonlyMap<string, NodePosition>,
    animate = false,
  ): void {
    const app = this.base.application;
    if (!app || !this.camera || positions.size === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of positions.values()) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    // Never auto-zoom past 1: the initial view is the constellation, not a
    // document close-up — semantic zoom-in is the user's move (G3.b).
    const scale = Math.min(
      1,
      Math.min(app.screen.width / w, app.screen.height / h) * 0.85,
    );
    const target = {
      scale,
      x: app.screen.width / 2 - (minX + w / 2) * scale,
      y: app.screen.height / 2 - (minY + h / 2) * scale,
    };
    if (animate) {
      this.camera.animateTo(target);
    } else {
      this.camera.set(target);
    }
  }

  private focusedIds(): ReadonlySet<string> {
    return this.pinned;
  }

  /** The selection id threaded into representationLayout (radial selected-root
   *  override, D5): the first selected id that is actually in the current model,
   *  or undefined when nothing selected is present in the slice. */
  private layoutSelectedId(): string | undefined {
    for (const id of this.selectedIds) {
      if (this.model.getNode(id)) return id;
    }
    return undefined;
  }

  /**
   * Per-node collision radius callback (D4): shares the salience-driven sprite
   * radius without leaking nodeRadius into the driver. A node missing from the
   * model (transient delta interleave) falls back to the base radius via
   * nodeRadius's own absent-salience path.
   */
  private radiusOf = (id: string): number => {
    const node = this.model.getNode(id);
    if (!node) return COLLIDE_PAD + 6; // base NODE_RADIUS-ish floor when unknown
    return nodeRadius(node) + COLLIDE_PAD;
  };

  /** Pan (animated) to center on a world coordinate — used by minimap clicks. */
  private navigateToWorld(wx: number, wy: number): void {
    if (!this.camera || !this.base.application) return;
    const screen = this.base.application.screen;
    const scale = this.camera.current.scale;
    this.autoFitArmed = false;
    this.camera.animateTo({
      scale,
      x: screen.width / 2 - wx * scale,
      y: screen.height / 2 - wy * scale,
    });
  }

  /** Hover ego-highlight: lift the 1-hop neighborhood, recede the rest. */
  private applyEgoHighlight(id: string | null): void {
    if (id === null) {
      this.sprites?.setHighlight(null);
      this.edges?.setHighlight(null);
      return;
    }
    const ego = computeEgo(this.model, id);
    this.sprites?.setHighlight(ego.nodeIds);
    this.edges?.setHighlight(ego.edgeIds);
  }

  /**
   * Incremental-reheat path (graph-force-stability D1). Returns true when the
   * incoming set-data was applied as a LOCAL PERTURBATION (applyChanges at the
   * low reheat, survivors preserved) rather than a full re-init. The boundary is
   * mechanical: connectivity mode, the model already laid out in the SAME scope,
   * and a non-empty surviving intersection between the incoming and laid-out id
   * sets. Any of first-load / scope-swap / deterministic-mode falls through to a
   * full init by returning false.
   *
   * The layout is fed ONLY the layout backbone (declared + structural), so the
   * edge add/remove diff is computed over the backbone of the new and old edge
   * sets, mirroring applyModelToLayers's anti-hairball discipline (W02.P07).
   */
  private tryIncrementalReheat(
    nodes: readonly SceneNodeData[],
    edges: readonly SceneEdgeData[],
  ): boolean {
    if (!this.layout || !this.sprites || !this.edges) return false;
    // Re-init triggers (D1): a new mental map, never an incremental perturbation.
    if (this.representationMode !== "connectivity") return false;
    if (this.appliedMode !== "connectivity") return false;
    if (this.laidOutIds.size === 0) return false; // first load
    if (this.laidOutScope !== this.cacheKey.scope) return false; // scope swap

    const incomingIds = new Set(nodes.map((n) => n.id));
    // The surviving intersection: must be non-empty for an incremental reheat,
    // else the field shares no mental map with the prior one — re-init instead.
    let survivors = 0;
    for (const id of incomingIds) if (this.laidOutIds.has(id)) survivors += 1;
    if (survivors === 0) return false;

    const addNodeIds: string[] = [];
    for (const id of incomingIds) if (!this.laidOutIds.has(id)) addNodeIds.push(id);
    const removeNodeIds: string[] = [];
    for (const id of this.laidOutIds) if (!incomingIds.has(id)) removeNodeIds.push(id);

    // Backbone edge diff: the solver only ever saw the backbone, so the add/remove
    // is over the new vs old BACKBONE edge ids (the full edge set still renders).
    const newBackbone = splitBackbone([...edges]).backbone;
    const newBackboneById = new Map(newBackbone.map((e) => [e.id, e]));
    const oldBackbone = splitBackbone([...this.model.edges]).backbone;
    const oldBackboneIds = new Set(oldBackbone.map((e) => e.id));
    const addEdges = newBackbone
      .filter((e) => !oldBackboneIds.has(e.id))
      .map((e) => ({ id: e.id, src: e.src, dst: e.dst }));
    const removeEdgeIds: string[] = [];
    for (const id of oldBackboneIds)
      if (!newBackboneById.has(id)) removeEdgeIds.push(id);

    // Commit the new slice to the model and the visual layers BEFORE the reheat,
    // so the collision radiusOf callback (D4) reads the new salience and the
    // sprites/edges/hit-test reflect the new set immediately; the solver then
    // perturbs the positions locally.
    this.model.setData(nodes, edges);
    const now = Date.now();
    this.sprites.sync(this.model, now);
    const rejected = this.edges.setEdges([...this.model.edges]).rejected;
    for (const err of rejected) this.assemblyLog.error(err.message);

    this.layout.applyChanges(
      { addNodeIds, removeNodeIds, addEdges, removeEdgeIds },
      undefined,
      this.radiusOf,
    );
    this.laidOutIds = incomingIds;
    // A content delta is a perturbation of the held mental map, NOT a re-fit:
    // the camera stays where the user has it (D6 — no double-fit, no snap-back).
    return true;
  }

  private applyModelToLayers(reseed: boolean): void {
    if (!this.sprites || !this.edges || !this.layout) return;
    const now = Date.now();
    this.sprites.sync(this.model, now);
    const rejected = this.edges.setEdges([...this.model.edges]).rejected;
    if (rejected.length > 0) {
      // Truthfulness: a malformed tier is a loud, structured log, never a
      // silent re-bucket. Surfacing into the degradation UI lands with S46.
      for (const err of rejected) {
        this.assemblyLog.error(err.message);
      }
    }
    const nodeIds = [...this.model.nodes].map((n) => n.id);
    // Anti-hairball discipline (W02.P07): feed ONLY the declared+structural layout
    // backbone to the FA2 solver; the disparity-thinned temporal/semantic tiers
    // are layered context the renderer draws, never layout input. The full edge
    // set still renders (the EdgeMeshLayer got all edges above); only the FORCE
    // INPUT is the backbone.
    const allEdges = [...this.model.edges];
    const backboneRefs = splitBackbone(allEdges).backbone.map((e) => ({
      id: e.id,
      src: e.src,
      dst: e.dst,
    }));
    if (reseed) {
      // Composition (graph-representation ADR): a new slice (a lens re-query) is
      // re-laid-out by the ACTIVE representation mode. A deterministic mode
      // (lineage/semantic) seeds explicit positions; connectivity warm-starts FA2
      // over the backbone.
      if (this.representationMode !== "connectivity") {
        const result = representationLayout(
          this.representationMode,
          [...this.model.nodes],
          allEdges,
          this.layoutSelectedId(),
        );
        // Routed lineage waypoints to the edge layer (W03 D6); empty otherwise.
        this.edges?.setRoutes(result.lineageDetail?.routes ?? new Map());
        if (result.positions) {
          const seeds = new Map(
            nodeIds
              .filter((id) => result.positions!.has(id))
              .map((id) => [id, result.positions!.get(id)!] as const),
          );
          this.layout.stop();
          this.layout.init(nodeIds, [], seeds, this.radiusOf);
          // Deterministic mode: the solver is held stopped, so NO settle fires.
          // The one-shot seed-fit is the only framing there will be, so it is
          // retained here (D6: drop the instant fit only when a settle-fit
          // follows — for a stopped solver none does).
          this.lastFrame = null;
          this.autoFitArmed = false;
          this.fitToContent(this.layout.positions, false);
          this.laidOutIds = new Set(nodeIds);
          this.appliedMode = result.applied;
          this.laidOutScope = this.cacheKey.scope;
          return;
        }
        // A held gated mode downgrades to connectivity below.
      }
      // Connectivity (or downgraded) reseed: no routed lineage edges.
      this.edges?.setRoutes(new Map());
      const warm = new Map<string, NodePosition>();
      if (this.positionCache) {
        for (const [id, p] of this.positionCache.load(
          this.cacheKey.workspace,
          this.cacheKey.scope,
        )) {
          warm.set(id, p);
        }
      }
      for (const node of this.model.nodes) {
        if (!warm.has(node.id) && node.seedPosition) {
          warm.set(node.id, node.seedPosition);
        }
      }
      this.layout.init(nodeIds, backboneRefs, warm, this.radiusOf);
      this.layout.start();
      // Connectivity re-init: the solver runs and WILL fire a settle, so the
      // animated settle-fit frames the cooled layout. Drop the instant seed-fit
      // (D6: no double-fit) — it would snap to the seed spread then animate to the
      // cooled framing, the post-load double-snap. Just arm the settle fit.
      this.lastFrame = null;
      this.autoFitArmed = true;
      this.laidOutIds = new Set(nodeIds);
      this.appliedMode = "connectivity";
      this.laidOutScope = this.cacheKey.scope;
    }
  }

  /** Synchronous snapshot for tests/inspection: active representation mode and
   *  overlay flags (the field-side mirror of the controller state). */
  getRepresentationState(): {
    mode: RepresentationMode;
    overlays: { featureCountries: boolean; featureHulls: boolean };
  } {
    return { mode: this.representationMode, overlays: { ...this.overlays } };
  }

  /**
   * Dev/test-only inspection snapshot for the visual + interaction + resource
   * harness. Returns per-node SCREEN coordinates (so the harness can dispatch a
   * pointer at the right pixel), the camera state, the live solver telemetry, and
   * the pinned set. Not part of the seam; never consumed by app code.
   */
  debugSnapshot(): {
    camera: { x: number; y: number; scale: number } | null;
    running: boolean;
    alpha: number;
    pinned: string[];
    nodes: { id: string; sx: number; sy: number; wx: number; wy: number }[];
  } {
    const cam = this.camera;
    const positions = this.layout?.positions ?? new Map();
    const nodes: { id: string; sx: number; sy: number; wx: number; wy: number }[] = [];
    for (const [id, p] of positions) {
      const s = cam ? cam.worldToScreen(p.x, p.y) : { x: p.x, y: p.y };
      nodes.push({ id, sx: s.x, sy: s.y, wx: p.x, wy: p.y });
    }
    return {
      camera: cam ? cam.current : null,
      running: this.layout?.isRunning() ?? false,
      alpha: this.layout?.alpha() ?? 0,
      pinned: [...this.pinned],
      nodes,
    };
  }
}

/** Build the app's scene: one controller, one assembled field behind it. */
export function createDashboardScene(): {
  controller: SceneController;
  field: DashboardField;
} {
  const field = new DashboardField();
  const controller = new Controller(field);
  field.controller = controller;
  return { controller, field };
}
