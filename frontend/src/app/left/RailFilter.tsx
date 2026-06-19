// The in-rail filter (binding Figma `LeftRail` 244:750 — the "Filter documents…"
// SearchField beneath the mode toggle). Re-skinned (W02.P04.S07) onto the
// centralized kit `SearchField` (board "Design System — Components" 135:2) so the
// field is a real shared definition, not a per-surface hand-built input
// (design-system-is-centralized). It narrows the ALREADY-FETCHED listing
// client-side by name / stem / tag after its parent reads canonical dashboard
// filter text.
//
// It stays the deliberate counterpart to the global right-rail SEARCH pillar
// (`POST /search`): its placeholder names the client-side narrowing ("Filter
// documents…" / "Filter files…"), never "search", and it lives inline in the
// rail's browser region, not in the activity rail.
//
// The rail filter area is the SINGLE canonical filter surface
// (filter-consolidation ADR / binding `LeftRail` FilterRow): the text SearchField
// for the live narrowing, plus a trailing `PanelLeft` trigger (with an active-count
// badge) that opens the centralized facet flyout (KIND / TOPIC / STATUS / HEALTH).
// The graph, timeline, and right rail host no filter controls — they consume the
// one canonical `dashboardState.filters` this surface authors.
//
// Read-only navigation law: this emits no scope/node selection and never fetches;
// its parent routes text changes through canonical dashboard filters and owns the
// flyout open-state.

import { Badge, IconButton, PanelLeft, SearchField } from "../kit";

export interface RailFilterProps {
  /** The active browser mode, used to name the narrowed listing in the
   *  placeholder so the filter reads as scoped to the current mode. */
  modeLabel: string;
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  /** Active facet-filter count, surfaced as the trigger badge (0 hides it). */
  filterActiveCount?: number;
  /** Whether the facet flyout is open (drives the trigger's pressed state). */
  filterOpen?: boolean;
  /** Toggle the facet flyout. Omit to render the text field alone. */
  onToggleFilter?: () => void;
}

export function RailFilter({
  modeLabel,
  value,
  onChange,
  onClear,
  filterActiveCount = 0,
  filterOpen = false,
  onToggleFilter,
}: RailFilterProps) {
  // Name the narrowed listing for the active mode: vault narrows documents,
  // code narrows files. Always begins with "Filter …" (never "search…").
  const noun = modeLabel === "code" ? "files" : "documents";
  return (
    <div data-rail-filter className="flex items-center gap-fg-1-5">
      <div className="min-w-0 flex-1">
        <SearchField
          value={value}
          onChange={onChange}
          onClear={onClear ?? (() => onChange(""))}
          placeholder={`Filter ${noun}…`}
          ariaLabel={`filter the ${modeLabel} listing`}
        />
      </div>
      {onToggleFilter && (
        <div className="relative flex shrink-0 items-center">
          <IconButton
            label={filterOpen ? "close filter options" : "open filter options"}
            title="filter by kind, topic, status, and health"
            active={filterOpen}
            onClick={onToggleFilter}
            data-rail-filter-trigger
          >
            <PanelLeft size={14} aria-hidden />
          </IconButton>
          {filterActiveCount > 0 && (
            <span className="pointer-events-none absolute -right-1 -top-1">
              <Badge tone="accent">{filterActiveCount}</Badge>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
