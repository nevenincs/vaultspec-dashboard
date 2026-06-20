// Stage layout + salience selectors (figma-parity-reconciliation W03.P09.S53;
// graph-node-salience ADR; graph-layout-catalog ADR D11).
//
// This module owns the binding `graph/Layout picker` 216:633 LAYOUT control — the
// plain-language Free / Lineage / Hierarchy / Radial / Clusters / Meaning picker
// (plus the distinct Timeline temporal entry) — and the distinct salience LENS
// selector (status / design). Both are dumb projections over canonical dashboard
// state (the stores layer is the sole wire client): switching the layout writes
// the representation mode, switching the lens writes the active salience lens (a
// wire re-query, folded into the graph-slice cache key).
//
// W03.P09.S53 — the Layout control is consolidated HERE so the canonical picker
// has one home; `GraphControls` renders `<LayoutSelector />` rather than carrying
// its own inline copy. The catalog is PRESERVED (graph-layout-catalog D11): the
// binding "Grouped" label organizes the clustering-family spatial modes, so the
// Spatial group surfaces the full preserved catalog — Network (connectivity),
// Tree (lineage), Layered (hierarchical), Radial (radial), Communities
// (community), Grouped by meaning (semantic) — under the binding plain-language
// framing, with Timeline kept DISTINCT as the temporal time-travel seam (it is
// not a spatial layout). No catalog mode is orphaned and no dead control ships.
//
// Layer ownership (dashboard-layer-ownership): app chrome reads + writes the
// dashboard-state surface; it never fetches the engine and never reads the raw
// tiers block. Icons are Lucide structural marks (the sanctioned chrome family).
// Tokens only — no raw hex; the type usages read the Figma role-named scale.

import { Compass, ScrollText } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useRef } from "react";

import { SEMANTIC_MODE_GATE } from "../../scene/field/semanticGate";
import { useDashboardStageControlsIntent } from "../../stores/server/dashboardStageControlsIntent";
import type { DashboardDateRange, SalienceLens } from "../../stores/server/engine";
import {
  deriveDashboardLayoutSelectorPresentationView,
  deriveDashboardLensSelectorPresentationView,
  type DashboardLayoutSegmentGroupView,
  type DashboardSpatialRepresentationMode,
  useActiveScope,
  useDashboardLayoutSelectorView,
  useDashboardLensSelectorView,
} from "../../stores/server/queries";
import { useTimelineViewportState } from "../../stores/view/timeline";
import { movePlayhead } from "../../stores/view/timelineIntent";
import { visibleRange } from "../timeline/scrollStrip";

// ---------------------------------------------------------------------------
// Segmented control - a roving-tabstop group: one Tab-stop, arrow keys walk the
// segments. Shared by the Layout picker (the Spatial group and the distinct
// Timeline entry are each a Segmented).
// ---------------------------------------------------------------------------

interface SegmentedProps<T extends string> {
  group: DashboardLayoutSegmentGroupView<T>;
  onSelect: (value: T) => void;
}

function Segmented<T extends string>({ group, onSelect }: SegmentedProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback((e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const buttons = Array.from(
      groupRef.current?.querySelectorAll<HTMLButtonElement>("button[data-seg]") ?? [],
    );
    const at = buttons.indexOf(e.currentTarget);
    if (at === -1) return;
    const next =
      e.key === "ArrowRight"
        ? at + 1
        : e.key === "ArrowLeft"
          ? at - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? buttons.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    buttons[Math.min(buttons.length - 1, Math.max(0, next))]?.focus();
  }, []);

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label={group.ariaLabel}
      className={group.className}
    >
      {group.segments.map((seg) => {
        return (
          <button
            key={seg.value}
            type="button"
            data-seg
            aria-pressed={seg.active}
            aria-label={seg.label}
            title={seg.title}
            tabIndex={seg.tabIndex}
            onKeyDown={onKeyDown}
            onClick={() => onSelect(seg.value)}
            className={seg.className}
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The binding Layout control — the plain-language graph/Controls 88:2 picker.
// ---------------------------------------------------------------------------

export function timelineEntryInstant(
  dateRange: DashboardDateRange | undefined,
  scrollOffset: number,
  pxPerMs: number,
  viewportWidth: number,
  now: number,
): number {
  const dateRangeTo = dateRange?.to ? Date.parse(dateRange.to) : NaN;
  const fallback = visibleRange(scrollOffset, viewportWidth, pxPerMs, 0).toMs;
  const finiteFallback = Number.isFinite(fallback) ? fallback : now;
  const target = Number.isFinite(dateRangeTo) ? dateRangeTo : finiteFallback;
  return Math.trunc(Math.min(now, target));
}

/**
 * The binding Layout control (graph/Controls 88:2): the plain-language Network /
 * Tree / Grouped / Timeline picker over the PRESERVED representation-mode catalog.
 * Writes the representation mode into dashboard-state (Stage's single
 * scene-owner effect turns the subscribed value into a scene command); Timeline
 * enters the temporal time-travel seam (movePlayhead). Reflects time-travel as
 * the active Timeline segment and downgrades the held semantic mode honestly.
 */
export function LayoutSelector() {
  const scope = useActiveScope();
  const stageControlsIntent = useDashboardStageControlsIntent(scope);
  const layoutView = useDashboardLayoutSelectorView(scope);
  const { dateRange, timeline } = layoutView;
  const layoutPresentation = deriveDashboardLayoutSelectorPresentationView(layoutView, {
    semanticShipped: SEMANTIC_MODE_GATE.shipped,
  });
  const timeTravelling = timeline.timeTravel;
  const { pxPerMs, scrollOffset, viewportWidth } = useTimelineViewportState();

  function onSpatial(value: DashboardSpatialRepresentationMode) {
    // Selecting a spatial mode returns to LIVE (leaving the temporal view) and
    // sets the representation mode.
    if (timeTravelling) {
      movePlayhead("live", scope);
    }
    if (scope) {
      void stageControlsIntent.setRepresentationMode(value).catch(() => undefined);
    }
  }

  function onTimeline() {
    // Enter the temporal view at the canonical date-range end when one is set,
    // otherwise at the scroll-strip viewport's visible right edge.
    const at = timelineEntryInstant(
      dateRange,
      scrollOffset,
      pxPerMs,
      viewportWidth,
      Date.now(),
    );
    movePlayhead(at, scope);
    if (scope) {
      void stageControlsIntent.setRepresentationMode("temporal").catch(() => undefined);
    }
  }

  return (
    <div className={layoutPresentation.containerClassName} data-layout-picker>
      <Segmented group={layoutPresentation.spatial} onSelect={onSpatial} />
      <Segmented group={layoutPresentation.temporal} onSelect={onTimeline} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Salience lens (graph-node-salience ADR, canvas-controls amendment W04.P12).
//
// Selects the active SALIENCE lens (status, design) — the viewer-intent parameter
// that, via DOI, drives both the per-lens importance field and the served node
// set. Switching the lens is a wire RE-QUERY (the lens folds into the graph slice
// cache key), so this control emits lens intent into the stores VIEW STORE — the
// stores layer is the sole wire client. Distinct from the named-filter-set lenses
// (the palette's saved filters) and the tier dial. The binding `graph/Controls`
// consolidation has no slot for the lens (a distinct concern from layout/zoom), so
// it stays docked on its own rather than being silently dropped — it remains a
// real, consumed capability.
// ---------------------------------------------------------------------------

const LENS_ICONS: Record<SalienceLens, typeof Compass> = {
  status: Compass,
  design: ScrollText,
};

export function LensSelector() {
  const scope = useActiveScope();
  const stageControlsIntent = useDashboardStageControlsIntent(scope);
  const lensView = useDashboardLensSelectorView(scope);
  const lensPresentation = deriveDashboardLensSelectorPresentationView(lensView, {
    disabled: !scope || stageControlsIntent.pending,
  });

  return (
    <div
      role="group"
      aria-label={lensPresentation.containerAriaLabel}
      className={lensPresentation.containerClassName}
    >
      {lensPresentation.rows.map((row) => {
        const Icon = LENS_ICONS[row.lens];
        return (
          <button
            key={row.lens}
            type="button"
            role="switch"
            aria-checked={row.active}
            aria-label={row.ariaLabel}
            title={row.hint}
            disabled={row.disabled}
            onClick={() => {
              void stageControlsIntent.setLens(row.lens);
            }}
            className={row.className}
          >
            <Icon size={14} aria-hidden />
            <span>{row.label}</span>
          </button>
        );
      })}
    </div>
  );
}
