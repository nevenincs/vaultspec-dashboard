// Animated arc growth (dashboard-timeline ADR deferred fast-follow): as the
// playhead scrubs — and during play-the-range — the lineage NODES and derivation
// ARCS are revealed progressively up to the playhead's time, so the corpus
// lineage visibly GROWS over time. This is a PURE client-side reveal computed over
// the already-loaded range lineage (no new engine endpoint, no second clock).
//
// The reveal time T is read from the ONE authoritative playhead truth, not a new
// clock: in time-travel mode T = the playhead instant (`timelineMode.at`), which
// play-the-range writes every frame through `movePlayhead`; in LIVE mode T = now,
// so everything in range is revealed and the default view is unchanged.
//
// Reveal law (faithful to the motion grammar):
//   - A NODE is revealed when its blob-true `created` instant <= T. It fades IN as
//     T crosses that instant (an eased 0..1 factor over a short fade window after
//     the threshold); before its instant it is not revealed (the consumer renders
//     it hidden, or at a faint pre-birth alpha).
//   - An ARC is revealed when BOTH its endpoint nodes are revealed — an arc cannot
//     exist before both documents it connects do, so it is gated on the LATER of
//     its two endpoints' created instants. Its fade factor is that later endpoint's
//     fade, so the arc fades in exactly when its second endpoint is born.
//
// Object constancy by stable id is preserved: the reveal is keyed purely by the
// node/arc id + the carried `created` dates and T — it mints no id and mutates no
// identity. Under prefers-reduced-motion (or a keyboard-initiated instant step) the
// consumer passes `instant`, collapsing the eased fade to a hard 0/1 cut.
//
// Pure + deterministic + unit-testable: every export is a referentially-transparent
// function of its arguments — no DOM, no React, no `Date.now()` read inside (the
// consumer passes `now`).

import type { TimelineMode } from "../../stores/view/viewStore";

/**
 * The default fade window (ms of reveal-time over which a freshly-revealed node or
 * arc ramps from 0 to full). Small relative to a multi-day scrub so the fade reads
 * as a birth, not a lingering ghost; the consumer may override it.
 */
export const DEFAULT_FADE_WINDOW_MS = 12 * 3600_000; // ~half a day of reveal-time

/**
 * The reveal time T from the authoritative playhead truth. In time-travel mode the
 * playhead instant (`timelineMode.at`) is the reveal frontier — play-the-range
 * writes it every frame through `movePlayhead`, so the growth animates for free. In
 * LIVE mode the frontier is `now`, so everything in range is revealed and the
 * default (non-time-travel) view is ungated. Reads the ONE shared mode; adds no
 * second clock.
 */
export function revealTimeFor(mode: TimelineMode, now: number): number {
  return mode.kind === "time-travel" ? mode.at : now;
}

/**
 * Whether the reveal is UNGATED — every in-range node/arc is shown at full
 * treatment with no growth animation. True in LIVE mode: the default view is
 * unchanged by this feature. In time-travel mode the reveal gates on T.
 */
export function isUngated(mode: TimelineMode): boolean {
  return mode.kind === "live";
}

/** A revealed item's draw state: whether it is shown, and its 0..1 fade factor. */
export interface RevealState {
  /** True once the item's birth instant has been crossed by the reveal time T. */
  readonly revealed: boolean;
  /**
   * Eased 0..1 opacity factor. 0 before birth, ramping to 1 across the fade window
   * after birth, then held at 1. Under an instant reveal it is a hard 0 or 1.
   */
  readonly fade: number;
}

/** A not-yet-born item: hidden, zero fade. The shared "before birth" state. */
const PRE_BIRTH: RevealState = { revealed: false, fade: 0 };
/** A fully-revealed item: shown at full treatment. The shared "ungated" state. */
const FULLY_REVEALED: RevealState = { revealed: true, fade: 1 };

/**
 * Ease an elapsed-since-birth fraction (0..1) to an opacity factor. Ease-OUT cubic
 * — fast at the start of the birth, settling into full — matching the timeline's
 * `ease-settle` add-fades-in feel. Clamped to [0, 1].
 */
export function easeReveal(fraction: number): number {
  const f = Math.max(0, Math.min(1, fraction));
  const inv = 1 - f;
  return 1 - inv * inv * inv;
}

/**
 * The reveal state for a single birth instant against the reveal frontier T.
 *
 * `birthMs` is the item's blob-true creation instant (a node's `created`, or an
 * arc's later-endpoint instant), or `null` when no date is carried. A dateless item
 * has no birth to cross, so it is treated as ALWAYS revealed (it cannot be
 * meaningfully grown and must not vanish) — the same degrade-don't-demand stance the
 * surface takes for dateless marks elsewhere.
 *
 * `instant` collapses the eased fade to a hard cut (revealed => 1, else 0): the
 * reduced-motion floor and the keyboard-initiated-step instant path.
 */
export function revealAt(
  birthMs: number | null,
  T: number,
  fadeWindowMs: number,
  instant: boolean,
): RevealState {
  // Dateless => always present (no birth to animate; never hide a real item).
  if (birthMs == null || !Number.isFinite(birthMs)) return FULLY_REVEALED;
  if (T < birthMs) return PRE_BIRTH;
  if (instant) return FULLY_REVEALED;
  const window = fadeWindowMs > 0 ? fadeWindowMs : DEFAULT_FADE_WINDOW_MS;
  return { revealed: true, fade: easeReveal((T - birthMs) / window) };
}

/** The minimal node shape the reveal reads: its id and its blob-true birth instant. */
export interface RevealNode {
  readonly id: string;
  /** The node's `created` instant in epoch-ms, or null when no date is carried. */
  readonly bornMs: number | null;
}

/** The minimal arc shape the reveal reads: its id and its two endpoint node ids. */
export interface RevealArc {
  readonly id: string;
  readonly src: string;
  readonly dst: string;
}

/** Options shared by the node/arc reveal passes. */
export interface RevealOptions {
  /** The reveal frontier (from `revealTimeFor`). */
  readonly T: number;
  /** Fade window in reveal-time ms; defaults to `DEFAULT_FADE_WINDOW_MS`. */
  readonly fadeWindowMs?: number;
  /** Instant reveal (reduced-motion / keyboard step): hard cut, no eased fade. */
  readonly instant?: boolean;
  /**
   * Ungated reveal (LIVE mode): every item fully revealed, growth off. When true
   * the passes return every item at `{ revealed: true, fade: 1 }` regardless of T,
   * so the default view is unchanged.
   */
  readonly ungated?: boolean;
}

/**
 * The reveal state for every node, keyed by node id. In ungated (LIVE) mode every
 * node is fully revealed; otherwise each node's reveal gates on its `bornMs`
 * against T with the eased (or instant) fade. Pure: O(nodes), keyed by stable id.
 */
export function revealNodes(
  nodes: readonly RevealNode[],
  options: RevealOptions,
): Map<string, RevealState> {
  const out = new Map<string, RevealState>();
  const fade = options.fadeWindowMs ?? DEFAULT_FADE_WINDOW_MS;
  const instant = options.instant ?? false;
  for (const node of nodes) {
    out.set(
      node.id,
      options.ungated
        ? FULLY_REVEALED
        : revealAt(node.bornMs, options.T, fade, instant),
    );
  }
  return out;
}

/**
 * The reveal state for every arc, keyed by arc id, given the already-computed node
 * reveal map. An arc is revealed only when BOTH endpoints are revealed; its fade is
 * the MINIMUM of its two endpoints' fades, so it fades in exactly when its later
 * (second-born) endpoint does and never out-paces either document it connects. An
 * arc with a missing endpoint in the map (off-screen / not in slice) is not
 * revealed — it has no positioned pair to grow between. Pure: O(arcs).
 */
export function revealArcs(
  arcs: readonly RevealArc[],
  nodeReveal: ReadonlyMap<string, RevealState>,
  options: RevealOptions,
): Map<string, RevealState> {
  const out = new Map<string, RevealState>();
  for (const arc of arcs) {
    if (options.ungated) {
      out.set(arc.id, FULLY_REVEALED);
      continue;
    }
    const a = nodeReveal.get(arc.src);
    const b = nodeReveal.get(arc.dst);
    if (!a || !b || !a.revealed || !b.revealed) {
      out.set(arc.id, PRE_BIRTH);
      continue;
    }
    out.set(arc.id, { revealed: true, fade: Math.min(a.fade, b.fade) });
  }
  return out;
}
