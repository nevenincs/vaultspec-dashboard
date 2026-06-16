// The filter sidebar (figma-parity-reconciliation W02.P05.S33; binding
// FacetChipGroup primitive, Figma node 136:27): a full collapsible panel that
// hosts all filter groups with section headers and per-value toggles — the
// complete instrument vs the quick-strip summary in FilterBar. Same hooks, same
// store; no fetching, no derived data.
//
// Rebuilt onto the NEW Figma role-named token foundation: the overlay panel on the
// three-level overlay elevation (`shadow-fg-overlay`), section rows and toggles on
// the canonical radius (`rounded-fg-xs`), badges on the pill radius
// (`rounded-fg-pill`), and dense badges/values on the `caption` type role.
//
// Seam boundary: reads useFilterStore + useFiltersVocabulary only.
// Chrome never touches the wire. The "N hidden" cost comes in from Stage
// which already owns the visibility membership reduction.

import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useDismissOnEscape } from "../chrome/useDismissOnEscape";
import { TierMark } from "../../scene/field/markComponents";
import { useFiltersVocabulary } from "../../stores/server/queries";
import { useFilterStore } from "../../stores/view/filters";
import { useViewStore } from "../../stores/view/viewStore";
import { hiddenCountLabel } from "./FilterBar";
import { TIER_ORDER, isTierInapplicable } from "./TierDial";

// ---------------------------------------------------------------------------
// Section scaffold
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string;
  badge?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, badge, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-rule">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-fg-3 py-fg-1-5 text-left text-label font-medium uppercase tracking-wider text-ink-muted hover:bg-paper-sunken"
      >
        <span>{title}</span>
        <span className="flex items-center gap-fg-1-5">
          {badge !== undefined && badge > 0 && (
            <span className="rounded-fg-pill bg-paper-sunken px-fg-1-5 py-fg-0-5 text-caption font-normal text-ink-muted">
              {badge}
            </span>
          )}
          <span className="text-ink-faint">
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
        </span>
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Facet toggle list
// ---------------------------------------------------------------------------

interface FacetListProps {
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
  max?: number;
  /** Vocabulary query in flight — render a loading cue, not "none in corpus". */
  loading?: boolean;
}

function FacetList({ values, selected, onToggle, max, loading }: FacetListProps) {
  const [showAll, setShowAll] = useState(false);
  const shown = !max || showAll ? values : values.slice(0, max);
  const overflow = max ? values.length - max : 0;

  if (values.length === 0) {
    // Loading and empty are distinct designed states: a vocabulary still in
    // flight is "loading…", an actually-empty corpus is "none in corpus".
    return (
      <p
        className="px-fg-3 py-fg-1 text-label italic text-ink-faint"
        aria-busy={loading || undefined}
      >
        {loading ? "loading…" : "none in corpus"}
      </p>
    );
  }

  return (
    <ul className="space-y-fg-0-5 px-fg-3" role="list">
      {shown.map((value) => {
        const on = selected.includes(value);
        return (
          <li key={value}>
            <label className="flex cursor-pointer items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-0-5 text-label hover:bg-paper-sunken">
              <input
                type="checkbox"
                checked={on}
                onChange={() => onToggle(value)}
                className="accent-accent"
              />
              <span className={on ? "text-ink" : "text-ink-muted"}>{value}</span>
            </label>
          </li>
        );
      })}
      {overflow > 0 && !showAll && (
        <li>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="ml-fg-1 text-label text-ink-faint underline hover:text-ink-muted"
          >
            +{overflow} more
          </button>
        </li>
      )}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Tier section (reuses the dial's data; inline layout for sidebar width)
// ---------------------------------------------------------------------------

function TierSection() {
  const tiers = useFilterStore((s) => s.tiers);
  const minConfidence = useFilterStore((s) => s.minConfidence);
  const setTier = useFilterStore((s) => s.setTier);
  const setMinConfidence = useFilterStore((s) => s.setMinConfidence);
  const timelineMode = useViewStore((s) => s.timelineMode);

  const activeCount = Object.values(tiers).filter(Boolean).length;

  return (
    <Section title="Tiers" badge={activeCount < 4 ? activeCount : undefined}>
      <ul className="space-y-fg-1 px-fg-3" role="list">
        {TIER_ORDER.map(({ tier, label }) => {
          const inapplicable = isTierInapplicable(tier, timelineMode);
          const on = tiers[tier] && !inapplicable;
          return (
            <li key={tier}>
              <label
                className={`flex flex-col gap-fg-0-5 rounded-fg-xs px-fg-1 py-fg-0-5 ${
                  inapplicable ? "opacity-40" : "hover:bg-paper-sunken"
                }`}
              >
                <span className="flex cursor-pointer items-center gap-fg-2">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={inapplicable}
                    onChange={() => setTier(tier, !tiers[tier])}
                    className="accent-accent"
                  />
                  <span
                    className={`flex items-center gap-fg-1 text-label ${on ? "text-ink" : "text-ink-faint"}`}
                  >
                    <TierMark tier={tier} size={14} title={`${label} tier mark`} />
                    {label}
                    {inapplicable && (
                      <span className="ml-fg-1 text-caption text-ink-faint">
                        (time-travel)
                      </span>
                    )}
                  </span>
                </span>
                {(tier === "temporal" || tier === "semantic") &&
                  !inapplicable &&
                  on && (
                    <span className="flex items-center gap-fg-2 pl-fg-4">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={minConfidence[tier] ?? 0}
                        aria-label={`${label} confidence floor`}
                        aria-valuetext={`${Math.round((minConfidence[tier] ?? 0) * 100)} percent`}
                        title={`min confidence ${Math.round((minConfidence[tier] ?? 0) * 100)}%`}
                        onChange={(e) => setMinConfidence(tier, Number(e.target.value))}
                        className="h-1 w-full accent-accent"
                      />
                      <span
                        data-tabular
                        className="w-8 text-right text-caption tabular-nums text-ink-faint"
                      >
                        {Math.round((minConfidence[tier] ?? 0) * 100)}%
                      </span>
                    </span>
                  )}
              </label>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Main sidebar
// ---------------------------------------------------------------------------

export interface FilterSidebarProps {
  /** Whether the sidebar panel is visible. */
  open: boolean;
  /** Close the sidebar. */
  onClose: () => void;
  /** Scope for vocabulary queries (same as FilterBar). */
  scope: string | null;
  /** Hidden count — owned by Stage's visibility membership reduction. */
  hidden: { nodes: number; edges: number };
}

export function FilterSidebar({ open, onClose, scope, hidden }: FilterSidebarProps) {
  const vocabulary = useFiltersVocabulary(scope);
  // The vocabulary query is enabled only when scope is set; treat "no scope yet"
  // and "in flight" alike as loading so the data-driven facets render a loading
  // cue instead of a false "none in corpus".
  const vocabLoading = scope === null || vocabulary.isPending;

  const docTypes = useFilterStore((s) => s.docTypes);
  const featureTags = useFilterStore((s) => s.featureTags);
  const relations = useFilterStore((s) => s.relations);
  const structuralStates = useFilterStore((s) => s.structuralStates);
  const textMatch = useFilterStore((s) => s.textMatch);
  const toggleFacet = useFilterStore((s) => s.toggleFacet);
  const setTextMatch = useFilterStore((s) => s.setTextMatch);
  const reset = useFilterStore((s) => s.reset);

  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape; refocus opener is the caller's responsibility.
  useDismissOnEscape(onClose, { enabled: open });

  // Focus the panel on open so keyboard users can tab through controls.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const anyActive =
    docTypes.length > 0 ||
    featureTags.length > 0 ||
    relations.length > 0 ||
    structuralStates.length > 0 ||
    textMatch.length > 0;

  const hiddenTotal = hidden.nodes + hidden.edges;

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="filter panel"
      aria-modal={false}
      tabIndex={-1}
      className="pointer-events-auto absolute bottom-0 left-0 top-9 z-20 flex w-60 flex-col overflow-hidden border-r border-rule bg-paper-raised/95 shadow-fg-overlay backdrop-blur-sm focus:outline-none animate-slide-in-left"
      data-filter-sidebar
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-rule px-fg-3 py-fg-1-5">
        <span className="text-label font-semibold uppercase tracking-wider text-ink-muted">
          Filters
        </span>
        <div className="flex items-center gap-fg-2">
          {anyActive && (
            <button
              type="button"
              onClick={reset}
              className="text-caption text-ink-faint hover:text-ink"
              aria-label="reset all filters"
            >
              reset all
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="close filter panel"
            className="rounded-fg-xs p-fg-0-5 text-ink-faint hover:bg-paper-sunken hover:text-ink"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Scrollable filter groups */}
      <div className="flex-1 overflow-y-auto">
        {/* Tier section */}
        <TierSection />

        {/* Status (resolved / stale / broken) */}
        <Section
          title="Link Status"
          badge={structuralStates.length || undefined}
          defaultOpen={structuralStates.length > 0}
        >
          <FacetList
            values={["resolved", "stale", "broken"]}
            selected={structuralStates}
            onToggle={(v) => toggleFacet("structuralStates", v)}
          />
        </Section>

        {/* Doc Types */}
        <Section
          title="Doc Type"
          badge={docTypes.length || undefined}
          defaultOpen={docTypes.length > 0}
        >
          <FacetList
            values={vocabulary.data?.doc_types ?? []}
            selected={docTypes}
            onToggle={(v) => toggleFacet("docTypes", v)}
            loading={vocabLoading}
          />
        </Section>

        {/* Features */}
        <Section
          title="Feature"
          badge={featureTags.length || undefined}
          defaultOpen={false}
        >
          <FacetList
            values={vocabulary.data?.feature_tags ?? []}
            selected={featureTags}
            onToggle={(v) => toggleFacet("featureTags", v)}
            max={12}
            loading={vocabLoading}
          />
        </Section>

        {/* Relations */}
        <Section
          title="Relation"
          badge={relations.length || undefined}
          defaultOpen={false}
        >
          <FacetList
            values={vocabulary.data?.relations ?? []}
            selected={relations}
            onToggle={(v) => toggleFacet("relations", v)}
            loading={vocabLoading}
          />
        </Section>

        {/* Text match */}
        <Section title="Text" defaultOpen>
          <div className="px-3 pb-1">
            <input
              type="search"
              value={textMatch}
              onChange={(e) => setTextMatch(e.target.value)}
              placeholder="match node labels…"
              aria-label="text match filter"
              className="w-full rounded-fg-xs border border-rule bg-paper-raised px-fg-2 py-fg-1 text-label text-ink-muted focus:border-rule-strong focus:outline-none"
            />
          </div>
        </Section>
      </div>

      {/* Footer: hidden count */}
      {hiddenTotal > 0 && (
        <div className="border-t border-rule px-fg-3 py-fg-1-5">
          <span className="text-label text-state-stale">
            {hiddenCountLabel(hidden.nodes, hidden.edges)}
          </span>
        </div>
      )}
    </div>
  );
}
