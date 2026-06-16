// Kit Chip / Badge (figma-frontend-rewrite W01.P02 — binding Figma component kit
// board "Design System — Components" 135:2, Chip/Badge by Category). A small pill
// label — the centralized definition for category badges (the #feature-tag chip on
// a ListRow, the legend chips, the doc-type marks). The category drives a leading
// dot tinted by the bound scene/category token and a low-chroma tinted ground, so
// the chip reads its category by both the dot color and (for screen readers) the
// label text — never by hue alone.
//
// `Badge` is the same primitive without the leading dot (a plain count/status
// pill); both live here so the pill geometry/radius is defined exactly once.

import type { ReactNode } from "react";

import type { Category } from "./category";
import { categoryColorVar, categoryToken } from "./category";

export interface ChipProps {
  /** The category whose bound color tints the leading dot. */
  category: Category;
  /** The chip label (e.g. a "#feature-tag" or the doc type). */
  children: ReactNode;
}

const PILL =
  "inline-flex shrink-0 items-center gap-fg-1 rounded-fg-pill border border-rule bg-paper-sunken px-fg-2 py-fg-0-5 text-meta font-medium text-ink-muted";

export function Chip({ category, children }: ChipProps) {
  return (
    <span data-kit="chip" data-category={categoryToken(category)} className={PILL}>
      <span
        aria-hidden
        className="inline-block size-2 shrink-0 rounded-full"
        style={{ backgroundColor: categoryColorVar(category) }}
      />
      {children}
    </span>
  );
}

export type BadgeTone = "neutral" | "accent";

export interface BadgeProps {
  /** Tone: neutral ruled pill (default) or the accent-subtle tint. */
  tone?: BadgeTone;
  /** The badge label (e.g. a count, a tier like "L3", a status). */
  children: ReactNode;
}

/** A plain pill with no category dot — a count / tier / status badge. */
export function Badge({ tone = "neutral", children }: BadgeProps) {
  return (
    <span
      data-kit="badge"
      data-tone={tone}
      className={`inline-flex shrink-0 items-center rounded-fg-pill px-fg-2 py-fg-0-5 text-meta font-medium tabular-nums ${
        tone === "accent"
          ? "bg-accent-subtle text-accent-text"
          : "border border-rule bg-paper-sunken text-ink-muted"
      }`}
    >
      {children}
    </span>
  );
}
