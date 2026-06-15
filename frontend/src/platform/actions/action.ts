// The shared action descriptor (dashboard-context-menus ADR, layer 1): the one
// declare-once verb unit the whole app speaks. It generalizes the palette's
// `PaletteCommand` so the command palette and the context menu consume the SAME
// shape and cannot drift (the brief's "standardise the commands"). An action is
// reachable from more than one affordance (palette today, context menu now,
// keybindings later) and either calls an imperative store-only intent (`run` -
// select / pin / filter) or dispatches a mutating verb through the appDispatcher
// seam (`dispatch`); a context-menu action carries exactly one of the two.
//
// Naming: this is the UI-level action DESCRIPTOR, distinct from the dispatch
// seam's wire-level `Action` ({ type, payload, meta }) in `../dispatch/dispatch`.
// A mutating descriptor's `dispatch` field IS a dispatch `Action` body.
//
// Substrate module (platform layer): no imports from app/, scene/, or stores.

import type { ComponentType } from "react";

import type { ActionMeta } from "../dispatch/dispatch";

/**
 * Item marks come from the two sanctioned families
 * (icons-come-from-the-two-sanctioned-families): Lucide for structural action
 * glyphs, Phosphor for domain marks. Both render as components taking a numeric
 * `size`; this is the shared shape that accepts either.
 */
export type ActionIcon = ComponentType<{
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

/**
 * Intent grouping for a menu (the ADR's sectioned-not-flat law). Ordered:
 * navigate/select first, transform (mutating, non-destructive) next, copy after,
 * danger (destructive, arm-to-confirm) last. The palette groups by its own
 * `family` instead and leaves `section` unset.
 */
export type ActionSection = "navigate" | "transform" | "copy" | "danger";

/** Canonical render order of sections in a menu. */
export const ACTION_SECTION_ORDER: readonly ActionSection[] = [
  "navigate",
  "transform",
  "copy",
  "danger",
];

/** The seam dispatch body a mutating action fires (a wire-level dispatch Action). */
export interface ActionDispatch {
  type: string;
  payload?: unknown;
  meta?: ActionMeta;
}

/**
 * One action: a complete, unambiguous intent at the moment it is activated
 * (object-then-action grammar inherited from the palette ADR).
 */
export interface ActionDescriptor {
  /** Stable within its surface; used as the menu item key and armed-item id. */
  id: string;
  label: string;
  /** Menu section (navigate/transform/copy/danger). Palette leaves this unset. */
  section?: ActionSection;
  /** Leading mark (Lucide structural / Phosphor domain), 14px, grayscale-safe. */
  icon?: ActionIcon;
  /** Store-only intent (select/pin/filter/open). Mutually exclusive with `dispatch`. */
  run?: () => void;
  /**
   * Mutating verb routed through the appDispatcher seam
   * (actions-dispatch-through-the-one-seam): the single logged/traced/guardable
   * engine touch. Mutually exclusive with `run`.
   */
  dispatch?: ActionDispatch;
  /** Destructive: arms on first activation, fires on the second. */
  confirm?: boolean;
  /** Exists-but-cannot-run-now: dimmed, reason surfaced (disabled-with-reason). */
  disabled?: boolean;
  disabledReason?: string;
  /**
   * Mutating, so removed from the menu in time-travel mode (the gate is a
   * property of the descriptor, applied uniformly by the resolver registry -
   * never re-derived per surface).
   */
  disabledInTimeTravel?: boolean;
  /** Trailing inline accelerator hint (the cohort's inline-shortcut affordance). */
  accelerator?: string;
}

/** True when the descriptor carries a runnable effect (not a disabled placeholder). */
export function isRunnable(action: ActionDescriptor): boolean {
  return (
    !action.disabled && (action.run !== undefined || action.dispatch !== undefined)
  );
}
