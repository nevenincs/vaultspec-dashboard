// The PixiJS v8 field behind the SceneController lifecycle (W01.P03.S09,
// ADR G6.b — substrate confirmed by the W01.P01 spike gate).
//
// The field implements the renderer side of the locked seam: the
// SceneController delegates mount/resize/destroy and forwards commands; the
// field owns the Pixi Application, the world container the camera drives,
// and (as the later P03 steps land) the sprite, edge, and layout layers.
// Scene-layer module: framework-free by design — no React imports, ever.

import { Application, Container } from "pixi.js";

import type { SceneFieldRenderer } from "../sceneController";

/**
 * Read the canvas background colour from the --color-canvas-bg CSS variable.
 * Returns a numeric RGB hex suitable for Pixi (e.g. 0xfaf9f7 in light mode,
 * 0x211e1a in dark mode).  Falls back to the paper-warm light value if the
 * variable is absent so the field is never transparent.
 */
function readCanvasBg(): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-canvas-bg")
    .trim();
  if (!raw || !raw.startsWith("#")) return 0xfaf9f7;
  return parseInt(raw.slice(1), 16);
}

export class PixiField implements SceneFieldRenderer {
  private app: Application | null = null;
  /** The camera-transformed container all field layers parent under. */
  private world = new Container();
  private mounting: Promise<void> | null = null;
  private destroyed = false;
  private pendingResize: { width: number; height: number } | null = null;
  private readyListeners = new Set<(app: Application) => void>();
  /** Watches for data-theme changes to keep the canvas background in sync. */
  private themeObserver: MutationObserver | null = null;

  /**
   * Attach the renderer's canvas into the host element. Pixi v8 init is
   * async; mount() is fire-and-forget from the seam's perspective and
   * internally serializes against destroy() so a fast mount/destroy cycle
   * (React StrictMode-style) can never leak an Application.
   */
  mount(host: HTMLElement): void {
    if (this.mounting || this.app) return;
    this.destroyed = false;
    const app = new Application();
    this.mounting = app
      .init({
        background: readCanvasBg(),
        resizeTo: host,
        antialias: true,
        preference: "webgl",
      })
      .then(() => {
        this.mounting = null;
        if (this.destroyed) {
          app.destroy(true, { children: true });
          return;
        }
        this.app = app;
        app.stage.addChild(this.world);
        host.appendChild(app.canvas);
        // Track theme switches so the canvas background stays in sync with
        // the --color-canvas-bg token as data-theme flips on <html>.
        this.themeObserver = new MutationObserver(() => {
          if (this.app) {
            this.app.renderer.background.color = readCanvasBg();
          }
        });
        this.themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-theme"],
        });
        if (this.pendingResize) {
          this.resize(this.pendingResize.width, this.pendingResize.height);
          this.pendingResize = null;
        }
        for (const listener of this.readyListeners) {
          listener(app);
        }
      });
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

  /** Propagate host resize to the renderer viewport. */
  resize(width: number, height: number): void {
    if (!this.app) {
      this.pendingResize = { width, height };
      return;
    }
    this.app.renderer.resize(width, height);
  }

  /** Tear down the renderer; safe to call mid-mount and idempotent. */
  destroy(): void {
    this.destroyed = true;
    this.pendingResize = null;
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
      this.world = new Container();
    }
  }

  /** The world container later field layers parent under (camera target). */
  get worldContainer(): Container {
    return this.world;
  }

  /** True once the canvas is live in the host. */
  get isMounted(): boolean {
    return this.app !== null;
  }
}
