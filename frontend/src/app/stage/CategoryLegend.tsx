// Category legend (binding Figma `graph/Hero` 213:505 Legend 99:2): the key to the
// node-fill encoding, docked top-left of the canvas as a single raised card. Each
// item leads with the SAME centralized category GLYPH the left-rail tree uses —
// the shared `DocTypeMark` silhouette tinted by the bound scene/category color (the
// SAME color the graph nodes paint with) — over a plain-language label, so the
// legend, the tree, and the nodes all read as one icon + color schema.
//
// LIVE legend: each DOC-TYPE item is also a canonical FILTER TOGGLE — clicking a
// category writes the ONE `dashboardState.filters.doc_types` facet through the
// shared stores intent (the SAME facet the left-rail KIND section authors), so a
// category narrowed on the graph narrows the rail tree, the graph, AND the timeline
// together (unified-filter-plane D2: one filter authority, no canvas-local
// visibility mask). The doc_types facet is multi-select INCLUSION: with no
// selection every category is shown; selecting categories shows only those.
//
// `feature` is NOT a vault document category (it is a convergence-aggregation key),
// so it is not in the legend — the legend is the doc-type key, and every item it
// shows is a real, filterable category.
//
// LAYOUT (graph category-legend issue): the legend is ALWAYS ONE continuous
// HORIZONTAL row — `[chevron toggle] | [separator] | [item] [item] …` — never a
// dropdown or a vertical stack. The leading control is an ARROW-ONLY chevron (no
// label, no funnel) that toggles COMPACT vs EXPANDED:
//   • EXPANDED  → each item is `[icon] [label]`.
//   • COMPACT   → the LABEL is dropped; each item is `[icon]` only.
// The category ICONS are ALWAYS visible in BOTH modes. The row stays on a SINGLE
// line whenever it fits (it shrinks to its content and is clamped to the canvas
// width) and WRAPS only under genuine width pressure — it never wraps when there is
// room and never scrolls.
//
// SELECTED PILL: a category included by the active filter renders as an accent PILL
// (kit pill geometry + bound accent tokens) so on/off reads clearly; an unselected
// category keeps its resting mark+label appearance and dims when a selection exists.
//
// RESET: a state-aware "Reset" clears ONLY the `doc_types` facet through the
// canonical scoped-clear seam (`clearFacet`) — it never clobbers the flyout's other
// facets and never touches a private/canvas-local mask (one-filter-authority-every-
// corpus-view-consumes-it). It is shown only when a doc-type filter is active.
//
// figma-frontend-rewrite / graph-overlay redesign: the legend composes the
// centralized kit `Card` + bound category/accent tokens — never a hand-drawn pill or
// a literal hex (design-system-is-centralized, warmth-lives-in-tokens), and every
// size is relative (no-hardcoded-px-in-dom-styling).

import { useMemo, useState } from "react";

import { useDashboardFilterSidebarIntent } from "../../stores/server/dashboardFilterSidebarIntent";
import { docTypeLabel } from "../../stores/server/docTypeVocabulary";
import { useActiveScope, useVaultRailFacets } from "../../stores/server/queries";
import { DocTypeMark } from "../../scene/field/markComponents";
import { useFocusZone } from "../chrome/useFocusZone";
import {
  Card,
  ChevronLeft,
  ChevronRight,
  Divider,
  categoryColorVar,
  categoryToken,
} from "../kit";
import type { Category } from "../kit";

// The leading category GLYPH reads at the caption size — the same shared mark and
// color schema as the left-rail tree (each doc type its own mark).
const LEGEND_ICON_PX = 14;

/** The legend vocabulary in the canonical pipeline reading order (terminology-
 *  standardization ADR D2): Research · Decisions · Plans · Steps · Audits ·
 *  References. The graph is the VAULT corpus, so each label reads from the ONE
 *  canonical doc-type schema (ADR D1) and its mark resolves to the same bound
 *  scene/category color the nodes use. `code`, `index`, and `feature` are excluded —
 *  they are never displayable knowledge-node categories (ADR D5/D6), so they are not
 *  in the legend. */
const LEGEND: { category: Category; label: string }[] = [
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
      data-category-legend-mark={category}
    >
      <DocTypeMark kind={category} size={LEGEND_ICON_PX} />
    </span>
  );
}

const CARD_POSITION = "pointer-events-auto absolute left-fg-2 top-fg-2 z-10";

export function CategoryLegend() {
  const scope = useActiveScope();
  const { docTypes } = useVaultRailFacets(scope);
  const { toggleFacet, clearFacet } = useDashboardFilterSidebarIntent(scope);
  // The active `doc_types` inclusion set (stable raw slice, Set derived in useMemo
  // — stable-selectors). Empty = no filter, every category shown.
  const activeDocTypes = useMemo(() => new Set(docTypes), [docTypes]);
  const filterActive = docTypes.length > 0;
  // COMPACT drops the labels (icons only); EXPANDED shows icon + label. The legend
  // is the same horizontal row either way — only the labels toggle. Local view
  // chrome (no shared/persisted state, so the graph-controls seam is untouched).
  const [compact, setCompact] = useState(false);
  // The legend's controls rove through the one shared FocusZone as a toolbar
  // (every-composite-navigates-through-the-one-focuszone): the row is ONE tab stop
  // and arrows move between the chevron, the category toggles, and Reset.
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const zone = useFocusZone({
    orientation: "both",
    wrap: true,
    activeKey: activeItem,
    onActiveKeyChange: setActiveItem,
  });

  const toggle = zone.rove("toggle");
  const reset = zone.rove("reset");
  // Arrow only: ChevronLeft collapses the expanded row to icons; ChevronRight
  // expands the compact row back out to labels (the chevron points the way the row
  // will move).
  const ToggleChevron = compact ? ChevronRight : ChevronLeft;

  return (
    <Card
      elevation="raised"
      padded={false}
      className={`${CARD_POSITION} flex w-fit max-w-[calc(100%-1rem)] flex-wrap items-center gap-fg-1-5 px-fg-2 py-fg-1-5`}
      role="toolbar"
      aria-label="category filters"
      data-category-legend
      data-category-legend-mode={compact ? "compact" : "expanded"}
    >
      {/* Arrow-only toggle — no label, no funnel. Collapses to icons / expands to
          labels; the category icons stay visible in both modes. */}
      <button
        ref={toggle.ref}
        tabIndex={toggle.tabIndex}
        onKeyDown={toggle.onKeyDown}
        onFocus={() => setActiveItem("toggle")}
        type="button"
        onClick={() => setCompact((value) => !value)}
        aria-expanded={!compact}
        aria-label={compact ? "Show category labels" : "Hide category labels"}
        title={compact ? "Show category labels" : "Hide category labels"}
        data-category-legend-toggle
        className="flex shrink-0 items-center rounded-fg-xs px-fg-1 py-fg-0-5 text-ink-muted outline-none transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        <ToggleChevron aria-hidden size={LEGEND_ICON_PX} />
      </button>
      <Divider orientation="vertical" className="h-[1.25em] self-stretch" />
      {LEGEND.map(({ category, label }) => {
        const token = categoryToken(category);
        const selected = activeDocTypes.has(token);
        // Multi-select inclusion: with no selection every category is shown; once a
        // selection exists, only its members stay full-opacity (the rest dim).
        const included = !filterActive || selected;
        const item = zone.rove(token);
        // SELECTED → accent pill (kit pill geometry + bound accent tokens) so on/off
        // reads at a glance; UNSELECTED → the resting mark(+label) appearance, dimmed
        // when another category is selected. The icon is present in BOTH modes; the
        // label span is dropped in compact.
        const className = selected
          ? "flex shrink-0 items-center gap-fg-1 rounded-fg-pill border border-accent bg-accent-subtle px-fg-2 py-fg-0-5 text-caption font-medium text-accent-text outline-none transition-[opacity,background-color] duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          : `flex shrink-0 items-center gap-fg-1 rounded-fg-xs px-fg-1 py-fg-0-5 text-caption text-ink-muted outline-none transition-[opacity,background-color] duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
              included ? "opacity-100" : "opacity-40"
            }`;
        return (
          <button
            ref={item.ref}
            tabIndex={item.tabIndex}
            onKeyDown={item.onKeyDown}
            onFocus={() => setActiveItem(token)}
            type="button"
            key={label}
            onClick={() => void toggleFacet("doc_types", token)}
            aria-pressed={selected}
            title={`Filter by ${label}`}
            data-category-legend-item={token}
            className={className}
          >
            <LegendMark category={category} />
            {!compact ? <span>{label}</span> : null}
          </button>
        );
      })}
      {filterActive ? (
        <>
          <Divider orientation="vertical" className="h-[1.25em] self-stretch" />
          <button
            ref={reset.ref}
            tabIndex={reset.tabIndex}
            onKeyDown={reset.onKeyDown}
            onFocus={() => setActiveItem("reset")}
            type="button"
            onClick={() => void clearFacet("doc_types")}
            title="Reset category filters"
            data-category-legend-reset
            className="flex shrink-0 items-center rounded-fg-xs px-fg-1 py-fg-0-5 text-caption font-medium text-ink-muted outline-none transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            Reset
          </button>
        </>
      ) : null}
    </Card>
  );
}
