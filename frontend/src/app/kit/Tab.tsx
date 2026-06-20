// Kit Tab (figma-frontend-rewrite W01.P02 — binding Figma component kit board
// "Design System — Components" 135:2, Tab symbol State=Active/Inactive and the
// Closable Default/Active × Closable No/Yes variants). The centralized tab
// affordance for the right rail's Status/Changes/Search and any future tab strip.
// The active state reads by an accent underline bar + ink weight (shape, not hue
// alone); the closable variant adds a trailing Lucide ✕ that fires its own intent
// without selecting the tab.

import { X } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface TabProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "children" | "className" | "type" | "role" | "aria-selected"
> {
  /** Whether this tab is the active one. */
  active: boolean;
  /** Selects this tab. */
  onSelect: () => void;
  /** The tab label. */
  children: ReactNode;
  /** When supplied, a trailing close (✕) control renders (closable variant). */
  onClose?: () => void;
  /** Accessible name for the close control (defaults to "Close tab"). */
  closeLabel?: string;
  id?: string;
}

export function Tab({
  active,
  onSelect,
  children,
  onClose,
  closeLabel = "Close tab",
  id,
  ...rest
}: TabProps) {
  return (
    <div
      data-kit="tab"
      data-active={active}
      className="relative inline-flex shrink-0 items-center"
    >
      <button
        type="button"
        role="tab"
        id={id}
        aria-selected={active}
        onClick={onSelect}
        // Roving-tablist passthrough (tabIndex / onKeyDown / aria-controls /
        // data-*) so a tablist container (the activity rail) drives one shared Tab
        // rather than hand-building its own button (design-system-is-centralized).
        {...rest}
        className={`inline-flex items-center gap-fg-1-5 rounded-fg-xs px-fg-2 py-fg-1-5 text-label font-medium transition-colors duration-ui-fast ease-settle outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
          active ? "text-ink" : "text-ink-faint hover:text-ink-muted"
        }`}
      >
        {children}
        {onClose && (
          // The close affordance lives inside the tab strip but is a separate
          // hit target: it is a <span role="button"> so it is not a nested
          // <button> (invalid HTML), with its own keyboard + click handling.
          <span
            role="button"
            tabIndex={0}
            aria-label={closeLabel}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }
            }}
            className="-mr-fg-0-5 inline-flex size-3.5 items-center justify-center rounded-fg-xs text-ink-faint transition-colors duration-ui-fast hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <X size={11} aria-hidden />
          </span>
        )}
      </button>
      {/* Active underline bar — the shape channel for selection (accent). */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-fg-1 -bottom-px h-0.5 rounded-full transition-colors duration-ui-fast ${
          active ? "bg-accent" : "bg-transparent"
        }`}
      />
    </div>
  );
}
