// The stage toolbar (binding Figma stage chrome: the top toolbar of AppShell 117:2
// — "Search the graph", a Filter control with its active count, an "N of M" node
// count, and the recoverable filtered-out cost). Docked at the stage's top edge —
// part of the instrument, not global chrome.
//
// figma-frontend-rewrite W03.P07.S10 / W04.P11.S17: the toolbar now follows the
// binding Filter-MENU model — the busy inline tier dial + facet chip strip is
// RETIRED from the toolbar; the full facet instrument lives behind the Filter
// control in the `FilterSidebar` (the binding "Filter menu" 217:633). The toolbar
// composes the centralized kit: a `SearchField` for the live text match, a Filter
// toggle (`IconButton` + active-count `Badge`) that opens the menu, and quiet
// count/cost pills. Filtered-out is recoverable context: the cost pill names what
// the filter removed, carrying the stale/caution token tone (not an error).
//
// A dumb projection over the PRESERVED filter store — it fetches nothing of its own
// and reads no raw tiers block (dashboard-layer-ownership). Tokens only; icons are
// the sanctioned Lucide chrome family from the kit.

import { useEffect, useMemo, useState } from "react";

import { Badge, IconButton, PanelLeft, SearchField } from "../kit";
import { useFilterStore } from "../../stores/view/filters";
import { debounce } from "../../platform/timing";

/** The "N hidden" cost chip text; null hides the chip. */
export function hiddenCountLabel(
  hiddenNodes: number,
  hiddenEdges: number,
): string | null {
  if (hiddenNodes === 0 && hiddenEdges === 0) return null;
  const parts: string[] = [];
  if (hiddenNodes > 0) parts.push(`${hiddenNodes} nodes`);
  if (hiddenEdges > 0) parts.push(`${hiddenEdges} edges`);
  return `${parts.join(" · ")} hidden`;
}

export function FilterBar({
  hidden,
  sidebarOpen,
  onSidebarToggle,
  nodeCounts,
}: {
  hidden: { nodes: number; edges: number };
  /** Pass to render a Filter (sidebar expand/collapse) control at the leading edge. */
  sidebarOpen?: boolean;
  onSidebarToggle?: () => void;
  /** Optional visible/total node count for the "N of M" toolbar readout. */
  nodeCounts?: { visible: number; total: number };
}) {
  const docTypes = useFilterStore((s) => s.docTypes);
  const featureTags = useFilterStore((s) => s.featureTags);
  const structuralStates = useFilterStore((s) => s.structuralStates);
  const relations = useFilterStore((s) => s.relations);
  const textMatch = useFilterStore((s) => s.textMatch);
  const dateRange = useFilterStore((s) => s.dateRange);
  const setTextMatch = useFilterStore((s) => s.setTextMatch);

  // The number of active facet selections — surfaced as a count Badge on the
  // Filter control so the menu's effect is legible without opening it.
  const activeFilterCount =
    docTypes.length +
    featureTags.length +
    relations.length +
    structuralStates.length +
    (textMatch.length > 0 ? 1 : 0);

  // Debounce the text filter (B7, resource-hardening): the field is locally
  // controlled for instant feedback, but the store write — which drives a full
  // computeVisibility recompute over the live slice — is trailing-edge debounced
  // so it fires once per pause, not once per keystroke.
  const [localText, setLocalText] = useState(textMatch);
  useEffect(() => setLocalText(textMatch), [textMatch]);
  const debouncedSetTextMatch = useMemo(
    () => debounce((value: string) => setTextMatch(value), 200),
    [setTextMatch],
  );
  useEffect(() => () => debouncedSetTextMatch.cancel(), [debouncedSetTextMatch]);

  const costLabel = hiddenCountLabel(hidden.nodes, hidden.edges);

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 top-0 z-10 flex flex-wrap content-center items-center gap-x-fg-2 gap-y-fg-1 border-b border-rule bg-paper-raised px-fg-2 py-fg-1-5 text-label"
      data-filter-bar
    >
      {onSidebarToggle !== undefined && (
        <div className="flex items-center gap-fg-1">
          <IconButton
            label={sidebarOpen ? "close filter panel" : "open filter panel"}
            title="toggle filter sidebar"
            active={sidebarOpen}
            onClick={onSidebarToggle}
          >
            <PanelLeft size={14} aria-hidden />
          </IconButton>
          {activeFilterCount > 0 && (
            <Badge tone="accent">{activeFilterCount}</Badge>
          )}
        </div>
      )}
      <SearchField
        value={localText}
        onChange={(value) => {
          setLocalText(value);
          debouncedSetTextMatch(value);
        }}
        placeholder="Search the graph…"
        ariaLabel="text match filter"
        onClear={() => {
          setLocalText("");
          setTextMatch("");
        }}
      />
      {nodeCounts && (
        <span data-tabular className="tabular-nums text-ink-muted">
          {nodeCounts.visible} of {nodeCounts.total}
        </span>
      )}
      {(dateRange.from || dateRange.to) && (
        <span
          data-tabular
          className="rounded-fg-pill border border-rule bg-paper px-fg-1-5 py-fg-0-5 tabular-nums text-ink-muted"
        >
          {dateRange.from?.slice(0, 10) ?? "…"} → {dateRange.to?.slice(0, 10) ?? "…"}{" "}
          <span className="text-ink-faint">(timeline)</span>
        </span>
      )}
      {costLabel && (
        <span
          data-tabular
          className="rounded-fg-pill border border-state-stale bg-paper-raised px-fg-1-5 py-fg-0-5 tabular-nums text-state-stale"
        >
          {costLabel}
        </span>
      )}
    </div>
  );
}
