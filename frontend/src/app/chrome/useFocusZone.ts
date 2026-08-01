// FocusZone — the one shared Class-B composite-navigation primitive
// (keyboard-navigation W01.P01). A "focus zone" is a group of focusable items
// that contributes EXACTLY ONE tab stop to the shell tab ring: Tab enters the
// zone and Tab leaves it, while arrow keys / Home / End / typeahead move the
// roving focus WITHIN it (ARIA Authoring Practices two-tier model). One roving
// item carries `tabIndex={0}`; the rest carry `tabIndex={-1}`. Before anything
// in the zone has been focused, the FIRST item is the tab stop so the zone is
// reachable from a cold load (the proven left-rail tree pattern).
//
// This owns the shared roving model for vault/files trees, segmented toggles,
// search results, and context-menu items. It is logic-only (no JSX), consumed
// by app surfaces; the `platform` layer forbids upward imports, so the primitive
// lives in `app/chrome` beside the other chrome focus utilities.

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/** Primary movement axis of a zone. `both` accepts either arrow pair. */
export type FocusZoneOrientation = "vertical" | "horizontal" | "both";

/** A resolved movement request over the ordered item list. */
export type FocusMoveIntent = "next" | "prev" | "first" | "last";

/** Cross-axis arrow (the secondary axis), surfaced so tree-style consumers can
 *  bind expand/collapse without the zone owning those semantics. */
export type FocusCrossIntent = "crossNext" | "crossPrev";

export interface FocusKeyResolution {
  /** Primary-axis move within the zone, if the key maps to one. */
  intent?: FocusMoveIntent;
  /** Secondary-axis arrow, handed to the consumer's cross-axis hook. */
  cross?: FocusCrossIntent;
}

export interface FocusTargetOptions {
  /** Cycle past the ends (true) or stop at them (false). */
  wrap: boolean;
  /** Exclude an item from roving traversal while retaining it in DOM order. */
  isFocusable?: (key: string) => boolean;
}

/**
 * Pure next-key resolution over an ordered key list. Returns the target key, or
 * null when the move is a no-op (unknown `from`, empty list, or a clamped edge).
 * Wrap cycles around the ends; clamp stops at them.
 */
export function resolveFocusTarget(
  order: readonly string[],
  from: string,
  intent: FocusMoveIntent,
  options: FocusTargetOptions,
): string | null {
  const n = order.length;
  if (n === 0) return null;
  const isFocusable = options.isFocusable ?? (() => true);
  if (intent === "first") return order.find(isFocusable) ?? null;
  if (intent === "last") return order.findLast(isFocusable) ?? null;

  const at = order.indexOf(from);
  if (at === -1) return null;

  const step = intent === "next" ? 1 : -1;
  for (let distance = 1; distance < n; distance += 1) {
    let target = at + step * distance;
    if (options.wrap) {
      target = (target + n) % n;
    } else if (target < 0 || target >= n) {
      break;
    }
    const candidate = order[target];
    if (candidate !== undefined && isFocusable(candidate)) return candidate;
  }
  return null;
}

/**
 * Map a keyboard event to a movement intent for the given orientation. The
 * primary axis arrows resolve to next/prev; the secondary axis arrows resolve
 * to a cross intent (so a tree can expand/collapse). Home/End are first/last.
 * Returns an empty object for keys the zone does not own (so the consumer can
 * let them through — Enter to activate, typeahead chars, etc.).
 */
export function resolveFocusKey(
  key: string,
  orientation: FocusZoneOrientation,
): FocusKeyResolution {
  const vertical = orientation === "vertical" || orientation === "both";
  const horizontal = orientation === "horizontal" || orientation === "both";

  switch (key) {
    case "ArrowDown":
      if (vertical) return { intent: "next" };
      return { cross: "crossNext" };
    case "ArrowUp":
      if (vertical) return { intent: "prev" };
      return { cross: "crossPrev" };
    case "ArrowRight":
      if (horizontal) return { intent: "next" };
      return { cross: "crossNext" };
    case "ArrowLeft":
      if (horizontal) return { intent: "prev" };
      return { cross: "crossPrev" };
    case "Home":
      return { intent: "first" };
    case "End":
      return { intent: "last" };
    default:
      return {};
  }
}

export interface UseFocusZoneOptions {
  /** Primary movement axis. Defaults to `vertical`. */
  orientation?: FocusZoneOrientation;
  /** Cycle past the ends (true) or stop at them (false). Defaults to false. */
  wrap?: boolean;
  /**
   * The currently roving item key, or null when nothing in the zone has been
   * focused yet. Usually the consumer's selected/active key so roving and
   * selection stay in lockstep (the tree/toggle pattern).
   */
  activeKey: string | null;
  /** Commits a new roving key (e.g. updates the consumer's active/selected state). */
  onActiveKeyChange: (key: string) => void;
}

export interface FocusZoneItemProps {
  /** Ref callback registering the item's element and DOM order. */
  ref: (el: HTMLElement | null) => void;
  /** Roving tab index: 0 for the single tab stop, -1 otherwise. */
  tabIndex: 0 | -1;
  /** Keydown handler owning arrow/Home/End movement within the zone. */
  onKeyDown: (event: ReactKeyboardEvent) => void;
}

export interface FocusZoneItemOptions {
  /** Excluded from roving traversal (for example, a disabled menu item). */
  disabled?: boolean;
  /** Bound when a secondary-axis ArrowRight/ArrowDown fires (e.g. expand). */
  onCrossNext?: () => void;
  /** Bound when a secondary-axis ArrowLeft/ArrowUp fires (e.g. collapse). */
  onCrossPrev?: () => void;
}

export interface UseFocusZone {
  /**
   * Called by EACH item during the parent's render, in visual order. Records the
   * item's order and returns the props to spread onto it. The render-time pass
   * is what lets the zone compute the first-item tab-stop fallback synchronously.
   */
  rove: (key: string, options?: FocusZoneItemOptions) => FocusZoneItemProps;
  /** Imperatively move focus to a registered item (e.g. after an external jump). */
  focusItem: (key: string) => void;
}

/**
 * The FocusZone hook. The consumer resets nothing itself: each render the hook
 * rebuilds the item order from the `rove()` calls its children make, so the
 * order always matches what is actually visible (collapsed tree nodes simply do
 * not call `rove`). Movement selects the next key via `onActiveKeyChange` and
 * moves DOM focus to it.
 */
export function useFocusZone({
  orientation = "vertical",
  wrap = false,
  activeKey,
  onActiveKeyChange,
}: UseFocusZoneOptions): UseFocusZone {
  const elements = useRef(new Map<string, HTMLElement>());
  const order = useRef<string[]>([]);
  const prevOrder = useRef<string[]>([]);
  const seenKeys = useRef(new Set<string>());
  const disabledKeys = useRef(new Set<string>());
  const rovingKeyRef = useRef<string | null>(null);
  const needsTabStopReconciliation = useRef(false);
  const [, reconcileTabStop] = useState(0);

  // Resolve the roving key from the PREVIOUS render's order (the current order is
  // not yet built — children call `rove` after this body runs). Honor the active
  // key when it was a known item last render; otherwise fall back to the first
  // item of the prior order. Falling back to a CONCRETE key (not null) keeps the
  // resolution idempotent: React double-invokes each row's render (StrictMode), so
  // `rove` runs twice per item — a first-item latch would be consumed by the first
  // invocation and the committed second one would find no tab stop. `prevOrder[0]`
  // is matched identically on every invocation. The latch below is only the
  // first-render seed, before any prior order exists.
  rovingKeyRef.current =
    activeKey !== null &&
    prevOrder.current.includes(activeKey) &&
    !disabledKeys.current.has(activeKey)
      ? activeKey
      : (prevOrder.current.find((key) => !disabledKeys.current.has(key)) ?? null);
  needsTabStopReconciliation.current = false;

  // An item can become disabled after it was the roving tab stop. `rove()` then
  // discovers that change in item order; if it is not the first item, preceding
  // siblings have already received -1 for this render. Re-render before paint so
  // the next pass uses the now-current disabled set to assign one enabled tab stop.
  useLayoutEffect(() => {
    if (!needsTabStopReconciliation.current) return;
    needsTabStopReconciliation.current = false;
    reconcileTabStop((version) => version + 1);
  });

  // Render-pass reset: children call `rove` after this hook body runs in the
  // same render, so the order they build reflects the current visible set. The
  // `seenKeys` set dedupes the order against React's double-invocation of each
  // row's render, so a key is recorded once even though `rove` runs twice.
  order.current = [];
  seenKeys.current = new Set();

  const focusItem = useCallback((key: string) => {
    elements.current.get(key)?.focus();
  }, []);

  const moveTo = useCallback(
    (from: string, intent: FocusMoveIntent) => {
      const next = resolveFocusTarget(order.current, from, intent, {
        wrap,
        isFocusable: (key) => !disabledKeys.current.has(key),
      });
      if (next === null || next === from) return;
      onActiveKeyChange(next);
      elements.current.get(next)?.focus();
    },
    [wrap, onActiveKeyChange],
  );

  const rove = useCallback(
    (key: string, options?: FocusZoneItemOptions): FocusZoneItemProps => {
      if (!seenKeys.current.has(key)) {
        seenKeys.current.add(key);
        order.current.push(key);
        prevOrder.current = order.current;
      }
      if (options?.disabled) disabledKeys.current.add(key);
      else disabledKeys.current.delete(key);
      if (options?.disabled && rovingKeyRef.current === key) {
        rovingKeyRef.current = null;
        needsTabStopReconciliation.current = true;
      }
      // One tab stop: the resolved roving key carries it; when none resolved
      // (the first render, before any prior order) the first focusable item does.
      // Both branches are idempotent under React's double-invoked render, so no
      // per-call latch can be consumed by the first pass.
      const rovingKey = rovingKeyRef.current;
      const firstFocusable = order.current.find(
        (candidate) => !disabledKeys.current.has(candidate),
      );
      const tabbable =
        !options?.disabled &&
        (rovingKey === key || (rovingKey === null && firstFocusable === key));

      const ref = (el: HTMLElement | null) => {
        if (el) elements.current.set(key, el);
        else elements.current.delete(key);
      };

      const onKeyDown = (event: ReactKeyboardEvent) => {
        const { intent, cross } = resolveFocusKey(event.key, orientation);
        // A consumed key is STOPPED, not just default-prevented: the one global
        // keymap dispatcher binds bare arrows (feature/neighbour cycling) on a
        // window listener, so an un-stopped arrow would double-fire (rove AND
        // graph-cycle). stopPropagation keeps a widget-intrinsic Class-B key from
        // reaching the Class-A dispatcher — the inverse of the registry rule's
        // "never grow a private global listener".
        const consume = () => {
          event.preventDefault();
          event.stopPropagation();
        };
        if (intent) {
          consume();
          moveTo(key, intent);
        } else if (cross === "crossNext" && options?.onCrossNext) {
          consume();
          options.onCrossNext();
        } else if (cross === "crossPrev" && options?.onCrossPrev) {
          consume();
          options.onCrossPrev();
        }
      };

      return { ref, tabIndex: tabbable ? 0 : -1, onKeyDown };
    },
    [orientation, moveTo],
  );

  return { rove, focusItem };
}
