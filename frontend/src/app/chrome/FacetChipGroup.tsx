// The shared facet-chip group primitive (codebase-centralisation M5).
//
// One facet-chip presentational component for the whole instrument: the stage
// FilterBar and the timeline TimelineControls both render the same
// vocabulary-driven on/off toggles, so the markup lives here once instead of
// drifting per surface. Each chip is a two-state on/off filter, so it carries
// the SWITCH role (`role="switch"` / `aria-checked`) — the correct semantics
// (consistent with the TierDial), not `aria-pressed` — with the non-color
// pressed cue (sunken + strong rule) as the visual channel.
//
// Pure presentation: it owns no store and no fetch. Callers pass the
// vocabulary `values`, the `selected` set, and an `onToggle(value)` intent that
// drives the shared filter store's `toggleFacet` action.

interface FacetChipGroupProps {
  /** The facet's display label (e.g. "type", "relation", "feature"). */
  label: string;
  /** The engine-enumerated vocabulary values to render as chips. */
  values: string[];
  /** The currently-selected values. */
  selected: string[];
  /** Emit toggle intent for a value (add-if-absent / remove-if-present). */
  onToggle: (value: string) => void;
  /**
   * The group's `aria-label` suffix appended to `label` (e.g. "filter",
   * "facet"). Defaults to "filter".
   */
  groupLabel?: string;
  /**
   * Text rendered in place of chips when the vocabulary is empty (e.g. "…").
   * When omitted, an empty vocabulary renders nothing.
   */
  emptyHint?: string;
}

export function FacetChipGroup({
  label,
  values,
  selected,
  onToggle,
  groupLabel = "filter",
  emptyHint,
}: FacetChipGroupProps) {
  if (values.length === 0 && emptyHint === undefined) return null;
  return (
    <span className="flex items-center gap-1" aria-label={`${label} ${groupLabel}`}>
      <span className="text-ink-faint">{label}</span>
      {values.length === 0 && emptyHint !== undefined ? (
        <span className="text-ink-faint">{emptyHint}</span>
      ) : (
        values.map((value) => {
          const on = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`${label} ${value}`}
              onClick={() => onToggle(value)}
              className={`rounded-fg-pill border px-fg-1-5 py-fg-0-5 transition-colors duration-ui-fast ease-settle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                on
                  ? "border-rule-strong bg-paper-sunken font-medium text-ink"
                  : "border-rule text-ink-muted hover:border-rule-strong"
              }`}
            >
              {value}
            </button>
          );
        })
      )}
    </span>
  );
}
