// Minimap layer (graph-quality plan P02.S05).
//
// Renders a downscaled overview of node positions + a viewport-rect border
// into a chrome-owned canvas. Chrome creates the <canvas>, registers it via
// SceneController.setMinimapCanvas(), and unmounts it on cleanup. The scene
// renders into it on each position-frame callback and on every camera change.
//
// Rendering is plain 2D canvas (not Pixi) — no additional WebGL context.
// Scene-layer module: framework-free by design.

import type { NodePosition } from "../positionCache";
import type { SceneNodeData } from "../sceneController";
import type { CameraState } from "./camera";

/** The fixed canvas size the chrome should create (width × height in px). */
export const MINIMAP_SIZE = 120;

/** Node dot radius in minimap pixels. */
const DOT_RADIUS = 2;

/** Padding inside the minimap canvas (keeps dots from clipping the edge). */
const PADDING = 8;

/** Viewport-rect stroke color. */
const VIEWPORT_COLOR = "#5b8cf5";

/** Node dot color. */
const NODE_COLOR = "#888";

/** Feature node dot color (larger + accent). */
const FEATURE_COLOR = "#5b8cf5";

export class MinimapLayer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private navigateCb: ((wx: number, wy: number) => void) | null = null;

  // Cached data for re-render on camera change:
  private lastPositions = new Map<string, NodePosition>();
  private featureIds = new Set<string>();
  private lastCamera: CameraState | null = null;
  private screenW = 0;
  private screenH = 0;

  // Inverse-transform state from the last render pass (click → world coord).
  private lastMinX = 0;
  private lastMinY = 0;
  private lastWorldScale = 1;
  private lastDrawOffX = 0;
  private lastDrawOffY = 0;

  /**
   * Register a callback that fires when the user clicks the minimap.
   * The callback receives world coordinates so the field can pan to that point.
   */
  setNavigateCallback(cb: ((wx: number, wy: number) => void) | null): void {
    this.navigateCb = cb;
  }

  setCanvas(canvas: HTMLCanvasElement | null): void {
    // Remove the old listener before replacing the canvas.
    if (this.canvas && this.clickHandler) {
      this.canvas.removeEventListener("click", this.clickHandler);
      this.clickHandler = null;
    }
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    if (canvas) {
      this.clickHandler = (e: MouseEvent) => {
        if (!this.navigateCb) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        // Invert the minimap transform to recover world coordinates.
        if (this.lastWorldScale === 0) return;
        const wx = this.lastMinX + (mx - this.lastDrawOffX) / this.lastWorldScale;
        const wy = this.lastMinY + (my - this.lastDrawOffY) / this.lastWorldScale;
        this.navigateCb(wx, wy);
      };
      canvas.addEventListener("click", this.clickHandler);
      this.render();
    }
  }

  /** Called on each layout position frame. */
  updatePositions(
    positions: ReadonlyMap<string, NodePosition>,
    nodes: Iterable<SceneNodeData>,
  ): void {
    this.lastPositions = new Map(positions);
    this.featureIds.clear();
    for (const n of nodes) {
      if (n.memberCount !== undefined && n.memberCount > 0) this.featureIds.add(n.id);
    }
    this.render();
  }

  /** Called on every camera.onChange. */
  updateViewport(camera: CameraState, screenW: number, screenH: number): void {
    this.lastCamera = camera;
    this.screenW = screenW;
    this.screenH = screenH;
    this.render();
  }

  destroy(): void {
    if (this.canvas && this.clickHandler) {
      this.canvas.removeEventListener("click", this.clickHandler);
      this.clickHandler = null;
    }
    this.canvas = null;
    this.ctx = null;
    this.navigateCb = null;
    this.lastPositions.clear();
    this.featureIds.clear();
    this.lastCamera = null;
  }

  private render(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas || this.lastPositions.size === 0) return;

    const w = canvas.width || MINIMAP_SIZE;
    const h = canvas.height || MINIMAP_SIZE;

    // Compute world bounds from node positions.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of this.lastPositions.values()) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const worldW = Math.max(1, maxX - minX);
    const worldH = Math.max(1, maxY - minY);

    const drawW = w - PADDING * 2;
    const drawH = h - PADDING * 2;
    const scale = Math.min(drawW / worldW, drawH / worldH);

    // Store the transform for click-inverse (navigate-to).
    const drawOffX = PADDING + (drawW - worldW * scale) / 2;
    const drawOffY = PADDING + (drawH - worldH * scale) / 2;
    this.lastMinX = minX;
    this.lastMinY = minY;
    this.lastWorldScale = scale;
    this.lastDrawOffX = drawOffX;
    this.lastDrawOffY = drawOffY;

    // World → minimap canvas transform.
    const toMX = (wx: number) => drawOffX + (wx - minX) * scale;
    const toMY = (wy: number) => drawOffY + (wy - minY) * scale;

    // Clear.
    ctx.clearRect(0, 0, w, h);

    // Background — read theme token so the minimap matches the canvas ground.
    const cssRoot = getComputedStyle(document.documentElement);
    const bgColor = cssRoot.getPropertyValue("--color-canvas-bg").trim() || "#faf9f7";
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Draw node dots.
    for (const [id, p] of this.lastPositions) {
      const mx = toMX(p.x);
      const my = toMY(p.y);
      const isFeature = this.featureIds.has(id);
      ctx.beginPath();
      ctx.arc(mx, my, isFeature ? DOT_RADIUS + 1 : DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isFeature ? FEATURE_COLOR : NODE_COLOR;
      ctx.fill();
    }

    // Draw viewport rectangle if camera state is available.
    if (this.lastCamera && this.screenW > 0 && this.screenH > 0) {
      const cam = this.lastCamera;
      // The visible world rect.
      const vLeft = -cam.x / cam.scale;
      const vTop = -cam.y / cam.scale;
      const vRight = vLeft + this.screenW / cam.scale;
      const vBottom = vTop + this.screenH / cam.scale;

      const rx = toMX(vLeft);
      const ry = toMY(vTop);
      const rw = (vRight - vLeft) * scale;
      const rh = (vBottom - vTop) * scale;

      ctx.strokeStyle = VIEWPORT_COLOR;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx, ry, rw, rh);
    }

    // Border — use the rule token so it separates cleanly on any theme.
    ctx.strokeStyle = cssRoot.getPropertyValue("--color-rule").trim() || "#e5e1da";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);
  }
}
