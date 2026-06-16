// A reusable modal Dialog primitive (dashboard-settings W03.P06).
//
// The app had no shared modal — only the command palette rolled its own scrim +
// focus trap. This generalizes that pattern into a token-driven primitive the
// settings dialog (and future modals) compose: a backdrop scrim, a centered
// panel with the dialog role, a real focus trap (Tab/Shift+Tab cycle within),
// Escape and backdrop dismiss, focus-into on open and focus-restore on close.
// All chrome derives from the OKLCH semantic tokens (no hardcoded hex, no `dark:`
// variant); the close affordance is a Lucide glyph (structural chrome).

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";

/** The focusable descendants of `root`, in DOM order — the focus-trap cycle.
 *  Mirrors the command palette's helper so trap behavior is identical. */
function focusablesOf(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea, [tabindex]",
    ),
  ).filter((el) => {
    if (el.hasAttribute("disabled")) return false;
    if (el.getAttribute("tabindex") === "-1") return false;
    return true;
  });
}

export interface DialogProps {
  /** Whether the dialog is mounted/visible. When false, nothing renders. */
  open: boolean;
  /** Called on every dismiss path: Escape, backdrop click, the close button. */
  onClose: () => void;
  /** The dialog title (also its accessible name via aria-labelledby). */
  title: string;
  /** Optional one-line description under the title (aria-describedby). */
  description?: string;
  /** The dialog body. */
  children: ReactNode;
}

/**
 * A modal dialog. Renders a scrim + centered panel when `open`. Owns its focus
 * trap, Escape/backdrop dismiss, and focus restore; the caller owns the
 * open/close state and the body.
 */
export function Dialog({ open, onClose, title, description, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  // Escape closes (document-level so it fires regardless of focus position).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus management: remember the previously-focused element on open, move
  // focus into the dialog, and restore it on close so the trigger regains focus.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const panel = panelRef.current;
    if (panel) {
      const focusables = focusablesOf(panel);
      (focusables[0] ?? panel).focus();
    }
    return () => {
      restoreRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 pt-[10vh] animate-fade-in"
      onMouseDown={(e) => {
        // Backdrop dismiss only on the scrim itself; a click inside the panel
        // stops propagation (below) and must not close it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className="flex max-h-[80vh] w-[34rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-fg-lg border border-rule bg-paper-raised shadow-fg-popover outline-none animate-slide-in-down"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Real focus trap: Tab / Shift+Tab cycle within the dialog so focus
          // can never escape to the chrome behind the scrim while open.
          if (e.key !== "Tab" || !panelRef.current) return;
          const focusables = focusablesOf(panelRef.current);
          if (focusables.length === 0) {
            e.preventDefault();
            return;
          }
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          const activeEl = document.activeElement;
          if (e.shiftKey && activeEl === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && activeEl === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <header className="flex shrink-0 items-start justify-between gap-fg-2 border-b border-rule px-fg-4 py-fg-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-title font-medium text-ink">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-fg-0-5 text-label text-ink-faint">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-fg-xs p-fg-1 text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
