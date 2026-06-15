// The filter bar (W02.P07.S30, ADR G3.f), docked at the stage's top edge —
// part of the instrument, not global chrome. The tier dial leads; facet
// chips (doc type, feature, relation, structural status, text match) draw
// their legal values from the engine-enumerated vocabulary — nothing
// hardcoded. Filtered-out is recoverable context: the hidden-count chip
// names the cost. The date-range chip is read-only here — the timeline
// owns it (G4.c).

import { PanelLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useActiveScope } from "./Stage";
import { FacetChipGroup } from "../chrome/FacetChipGroup";
import { useFiltersVocabulary } from "../../stores/server/queries";
import { useFilterStore } from "../../stores/view/filters";
import { debounce } from "../../platform/timing";
import { TierDial } from "./TierDial";

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
}: {
  hidden: { nodes: number; edges: number };
  /** Pass to render a sidebar expand/collapse button at the leading edge. */
  sidebarOpen?: boolean;
  onSidebarToggle?: () => void;
}) {
  const scope = useActiveScope();
  const vocabulary = useFiltersVocabulary(scope);
  // The vocabulary query is enabled only when scope is set; "no scope yet" and
  // "in flight" both render the strip without facet chips (a designed loading
  // state) — text-match still works as a fallback throughout.
  const vocabLoading = scope === null || vocabulary.isPending;
  const docTypes = useFilterStore((s) => s.docTypes);
  const featureTags = useFilterStore((s) => s.featureTags);
  const structuralStates = useFilterStore((s) => s.structuralStates);
  const textMatch = useFilterStore((s) => s.textMatch);
  const dateRange = useFilterStore((s) => s.dateRange);
  const toggleFacet = useFilterStore((s) => s.toggleFacet);
  const setTextMatch = useFilterStore((s) => s.setTextMatch);

  // Debounce the text filter (B7, resource-hardening): the raw input is locally
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

  const relations = useFilterStore((s) => s.relations);

  const costLabel = hiddenCountLabel(hidden.nodes, hidden.edges);

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 top-0 z-10 flex flex-wrap content-center items-center gap-x-vs-3 gap-y-0 border-b border-rule bg-paper-raised px-vs-2 py-vs-1-5 text-label"
      data-filter-bar
    >
      {onSidebarToggle !== undefined && (
        <button
          type="button"
          aria-pressed={sidebarOpen}
          aria-label={sidebarOpen ? "close filter panel" : "open filter panel"}
          onClick={onSidebarToggle}
          title="toggle filter sidebar"
          className={`flex items-center rounded-vs-sm border p-vs-1 transition-colors duration-ui-fast ease-settle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
            sidebarOpen
              ? "border-rule-strong bg-paper-sunken text-ink"
              : "border-rule text-ink-muted hover:border-rule-strong"
          }`}
        >
          <PanelLeft size={13} aria-hidden />
        </button>
      )}
      <TierDial />
      {vocabLoading && (
        <span className="text-ink-faint" aria-busy data-filter-loading>
          loading facets…
        </span>
      )}
      <FacetChipGroup
        label="type"
        groupLabel="facet"
        values={vocabulary.data?.doc_types ?? []}
        selected={docTypes}
        onToggle={(v) => toggleFacet("docTypes", v)}
      />
      <FacetChipGroup
        label="feature"
        groupLabel="facet"
        values={(vocabulary.data?.feature_tags ?? []).slice(0, 6)}
        selected={featureTags}
        onToggle={(v) => toggleFacet("featureTags", v)}
      />
      <FacetChipGroup
        label="relation"
        groupLabel="facet"
        values={(vocabulary.data?.relations ?? []).slice(0, 5)}
        selected={relations}
        onToggle={(v) => toggleFacet("relations", v)}
      />
      <FacetChipGroup
        label="status"
        groupLabel="facet"
        values={["resolved", "stale", "broken"]}
        selected={structuralStates}
        onToggle={(v) => toggleFacet("structuralStates", v)}
      />
      <input
        type="search"
        value={localText}
        onChange={(e) => {
          setLocalText(e.target.value);
          debouncedSetTextMatch(e.target.value);
        }}
        placeholder="text match…"
        aria-label="text match filter"
        className="w-28 rounded-vs-sm border border-rule bg-paper-raised px-vs-1-5 py-vs-0-5 text-ink-muted focus:border-rule-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus focus:outline-none"
      />
      {(dateRange.from || dateRange.to) && (
        <span
          data-tabular
          className="rounded-full border border-rule bg-paper px-vs-1-5 py-vs-0-5 tabular-nums text-ink-muted"
        >
          {dateRange.from?.slice(0, 10) ?? "…"} → {dateRange.to?.slice(0, 10) ?? "…"}{" "}
          <span className="text-ink-faint">(timeline)</span>
        </span>
      )}
      {costLabel && (
        <span
          data-tabular
          className="rounded-full border border-state-stale bg-paper-raised px-vs-1-5 py-vs-0-5 tabular-nums text-state-stale"
        >
          {costLabel}
        </span>
      )}
    </div>
  );
}
