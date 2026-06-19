// Minimap layer (graph-quality plan P02.S05; recodified W02.P11.S27).
//
// Renders a downscaled overview of node positions + a viewport-rect border
// into a chrome-owned canvas. Chrome creates the <canvas>, registers it via
// SceneController.setMinimapCanvas(), and unmounts it on cleanup. The scene
// renders into it on each position-frame callback and on every camera change.
//
// Rendering is plain 2D canvas (not Pixi) — no additional WebGL context.
// Scene-layer module: framework-free by design.
//
// Per the minimap surface ADR (2026-06-14-dashboard-minimap-adr):
//   • every colour resolves from the shared :root canvas token layer, so the
//     overview and the field it overviews share one palette per theme;
//   • the viewport rectangle is the SINGLE stroked outline on the overview, so
//     its position reads in grayscale, not by hue alone;
//   • the layer always paints its attenuated empty ground + frame — the
//     loading (no layout yet) and empty (no field) states are designed, never
//     blank or a spinner. Empty draws a quiet "nothing to map yet" affordance;
//   • click and drag both navigate: the click/drag recovers a world coordinate
//     and forwards it through the navigate callback. The SCENE applies the
//     camera change (camera.animateTo, which snaps under prefers-reduced-motion);
//     the chrome never moves the camera itself.

import type { NodePosition } from "../positionCache";
import type { SceneNodeData } from "../sceneController";
import type { CameraState } from "./cameraCore";
import { cssColorString } from "./tokenReads";

/** The fixed canvas size the chrome should create (width × height in px). */
export const MINIMAP_SIZE = 120;

/** Node dot radius in minimap pixels. */
const DOT_RADIUS = 2;

/** Padding inside the minimap canvas (keeps dots from clipping the edge). */
const PADDING = 8;

// Minimap colours are read from the theme token layer at render time (MEDIUM-3)
// rather than hardcoded: the prior cold-blue #5b8cf5 was a forbidden second
// accent (ADR layer 3: one muted earthy accent only). Feature dots and the
// viewport rect take the accent-tone token; node dots take a muted-ink token.
// These reads use the literal-hex scene-read tokens (resolved per theme), which
// real browsers return verbatim from getPropertyValue - unlike the var()-aliased
// chrome tokens, whose chain getPropertyValue does not resolve for custom props.

/** Fallback colours when the token layer is absent (node test env / pre-paint). */
const VIEWPORT_FALLBACK = "#3f774d";
const NODE_FALLBACK = "#5f5a53";
const FEATURE_FALLBACK = "#3f774d";
const BG_FALLBACK = "#fdfaf6";
const RULE_FALLBACK = "#ebe6e0";

/** The quiet empty-state copy drawn when the served slice has no nodes. */
const EMPTY_LABEL = "nothing to map yet";

export class MinimapLayer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private pointerDownHandler: ((e: PointerEvent) => void) | null = null;
  private pointerMoveHandler: ((e: PointerEvent) => void) | null = null;
  private pointerUpHandler: ((e: PointerEvent) => void) | null = null;
  private dragging = false;
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
   * Register a callback that fires when the user clicks or drags the minimap.
   * The callback receives world coordinates so the scene can pan the camera to
   * that point. The chrome never moves the camera itself — the scene applies the
   * change (camera.animateTo snaps under prefers-reduced-motion).
   */
  setNavigateCallback(cb: ((wx: number, wy: number) => void) | null): void {
    this.navigateCb = cb;
  }

  setCanvas(canvas: HTMLCanvasElement | null): void {
    // Remove old listeners before replacing the canvas.
    this.detachListeners();
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    if (canvas) {
      this.attachListeners(canvas);
      this.render();
    }
  }

  /** Recover the world coordinate under a pointer position on the canvas. */
  private worldAt(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    if (this.lastWorldScale === 0) return null;
    const wx = this.lastMinX + (mx - this.lastDrawOffX) / this.lastWorldScale;
    const wy = this.lastMinY + (my - this.lastDrawOffY) / this.lastWorldScale;
    return { wx, wy };
  }

  private attachListeners(canvas: HTMLCanvasElement): void {
    // The minimap's click/drag-to-pan is intentionally pointer-SUPPLEMENTARY: it
    // is a convenience over the field's own navigation, never the sole means of
    // moving the camera. Full keyboard pan/zoom lives on the main field and the
    // NavToolbar (and the widget's own header carries a keyboard recenter), so
    // the absence of keyboard panning ON THE CANVAS is by design, not a gap.
    //
    // Click-to-navigate: a single click recenters the camera on the clicked
    // world point. Retained alongside drag so a tap still works where pointer
    // events are not fully simulated.
    this.clickHandler = (e: MouseEvent) => {
      if (!this.navigateCb || this.dragging) return;
      const world = this.worldAt(canvas, e.clientX, e.clientY);
      if (world) this.navigateCb(world.wx, world.wy);
    };
    canvas.addEventListener("click", this.clickHandler);

    // Drag-to-navigate: pressing and dragging pans the camera continuously to
    // follow the pointer — a scrub-the-field gesture. Both gestures resolve to
    // the same navigate callback, so pointer and (the widget's) keyboard paths
    // converge on one channel.
    this.pointerDownHandler = (e: PointerEvent) => {
      if (!this.navigateCb) return;
      this.dragging = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // setPointerCapture can throw in non-DOM hosts / detached canvases.
      }
      const world = this.worldAt(canvas, e.clientX, e.clientY);
      if (world) this.navigateCb(world.wx, world.wy);
    };
    this.pointerMoveHandler = (e: PointerEvent) => {
      if (!this.dragging || !this.navigateCb) return;
      const world = this.worldAt(canvas, e.clientX, e.clientY);
      if (world) this.navigateCb(world.wx, world.wy);
    };
    this.pointerUpHandler = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignore — capture may not have been held
      }
    };
    canvas.addEventListener("pointerdown", this.pointerDownHandler);
    canvas.addEventListener("pointermove", this.pointerMoveHandler);
    canvas.addEventListener("pointerup", this.pointerUpHandler);
    canvas.addEventListener("pointercancel", this.pointerUpHandler);
  }

  private detachListeners(): void {
    const c = this.canvas;
    if (!c) return;
    if (this.clickHandler) c.removeEventListener("click", this.clickHandler);
    if (this.pointerDownHandler)
      c.removeEventListener("pointerdown", this.pointerDownHandler);
    if (this.pointerMoveHandler)
      c.removeEventListener("pointermove", this.pointerMoveHandler);
    if (this.pointerUpHandler) {
      c.removeEventListener("pointerup", this.pointerUpHandler);
      c.removeEventListener("pointercancel", this.pointerUpHandler);
    }
    this.clickHandler = null;
    this.pointerDownHandler = null;
    this.pointerMoveHandler = null;
    this.pointerUpHandler = null;
    this.dragging = false;
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
    this.detachListeners();
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
    if (!ctx || !canvas) return;

    const w = canvas.width || MINIMAP_SIZE;
    const h = canvas.height || MINIMAP_SIZE;

    // Colours read from the theme token layer so the minimap tracks the active
    // theme and uses no off-palette colour (MEDIUM-3). Resolved once per pass.
    const cssRoot = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) =>
      cssColorString(name, fallback, cssRoot);

    const bgColor = token("--color-canvas-bg", BG_FALLBACK);
    const ruleColor = token("--color-rule", RULE_FALLBACK);
    // Feature dots and the viewport rect both bind to --color-state-active: this
    // is the intentional accent / structural-tier unification — the dashboard's
    // single muted earthy accent IS the structural-tier tone, so there is no
    // separate scene-readable "accent" hex token to split them onto (and minting
    // a second would reintroduce the forbidden second accent). One hue, spent on
    // the feature marks and the viewport outline as redundant reinforcement.
    const featureColor = token("--color-state-active", FEATURE_FALLBACK);
    const nodeColor = token("--color-ink-muted", NODE_FALLBACK);
    const viewportColor = token("--color-state-active", VIEWPORT_FALLBACK);

    // Clear, then paint the attenuated empty ground + frame ALWAYS. This is the
    // loading state (no layout frame yet) and the empty state (no field): the
    // minimap is a passive overview, so it shows its ground rather than a
    // spinner or a blank canvas (ADR "States": loading / empty / degraded).
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Empty / no-field: a quiet one-line affordance, never an error. Drawn when
    // the served slice has no nodes to overview.
    //
    // The ADR specifies the FAINT ink role for this copy, but --color-ink-faint
    // is var()-aliased on :root (a semantic-token chain), so it is NOT resolvable
    // through getComputedStyle().getPropertyValue() at the scene layer — only the
    // literal-hex scene-read subset is (--color-canvas-bg / --color-ink /
    // --color-ink-muted / --color-rule / --color-tier-* / --color-state-*). So
    // --color-ink-muted is the readable-token approximation of the faint role
    // here; it is the next-faintest scene-readable ink. Its contrast on the warm
    // low-chroma scene ground (--color-canvas-bg) clears the legibility floor in
    // every theme: muted/canvas-bg = 6.57:1 (light), 7.21:1 (dark), 14.46:1
    // (high-contrast), all >= 4.5:1. If a scene-readable faint hex token lands on
    // :root in a later cycle, switch this fill to it (styles.css is frozen now).
    if (this.lastPositions.size === 0) {
      this.drawFrame(ctx, w, h, ruleColor);
      ctx.fillStyle = nodeColor;
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(EMPTY_LABEL, w / 2, h / 2);
      // Reset text alignment so it does not bleed into a later pass.
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
      return;
    }

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

    // Store the transform for click/drag-inverse (navigate-to).
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

    // Draw node dots. Feature/constellation nodes are drawn slightly larger and
    // in the shared accent as redundant reinforcement; ordinary nodes take the
    // muted-ink token. Marks are small and unlabelled — shape, not identity.
    for (const [id, p] of this.lastPositions) {
      const mx = toMX(p.x);
      const my = toMY(p.y);
      const isFeature = this.featureIds.has(id);
      ctx.beginPath();
      ctx.arc(mx, my, isFeature ? DOT_RADIUS + 1 : DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isFeature ? featureColor : nodeColor;
      ctx.fill();
    }

    // Draw the viewport rectangle if camera state is available. The rect is the
    // SINGLE stroked outline on the overview, so its position reads in grayscale
    // (not by hue alone). It is clamped to the canvas bounds so an off-screen or
    // out-of-bounds viewport still reads as an edge-pinned rectangle rather than
    // drawing off-canvas (ADR "States": viewport-out-of-bounds).
    if (this.lastCamera && this.screenW > 0 && this.screenH > 0) {
      const cam = this.lastCamera;
      const vLeft = -cam.x / cam.scale;
      const vTop = -cam.y / cam.scale;
      const vRight = vLeft + this.screenW / cam.scale;
      const vBottom = vTop + this.screenH / cam.scale;

      const rawX = toMX(vLeft);
      const rawY = toMY(vTop);
      const rawW = (vRight - vLeft) * scale;
      const rawH = (vBottom - vTop) * scale;

      // Clamp the rectangle into [0, w] × [0, h] so it never strokes off-canvas.
      const x0 = Math.max(0, Math.min(w, rawX));
      const y0 = Math.max(0, Math.min(h, rawY));
      const x1 = Math.max(0, Math.min(w, rawX + rawW));
      const y1 = Math.max(0, Math.min(h, rawY + rawH));

      ctx.strokeStyle = viewportColor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
    }

    // Frame — the rule token so it separates cleanly on any theme.
    this.drawFrame(ctx, w, h, ruleColor);
  }

  /** Stroke the 1px frame border in the rule token. */
  private drawFrame(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    ruleColor: string,
  ): void {
    ctx.strokeStyle = ruleColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);
  }
}
