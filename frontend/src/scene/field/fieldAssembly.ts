// Field assembly (W02.P06.S21): composes the W01 parts — Pixi application,
// node sprites, tier-treated edges, camera + gestures, FA2 layout worker,
// anchor driver, visibility trackers, glyphs, position cache — into one
// SceneFieldRenderer driven entirely by seam commands. React never reaches
// past the SceneController. Scene-layer module: framework-free by design.

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
import { Camera, HIT_RADIUS_WORLD, PointerGestures, SpatialHitTester } from "./camera";
import { EdgeMeshLayer } from "./edgeMeshes";
import { ProgrammaticGlyphs } from "./glyphs";
import { FieldLayout } from "./layoutWorker";
import { NodeSpriteLayer } from "./nodeSprites";
import { PixiField } from "./pixiField";

const POSITION_SAVE_INTERVAL_MS = 5_000;

export class DashboardField implements SceneFieldRenderer {
  private base = new PixiField();
  private model: SceneGraphModel = new Model();
  private nodeVisibility = new VisibilityTracker();
  private edgeVisibility = new VisibilityTracker();
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
  private hitTester = new SpatialHitTester();
  private glyphs: ProgrammaticGlyphs | null = null;
  private detachListeners: (() => void)[] = [];
  private lastSave = 0;
  /** Set by the controller on attach (events flow back through the seam). */
  controller: SceneController | null = null;

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

      const offCamera = this.camera.onChange((state) => {
        this.sprites?.setLod(state.scale, this.focusedIds());
        this.anchors?.update();
      });

      // Visibility fades tick on the app ticker while animating.
      const tick = () => {
        const sample = this.nodeVisibility.sample(performance.now());
        if (sample.animating || this.lastAnimating) {
          this.sprites?.applyVisibility(
            sample.progress,
            this.nodeVisibility.visibleIds,
          );
        }
        this.lastAnimating = sample.animating;
      };
      app.ticker.add(tick);

      // Pointer gestures on the canvas emit the locked seam events.
      const gestures = new PointerGestures({
        emit: (event) => this.controller?.emit(event),
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
    this.glyphs?.destroy();
    this.glyphs = null;
    this.base.destroy();
  }

  // --- seam commands ------------------------------------------------------------

  private lastAnimating = false;

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
        this.applyModelToLayers(false);
        break;
      }
      case "set-visibility": {
        const now = performance.now();
        this.nodeVisibility.setVisible(cmd.visibleNodeIds, now);
        this.edgeVisibility.setVisible(cmd.visibleEdgeIds, now);
        // Edges snap on membership (rebuild); nodes fade via the ticker.
        this.edges?.setEdges(
          [...this.model.edges].filter((e) => cmd.visibleEdgeIds.has(e.id)),
        );
        this.lastAnimating = true;
        break;
      }
      case "focus-node": {
        const p = this.sprites?.positionOf(cmd.id);
        if (p && this.camera && this.base.application) {
          const screen = this.base.application.screen;
          const scale = Math.max(this.camera.current.scale, 1.6);
          this.camera.set({
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

  private applyModelToLayers(reseed: boolean): void {
    if (!this.sprites || !this.edges || !this.layout) return;
    const now = Date.now();
    this.sprites.sync(this.model, now);
    const rejected = this.edges.setEdges([...this.model.edges]).rejected;
    for (const err of rejected) {
      // Truthfulness: a malformed tier is a loud console error, never a
      // silent re-bucket. Surfacing into the degradation UI lands with S46.
      console.error(err.message);
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
