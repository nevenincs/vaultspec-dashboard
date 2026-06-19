// DocRow — the centralized document-list row (figma-frontend-rewrite W01.P02;
// binding kit board "Design System — Components" 135:2, DocRow symbol, and the
// LeftRail rows 244:750). ONE row of the vault / tree / plan document lists: a
// leading category mark (a kit StatusDot, or a plan-status pip), the document
// title, an optional plain "#feature" tag, and an optional age — left-packed,
// 30px tall. The Selected state is the binding accent treatment: an accent-subtle
// ground PLUS a short centered accent bar inset at the left edge (NOT a full-height
// border), with the title lifting to medium weight in body ink (never accent-text).
//
// Every surface that lists documents composes THIS row instead of hand-building the
// dot + title + tag + age markup per frame (design-system-is-centralized). It is
// presentational and prop-driven: the caller wraps it in its own interactive
// element (a button for the left rail's roving-tabindex nav) and owns click / hover
// intent; DocRow owns only the row's visual contract, matched to the board.
//
// Geometry is the board's, encoded once here (the single definition): h 30, ps 14 /
// pe 10, gap 8, radius md; the selection bar is 2.5x16 inset 4px and vertically
// centered. The title rides the `meta` type role; the tag + age ride `caption`,
// both in faint ink — the tag is PLAIN text, not a pill (the board draws "#topic"
// as faint text beside the title, never a chip).

import type { HTMLAttributes, ReactNode } from "react";

export interface DocRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Selected = accent-subtle ground + centered left accent bar + medium title. */
  selected?: boolean;
  /** Leading mark — a kit StatusDot (category) or a plan-status pip. */
  leading?: ReactNode;
  /** The document title (truncates when long). */
  title: ReactNode;
  /** Optional "#feature" tag — rendered as PLAIN faint text (the board, not a pill). */
  tag?: ReactNode;
  /** Optional age / freshness label (faint, tabular). */
  age?: ReactNode;
}

export function DocRow({
  selected = false,
  leading,
  title,
  tag,
  age,
  className = "",
  ...rest
}: DocRowProps) {
  return (
    <div
      data-kit="doc-row"
      data-selected={selected ? "" : undefined}
      className={`relative flex h-[1.875rem] w-full min-w-0 items-center gap-fg-2 rounded-fg-md ps-[0.875rem] pe-[0.625rem] text-left transition-colors duration-ui-fast ease-settle ${
        selected ? "bg-accent-subtle" : "hover:bg-paper-sunken"
      } ${className}`.trim()}
      {...rest}
    >
      {/* Selection bar (binding 244:750): a short accent bar inset 4px from the
          left edge, vertically centered — NOT a full-height border. */}
      {selected && (
        <span
          aria-hidden
          className="absolute left-1 top-1/2 h-4 w-[0.15625rem] -translate-y-1/2 rounded-[0.09375rem] bg-accent"
        />
      )}
      {leading != null && (
        <span className="flex shrink-0 items-center" aria-hidden>
          {leading}
        </span>
      )}
      <span
        className={`min-w-0 truncate text-[0.78125rem] ${
          selected ? "font-medium text-ink" : "text-ink"
        }`}
      >
        {title}
      </span>
      {tag != null && (
        <span className="shrink-0 truncate text-[0.6875rem] text-ink-faint">{tag}</span>
      )}
      {age != null && (
        <span
          data-tabular
          className="shrink-0 text-[0.6875rem] tabular-nums text-ink-faint"
        >
          {age}
        </span>
      )}
    </div>
  );
}
