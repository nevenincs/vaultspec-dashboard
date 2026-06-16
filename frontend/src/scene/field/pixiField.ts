// The PixiJS v8 field behind the SceneController lifecycle — the GPU substrate
// for the binding node-connection canvas (graph/Hero 85:2, graph/Node-items 83:2;
// figma-parity-reconciliation W03.P07). Scene-layer module: framework-free by
// design — no React imports, ever.
//
// CONNECTION-FIELD TREATMENT (graph/Hero 85:2 — binding): the field is a clean
// instrument register — a warm paper ground with category-coloured circles on a
// thin flat-grey connection mesh, nothing more. This renderer owns only the GPU
// substrate of that treatment: the Pixi Application, its warm background ground
// (the field on which the clean connection lines and circles read), and the
// camera-driven world container the sprite, edge, and overlay layers parent
// under. The node circles (nodeSprites), the flat-grey edges (edgeMeshes), and
// the category hues (categoryColor) layer on top; this file establishes the
// ground they read against.
//
// FROZEN SCENECONTROLLER CONTRACT: this is the renderer side of the locked seam
// (sceneController.ts RL-1..RL-5). The SceneController delegates mount/resize/
// destroy here and forwards SceneCommands to the field assembly's command(); this
// file widens neither the command nor the event union. Data reaches the field
// ONLY through that command channel; selection/hover flow BACK through the
// controller's event channel (dashboard-layer-ownership). This module never
// fetches and never reaches into the stores layer.

import { Application, Container } from "pixi.js";

import type { SceneFieldRenderer } from "../sceneController";
import { cssColorNumber } from "./tokenReads";

/**
 * The warm paper ground the clean connection field reads against (graph/Hero):
 * the --color-canvas-bg scene token as literal hex per theme (0xfdfaf6 light,
 * 0x1a1713 dark; themes-are-oklch: a scene-read token is literal hex, never a
 * var() chain getComputedStyle cannot flatten). Falls back to the light paper
 * value so the field is never transparent in the node test env.
 */
function readCanvasBg(): number {
  return cssColorNumber("--color-canvas-bg", 0xfdfaf6);
}

export class PixiField implements SceneFieldRenderer {
  private app: Application | null = null;
  /** The camera-transformed container all field layers parent under. */
  private world = new Container();
  private mounting: Promise<void> | null = null;
  private destroyed = false;
  /** Bumped by every mount() and destroy(); the async init bails if its captured
   * generation is stale, so a fast mount->destroy->mount cycle (React StrictMode,
   * or a real Stage remount) can neither leak an Application nor wedge with a
   * blank canvas (perf-sweep F#1). */
  private gen = 0;
  private pendingResize: { width: number; height: number } | null = null;
  private readyListeners = new Set<(app: Application) => void>();
  /** Watches data-theme changes to keep the field ground in sync with the theme. */
  private themeObserver: MutationObserver | null = null;

  /**
   * Attach the renderer's canvas into the host element. Pixi v8 init is async;
   * mount() is fire-and-forget from the seam's perspective and internally
   * serializes against destroy() so a fast mount/destroy cycle (React
   * StrictMode-style) can never leak an Application.
   */
  mount(host: HTMLElement): void {
    // No DOM -> no renderer; safe no-op for SSR / node test environment.
    if (typeof document === "undefined") return;
    // Idempotent: already live, or an init is in flight that a destroy() has not
    // cancelled. (The assembly's own guard usually prevents a redundant call.)
    if (this.app || (this.mounting && !this.destroyed)) return;
    this.destroyed = false;
    const myGen = ++this.gen;
    const app = new Application();
    this.mounting = app
      .init({
        // The warm paper ground the clean connection field reads against
        // (graph/Hero): literal-hex --color-canvas-bg per theme, never a var()
        // chain (themes-are-oklch: scene tokens are literal hex).
        background: readCanvasBg(),
        resizeTo: host,
        antialias: true,
        // Render at the device pixel ratio so circles and connection lines are
        // crisp on HiDPI displays (without this Pixi v8 defaults to resolution 1
        // and the field renders soft/blurry). autoDensity keeps the CSS size at
        // the host's logical pixels while the backing store scales by DPR.
        resolution: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
        autoDensity: true,
        preference: "webgl",
      })
      .then(() => {
        // A destroy() or a newer mount() superseded this init during the async
        // window: discard this Application so the cycle neither leaks it nor
        // wedges the field with a blank canvas (F#1).
        if (myGen !== this.gen || this.destroyed) {
          app.destroy(true, { children: true });
          if (myGen === this.gen) this.mounting = null;
          return;
        }
        this.mounting = null;
        this.app = app;
        // Render-on-demand (no idle GPU cost): stop Pixi's automatic per-frame
        // render loop. The field assembly presents EXPLICITLY (app.render()) only
        // when a frame is actually dirty — a layout tick, a camera move, a
        // visibility fade, a theme flip, or a data change. A static, converged,
        // untouched field then presents ZERO frames (the GPU goes fully idle)
        // instead of the previous fixed idle-FPS floor. Every redraw trigger
        // routes through the assembly's requestRender().
        app.ticker.stop();
        app.stage.addChild(this.world);
        host.appendChild(app.canvas);
        this.watchTheme(app);
        if (this.pendingResize) {
          this.resize(this.pendingResize.width, this.pendingResize.height);
          this.pendingResize = null;
        }
        for (const listener of this.readyListeners) {
          listener(app);
        }
      });
  }

  /** Keep the field ground synced to the active theme — a data-theme flip on
   *  <html> re-reads the literal-hex --color-canvas-bg so the connection field
   *  always reads against the correct warm/dark ground. */
  private watchTheme(app: Application): void {
    this.themeObserver = new MutationObserver(() => {
      if (!this.app) return;
      this.app.renderer.background.color = readCanvasBg();
      // Render-on-demand: present the new ground immediately (the ticker is
      // stopped, so nothing else repaints the cleared background otherwise).
      this.app.render();
    });
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    void app;
  }

  /** Fires once per successful mount, with the live Application. */
  onReady(listener: (app: Application) => void): () => void {
    this.readyListeners.add(listener);
    if (this.app) listener(this.app);
    return () => this.readyListeners.delete(listener);
  }

  /** The live Application, once mounted. */
  get application(): Application | null {
    return this.app;
  }

  /** Propagate host resize to the renderer viewport. Also re-pins the backing-
   *  store resolution to the CURRENT device pixel ratio: DPR is set once at init,
   *  but a window dragged between a HiDPI and a standard display changes it, and a
   *  stale resolution renders the field blurry (or needlessly oversamples). Pixi
   *  v8 `renderer.resize(w, h, resolution)` updates both in one call. */
  resize(width: number, height: number): void {
    if (!this.app) {
      this.pendingResize = { width, height };
      return;
    }
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    this.app.renderer.resize(width, height, dpr);
  }

  /** Tear down the renderer; safe to call mid-mount and idempotent. */
  destroy(): void {
    this.destroyed = true;
    this.gen++; // cancel any in-flight mount so its app is discarded on resolve
    this.pendingResize = null;
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
      this.world = new Container();
    }
  }

  /** The world container the field layers parent under (the camera target). */
  get worldContainer(): Container {
    return this.world;
  }

  /** True once the canvas is live in the host. */
  get isMounted(): boolean {
    return this.app !== null;
  }
}
