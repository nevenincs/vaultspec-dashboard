// Kit Popover — the centralized anchored-overlay shell (filter-controls /
// standardization campaign). Bundles the two shared light-dismiss hooks (Escape +
// outside-pointer) and a tracked root so every popover surface — the graph settings
// popover, the filter flyout — stops re-wiring dismiss by hand
// (design-system-is-centralized). Display-only: it renders a positioned container
// and owns ONLY the dismiss wiring; the caller supplies the trigger and/or panel as
// children and the positioning via `className`. Standard div attributes (role,
// aria-*, data-*, style) pass straight through.

import { useRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";

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
  /** Whether the popover restores focus to the open-time element on close
   *  (default `true`). A surface that manages its own focus restoration to a
   *  known target opts OUT with `false` — e.g. the worktree picker restores to its
   *  trigger via a ref, because it opens via paths (a default-open test seam, an
   *  `ArrowDown`-dive into the first row) where the open-time `activeElement` is
   *  NOT the intended return target, so the generic capture would land on the
   *  wrong element (or `<body>`). */
  restoreFocus?: boolean;
  children: ReactNode;
}

export function Popover({
  open,
  onDismiss,
  ignoreSelector,
  escapeTarget,
  restoreFocus = true,
  children,
  ...rest
}: PopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissOnEscape(onDismiss, { enabled: open, target: escapeTarget });
  useDismissOnOutsidePointer(rootRef, onDismiss, { enabled: open, ignoreSelector });
  // Restore focus to whatever was focused when the popover opened (its trigger)
  // when it closes, so dismissing a flyout never drops focus to `<body>`
  // (keyboard-navigation W01.P03.S09). Centralized here so every popover surface —
  // the filter flyout, the panel flyout — inherits the restore without re-wiring
  // it. A surface that owns an explicit restore target opts out via `restoreFocus`
  // (else the two restores race and the generic one wins with the wrong element).
  useFocusRestore(open && restoreFocus);
  return (
    <div ref={rootRef} {...rest}>
      {children}
    </div>
  );
}
