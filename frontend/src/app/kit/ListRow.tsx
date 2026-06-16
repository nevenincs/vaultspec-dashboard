// ListRow — the centralized list-item primitive (figma-frontend-rewrite
// W01.P02.S05; binding kit board 135:2, states Default / Selected). One row of a
// grouped list: an optional leading mark (a StatusDot, a category glyph), a main
// label column, and an optional trailing slot (an age, a count chip). The Selected
// state is the binding accent treatment — a quiet accent-subtle tint plus a 2px
// left accent bar — carried entirely through the token tier, never a bespoke
// highlight. Surfaces compose this for the left-rail doc list and any grouped list
// (design-system-is-centralized). Display-only and prop-driven; clicking is the
// caller's intent via the forwarded `onClick`.

import type { HTMLAttributes, ReactNode } from "react";

export interface ListRowProps extends HTMLAttributes<HTMLDivElement> {
  /** Selected = accent-subtle tint + left accent bar (binding Selected state). */
  selected?: boolean;
  /** Leading slot — a StatusDot or category glyph. */
  leading?: ReactNode;
  /** Trailing slot — an age, a #tag chip, a count. */
  trailing?: ReactNode;
}

export function ListRow({
  selected = false,
  leading,
  trailing,
  className = "",
  children,
  ...rest
}: ListRowProps) {
  return (
    <div
      data-selected={selected ? "" : undefined}
      aria-selected={selected}
      className={`flex w-full min-w-0 items-center gap-fg-2 border-l-2 px-fg-2 py-fg-1 text-body transition-colors duration-ui-fast ease-settle ${
        selected
          ? "border-l-accent bg-accent-subtle text-accent-text"
          : "border-l-transparent text-ink hover:bg-paper-sunken"
      } ${className}`.trim()}
      {...rest}
    >
      {leading != null && (
        <span className="flex shrink-0 items-center" aria-hidden>
          {leading}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing != null && (
        <span className="flex shrink-0 items-center gap-fg-1 text-ink-faint">
          {trailing}
        </span>
      )}
    </div>
  );
}
