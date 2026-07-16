import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import { useDashboardFilterSidebarIntent } from "../../stores/server/dashboardFilterSidebarIntent";
import {
  DOC_TYPE_ORDER,
  DOC_TYPE_PRESENTATION,
} from "../../stores/server/docTypeVocabulary";
import { useActiveScope, useVaultRailFacets } from "../../stores/server/queries";
import {
  type CodeModuleLegendRow,
  useCodeModuleLegend,
} from "../../stores/view/codeModuleLegend";
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

const LEGEND_ICON_PX = 14;
const LEGEND_HEADER_GAP = 16;

const LEGEND = DOC_TYPE_ORDER.map((category) => ({
  category,
  label: DOC_TYPE_PRESENTATION[category].label,
}));

export const CATEGORY_LEGEND_MESSAGES = Object.freeze({
  recencyScale: Object.freeze({
    key: "graph:legend.accessibility.recencyScale",
  } satisfies MessageDescriptor<"graph:legend.accessibility.recencyScale">),
  moduleColors: Object.freeze({
    key: "graph:legend.accessibility.moduleColors",
  } satisfies MessageDescriptor<"graph:legend.accessibility.moduleColors">),
  documentTypeFilters: Object.freeze({
    key: "graph:legend.accessibility.documentTypeFilters",
  } satisfies MessageDescriptor<"graph:legend.accessibility.documentTypeFilters">),
  showModuleLabels: Object.freeze({
    key: "graph:legend.actions.showModuleLabels",
  } satisfies MessageDescriptor<"graph:legend.actions.showModuleLabels">),
  hideModuleLabels: Object.freeze({
    key: "graph:legend.actions.hideModuleLabels",
  } satisfies MessageDescriptor<"graph:legend.actions.hideModuleLabels">),
  showDocumentTypeLabels: Object.freeze({
    key: "graph:legend.actions.showDocumentTypeLabels",
  } satisfies MessageDescriptor<"graph:legend.actions.showDocumentTypeLabels">),
  hideDocumentTypeLabels: Object.freeze({
    key: "graph:legend.actions.hideDocumentTypeLabels",
  } satisfies MessageDescriptor<"graph:legend.actions.hideDocumentTypeLabels">),
  clearDocumentTypeFilters: Object.freeze({
    key: "graph:legend.actions.clearDocumentTypeFilters",
  } satisfies MessageDescriptor<"graph:legend.actions.clearDocumentTypeFilters">),
  addDocumentTypeFilter: Object.freeze({
    key: "graph:legend.actions.addDocumentTypeFilter",
  } satisfies MessageDescriptor<"graph:legend.actions.addDocumentTypeFilter">),
  removeDocumentTypeFilter: Object.freeze({
    key: "graph:legend.actions.removeDocumentTypeFilter",
  } satisfies MessageDescriptor<"graph:legend.actions.removeDocumentTypeFilter">),
  older: Object.freeze({
    key: "graph:legend.labels.older",
  } satisfies MessageDescriptor<"graph:legend.labels.older">),
  recent: Object.freeze({
    key: "graph:legend.labels.recent",
  } satisfies MessageDescriptor<"graph:legend.labels.recent">),
});

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

export function CodeModuleLegendRows({
  codeModules,
  compact,
}: {
  codeModules: readonly CodeModuleLegendRow[];
  compact: boolean;
}) {
  return codeModules.map(({ module, moduleHue }) => {
    const category = MODULE_HUE_CATEGORIES[moduleHue % MODULE_HUE_CATEGORIES.length];
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
  });
}

const LEGEND_REGION_POSITION =
  "flex h-full min-w-0 max-w-full items-center overflow-hidden px-fg-2";

export function CategoryLegend() {
  const resolveMessage = useLocalizedMessageResolver();
  const scope = useActiveScope();
  const codeModules = useCodeModuleLegend(scope);
  const { nodeColorMode } = useGraphControlsAppearanceParams();
  const { docTypes } = useVaultRailFacets(scope);
  const { toggleFacet, clearFacet } = useDashboardFilterSidebarIntent(scope);
  const activeDocTypes = useMemo(() => new Set(docTypes), [docTypes]);
  const filterActive = docTypes.length > 0;
  const [userCompact, setUserCompact] = useState(false);
  const [autoCompact, setAutoCompact] = useState(false);
  const compact = userCompact || autoCompact;
  const regionRef = useRef<HTMLDivElement | null>(null);
  const expandedNeedRef = useRef(0);
  useLayoutEffect(() => {
    const region = regionRef.current;
    if (!region || typeof ResizeObserver === "undefined") return;
    const header = region.closest<HTMLElement>(".dv-tabs-and-actions-container");
    const evaluate = () => {
      const card = region.querySelector<HTMLElement>("[data-category-legend]");
      if (!card) return;
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
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const zone = useFocusZone({
    orientation: "both",
    wrap: true,
    activeKey: activeItem,
    onActiveKeyChange: setActiveItem,
  });

  const toggle = zone.rove("toggle");
  const ToggleChevron = compact ? ChevronRight : ChevronLeft;

  if (codeModules.length > 0 && nodeColorMode === "recency") {
    return (
      <div
        ref={regionRef}
        className={LEGEND_REGION_POSITION}
        data-category-legend-region
      >
        <div
          className="flex w-fit max-w-full flex-nowrap items-center gap-fg-1-5 overflow-hidden"
          role="group"
          aria-label={resolveMessage(CATEGORY_LEGEND_MESSAGES.recencyScale).message}
          data-category-legend
          data-category-legend-corpus="code"
          data-category-legend-heat
        >
          <span className="shrink-0 text-caption text-ink-muted">
            {resolveMessage(CATEGORY_LEGEND_MESSAGES.older).message}
          </span>
          <span
            aria-hidden
            className="inline-block h-[0.5em] w-[6em] shrink-0 rounded-fg-pill"
            data-recency-ramp
            style={{
              background:
                "linear-gradient(to right, color-mix(in srgb, var(--color-ink-muted) 65%, var(--color-canvas-bg) 35%), var(--color-accent))",
            }}
          />
          <span className="shrink-0 text-caption text-ink-muted">
            {resolveMessage(CATEGORY_LEGEND_MESSAGES.recent).message}
          </span>
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
          aria-label={resolveMessage(CATEGORY_LEGEND_MESSAGES.moduleColors).message}
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
            aria-label={
              resolveMessage(
                compact
                  ? CATEGORY_LEGEND_MESSAGES.showModuleLabels
                  : CATEGORY_LEGEND_MESSAGES.hideModuleLabels,
              ).message
            }
            title={
              resolveMessage(
                compact
                  ? CATEGORY_LEGEND_MESSAGES.showModuleLabels
                  : CATEGORY_LEGEND_MESSAGES.hideModuleLabels,
              ).message
            }
            data-category-legend-toggle
            className="flex shrink-0 items-center rounded-fg-xs px-fg-1 py-fg-0-5 text-ink-muted outline-none transition-colors duration-ui-fast ease-settle hover:bg-paper-raised focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <ToggleChevron aria-hidden size={LEGEND_ICON_PX} />
          </button>
          <Divider orientation="vertical" className="h-[1.25em] self-stretch" />
          <CodeModuleLegendRows codeModules={codeModules} compact={compact} />
        </div>
      </div>
    );
  }

  return (
    <div ref={regionRef} className={LEGEND_REGION_POSITION} data-category-legend-region>
      <div
        className="flex w-fit max-w-full flex-nowrap items-center gap-fg-1-5 overflow-hidden"
        role="toolbar"
        aria-label={
          resolveMessage(CATEGORY_LEGEND_MESSAGES.documentTypeFilters).message
        }
        data-category-legend
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
          aria-label={
            resolveMessage(
              compact
                ? CATEGORY_LEGEND_MESSAGES.showDocumentTypeLabels
                : CATEGORY_LEGEND_MESSAGES.hideDocumentTypeLabels,
            ).message
          }
          title={
            resolveMessage(
              compact
                ? CATEGORY_LEGEND_MESSAGES.showDocumentTypeLabels
                : CATEGORY_LEGEND_MESSAGES.hideDocumentTypeLabels,
            ).message
          }
          data-category-legend-toggle
          className="flex shrink-0 items-center rounded-fg-xs px-fg-1 py-fg-0-5 text-ink-muted outline-none transition-colors duration-ui-fast ease-settle hover:bg-paper-raised focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          <ToggleChevron aria-hidden size={LEGEND_ICON_PX} />
        </button>
        <Divider orientation="vertical" className="h-[1.25em] self-stretch" />
        {LEGEND.map(({ category, label: labelDescriptor }) => {
          const token = categoryToken(category);
          const label = resolveMessage(labelDescriptor).message;
          const selected = activeDocTypes.has(token);
          const included = !filterActive || selected;
          const item = zone.rove(token);
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
              key={token}
              onClick={() => void toggleFacet("doc_types", token)}
              aria-pressed={selected}
              title={
                resolveMessage({
                  key: selected
                    ? CATEGORY_LEGEND_MESSAGES.removeDocumentTypeFilter.key
                    : CATEGORY_LEGEND_MESSAGES.addDocumentTypeFilter.key,
                  values: { documentType: label },
                }).message
              }
              data-category-legend-item={token}
              className={className}
            >
              <LegendMark category={category} />
              {!compact ? <span>{label}</span> : null}
            </button>
          );
        })}
        {filterActive
          ? (() => {
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
                    title={
                      resolveMessage(CATEGORY_LEGEND_MESSAGES.clearDocumentTypeFilters)
                        .message
                    }
                    data-category-legend-reset
                    className="flex shrink-0 items-center rounded-fg-xs px-fg-1 py-fg-0-5 text-caption font-medium text-ink-muted outline-none transition-colors duration-ui-fast ease-settle hover:bg-paper-raised focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                  >
                    {
                      resolveMessage(CATEGORY_LEGEND_MESSAGES.clearDocumentTypeFilters)
                        .message
                    }
                  </button>
                </>
              );
            })()
          : null}
      </div>
    </div>
  );
}
