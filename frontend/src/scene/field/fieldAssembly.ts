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
  SceneFieldRenderer,
} from "../sceneController";
import { SceneController as Controller } from "../sceneController";
import { VisibilityTracker } from "../visibility";
import { AnchorDriver } from "./anchors";
import { circularArrange } from "./circularLayout";
import { computeEgo } from "./egoHighlight";
import { Camera, HIT_RADIUS_WORLD, PointerGestures, SpatialHitTester } from "./camera";
import { ARROW_VISIBLE_SCALE, EdgeMeshLayer } from "./edgeMeshes";
import { ProgrammaticGlyphs } from "./glyphs";
import type { LayoutParams } from "./layoutWorker";
import { FieldLayout } from "./layoutWorker";
import { MinimapLayer } from "./minimapLayer";
import { NodeSpriteLayer } from "./nodeSprites";
import { PixiField } from "./pixiField";

const POSITION_SAVE_INTERVAL_MS = 5_000;
/** Cross-highlight pulse duration (G2.b event click). */
export const PULSE_MS = 1200;

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
  private pinnedPositions = new Map<string, NodePosition>();
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
  private hitTester = new SpatialHitTester();
  private glyphs: ProgrammaticGlyphs | null = null;
  private detachListeners: (() => void)[] = [];
  private lastSave = 0;
  private layoutMode: "force" | "circular" = "force";
  private layoutParams: LayoutParams = {};
  /** Set by the controller on attach (events flow back through the seam). */
  controller: SceneController | null = null;

  /** Called by SceneController.setMinimapCanvas() — chrome owns the canvas. */
  setMinimapCanvas(canvas: HTMLCanvasElement | null): void {
    this.minimap?.setCanvas(canvas);
  }

  /** Scope the warm-start persistence (the worktree picker drives this). */
  setPersistenceScope(workspace: string, scope: string): void {
    this.cacheKey = { workspace, scope };
  }

  // --- lifecycle -------------------------------------------------------------

  mount(host: HTMLElement): void {
    this.base.mount(host);
    const offReady = this.base.onReady((app) => {
      const world = this.base.worldContainer;
      this.glyphs = new ProgrammaticGlyphs(app.renderer);
      this.edges = new EdgeMeshLayer(world);
      this.sprites = new NodeSpriteLayer(world, this.glyphs);
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
        for (const [id, p] of this.pinnedPositions) {
          if (positions.has(id)) (positions as Map<string, NodePosition>).set(id, p);
        }
        // Auto-fit follows the layout settle until the user takes the
        // camera (first pan/zoom) — then the mental map is theirs.
        if (this.autoFit && positions.size > 0) {
          this.fitToContent(positions);
        }
        this.sprites?.updatePositions((id) => positions.get(id));
        this.edges?.update((id) => positions.get(id));
        this.hitTester.rebuild(positions.entries());
        this.minimap?.updatePositions(positions, this.model.nodes);
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
      });

      this.minimap = new MinimapLayer();
      this.minimap.setNavigateCallback((wx, wy) => {
        this.navigateToWorld(wx, wy);
      });

      const offCamera = this.camera.onChange((state, level) => {
        this.sprites?.setLod(state.scale, this.focusedIds());
        this.edges?.setArrowVisibility(state.scale >= ARROW_VISIBLE_SCALE);
        this.anchors?.update();
        this.minimap?.updateViewport(state, app.screen.width, app.screen.height);
        this.controller?.emit({ kind: "camera-change", scale: state.scale, level });
      });

      // Visibility fades tick on the app ticker while animating — nodes
      // fade/shrink, edges fade through their transition groups (017).
      const tick = () => {
        const now = performance.now();
        const nodeSample = this.nodeVisibility.sample(now);
        const edgeSample = this.edgeVisibility.sample(now);
        if (nodeSample.animating || edgeSample.animating || this.lastAnimating) {
          this.sprites?.applyVisibility(
            nodeSample.progress,
            this.nodeVisibility.visibleIds,
            Date.now(),
          );
          this.edges?.applyVisibility(edgeSample.progress);
        }
        this.lastAnimating = nodeSample.animating || edgeSample.animating;
      };
      app.ticker.add(tick);

      // Pointer gestures on the canvas emit the locked seam events; hover
      // additionally drives the ego-highlight (G3.b) inside the field.
      const gestures = new PointerGestures({
        emit: (event) => {
          if (event.kind === "hover") this.applyEgoHighlight(event.id);
          this.controller?.emit(event);
        },
        panBy: (dx, dy) => {
          this.autoFit = false;
          this.camera?.panBy(dx, dy);
        },
        hitTestScreen: (sx, sy) => {
          const world = this.camera!.screenToWorld(sx, sy);
          const radius = HIT_RADIUS_WORLD / Math.max(0.2, this.camera!.current.scale);
          return this.hitTester.hitTest(world.x, world.y, radius);
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
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        this.autoFit = false;
        const p = local(e);
        this.camera?.zoomAt(p.x, p.y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
      };
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("dblclick", onDbl);
      canvas.addEventListener("wheel", onWheel, { passive: false });

      this.detachListeners.push(
        offPositions,
        offCamera,
        () => app.ticker.remove(tick),
        () => canvas.removeEventListener("pointerdown", onDown),
        () => canvas.removeEventListener("pointermove", onMove),
        () => canvas.removeEventListener("pointerup", onUp),
        () => canvas.removeEventListener("dblclick", onDbl),
        () => canvas.removeEventListener("wheel", onWheel),
      );

      // Data may have arrived before the renderer was live.
      this.applyModelToLayers(true);
    });
    this.detachListeners.push(offReady);
  }

  resize(width: number, height: number): void {
    this.base.resize(width, height);
  }

  destroy(): void {
    for (const detach of this.detachListeners) detach();
    this.detachListeners = [];
    this.layout?.destroy();
    this.layout = null;
    this.sprites = null;
    this.edges = null;
    this.camera = null;
    this.anchors = null;
    this.minimap?.destroy();
    this.minimap = null;
    this.glyphs?.destroy();
    this.glyphs = null;
    this.base.destroy();
  }

  // --- seam commands ------------------------------------------------------------

  private lastAnimating = false;
  private pulseToken = 0;

  command(cmd: SceneCommand): void {
    switch (cmd.kind) {
      case "set-data": {
        this.model.setData(cmd.nodes, cmd.edges);
        this.autoFit = true;
        this.applyModelToLayers(true);
        break;
      }
      case "apply-deltas": {
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
        // Both entity classes fade through their trackers on the ticker.
        this.lastAnimating = true;
        break;
      }
      case "focus-node": {
        const p = this.sprites?.positionOf(cmd.id);
        if (p && this.camera && this.base.application) {
          const screen = this.base.application.screen;
          const scale = Math.max(this.camera.current.scale, 1.6);
          this.camera.animateTo({
            scale,
            x: screen.width / 2 - p.x * scale,
            y: screen.height / 2 - p.y * scale,
          });
        }
        break;
      }
      case "set-pinned": {
        this.pinned = new Set(cmd.ids);
        this.pinnedPositions = new Map(
          [...this.pinned].flatMap((id) => {
            const p = this.layout?.positions.get(id);
            return p ? [[id, p] as const] : [];
          }),
        );
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
          this.autoFit = true;
          this.fitToContent(this.layout.positions);
        }
        break;
      }
      case "reset-view": {
        this.autoFit = false;
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
          // Switch to circular: seed positions on circle, stop FA2.
          if (this.layout && this.model.nodeCount > 0) {
            const nodeIds = [...this.model.nodes].map((n) => n.id);
            const positions = circularArrange(nodeIds);
            this.layout.stop();
            this.layout.init(nodeIds, [], positions);
            // Don't restart FA2 in circular mode — positions are already set.
          }
        } else {
          // Switch back to force: restart FA2 from current positions.
          if (this.layout) {
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
    }
  }

  // --- internals -------------------------------------------------------------------

  private autoFit = true;

  /** Center and scale the camera to the field's content bounds. */
  private fitToContent(positions: ReadonlyMap<string, NodePosition>): void {
    const app = this.base.application;
    if (!app || !this.camera) return;
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
    this.camera.set({
      scale,
      x: app.screen.width / 2 - (minX + w / 2) * scale,
      y: app.screen.height / 2 - (minY + h / 2) * scale,
    });
  }

  private focusedIds(): ReadonlySet<string> {
    return this.pinned;
  }

  /** Pan (animated) to center on a world coordinate — used by minimap clicks. */
  private navigateToWorld(wx: number, wy: number): void {
    if (!this.camera || !this.base.application) return;
    const screen = this.base.application.screen;
    const scale = this.camera.current.scale;
    this.autoFit = false;
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

  private applyModelToLayers(reseed: boolean): void {
    if (!this.sprites || !this.edges || !this.layout) return;
    const now = Date.now();
    this.sprites.sync(this.model, now);
    const rejected = this.edges.setEdges([...this.model.edges]).rejected;
    if (rejected.length > 0) {
      // Truthfulness: a malformed tier is a loud, structured log, never a
      // silent re-bucket. Surfacing into the degradation UI lands with S46.
      const assemblyLog = logger.child("scene.field-assembly");
      for (const err of rejected) {
        assemblyLog.error(err.message);
      }
    }
    const nodeIds = [...this.model.nodes].map((n) => n.id);
    const edgeRefs = [...this.model.edges].map((e) => ({
      id: e.id,
      src: e.src,
      dst: e.dst,
    }));
    if (reseed) {
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
      this.layout.init(nodeIds, edgeRefs, warm);
      this.layout.start();
    }
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
