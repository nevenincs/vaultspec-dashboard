// Camera, semantic zoom, and pointer hit-testing (W01.P03.S12, ADR G3.b).
//
// The camera owns the world transform (pan + zoom); zoom is anchored at the
// cursor and clamped. Zoom is SEMANTIC: discrete levels (constellation →
// feature → document) gate what unfolds, per the semantic-zoom literature
// the ADR cites — geometric scale is the input, the level is the meaning.
// Hit-testing runs on a spatial hash over node positions (batched sprites
// carry no per-sprite interaction) and pointer gestures emit the locked
// seam events: hover, select (click), open (double-click). Scene-layer
// module: framework-free by design.

import type { Container } from "pixi.js";

import { prefersReducedMotion } from "../../platform/reducedMotion";
import type { SceneEvent } from "../sceneController";

// --- pure camera math (unit-tested) ------------------------------------------

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;

/** Discrete semantic-zoom levels (§3.1 LOD discipline rides these). */
export type SemanticLevel = "constellation" | "feature" | "document";

export const FEATURE_LEVEL_SCALE = 0.6;
export const DOCUMENT_LEVEL_SCALE = 1.6;

export function semanticLevel(scale: number): SemanticLevel {
  if (scale >= DOCUMENT_LEVEL_SCALE) return "document";
  if (scale >= FEATURE_LEVEL_SCALE) return "feature";
  return "constellation";
}

export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

export function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

/** Zoom by `factor` keeping the world point under (sx, sy) stationary. */
export function zoomAt(
  state: CameraState,
  sx: number,
  sy: number,
  factor: number,
): CameraState {
  const scale = clampScale(state.scale * factor);
  const applied = scale / state.scale;
  return {
    scale,
    x: sx - (sx - state.x) * applied,
    y: sy - (sy - state.y) * applied,
  };
}

export function screenToWorld(
  state: CameraState,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return { x: (sx - state.x) / state.scale, y: (sy - state.y) / state.scale };
}

export function worldToScreen(
  state: CameraState,
  wx: number,
  wy: number,
): { x: number; y: number } {
  return { x: wx * state.scale + state.x, y: wy * state.scale + state.y };
}

// --- spatial hit-testing (unit-tested) -----------------------------------------

/** Grid-hashed nearest-node lookup; rebuild when positions settle/change. */
export class SpatialHitTester {
  private cells = new Map<string, { id: string; x: number; y: number }[]>();
  private cellSize: number;

  constructor(cellSize = 32) {
    this.cellSize = cellSize;
  }

  rebuild(positions: Iterable<[string, { x: number; y: number }]>): void {
    this.cells.clear();
    for (const [id, p] of positions) {
      const key = this.cellKey(p.x, p.y);
      let cell = this.cells.get(key);
      if (!cell) {
        cell = [];
        this.cells.set(key, cell);
      }
      cell.push({ id, x: p.x, y: p.y });
    }
  }

  /** Nearest node id within `radius` world units of (x, y), or null. */
  hitTest(x: number, y: number, radius: number): string | null {
    const r2 = radius * radius;
    let best: string | null = null;
    let bestD2 = Infinity;
    const c = this.cellSize;
    for (
      let cx = Math.floor((x - radius) / c);
      cx <= Math.floor((x + radius) / c);
      cx++
    ) {
      for (
        let cy = Math.floor((y - radius) / c);
        cy <= Math.floor((y + radius) / c);
        cy++
      ) {
        const cell = this.cells.get(`${cx}:${cy}`);
        if (!cell) continue;
        for (const node of cell) {
          const d2 = (node.x - x) ** 2 + (node.y - y) ** 2;
          if (d2 <= r2 && d2 < bestD2) {
            bestD2 = d2;
            best = node.id;
          }
        }
      }
    }
    return best;
  }

  private cellKey(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)}:${Math.floor(y / this.cellSize)}`;
  }
}

// --- pointer gesture state machine (unit-tested via synthetic events) ----------

/** Minimal pointer event shape — keeps the state machine DOM-free. */
export interface PointerSample {
  x: number;
  y: number;
}

export const DRAG_THRESHOLD_PX = 4;
export const HIT_RADIUS_WORLD = 10;

interface GestureCallbacks {
  emit(event: SceneEvent): void;
  panBy(dx: number, dy: number): void;
  hitTestScreen(sx: number, sy: number): string | null;
  /** Convert a screen sample to a world coordinate (node-drag, D3). */
  screenToWorld(sx: number, sy: number): { x: number; y: number };
  /** Drag a node to a world position each move past the threshold (D3). */
  nodeDragTo(id: string, worldX: number, worldY: number): void;
  /** End a node-drag; `moved` records a sticky pin only when the drag crossed
   *  the threshold (a below-threshold press stays a plain select). (D3) */
  nodeDragEnd(id: string, moved: boolean): void;
}

/**
 * Click-vs-drag discrimination, node-drag, and hover tracking (D3). On
 * pointer-down the gesture HIT-TESTS: if a node is under the pointer it records a
 * PENDING node-drag on that id; empty canvas arms a pan. On move past the 4px
 * threshold the gesture diverges by WHAT WAS UNDER THE POINTER AT DOWN-TIME — a
 * node hit becomes a node-drag (fx/fy via nodeDragTo), empty canvas a camera pan.
 * On up: a below-threshold press is still a select (hit or clear), exactly as
 * before; a node-drag past threshold ends and records a sticky pin; a pan past
 * threshold is swallowed. Double-click opens; plain moves emit hover transitions.
 */
export class PointerGestures {
  private callbacks: GestureCallbacks;
  private down: PointerSample | null = null;
  private dragging = false;
  private last: PointerSample = { x: 0, y: 0 };
  private hovered: string | null = null;
  /** The node hit at pointer-down, if any — the node-drag candidate (D3). */
  private downHit: string | null = null;

  constructor(callbacks: GestureCallbacks) {
    this.callbacks = callbacks;
  }

  pointerDown(p: PointerSample): void {
    this.down = p;
    this.dragging = false;
    this.last = p;
    // Disambiguate at DOWN-TIME (D3): a node under the pointer is a node-drag
    // candidate; empty canvas arms a camera pan. The branch is only TAKEN once
    // the move crosses the threshold, so a press-and-release stays a select.
    this.downHit = this.callbacks.hitTestScreen(p.x, p.y);
  }

  pointerMove(p: PointerSample): void {
    if (this.down) {
      const past =
        this.dragging ||
        Math.hypot(p.x - this.down.x, p.y - this.down.y) > DRAG_THRESHOLD_PX;
      if (past) {
        this.dragging = true;
        if (this.downHit) {
          // Node-drag (D3): move the node to the world point under the pointer.
          const world = this.callbacks.screenToWorld(p.x, p.y);
          this.callbacks.nodeDragTo(this.downHit, world.x, world.y);
        } else {
          // Empty-canvas drag stays a camera pan, exactly as before.
          this.callbacks.panBy(p.x - this.last.x, p.y - this.last.y);
        }
      }
      this.last = p;
      return;
    }
    const hit = this.callbacks.hitTestScreen(p.x, p.y);
    if (hit !== this.hovered) {
      this.hovered = hit;
      this.callbacks.emit({ kind: "hover", id: hit });
    }
  }

  pointerUp(p: PointerSample): void {
    const wasDrag = this.dragging;
    const downHit = this.downHit;
    this.down = null;
    this.dragging = false;
    this.downHit = null;
    if (downHit) {
      // A node was grabbed on down: end the drag (record a sticky pin only if it
      // actually moved past the threshold). A below-threshold node press is still
      // a plain select — click semantics are unchanged (D3).
      this.callbacks.nodeDragEnd(downHit, wasDrag);
      if (!wasDrag) {
        this.callbacks.emit({ kind: "select", id: downHit });
      }
      return;
    }
    // Empty-canvas: a pan is swallowed; a below-threshold press selects/clears.
    if (wasDrag) return;
    this.callbacks.emit({ kind: "select", id: this.callbacks.hitTestScreen(p.x, p.y) });
  }

  doubleClick(p: PointerSample): void {
    const hit = this.callbacks.hitTestScreen(p.x, p.y);
    if (hit) this.callbacks.emit({ kind: "open", id: hit });
  }

  /**
   * Right-click (dashboard-context-menus W04.P10): emit a context-menu event for
   * the node under the pointer (or null for empty canvas). `client` carries the
   * viewport coords for the menu anchor; the local sample is for the hit-test.
   */
  contextMenu(p: PointerSample, client: { x: number; y: number }): void {
    this.callbacks.emit({
      kind: "context-menu",
      id: this.callbacks.hitTestScreen(p.x, p.y),
      target: "node",
      clientX: client.x,
      clientY: client.y,
    });
  }

  /** The node currently under the pointer, if any. */
  get hoveredId(): string | null {
    return this.hovered;
  }
}

// --- the camera ------------------------------------------------------------------

export type CameraListener = (state: CameraState, level: SemanticLevel) => void;

/** Lerp damping coefficient per RAF frame (0.85 → moves 15% of gap each frame). */
const ANIM_DAMPING = 0.85;
/** Stop animating when all components are within these thresholds. */
const ANIM_PX_STOP = 0.5;
const ANIM_SCALE_STOP = 0.001;

export { prefersReducedMotion };

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
