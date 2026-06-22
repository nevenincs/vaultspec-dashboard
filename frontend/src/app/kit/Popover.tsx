// Kit Popover — the centralized anchored-overlay shell (filter-controls /
// standardization campaign). Bundles the two shared light-dismiss hooks (Escape +
// outside-pointer) and a tracked root so every popover surface — the graph settings
// popover, the filter flyout — stops re-wiring dismiss by hand
// (design-system-is-centralized). Display-only: it renders a positioned container
// and owns ONLY the dismiss wiring; the caller supplies the trigger and/or panel as
// children and the positioning via `className`. Standard div attributes (role,
// aria-*, data-*, style) pass straight through.

import { useRef } from "react";
import type { HTMLAttributes, ReactNode, RefObject } from "react";

import { useDismissOnEscape } from "../chrome/useDismissOnEscape";
import { useDismissOnOutsidePointer } from "../chrome/useDismissOnOutsidePointer";
import { useFocusRestore } from "../chrome/useFocusRestore";

export interface PopoverProps extends HTMLAttributes<HTMLDivElement> {
  /** Whether the popover is open — gates the dismiss listeners. */
  open: boolean;
  /** Called on an Escape press or an outside pointer; the caller decides what
   *  dismissal does (the hooks never unify that). */
  onDismiss: () => void;
  /** A pointer inside an element matching this selector does NOT dismiss — for a
   *  popover whose TRIGGER lives outside its root (e.g. a toolbar "Filter ▾"
   *  button). Omit when the trigger is a child (the common case). */
  ignoreSelector?: string;
  /** Escape listener target (default `window`; some surfaces use `document`). */
  escapeTarget?: Window | Document;
  /** Explicit focus-return target. By default the popover restores focus to the
   *  element focused when it opened (its trigger, the common case). A surface whose
   *  open-time `activeElement` is NOT the intended return target — it opens via a
   *  default-open seam or an `ArrowDown`-dive into a row, where the generic capture
   *  would land on the wrong element (or `<body>`) — DECLARES its invoker here, and
   *  the restore targets it on close/unmount (replacing any manual restore). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export function Popover({
  open,
  onDismiss,
  ignoreSelector,
  escapeTarget,
  returnFocusRef,
  children,
  ...rest
}: PopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissOnEscape(onDismiss, { enabled: open, target: escapeTarget });
  useDismissOnOutsidePointer(rootRef, onDismiss, { enabled: open, ignoreSelector });
  // Restore focus when the popover closes so dismissing a flyout never drops focus
  // to `<body>` (keyboard-navigation W01.P03.S09). Centralized here so every popover
  // surface — the filter flyout, the panel flyout — inherits the restore without
  // re-wiring it. By default it restores the open-time element (the trigger); a
  // surface whose opener is not that element DECLARES its invoker via
  // `returnFocusRef` and drops any manual restore (no race).
  useFocusRestore(open, { returnFocusRef });
  return (
    <div ref={rootRef} {...rest}>
      {children}
    </div>
  );
}
