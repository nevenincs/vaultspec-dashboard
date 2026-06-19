// TreeRow — the centralized tree-node row (figma-frontend-rewrite W01.P02.S05;
// binding kit board 135:2, states Collapsed / Expanded / Leaf). One row of a
// hierarchical tree (the left-rail Tree-mode browser): a disclosure twisty
// (ChevronRight collapsed, ChevronDown expanded, a blank spacer for a leaf), a
// depth indent, an optional leading glyph (Folder / File from the sanctioned set),
// the label, and an optional trailing slot. Selected is the binding accent tint.
// Surfaces compose this for any tree (design-system-is-centralized); the disclosure
// and selection are caller intent via `onToggle` / `onSelect`. The twisty and
// indent are separated so a click on the twisty toggles without selecting.

import type { ReactNode } from "react";

import { ChevronDown, ChevronRight } from "./glyphs";

export type TreeRowState = "collapsed" | "expanded" | "leaf";

export interface TreeRowProps {
  state: TreeRowState;
  label: ReactNode;
  /** Nesting depth; drives the left indent. Defaults to 0. */
  depth?: number;
  /** Leading glyph slot (Folder / File / category mark). */
  leading?: ReactNode;
  /** Trailing slot (a count, an age). */
  trailing?: ReactNode;
  selected?: boolean;
  /** Fires when the disclosure twisty is activated (not on a leaf). */
  onToggle?: () => void;
  /** Fires when the row body is activated. */
  onSelect?: () => void;
  className?: string;
}

const INDENT_REM = 0.875;

export function TreeRow({
  state,
  label,
  depth = 0,
  leading,
  trailing,
  selected = false,
  onToggle,
  onSelect,
  className = "",
}: TreeRowProps) {
  const isLeaf = state === "leaf";
  return (
    <div
      data-tree-state={state}
      data-selected={selected ? "" : undefined}
      style={{ paddingInlineStart: `${depth * INDENT_REM}rem` }}
      className={`flex h-[1.875rem] w-full min-w-0 items-center gap-fg-1 rounded-fg-xs pe-fg-1 text-meta transition-colors duration-ui-fast ease-settle ${
        selected
          ? "bg-accent-subtle text-accent-text"
          : "text-ink hover:bg-paper-sunken"
      } ${className}`.trim()}
    >
      {isLeaf ? (
        <span className="inline-flex h-fg-4 w-fg-4 shrink-0" aria-hidden />
      ) : (
        <button
          type="button"
          aria-label={state === "expanded" ? "Collapse" : "Expand"}
          aria-expanded={state === "expanded"}
          onClick={onToggle}
          className="inline-flex h-fg-4 w-fg-4 shrink-0 items-center justify-center rounded-fg-xs text-ink-faint hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          {state === "expanded" ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </button>
      )}
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-fg-1-5 rounded-fg-xs text-start focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        {leading != null && (
          <span className="flex shrink-0 items-center text-ink-muted" aria-hidden>
            {leading}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
      {trailing != null && (
        <span className="flex shrink-0 items-center gap-fg-1 text-ink-faint">
          {trailing}
        </span>
      )}
    </div>
  );
}
