// Visibility membership diffs with fade transitions (W01.P02.S07, ADR G3.f).
//
// Filter SEMANTICS live engine/view-side (RL-5a): the scene receives only a
// computed visibility membership via the locked `set-visibility` command and
// animates the diff — filtered-out elements fade and shrink over ~200ms
// rather than popping, so the user sees what a filter removed. The hidden
// count is surfaced for the filter bar's "N hidden" chip. Scene-layer
// module: framework-free by design.

import { easeCubicOut } from "d3-ease";
import { interpolateNumber } from "d3-interpolate";

/** Matches gui-spec §3.5/§7.5: UI transitions live in the 150–250ms band. */
export const FADE_DURATION_MS = 200;

export interface VisibilitySample {
  /**
   * Per-id presentation progress for every id in or leaving the stage:
   * 1 = fully visible, 0 = fully hidden. Renderers map progress onto
   * alpha and scale (fade AND shrink per G3.f). Ids absent from the map
   * are settled-hidden and need no draw at all.
   */
  progress: ReadonlyMap<string, number>;
  /** True while any transition is still running (keep ticking). */
  animating: boolean;
}

// --- FILTERED-OUT presentation (graph/Node-items 83:2 "Hidden") ----------------
//
// The binding "filtered-out" state recedes a removed node toward transparent AND
// shrinks it slightly, so a filter reads as the field PULLING BACK rather than a
// hard pop-out — the user sees what the filter removed mid-transition before it
// settles away. The fade and the shrink are the two halves of that treatment.
// These are PURE mappings from the membership-progress `p` (1 = fully present,
// 0 = fully filtered out) onto alpha and scale; the renderer (`nodeSprites`
// `applyVisibility`) composes them with the per-node ghost floor. Owning the
// curve here (the visibility module, RL-5a) keeps the filtered-out look in one
// testable home rather than as magic numbers inline in the sprite layer.

/** The scale a fully filtered-out (p = 0) node shrinks to — it recedes, not
 *  collapses, so the shrink reads as "pulling back" not "vanishing to a point". */
export const FILTERED_OUT_SCALE = 0.6;

/** Map membership-progress to the node's presentation ALPHA (1 = present,
 *  0 = filtered out). The fade is linear in progress: a removed node fades
 *  toward transparent across the transition. */
export function filteredAlpha(progress: number): number {
  return Math.max(0, Math.min(1, progress));
}

/** Map membership-progress to the node's presentation SCALE: it shrinks from full
 *  size at p = 1 down to `FILTERED_OUT_SCALE` at p = 0, so the filtered-out node
 *  recedes as it fades (the binding "Hidden" pull-back). */
export function filteredScale(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  return FILTERED_OUT_SCALE + (1 - FILTERED_OUT_SCALE) * p;
}

interface Transition {
  from: number;
  to: number;
  startedAt: number;
}

/**
 * Tracks one entity class (nodes or edges — instantiate one tracker each).
 * `setVisible` diffs the new membership against the current one and starts
 * fades for entering/leaving ids; `sample(now)` yields per-id progress.
 */
export class VisibilityTracker {
  private visible = new Set<string>();
  private transitions = new Map<string, Transition>();
  /** Settled progress for ids not in transition: 1 if visible. */
  private readonly duration: number;

  constructor(duration = FADE_DURATION_MS) {
    this.duration = duration;
  }

  /** Current settled membership (the post-transition truth). */
  get visibleIds(): ReadonlySet<string> {
    return this.visible;
  }

  /** How many known ids the current membership hides ("142 hidden" chip). */
  hiddenCount(allIds: Iterable<string>): number {
    let hidden = 0;
    for (const id of allIds) {
      if (!this.visible.has(id)) hidden += 1;
    }
    return hidden;
  }

  /**
   * Apply a new membership at time `now`. Entering ids fade 0→1, leaving
   * ids fade 1→0; ids mid-transition retarget from their current progress
   * so rapid filter changes never snap.
   */
  setVisible(ids: ReadonlySet<string>, now: number): void {
    // Leaving: visible (or entering) but not in the new membership.
    for (const id of this.visible) {
      if (!ids.has(id)) {
        this.startTransition(id, this.progressOf(id, now), 0, now);
      }
    }
    // Entering: in the new membership but not currently visible.
    for (const id of ids) {
      if (!this.visible.has(id)) {
        this.startTransition(id, this.progressOf(id, now), 1, now);
      }
    }
    this.visible = new Set(ids);
  }

  /**
   * Sample all running transitions at `now`. Completed transitions settle:
   * fade-ins leave the map (settled visible ids are implicitly 1 via
   * `visibleIds`), fade-outs are dropped entirely.
   */
  sample(now: number): VisibilitySample {
    const progress = new Map<string, number>();
    for (const id of this.visible) {
      if (!this.transitions.has(id)) progress.set(id, 1);
    }
    for (const [id, tr] of this.transitions) {
      const p = this.evaluate(tr, now);
      if (now - tr.startedAt >= this.duration) {
        this.transitions.delete(id);
        if (tr.to === 1) progress.set(id, 1);
        // Settled fade-outs are omitted: nothing left to draw.
      } else {
        progress.set(id, p);
      }
    }
    return { progress, animating: this.transitions.size > 0 };
  }

  private progressOf(id: string, now: number): number {
    const tr = this.transitions.get(id);
    if (tr) return this.evaluate(tr, now);
    return this.visible.has(id) ? 1 : 0;
  }

  private evaluate(tr: Transition, now: number): number {
    const elapsed = (now - tr.startedAt) / this.duration;
    const t = Math.max(0, Math.min(1, elapsed));
    return interpolateNumber(tr.from, tr.to)(easeCubicOut(t));
  }

  private startTransition(id: string, from: number, to: number, now: number): void {
    if (from === to) {
      this.transitions.delete(id);
      return;
    }
    this.transitions.set(id, { from, to, startedAt: now });
  }
}
