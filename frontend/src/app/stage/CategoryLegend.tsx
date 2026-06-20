// Category legend (binding Figma `graph/Hero` 213:505 Legend 99:2): the key to the
// node-fill encoding, docked top-left of the canvas as a single raised card. Each
// item is a small dot carrying the SAME bound scene/category color the graph nodes
// paint with (via the shared `category` vocabulary) over a plain-language label, so
// a swatch and its nodes always agree.
//
// LIVE legend: each item is also a canvas FILTER TOGGLE — clicking a category
// hides/shows that category's nodes on the graph canvas (a dimmed item is hidden).
// The toggle writes a CANVAS-LOCAL visibility mask through the
// `graphCategoryVisibility` seam, NOT the canonical dashboard filter
// (filtering-has-one-canonical-surface: the left rail stays the sole facet-filter
// author). The mask composes into the stores' set-visibility projection, so the
// scene fades the nodes; the dataset and the tree/timeline are untouched.
//
// figma-frontend-rewrite / graph-overlay redesign: the legend composes the
// centralized kit `Card` and the bound category tokens — never a hand-drawn pill or
// a literal hex (design-system-is-centralized, warmth-lives-in-tokens).

import {
  toggleHiddenCategory,
  useHiddenCategorySet,
} from "../../stores/view/graphCategoryVisibility";
import { docTypeLabel } from "../../stores/server/docTypeVocabulary";
import { Card, categoryColorVar, categoryToken } from "../kit";
import type { Category } from "../kit";

/** The legend vocabulary in the canonical pipeline reading order (terminology-
 *  standardization ADR D2): Feature · Research · Decisions · Plans · Steps · Audits
 *  · References. The graph is the VAULT corpus, so each label reads from the ONE
 *  canonical doc-type schema (ADR D1) and its dot resolves to the same bound
 *  scene/category color the nodes use. `code` and `index` are excluded — they are
 *  never displayable knowledge nodes (ADR D5/D6), so they are not in the legend. */
const LEGEND: { category: Category; label: string }[] = [
  { category: "feature", label: "Feature" },
  { category: "research", label: docTypeLabel("research") },
  { category: "adr", label: docTypeLabel("adr") },
  { category: "plan", label: docTypeLabel("plan") },
  { category: "exec", label: docTypeLabel("exec") },
  { category: "audit", label: docTypeLabel("audit") },
  { category: "reference", label: docTypeLabel("reference") },
];

export function CategoryLegend() {
  const hidden = useHiddenCategorySet();
  return (
    <Card
      elevation="raised"
      padded={false}
      className="pointer-events-auto absolute left-fg-2 top-fg-2 z-10 flex max-w-[60%] flex-wrap items-center gap-fg-2 px-fg-2 py-fg-1-5"
      role="group"
      aria-label="category filters"
      data-category-legend
    >
      {LEGEND.map(({ category, label }) => {
        const token = categoryToken(category);
        const isHidden = hidden.has(token);
        return (
          <button
            type="button"
            key={label}
            onClick={() => toggleHiddenCategory(token)}
            aria-pressed={!isHidden}
            title={isHidden ? `Show ${label}` : `Hide ${label}`}
            data-category-legend-item={token}
            className={`flex shrink-0 items-center gap-fg-1 rounded-fg-xs px-fg-1 py-fg-0-5 outline-none transition-[opacity,background-color] duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
              isHidden ? "opacity-40" : "opacity-100"
            }`}
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: categoryColorVar(category) }}
            />
            <span className="text-caption text-ink-muted">{label}</span>
          </button>
        );
      })}
    </Card>
  );
}
