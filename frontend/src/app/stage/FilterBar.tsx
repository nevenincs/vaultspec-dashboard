// The filter bar (W02.P07.S30, ADR G3.f), docked at the stage's top edge —
// part of the instrument, not global chrome. The tier dial leads; facet
// chips (doc type, feature, relation, structural status, text match) draw
// their legal values from the engine-enumerated vocabulary — nothing
// hardcoded. Filtered-out is recoverable context: the hidden-count chip
// names the cost. The date-range chip is read-only here — the timeline
// owns it (G4.c).

import { useActiveScope } from "./Stage";
import { useFiltersVocabulary } from "../../stores/server/queries";
import { useFilterStore } from "../../stores/view/filters";
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

interface FacetChipsProps {
  label: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}

function FacetChips({ label, values, selected, onToggle }: FacetChipsProps) {
  if (values.length === 0) return null;
  return (
    <span className="flex items-center gap-1" aria-label={`${label} facet`}>
      <span className="text-stone-400">{label}</span>
      {values.map((value) => {
        const on = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(value)}
            className={`rounded-full border px-1.5 py-0.5 ${
              on
                ? "border-stone-500 bg-stone-100 text-stone-900"
                : "border-stone-200 text-stone-500"
            }`}
          >
            {value}
          </button>
        );
      })}
    </span>
  );
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
  const docTypes = useFilterStore((s) => s.docTypes);
  const featureTags = useFilterStore((s) => s.featureTags);
  const structuralStates = useFilterStore((s) => s.structuralStates);
  const textMatch = useFilterStore((s) => s.textMatch);
  const dateRange = useFilterStore((s) => s.dateRange);
  const setFacet = useFilterStore((s) => s.setFacet);
  const setTextMatch = useFilterStore((s) => s.setTextMatch);

  const relations = useFilterStore((s) => s.relations);
  const toggle = (
    facet: "docTypes" | "featureTags" | "relations" | "structuralStates",
    value: string,
  ) => {
    const current =
      facet === "docTypes"
        ? docTypes
        : facet === "featureTags"
          ? featureTags
          : facet === "relations"
            ? relations
            : structuralStates;
    setFacet(
      facet,
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    );
  };

  const costLabel = hiddenCountLabel(hidden.nodes, hidden.edges);

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-3 border-b border-stone-200 bg-white/90 px-2 py-1 text-[11px] backdrop-blur-sm"
      data-filter-bar
    >
      {onSidebarToggle !== undefined && (
        <button
          type="button"
          aria-pressed={sidebarOpen}
          aria-label={sidebarOpen ? "close filter panel" : "open filter panel"}
          onClick={onSidebarToggle}
          title="toggle filter sidebar"
          className={`rounded border px-1.5 py-0.5 ${
            sidebarOpen
              ? "border-stone-500 bg-stone-100 text-stone-900"
              : "border-stone-200 text-stone-500 hover:border-stone-400"
          }`}
        >
          ⊞
        </button>
      )}
      <TierDial />
      <FacetChips
        label="type"
        values={vocabulary.data?.doc_types ?? []}
        selected={docTypes}
        onToggle={(v) => toggle("docTypes", v)}
      />
      <FacetChips
        label="feature"
        values={(vocabulary.data?.feature_tags ?? []).slice(0, 6)}
        selected={featureTags}
        onToggle={(v) => toggle("featureTags", v)}
      />
      <FacetChips
        label="relation"
        values={(vocabulary.data?.relations ?? []).slice(0, 5)}
        selected={relations}
        onToggle={(v) => toggle("relations", v)}
      />
      <FacetChips
        label="status"
        values={["resolved", "stale", "broken"]}
        selected={structuralStates}
        onToggle={(v) => toggle("structuralStates", v)}
      />
      <input
        type="search"
        value={textMatch}
        onChange={(e) => setTextMatch(e.target.value)}
        placeholder="text match…"
        aria-label="text match filter"
        className="w-28 rounded border border-stone-200 px-1.5 py-0.5"
      />
      {(dateRange.from || dateRange.to) && (
        <span className="rounded-full border border-stone-300 bg-stone-50 px-1.5 py-0.5 text-stone-600">
          {dateRange.from?.slice(0, 10) ?? "…"} → {dateRange.to?.slice(0, 10) ?? "…"}{" "}
          <span className="text-stone-400">(timeline)</span>
        </span>
      )}
      {costLabel && (
        <span className="ml-auto rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-800">
          {costLabel}
        </span>
      )}
    </div>
  );
}
