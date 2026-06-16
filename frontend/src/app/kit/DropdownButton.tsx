// Kit DropdownButton (figma-frontend-rewrite W01.P02 — binding Figma component kit
// board "Design System — Components" 135:2, DropdownButton symbol). The standard
// BUTTON SURFACE that opens a menu (e.g. the stage toolbar "Layout: Free"): a
// secondary-weight button carrying an optional leading glyph, a label, and a
// trailing Lucide chevron that rotates when open. It renders ONLY the trigger —
// the menu/popover host is a separate, already-built surface; this never owns or
// renders the menu itself.
//
// Display-only and prop-driven: it holds no open state, emits the toggle intent
// through `onClick`, and reflects the caller-owned `open` flag for ARIA + chevron.

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

// 14px structural-chrome chevron, matching the kit's other Lucide marks.
const CHEVRON_PX = 14;

export interface DropdownButtonProps {
  /** The trigger label (e.g. "Layout: Free"). */
  label: ReactNode;
  /** Emits the open/close intent; the caller owns the menu host and `open`. */
  onClick: () => void;
  /** Whether the associated menu is open (drives aria-expanded + chevron). */
  open?: boolean;
  /** Optional leading glyph (a Lucide/Phosphor mark). */
  icon?: ReactNode;
  /** Accessible name when the label is not plain text. */
  ariaLabel?: string;
  disabled?: boolean;
  id?: string;
}

export function DropdownButton({
  label,
  onClick,
  open = false,
  icon,
  ariaLabel,
  disabled,
  id,
}: DropdownButtonProps) {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      disabled={disabled}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={ariaLabel}
      className="inline-flex shrink-0 items-center gap-fg-1-5 rounded-fg-md border border-rule bg-paper-raised px-fg-2 py-fg-1 text-label text-ink transition-colors duration-ui-fast hover:border-rule-strong hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50"
      data-kit="dropdown-button"
      data-open={open ? "" : undefined}
    >
      {icon && (
        <span className="shrink-0 text-ink-muted" aria-hidden>
          {icon}
        </span>
      )}
      <span className="min-w-0 truncate">{label}</span>
      <span
        className={`shrink-0 text-ink-faint transition-transform duration-ui-fast ${
          open ? "rotate-180" : ""
        }`}
        aria-hidden
      >
        <ChevronDown size={CHEVRON_PX} />
      </span>
    </button>
  );
}
