// The pixi-bound Camera class: it owns the world transform (pan + zoom) by mutating
// a pixi `Container`. The framework-free camera math, semantic-zoom levels, spatial
// hit-testing, and the pointer-gesture state machine now live in cameraCore.ts
// (pixi-free), and this file imports them back. This file dies with pixi in the
// cosmos/pixi delete step; cameraCore.ts survives. Scene-layer module.

import type { Container } from "pixi.js";

import {
  type CameraState,
  type SemanticLevel,
  clampScale,
  prefersReducedMotion,
  screenToWorld,
  semanticLevel,
  worldToScreen,
  zoomAt,
} from "./cameraCore";

// --- the camera ------------------------------------------------------------------

export type CameraListener = (state: CameraState, level: SemanticLevel) => void;

/** Lerp damping coefficient per RAF frame (0.85 → moves 15% of gap each frame). */
const ANIM_DAMPING = 0.85;
/** Stop animating when all components are within these thresholds. */
const ANIM_PX_STOP = 0.5;
const ANIM_SCALE_STOP = 0.001;

/** Options for a programmatic camera move (additive; all optional). */
export interface AnimateOptions {
  /** Skip the RAF lerp and snap to the target this frame (keyboard / reduced). */
  instant?: boolean;
}

export class Camera {
  private state: CameraState = { x: 0, y: 0, scale: 1 };
  private world: Container;
  private listeners = new Set<CameraListener>();
  private rafId: number | null = null;
  private reducedMotion: () => boolean;

  constructor(world: Container, reducedMotion: () => boolean = prefersReducedMotion) {
    this.world = world;
    this.reducedMotion = reducedMotion;
  }

  get current(): CameraState {
    return { ...this.state };
  }

  get level(): SemanticLevel {
    return semanticLevel(this.state.scale);
  }

  panBy(dx: number, dy: number): void {
    this.cancelAnimation();
    this.apply({ ...this.state, x: this.state.x + dx, y: this.state.y + dy });
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    this.cancelAnimation();
    this.apply(zoomAt(this.state, sx, sy, factor));
  }

  set(state: CameraState): void {
    this.cancelAnimation();
    this.apply({ ...state, scale: clampScale(state.scale) });
  }

  /**
   * Smoothly animate the camera toward `target` with a damped lerp.
   * Cancels any in-progress animation. `onDone` fires when the camera
   * snaps to the exact target (within ANIM_PX_STOP / ANIM_SCALE_STOP).
   *
   * Used by focus-node and minimap navigate-to so programmatic pan no
   * longer snap-jumps (graph-quality plan P03.S08).
   *
   * The base motion law: when `opts.instant` is set (keyboard-initiated focus)
   * OR `prefers-reduced-motion` is active, the camera SNAPS to the target this
   * frame with no RAF lerp; `onDone` still fires. This closes the reduced-motion
   * violation on the cross-region focus path and keeps keyboard actions instant.
   */
  animateTo(target: CameraState, onDone?: () => void, opts: AnimateOptions = {}): void {
    this.cancelAnimation();
    const tx = target.x;
    const ty = target.y;
    const ts = clampScale(target.scale);

    if (opts.instant || this.reducedMotion()) {
      this.apply({ x: tx, y: ty, scale: ts });
      onDone?.();
      return;
    }

    const step = () => {
      const { x, y, scale } = this.state;
      const dx = tx - x;
      const dy = ty - y;
      const ds = ts - scale;

      if (
        Math.abs(dx) < ANIM_PX_STOP &&
        Math.abs(dy) < ANIM_PX_STOP &&
        Math.abs(ds) < ANIM_SCALE_STOP
      ) {
        this.apply({ x: tx, y: ty, scale: ts });
        this.rafId = null;
        onDone?.();
        return;
      }

      const f = 1 - ANIM_DAMPING;
      this.apply({ x: x + dx * f, y: y + dy * f, scale: scale + ds * f });
      this.rafId = requestAnimationFrame(step);
    };

    this.rafId = requestAnimationFrame(step);
  }

  /** Cancel any in-progress animateTo. */
  cancelAnimation(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return screenToWorld(this.state, sx, sy);
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return worldToScreen(this.state, wx, wy);
  }

  /** Fires on every camera change — drives anchors, LOD, and label culling. */
  onChange(listener: CameraListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private apply(next: CameraState): void {
    this.state = next;
    this.world.position.set(next.x, next.y);
    this.world.scale.set(next.scale);
    for (const listener of this.listeners) {
      listener(this.current, this.level);
    }
  }
}
