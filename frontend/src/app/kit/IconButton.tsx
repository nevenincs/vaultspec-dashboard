// Kit IconButton (figma-frontend-rewrite W01.P02 — binding Figma component kit
// board "Design System — Components" 135:2, IconButton symbol Default/Hover/
// Active). A square, glyph-only affordance — the centralized definition for every
// toolbar/zoom/panel control (Maximize, Crosshair, Plus, Minus, panel toggles).
// The glyph is supplied by the caller from one of the two sanctioned families
// (Lucide structural chrome, Phosphor expressive), never drawn inline.
//
// State by SHAPE/fill, not hue: hover tints the sunken ground; the `active`
// (pressed/selected) state holds the accent-subtle tint with accent ink, so the
// pressed state reads without relying on color alone.

import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> {
  /** Accessible name — required (the button has no text label). */
  label: string;
  /** The glyph element (a Lucide or Phosphor icon). */
  children: ReactNode;
  /** The pressed/selected state (panel open, tool engaged). */
  active?: boolean;
}

export function IconButton({
  label,
  children,
  active = false,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={active}
      data-kit="icon-button"
      data-active={active}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-fg-sm transition-colors duration-ui-fast ease-settle outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "bg-accent-subtle text-accent-text"
          : "text-ink-muted hover:bg-paper-sunken hover:text-ink"
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}
