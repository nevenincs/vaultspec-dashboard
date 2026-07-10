// Compact top bar (mobile-responsive-layout ADR D2; binding Figma `MobileTopBar`
// component). The header for compact surfaces: an optional leading back control
// (the slide-back affordance for the document navigator, D5), a truncating title,
// and trailing icon action slots (search, filter, overflow). Every interactive
// slot is a ≥44pt touch target with a 20px glyph (the design-review touch-target
// finding), and iconography composes the centralized kit glyphs only.
//
// Layer law (dashboard-layer-ownership): dumb chrome — title text + callbacks in,
// no fetch, no state, no `tiers`. Sizing is rem/token (no hardcoded px).

import type { ComponentType, ReactNode } from "react";

import { ChevronDown } from "lucide-react";

import { ChevronLeft } from "../kit/glyphs";

export interface MobileTopBarAction {
  label: string;
  /** An icon action renders a 44pt icon slot. */
  Glyph?: ComponentType<{ size?: number }>;
  /** A text action renders a plain-language text button (e.g. the timeline "Now").
   *  Mutually exclusive with `Glyph`. */
  text?: string;
  onClick: () => void;
  /** Pressed/selected (e.g. an open filter sheet). */
  active?: boolean;
}

export interface MobileTopBarProps {
  title: string;
  /** When set, a leading back control is shown (slide-back). */
  onBack?: () => void;
  backLabel?: string;
  /** When set, the title becomes a tap-target with a trailing chevron — the compact
   *  workspace-switcher trigger (mobile-enrichment ADR D1). */
  onTitleActivate?: () => void;
  /** Accessible name for the title trigger (defaults to the title + a hint). */
  titleActivateLabel?: string;
  /** Trailing icon actions, right-aligned. */
  actions?: readonly MobileTopBarAction[];
}

function IconSlot({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-active={active}
      onClick={onClick}
      // 44pt touch target (size-11 = 2.75rem); state by accent-subtle fill, not hue.
      className={`flex size-11 shrink-0 items-center justify-center rounded-fg-sm transition-colors duration-ui-fast ease-settle outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
        active
          ? "bg-accent-subtle text-accent-text"
          : "text-ink-muted hover:bg-paper-sunken hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function MobileTopBar({
  title,
  onBack,
  backLabel = "Back",
  onTitleActivate,
  titleActivateLabel,
  actions,
}: MobileTopBarProps) {
  return (
    <header
      data-kit="mobile-top-bar"
      className="flex h-[3.25rem] shrink-0 items-center gap-fg-1 border-b border-rule bg-paper-raised pe-fg-1 ps-fg-2"
    >
      {onBack && (
        <IconSlot label={backLabel} onClick={onBack}>
          <ChevronLeft size={20} />
        </IconSlot>
      )}
      {onTitleActivate ? (
        // Title-as-trigger (ADR D1): the worktree name opens the workspace switcher.
        // The interactive trigger stays wrapped in an <h1> (display:contents so it
        // adds no box) so the compact landing surface keeps its level-1 heading for
        // assistive tech — the accessible name is interactive AND a heading. A
        // tap-target (min 44px via the bar) with a trailing disclosure chevron that
        // hugs the name, so the affordance never floats from a short one.
        <h1 className="contents">
          <button
            type="button"
            data-mobile-title-trigger
            onClick={onTitleActivate}
            aria-haspopup="dialog"
            aria-label={titleActivateLabel ?? `${title} — switch workspace`}
            className="flex min-w-0 flex-1 items-center gap-fg-1 rounded-fg-sm py-fg-1 text-left transition-colors duration-ui-fast ease-settle outline-none hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <span className="min-w-0 truncate text-title text-ink">{title}</span>
            <ChevronDown size={16} aria-hidden className="shrink-0 text-ink-muted" />
          </button>
        </h1>
      ) : (
        <h1 className="min-w-0 flex-1 truncate text-title text-ink">{title}</h1>
      )}
      {actions?.map((action) =>
        action.text != null ? (
          <button
            key={action.label}
            type="button"
            aria-label={action.label}
            onClick={action.onClick}
            className="flex h-11 shrink-0 items-center rounded-fg-sm px-fg-2 text-body-strong text-accent-text transition-colors duration-ui-fast ease-settle outline-none hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            {action.text}
          </button>
        ) : action.Glyph ? (
          <IconSlot
            key={action.label}
            label={action.label}
            active={action.active}
            onClick={action.onClick}
          >
            <action.Glyph size={20} />
          </IconSlot>
        ) : null,
      )}
    </header>
  );
}
