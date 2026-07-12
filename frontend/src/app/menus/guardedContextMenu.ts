// The selection-guard helper (touch-selectability ADR D1): the one arbitration
// rule between the app context-menu plane and the native text-selection plane.
// An app menu open must YIELD when the user has a live, non-collapsed text
// selection that intersects the right-clicked target — returning without
// preventDefault() so the platform's own selected-text menu (Copy / Search /
// Look Up) appears. When the selection is collapsed, absent, or elsewhere, the
// app menu opens exactly as before. Authored once and imported by every surface
// that opens the resolver menu; a second bespoke guard is the audited defect
// recurring (selection-is-never-stolen).

import type { MouseEvent as ReactMouseEvent } from "react";

/** True when `range` touches `node`. `Range.intersectsNode` where the engine
 *  provides it; otherwise a containment fallback against the range's common
 *  ancestor, which over-approximates toward YIELDING (the safe direction: the
 *  native menu still offers Copy for the live selection). */
function rangeIntersectsNode(range: Range, node: Node): boolean {
  if (typeof range.intersectsNode === "function") {
    try {
      return range.intersectsNode(node);
    } catch {
      // Detached node or foreign document: fall through to containment.
    }
  }
  const ancestor = range.commonAncestorContainer;
  return node.contains(ancestor) || ancestor.contains(node);
}

/** The pure guard predicate: should an app context-menu open yield to the
 *  current text selection? True only for a live, non-collapsed selection with
 *  at least one range intersecting `target`. */
export function shouldYieldContextMenuToSelection(
  target: Node | null,
  selection: Selection | null,
): boolean {
  if (target === null || selection === null) return false;
  if (selection.isCollapsed || selection.rangeCount === 0) return false;
  for (let i = 0; i < selection.rangeCount; i++) {
    if (rangeIntersectsNode(selection.getRangeAt(i), target)) return true;
  }
  return false;
}

/** The selection for an event's own document (multi-window safe). Resolves
 *  null — never throws — outside a DOM environment (node-env unit tests of
 *  handler wiring), where no native selection plane exists to yield to. */
export function selectionForEventTarget(target: EventTarget | null): Selection | null {
  const node = target as Node | null;
  const view =
    node?.ownerDocument?.defaultView ?? (typeof window === "undefined" ? null : window);
  return view?.getSelection?.() ?? null;
}

/** Wrap an app context-menu opener with the selection guard. The wrapped
 *  handler is what a surface passes to `onContextMenu`; it must contain the
 *  surface's own `preventDefault()` + `openContextMenu(...)` — the guard only
 *  decides whether that handler runs at all. */
export function guardedContextMenu<E extends ReactMouseEvent | MouseEvent>(
  handler: (event: E) => void,
): (event: E) => void {
  return (event: E) => {
    if (
      shouldYieldContextMenuToSelection(
        event.target as Node | null,
        selectionForEventTarget(event.target),
      )
    ) {
      return;
    }
    handler(event);
  };
}
