// Bottom sheet primitive (mobile-responsive-layout ADR D3; binding Figma
// `BottomSheet` / `SheetHandle`). The compact-layout overlay container: a scrim
// over the shell plus a bottom-anchored panel with a drag grabber, top rounding,
// modal elevation, and a safe-area inset. The compact filter is *presented* in
// one of these (the filter stays authored in `app/left/` — filtering-has-one-
// canonical-surface — so the guard holds; only its presentation moves into the
// sheet).
//
// It mirrors the kit `Dialog` a11y contract — scrim + focus trap, Escape and
// backdrop dismiss, focus-into on open and focus-restore on close — but anchors
// the panel to the bottom for thumb reach. Token-driven chrome only (no hardcoded
// px; the bottom inset is a rem floor max()'d with the safe-area env()).

import type { ReactNode } from "react";
import { useCallback, useId, useRef } from "react";

import { focusableDescendants, trapTabFocus } from "./focusTrap";
import { useDismissOnEscape } from "./useDismissOnEscape";
import { useFocusRestore } from "./useFocusRestore";

export interface BottomSheetProps {
  /** Whether the sheet is mounted/visible. When false, nothing renders. */
  open: boolean;
  /** Called on every dismiss path: Escape, scrim tap. */
  onDismiss: () => void;
  /** The sheet title (accessible name via aria-labelledby). */
  title: string;
  /** Hide the visible title header (keeping it for the accessible name) when the
   *  body already renders its own header — avoids a duplicated heading. */
  hideTitle?: boolean;
  /** The sheet body. */
  children: ReactNode;
}

/**
 * A bottom sheet. Renders a scrim + bottom-anchored panel when `open`. Owns its
 * focus trap, Escape/scrim dismiss, and focus restore; the caller owns the
 * open/close state and the body.
 */
export function BottomSheet({
  open,
  onDismiss,
  title,
  hideTitle = false,
  children,
}: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useDismissOnEscape(onDismiss, {
    enabled: open,
    target: document,
    preventDefault: true,
  });

  const focusPanel = useCallback(() => {
    const panel = panelRef.current;
    if (panel) {
      const focusables = focusableDescendants(panel);
      (focusables[0] ?? panel).focus();
    }
  }, []);

  useFocusRestore(open, { onOpen: focusPanel });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-fg-lg border-t border-rule bg-paper-raised shadow-fg-popover outline-none pb-[max(1rem,env(safe-area-inset-bottom))] animate-fade-in"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => trapTabFocus(panelRef.current, e)}
      >
        {/* Drag grabber — the binding SheetHandle. */}
        <div className="flex shrink-0 justify-center pb-fg-1 pt-fg-2">
          <span aria-hidden className="h-1 w-9 rounded-fg-pill bg-rule" />
        </div>
        {hideTitle ? (
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
        ) : (
          <header className="flex shrink-0 items-center justify-between gap-fg-2 px-fg-4 pb-fg-2">
            <h2 id={titleId} className="text-title font-medium text-ink">
              {title}
            </h2>
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-fg-4">{children}</div>
      </div>
    </div>
  );
}
