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
  children: ReactNode;
}

export function Popover({
  open,
  onDismiss,
  ignoreSelector,
  escapeTarget,
  children,
  ...rest
}: PopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissOnEscape(onDismiss, { enabled: open, target: escapeTarget });
  useDismissOnOutsidePointer(rootRef, onDismiss, { enabled: open, ignoreSelector });
  return (
    <div ref={rootRef} {...rest}>
      {children}
    </div>
  );
}
