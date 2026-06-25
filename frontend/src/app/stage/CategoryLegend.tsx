// Category legend (binding Figma `graph/Hero` 213:505 Legend 99:2): the key to the
// node-fill encoding, docked top-left of the canvas as a single raised card. Each
// item leads with the SAME centralized category GLYPH the left-rail tree uses —
// the shared `DocTypeMark` silhouette tinted by the bound scene/category color (the
// SAME color the graph nodes paint with) — over a plain-language label, so the
// legend, the tree, and the nodes all read as one icon + color schema. Features use
// the plan mark in the feature color (matching the tree); doc types use their own
// mark.
//
// LIVE legend: each DOC-TYPE item is also a canonical FILTER TOGGLE — clicking a
// category writes the ONE `dashboardState.filters.doc_types` facet through the
// shared stores intent (the SAME facet the left-rail KIND section authors), so a
// category narrowed on the graph narrows the rail tree, the graph, AND the timeline
// together (unified-filter-plane D2: one filter authority, no canvas-local
// visibility mask). The doc_types facet is multi-select INCLUSION: with no
// selection every category is shown; selecting categories shows only those. The
// `feature` item is the aggregation's colour KEY, not a doc-type, so it is a static
// swatch (there is no `doc_types` value for a feature-convergence node) — the legend
// "remains the colour/shape key" while every filterable category cross-wires.
//
// figma-frontend-rewrite / graph-overlay redesign: the legend composes the
// centralized kit `Card` and the bound category tokens — never a hand-drawn pill or
// a literal hex (design-system-is-centralized, warmth-lives-in-tokens).

import { useMemo, useState } from "react";

import { useDashboardFilterSidebarIntent } from "../../stores/server/dashboardFilterSidebarIntent";
import { docTypeLabel } from "../../stores/server/docTypeVocabulary";
import { useActiveScope, useVaultRailFacets } from "../../stores/server/queries";
import { DocTypeMark } from "../../scene/field/markComponents";
import { useFocusZone } from "../chrome/useFocusZone";
import { Card, categoryColorVar, categoryToken } from "../kit";
import type { Category } from "../kit";

// The leading category GLYPH reads at the caption size — the same shared mark and
// color schema as the left-rail tree (features carry the plan mark, doc types their
// own). Feature folds onto the plan mark to match the tree's feature treatment.
const LEGEND_ICON_PX = 14;
function legendMarkKind(category: Category): string {
  return category === "feature" ? "plan" : category;
}

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

function LegendMark({ category }: { category: Category }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center"
      style={{ color: categoryColorVar(category) }}
      data-category-legend-mark={legendMarkKind(category)}
    >
      <DocTypeMark kind={legendMarkKind(category)} size={LEGEND_ICON_PX} />
    </span>
  );
}

export function CategoryLegend() {
  const scope = useActiveScope();
  const { docTypes } = useVaultRailFacets(scope);
  const { toggleFacet } = useDashboardFilterSidebarIntent(scope);
  // The active `doc_types` inclusion set (stable raw slice, Set derived in useMemo
  // — stable-selectors). Empty = no filter, every category shown.
  const activeDocTypes = useMemo(() => new Set(docTypes), [docTypes]);
  const filterActive = docTypes.length > 0;
  // The doc-type filter toggles rove through the one shared FocusZone as a toolbar
  // (every-composite-navigates-through-the-one-focuszone): the legend is ONE tab
  // stop and arrows move between the categories. The `feature` swatch is a static
  // colour key (not a button), so it is outside the zone.
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const zone = useFocusZone({
    orientation: "both",
    wrap: true,
    activeKey: activeItem,
    onActiveKeyChange: setActiveItem,
  });
  return (
    <Card
      elevation="raised"
      padded={false}
      className="pointer-events-auto absolute left-fg-2 top-fg-2 z-10 flex max-w-[60%] flex-wrap items-center gap-fg-2 px-fg-2 py-fg-1-5"
      role="toolbar"
      aria-label="category filters"
      data-category-legend
    >
      {LEGEND.map(({ category, label }) => {
        const token = categoryToken(category);
        // `feature` is the aggregation's colour key, not a vault doc-type, so it is
        // a static swatch — there is no canonical `doc_types` value to toggle.
        if (category === "feature") {
          return (
            <span
              key={label}
              data-category-legend-item={token}
              className="flex shrink-0 items-center gap-fg-1 px-fg-1 py-fg-0-5"
            >
              <LegendMark category={category} />
              <span className="text-caption text-ink-muted">{label}</span>
            </span>
          );
        }
        // Multi-select inclusion: with no selection every category is shown; once a
        // selection exists, only its members stay full-opacity (the rest dim).
        const included = !filterActive || activeDocTypes.has(token);
        const item = zone.rove(token);
        return (
          <button
            ref={item.ref}
            tabIndex={item.tabIndex}
            onKeyDown={item.onKeyDown}
            onFocus={() => setActiveItem(token)}
            type="button"
            key={label}
            onClick={() => void toggleFacet("doc_types", token)}
            aria-pressed={activeDocTypes.has(token)}
            title={`Filter by ${label}`}
            data-category-legend-item={token}
            className={`flex shrink-0 items-center gap-fg-1 rounded-fg-xs px-fg-1 py-fg-0-5 outline-none transition-[opacity,background-color] duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
              included ? "opacity-100" : "opacity-40"
            }`}
          >
            <LegendMark category={category} />
            <span className="text-caption text-ink-muted">{label}</span>
          </button>
        );
      })}
    </Card>
  );
}
