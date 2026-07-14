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

import { normalizeAction, type ActionMeta } from "../dispatch/dispatch";
import { appDispatcher } from "../dispatch/middleware";
import type { MessageResolutionResult } from "../localization/fallback";
import {
  normalizeActionConfirmationDescriptor,
  normalizeMessageDescriptor,
  type ActionConfirmationDescriptor,
  type MessageDescriptor,
} from "../localization/message";

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
 * danger (destructive, arm-to-confirm), and `global` last - the terminal tail for
 * the kind-agnostic global-tail actions appended to every menu (global-context-
 * actions ADR D1). The palette groups by its own `family` instead and leaves
 * `section` unset.
 */
export type ActionSection = "navigate" | "transform" | "copy" | "danger" | "global";

/** Canonical render order of sections in a menu; `global` is always the trailing tail. */
export const ACTION_SECTION_ORDER: readonly ActionSection[] = [
  "navigate",
  "transform",
  "copy",
  "danger",
  "global",
];
export const ACTION_DESCRIPTOR_ID_MAX_CHARS = 512;
export const ACTION_DESCRIPTOR_LABEL_MAX_CHARS = 256;
export const ACTION_DESCRIPTOR_META_TEXT_MAX_CHARS = 256;
export const ACTION_DESCRIPTOR_ACCELERATOR_MAX_CHARS = 64;

export function normalizeActionDescriptorId(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= ACTION_DESCRIPTOR_ID_MAX_CHARS
    ? normalized
    : fallback;
}

export function normalizeActionDescriptorLabel(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= ACTION_DESCRIPTOR_LABEL_MAX_CHARS
    ? normalized
    : fallback;
}

export function normalizeActionDescriptorText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function actionDescriptorRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeOptionalActionDescriptorText(
  value: unknown,
  maxChars: number,
): string | undefined {
  const normalized = normalizeActionDescriptorText(value).trim();
  return normalized.length > 0 && normalized.length <= maxChars
    ? normalized
    : undefined;
}

function normalizeActionPresentation(
  value: unknown,
  maxChars: number,
): ActionPresentation | undefined {
  if (typeof value === "string") {
    return normalizeOptionalActionDescriptorText(value, maxChars);
  }
  return normalizeMessageDescriptor(value) ?? undefined;
}

function normalizeActionDescriptorSection(value: unknown): ActionSection | undefined {
  return typeof value === "string" &&
    ACTION_SECTION_ORDER.includes(value.trim() as ActionSection)
    ? (value.trim() as ActionSection)
    : undefined;
}

/** The seam dispatch body a mutating action fires (a wire-level dispatch Action). */
export interface ActionDispatch {
  type: string;
  payload?: unknown;
  meta?: ActionMeta;
}

export type ActionPresentation = string | MessageDescriptor;

export type ActionPresentationResolver = (
  descriptor: MessageDescriptor,
) => MessageResolutionResult;

/** Resolve transitional string-or-descriptor copy through an injected React resolver. */
export function resolveActionPresentation(
  presentation: ActionPresentation,
  resolveDescriptor: ActionPresentationResolver,
): MessageResolutionResult {
  return typeof presentation === "string"
    ? Object.freeze({ message: presentation, usedFallback: false })
    : resolveDescriptor(presentation);
}

export interface ActionDescriptorBase {
  /** Stable within its surface; used as the menu item key and armed-item id. */
  id: string;
  label: ActionPresentation;
  /** Menu section (navigate/transform/copy/danger). Palette leaves this unset. */
  section?: ActionSection;
  /** Leading mark (Lucide structural / Phosphor domain), 14px, grayscale-safe. */
  icon?: ActionIcon;
  /** Transitional legacy flag; normalization retains only literal `true`. */
  confirm?: boolean;
  /** Typed confirmation content for destructive and guarded actions. */
  confirmation?: ActionConfirmationDescriptor;
  /** Exists-but-cannot-run-now: dimmed, reason surfaced (disabled-with-reason). */
  disabled?: boolean;
  disabledReason?: ActionPresentation;
  /**
   * Mutating, so removed from the menu in time-travel mode (the gate is a
   * property of the descriptor, applied uniformly by the resolver registry -
   * never re-derived per surface).
   */
  disabledInTimeTravel?: boolean;
  /** Trailing inline accelerator hint (the cohort's inline-shortcut affordance). */
  accelerator?: string;
}

/**
 * One action: a complete, unambiguous intent at the moment it is activated
 * (object-then-action grammar inherited from the palette ADR).
 *
 * The terminal effect has exactly one lane when runnable: either a store-only
 * `run` intent or an appDispatcher `dispatch` body. Placeholder/disabled rows may
 * carry neither, but never both.
 */
export type ActionDescriptor =
  | (ActionDescriptorBase & {
      /** Store-only intent (select/pin/filter/open). */
      run: () => void;
      dispatch?: never;
    })
  | (ActionDescriptorBase & {
      /**
       * Mutating verb routed through the appDispatcher seam
       * (actions-dispatch-through-the-one-seam): the single logged/traced/guardable
       * engine touch.
       */
      dispatch: ActionDispatch;
      run?: never;
    })
  | (ActionDescriptorBase & {
      run?: undefined;
      dispatch?: undefined;
    });

export function normalizeActionDescriptor(action: unknown): ActionDescriptor | null {
  const record = actionDescriptorRecord(action);
  if (record === null) return null;

  const id = normalizeOptionalActionDescriptorText(
    record.id,
    ACTION_DESCRIPTOR_ID_MAX_CHARS,
  );
  const label = normalizeActionPresentation(
    record.label,
    ACTION_DESCRIPTOR_LABEL_MAX_CHARS,
  );
  if (id === undefined || label === undefined) return null;

  const base: ActionDescriptorBase = { id, label };
  const section = normalizeActionDescriptorSection(record.section);
  if (section !== undefined) base.section = section;
  if (typeof record.icon === "function") base.icon = record.icon as ActionIcon;
  if (record.confirm === true && Object.hasOwn(record, "confirmation")) return null;
  if (record.confirm === true) base.confirm = true;
  if (Object.hasOwn(record, "confirmation")) {
    const confirmation = normalizeActionConfirmationDescriptor(record.confirmation);
    if (confirmation === null) return null;
    base.confirmation = confirmation;
  }
  if (record.disabled === true) base.disabled = true;
  const disabledReason = normalizeActionPresentation(
    record.disabledReason,
    ACTION_DESCRIPTOR_META_TEXT_MAX_CHARS,
  );
  if (disabledReason !== undefined) base.disabledReason = disabledReason;
  if (record.disabledInTimeTravel === true) base.disabledInTimeTravel = true;
  const accelerator = normalizeOptionalActionDescriptorText(
    record.accelerator,
    ACTION_DESCRIPTOR_ACCELERATOR_MAX_CHARS,
  );
  if (accelerator !== undefined) base.accelerator = accelerator;

  const run = typeof record.run === "function" ? (record.run as () => void) : undefined;
  const dispatch = normalizeAction(record.dispatch);
  if (run !== undefined && dispatch === null) return { ...base, run };
  if (run === undefined && dispatch !== null) return { ...base, dispatch };
  return base;
}

/**
 * True when the descriptor carries exactly one runnable effect.
 *
 * `run` and `dispatch` are mutually exclusive lanes: store-only intent vs the
 * appDispatcher seam. Treating an ambiguous descriptor as inert keeps surfaces
 * from making different branch-priority choices.
 */
export function isRunnable(action: ActionDescriptor): boolean {
  const hasRun = action.run !== undefined;
  const hasDispatch = action.dispatch !== undefined;
  return !action.disabled && hasRun !== hasDispatch;
}

/** Execute a normalized runnable descriptor through its declared lane. */
export function fireActionDescriptor(action: unknown): unknown {
  const normalized = normalizeActionDescriptor(action);
  if (normalized === null || !isRunnable(normalized)) return undefined;
  if (normalized.dispatch !== undefined) {
    return appDispatcher.dispatch(normalized.dispatch);
  }
  return normalized.run?.();
}
