// Category legend (binding Figma `graph/Hero` 213:505 Legend 99:2): the key to the
// node-fill encoding, hosted in the LEFT of the graph panel's dock-header row (the
// dockview prefix-actions slot — the free space left of the empty graph tab, with
// the graph + activity-rail visibility toggles riding the same header's right). It
// is mounted by `DockWorkspace`'s `prefixHeaderActionsComponent` and rendered only
// in the graph group's header; it is no longer a free-floating canvas overlay, so
// its size is managed by the header row rather than absolute canvas positioning.
// Each item leads with the SAME centralized category GLYPH the left-rail tree uses —
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
// centralized kit marks/dividers + bound category/accent tokens — never a hand-drawn
// pill or a literal hex (design-system-is-centralized, warmth-lives-in-tokens), and
// every size is relative (no-hardcoded-px-in-dom-styling).

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { useDashboardFilterSidebarIntent } from "../../stores/server/dashboardFilterSidebarIntent";
import { docTypeLabel } from "../../stores/server/docTypeVocabulary";
import { useActiveScope, useVaultRailFacets } from "../../stores/server/queries";
import { useCodeModuleLegend } from "../../stores/view/codeModuleLegend";
import { useGraphControlsAppearanceParams } from "../../stores/view/graphControlsChrome";
import { DocTypeMark } from "../../scene/field/markComponents";
import { useFocusZone } from "../chrome/useFocusZone";
import {
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
// Breathing gap (px) reserved between the legend's expanded width and the header's
// right-actions cluster when deciding to auto-compact — a measurement constant used
// only in arithmetic, never as a DOM size (no-hardcoded-px-in-dom-styling).
const LEGEND_HEADER_GAP = 16;

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

/** CODE corpus module-hue palette order (CGR-002 P02.S08): `module_hue` 0..6 maps
 *  to these categories — the SAME ordered palette `appearance.ts`
 *  `categoryPaletteHue` bakes into the node colours, so a legend swatch matches the
 *  hue its module's nodes paint with. */
const MODULE_HUE_CATEGORIES: Category[] = [
  "feature",
  "research",
  "adr",
  "plan",
  "exec",
  "audit",
  "reference",
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

// The legend fills the LEFT of the graph dock-header row and is left-aligned and
// vertically centered in it; it shrinks to its content and is clamped to the header
// (the toolbar row inside is `w-fit max-w-full`, the region clips any overflow). The
// symmetric inline padding keeps the legend off the rail edge on the left and gives
// it breathing room before the header's free space / toggles on the right.
const LEGEND_REGION_POSITION =
  "flex h-full min-w-0 max-w-full items-center overflow-hidden px-fg-2";

export function CategoryLegend() {
  const scope = useActiveScope();
  // CODE corpus (CGR-002 P02.S08): the served slice's hued modules, rolled up
  // client-side. Non-empty ⇒ the graph is the code corpus ⇒ swap the doc-type key
  // for the module colour key below; empty ⇒ the vault doc-type legend (unchanged).
  const codeModules = useCodeModuleLegend(scope);
  // The node colour mode decides WHICH key the code legend shows: module swatches
  // (category) or the recency heat ramp (code-graph-heat ADR).
  const { nodeColorMode } = useGraphControlsAppearanceParams();
  const { docTypes } = useVaultRailFacets(scope);
  const { toggleFacet, clearFacet } = useDashboardFilterSidebarIntent(scope);
  // The active `doc_types` inclusion set (stable raw slice, Set derived in useMemo
  // — stable-selectors). Empty = no filter, every category shown.
  const activeDocTypes = useMemo(() => new Set(docTypes), [docTypes]);
  const filterActive = docTypes.length > 0;
  // COMPACT drops the labels (icons only); EXPANDED shows icon + label. The legend
  // is the same horizontal row either way — only the labels toggle. Local view
  // chrome (no shared/persisted state, so the graph-controls seam is untouched).
  //
  // Two compact sources: the user's manual chevron (`userCompact`) and an automatic
  // minify (`autoCompact`) ENFORCED when the expanded row can't fit the available
  // width left of the canvas controls (the reported overlap/overflow). Either wins.
  const [userCompact, setUserCompact] = useState(false);
  const [autoCompact, setAutoCompact] = useState(false);
  const compact = userCompact || autoCompact;
  // Measure-then-minify: the available width is the graph dock-header MINUS its
  // right-actions cluster (the graph + activity-rail visibility toggles) and a small
  // gap; the card's `scrollWidth` (read while EXPANDED, then cached) is the width the
  // expanded row needs. When the need exceeds the available space, enforce compact —
  // and re-expand once the space returns. The header chrome is dockview's stable
  // `.dv-tabs-and-actions-container` / `.dv-right-actions-container`; when it is
  // absent (a bare unit render with no dock host) we fall back to the region width.
  const regionRef = useRef<HTMLDivElement | null>(null);
  const expandedNeedRef = useRef(0);
  useLayoutEffect(() => {
    const region = regionRef.current;
    if (!region || typeof ResizeObserver === "undefined") return;
    const header = region.closest<HTMLElement>(".dv-tabs-and-actions-container");
    const evaluate = () => {
      const card = region.querySelector<HTMLElement>("[data-category-legend]");
      if (!card) return;
      // The expanded width is only measurable while the labels show; cache it so a
      // later compact render still knows what the expanded row would need.
      if (!compact) expandedNeedRef.current = card.scrollWidth;
      const need = expandedNeedRef.current;
      if (need <= 0) return;
      const rightActions = header?.querySelector<HTMLElement>(
        ".dv-right-actions-container",
      );
      const available = header
        ? header.clientWidth - (rightActions?.offsetWidth ?? 0) - LEGEND_HEADER_GAP
        : region.clientWidth;
      setAutoCompact(need > available);
    };
    const observer = new ResizeObserver(evaluate);
    observer.observe(region);
    if (header) observer.observe(header);
    evaluate();
    return () => observer.disconnect();
  }, [compact, filterActive]);
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
  // Arrow only: ChevronLeft collapses the expanded row to icons; ChevronRight
  // expands the compact row back out to labels (the chevron points the way the row
  // will move).
  const ToggleChevron = compact ? ChevronRight : ChevronLeft;

  // CODE CORPUS legend (CGR-002 P02.S08): a MODULE colour key — one row per top
  // module the engine hued, in the palette hue its nodes paint with. It is a colour
  // KEY (display), not a filter toggle: code carries no `dir_prefix` facet on the
  // wire, and the module hue is served per-node, so re-listing it here re-classifies
  // nothing (display-state-is-backend-served). Same toolbar shell + chevron compact
  // as the doc-type legend; the module rows are non-interactive.
  if (codeModules.length > 0 && nodeColorMode === "recency") {
    // Recency heat mode (code-graph-heat ADR): the module-identity swatch key
    // does not describe the node fill any more — one gradient ramp row does. The
    // ramp mirrors the scene's two stops EXACTLY (cold = ink-muted mixed 35%
    // toward the canvas ground, hot = the accent) via the same bound tokens, so
    // legend and nodes re-theme together.
    return (
      <div
        ref={regionRef}
        className={LEGEND_REGION_POSITION}
        data-category-legend-region
      >
        <div
          className="flex w-fit max-w-full flex-nowrap items-center gap-fg-1-5 overflow-hidden"
          role="group"
          aria-label="recency colour ramp"
          data-category-legend
          data-category-legend-corpus="code"
          data-category-legend-heat
        >
          <span className="shrink-0 text-caption text-ink-muted">Older</span>
          <span
            aria-hidden
            className="inline-block h-[0.5em] w-[6em] shrink-0 rounded-fg-pill"
            data-recency-ramp
            style={{
              background:
                "linear-gradient(to right, color-mix(in srgb, var(--color-ink-muted) 65%, var(--color-canvas-bg) 35%), var(--color-accent))",
            }}
          />
          <span className="shrink-0 text-caption text-ink-muted">Recent</span>
        </div>
      </div>
    );
  }

  if (codeModules.length > 0) {
    return (
      <div
        ref={regionRef}
        className={LEGEND_REGION_POSITION}
        data-category-legend-region
      >
        <div
          className="flex w-fit max-w-full flex-nowrap items-center gap-fg-1-5 overflow-hidden"
          role="group"
          aria-label="module colours"
          data-category-legend
          data-category-legend-corpus="code"
          data-category-legend-mode={compact ? "compact" : "expanded"}
        >
          <button
            ref={toggle.ref}
            tabIndex={toggle.tabIndex}
            onKeyDown={toggle.onKeyDown}
            onFocus={() => setActiveItem("toggle")}
            type="button"
            onClick={() => setUserCompact((value) => !value)}
            aria-expanded={!compact}
            aria-label={compact ? "Show module labels" : "Hide module labels"}
            title={compact ? "Show module labels" : "Hide module labels"}
            data-category-legend-toggle
            className="flex shrink-0 items-center rounded-fg-xs px-fg-1 py-fg-0-5 text-ink-muted outline-none transition-colors duration-ui-fast ease-settle hover:bg-paper-raised focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <ToggleChevron aria-hidden size={LEGEND_ICON_PX} />
          </button>
          <Divider orientation="vertical" className="h-[1.25em] self-stretch" />
          {codeModules.map(({ module, moduleHue }) => {
            const category =
              MODULE_HUE_CATEGORIES[moduleHue % MODULE_HUE_CATEGORIES.length];
            return (
              <span
                key={module}
                data-category-legend-item={module}
                title={module}
                className="flex shrink-0 items-center gap-fg-1 rounded-fg-xs px-fg-1 py-fg-0-5 text-caption text-ink-muted"
              >
                <span
                  aria-hidden
                  data-module-swatch={category}
                  className="inline-block shrink-0 rounded-full"
                  style={{
                    width: "0.75em",
                    height: "0.75em",
                    backgroundColor: categoryColorVar(category),
                  }}
                />
                {!compact ? <span className="truncate">{module}</span> : null}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={regionRef} className={LEGEND_REGION_POSITION} data-category-legend-region>
      {/* Inline header toolbar row — no raised card surface: the legend now reads as
          part of the opaque dock-header bar rather than a floating panel over the
          canvas. */}
      <div
        className="flex w-fit max-w-full flex-nowrap items-center gap-fg-1-5 overflow-hidden"
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
          onClick={() => setUserCompact((value) => !value)}
          aria-expanded={!compact}
          aria-label={compact ? "Show category labels" : "Hide category labels"}
          title={compact ? "Show category labels" : "Hide category labels"}
          data-category-legend-toggle
          className="flex shrink-0 items-center rounded-fg-xs px-fg-1 py-fg-0-5 text-ink-muted outline-none transition-colors duration-ui-fast ease-settle hover:bg-paper-raised focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
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
            : `flex shrink-0 items-center gap-fg-1 rounded-fg-xs px-fg-1 py-fg-0-5 text-caption text-ink-muted outline-none transition-[opacity,background-color] duration-ui-fast ease-settle hover:bg-paper-raised focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
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
        {filterActive
          ? // Reset is enrolled in the FocusZone order ONLY when it renders (it is
            // conditional on an active filter). Calling `zone.rove("reset")` here —
            // not unconditionally at the top — keeps the roving order matching the
            // VISIBLE controls, so arrowing off the toggle never lands on a phantom
            // (unrendered) Reset and stalls (every-composite-navigates-through-the-one-focuszone).
            (() => {
              const reset = zone.rove("reset");
              return (
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
                    className="flex shrink-0 items-center rounded-fg-xs px-fg-1 py-fg-0-5 text-caption font-medium text-ink-muted outline-none transition-colors duration-ui-fast ease-settle hover:bg-paper-raised focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                  >
                    Reset
                  </button>
                </>
              );
            })()
          : null}
      </div>
    </div>
  );
}
