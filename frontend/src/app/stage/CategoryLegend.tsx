// Category legend (binding Figma `graph/Hero` 213:505 Legend 99:2): a quiet,
// non-interactive key to the node-fill encoding, docked top-left of the canvas as a
// single raised card. Each item is a small dot carrying the SAME bound
// scene/category color the graph nodes paint with (via the shared `category`
// vocabulary) over a plain-language label, so a swatch and its nodes always agree.
//
// figma-frontend-rewrite / graph-overlay redesign: the legend composes the
// centralized kit `Card` and the bound category tokens — never a hand-drawn pill or
// a literal hex (design-system-is-centralized, warmth-lives-in-tokens). Pure chrome:
// it reads nothing off the wire, holds no state, and emits no intent; it merely
// names the encoding.

import { Card, categoryColorVar } from "../kit";
import type { Category } from "../kit";

/** The legend vocabulary in the binding reading order (board 99:2): Topic ·
 *  Research · Decision · Plan · Step · Review · Summary. The graph is the VAULT
 *  corpus, so each label is the user-facing doc-kind name and its dot resolves to
 *  the same bound scene/category color the nodes use. */
const LEGEND: { category: Category; label: string }[] = [
  { category: "topic", label: "Topic" },
  { category: "research", label: "Research" },
  { category: "decision", label: "Decision" },
  { category: "plan", label: "Plan" },
  { category: "step", label: "Step" },
  { category: "audit", label: "Review" },
  { category: "summary", label: "Summary" },
];

export function CategoryLegend() {
  return (
    <Card
      elevation="raised"
      padded={false}
      className="pointer-events-auto absolute left-fg-2 top-fg-2 z-10 flex max-w-[60%] flex-wrap items-center gap-fg-3 px-fg-3 py-fg-2"
      role="list"
      aria-label="category legend"
      data-category-legend
    >
      {LEGEND.map(({ category, label }) => (
        <span
          role="listitem"
          key={label}
          className="flex shrink-0 items-center gap-fg-1"
        >
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColorVar(category) }}
          />
          <span className="text-caption text-ink-muted">{label}</span>
        </span>
      ))}
    </Card>
  );
}
