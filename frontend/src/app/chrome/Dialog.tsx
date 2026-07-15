// Shared modal shell with focus containment, dismissal, and focus restoration.

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useId, useRef } from "react";

import { useLocalizedMessage } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import { focusableDescendants, trapTabFocus } from "./focusTrap";
import { useDismissOnEscape } from "./useDismissOnEscape";
import { useFocusRestore } from "./useFocusRestore";

export const DIALOG_MESSAGES = {
  close: { key: "common:actions.close" },
} as const satisfies Record<string, MessageDescriptor>;

export interface DialogProps {
  /** Whether the dialog is mounted/visible. When false, nothing renders. */
  open: boolean;
  /** Called on every dismiss path: Escape, backdrop click, the close button. */
  onClose: () => void;
  /** Whether Escape, the backdrop, and the close button may dismiss the dialog. */
  dismissible?: boolean;
  /** The dialog title (also its accessible name via aria-labelledby). */
  title: string;
  /** Optional one-line description under the title (aria-describedby). */
  description?: string;
  /** The dialog body. */
  children: ReactNode;
  /** Optional pinned action row rendered BELOW the scrolling body: it never
   *  scrolls out of reach, so the primary action stays visible when the body
   *  overflows a constrained viewport (soft keyboard up on compact). Carries
   *  the safe-area bottom inset. Dialogs with a bottom action row pass it
   *  here rather than rendering a footer inside the scrolling body. */
  footer?: ReactNode;
  /** Panel width. All variants retain the compact viewport guard. */
  size?: "default" | "medium" | "wide";
}

/** The panel width class per size variant. The `max-w` compact guard is shared,
 *  so a wide panel still fits a narrow viewport. */
const PANEL_WIDTH: Record<NonNullable<DialogProps["size"]>, string> = {
  default: "w-[34rem]",
  medium: "w-[45rem]",
  wide: "w-[52rem]",
};

/**
 * A modal dialog. Renders a scrim + centered panel when `open`. Owns its focus
 * trap, Escape/backdrop dismiss, and focus restore; the caller owns the
 * open/close state and the body.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "default",
  dismissible = true,
}: DialogProps) {
  const closeLabel = useLocalizedMessage(DIALOG_MESSAGES.close);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useDismissOnEscape(onClose, {
    enabled: open && dismissible,
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
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 pt-[10vh] animate-fade-in motion-reduce:animate-none"
      onMouseDown={(e) => {
        // Backdrop dismiss only on the scrim itself; a click inside the panel
        // stops propagation (below) and must not close it.
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`flex max-h-[80vh] ${PANEL_WIDTH[size]} max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-fg-lg border border-rule bg-paper-raised shadow-fg-popover outline-none animate-slide-in-down motion-reduce:animate-none`}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => trapTabFocus(panelRef.current, e)}
      >
        <header className="flex shrink-0 items-start justify-between gap-fg-2 border-b border-rule px-fg-4 py-fg-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-title font-medium text-ink">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-fg-0-5 text-label text-ink-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            aria-label={closeLabel}
            className="shrink-0 rounded-fg-xs p-fg-1 text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </header>
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          onFocus={(e) => {
            // Keep the focused field visible inside the one scrolling region
            // (soft keyboard / constrained viewports): nearest-block only, so
            // an already-visible field never causes scroll jank.
            if (e.target instanceof HTMLElement) {
              e.target.scrollIntoView?.({ block: "nearest" });
            }
          }}
        >
          {children}
        </div>
        {footer !== undefined && (
          <div className="shrink-0 border-t border-rule px-fg-4 pt-fg-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
