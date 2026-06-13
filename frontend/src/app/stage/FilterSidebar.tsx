// The filter sidebar (task #6, ADR G3.f promoted): a full collapsible
// panel that hosts all filter groups with section headers and per-value
// toggles — the complete instrument vs the quick-strip summary in
// FilterBar. Same hooks, same store; no fetching, no derived data.
//
// Seam boundary: reads useFilterStore + useFiltersVocabulary only.
// Chrome never touches the wire. The "N hidden" cost comes in from Stage
// which already owns the visibility membership reduction.

import { useEffect, useRef, useState } from "react";

import { useFiltersVocabulary } from "../../stores/server/queries";
import { useFilterStore } from "../../stores/view/filters";
import { useViewStore } from "../../stores/view/viewStore";
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
    <div className="border-b border-stone-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-stone-500 hover:bg-stone-50"
      >
        <span>{title}</span>
        <span className="flex items-center gap-1.5">
          {badge !== undefined && badge > 0 && (
            <span className="rounded-full bg-stone-200 px-1.5 py-0.5 text-[10px] font-normal text-stone-600">
              {badge}
            </span>
          )}
          <span className="text-stone-400">{open ? "▾" : "▸"}</span>
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
}

function FacetList({ values, selected, onToggle, max }: FacetListProps) {
  const [showAll, setShowAll] = useState(false);
  const shown = !max || showAll ? values : values.slice(0, max);
  const overflow = max ? values.length - max : 0;

  if (values.length === 0) {
    return (
      <p className="px-3 py-1 text-[11px] italic text-stone-300">none in corpus</p>
    );
  }

  return (
    <ul className="space-y-0.5 px-3" role="list">
      {shown.map((value) => {
        const on = selected.includes(value);
        return (
          <li key={value}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[11px] hover:bg-stone-50">
              <input
                type="checkbox"
                checked={on}
                onChange={() => onToggle(value)}
                className="accent-stone-600"
              />
              <span className={on ? "text-stone-800" : "text-stone-500"}>{value}</span>
            </label>
          </li>
        );
      })}
      {overflow > 0 && !showAll && (
        <li>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="ml-1 text-[11px] text-stone-400 underline hover:text-stone-600"
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
      <ul className="space-y-1 px-3" role="list">
        {TIER_ORDER.map(({ tier, mark, label }) => {
          const inapplicable = isTierInapplicable(tier, timelineMode);
          const on = tiers[tier] && !inapplicable;
          return (
            <li key={tier}>
              <label
                className={`flex flex-col gap-0.5 rounded px-1 py-0.5 ${
                  inapplicable ? "opacity-40" : "hover:bg-stone-50"
                }`}
              >
                <span className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={inapplicable}
                    onChange={() => setTier(tier, !tiers[tier])}
                    className="accent-stone-600"
                  />
                  <span
                    className={`text-[11px] ${on ? "text-stone-800" : "text-stone-400"}`}
                  >
                    {mark} {label}
                    {inapplicable && (
                      <span className="ml-1 text-[10px] text-stone-300">
                        (time-travel)
                      </span>
                    )}
                  </span>
                </span>
                {(tier === "temporal" || tier === "semantic") &&
                  !inapplicable &&
                  on && (
                    <span className="flex items-center gap-2 pl-5">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={minConfidence[tier] ?? 0}
                        aria-label={`${label} confidence floor`}
                        title={`min confidence ${Math.round((minConfidence[tier] ?? 0) * 100)}%`}
                        onChange={(e) => setMinConfidence(tier, Number(e.target.value))}
                        className="h-1 w-full accent-stone-600"
                      />
                      <span className="w-8 text-right text-[10px] text-stone-400">
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

  const docTypes = useFilterStore((s) => s.docTypes);
  const featureTags = useFilterStore((s) => s.featureTags);
  const relations = useFilterStore((s) => s.relations);
  const structuralStates = useFilterStore((s) => s.structuralStates);
  const textMatch = useFilterStore((s) => s.textMatch);
  const setFacet = useFilterStore((s) => s.setFacet);
  const setTextMatch = useFilterStore((s) => s.setTextMatch);
  const reset = useFilterStore((s) => s.reset);

  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape; refocus opener is the caller's responsibility.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus the panel on open so keyboard users can tab through controls.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

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
      className="pointer-events-auto absolute bottom-0 left-0 top-9 z-20 flex w-60 flex-col overflow-hidden border-r border-stone-200 bg-white/95 shadow-md backdrop-blur-sm focus:outline-none"
      data-filter-sidebar
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-200 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-600">
          Filters
        </span>
        <div className="flex items-center gap-2">
          {anyActive && (
            <button
              type="button"
              onClick={reset}
              className="text-[10px] text-stone-400 hover:text-stone-700"
              aria-label="reset all filters"
            >
              reset all
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="close filter panel"
            className="rounded p-0.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            ✕
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
            onToggle={(v) =>
              toggle("structuralStates", v as "resolved" | "stale" | "broken")
            }
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
            onToggle={(v) => toggle("docTypes", v)}
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
            onToggle={(v) => toggle("featureTags", v)}
            max={12}
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
            onToggle={(v) => toggle("relations", v)}
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
              className="w-full rounded border border-stone-200 px-2 py-1 text-[11px] focus:border-stone-400 focus:outline-none"
            />
          </div>
        </Section>
      </div>

      {/* Footer: hidden count */}
      {hiddenTotal > 0 && (
        <div className="border-t border-stone-200 px-3 py-1.5">
          <span className="text-[11px] text-amber-700">
            {hidden.nodes > 0 && `${hidden.nodes} nodes`}
            {hidden.nodes > 0 && hidden.edges > 0 && " · "}
            {hidden.edges > 0 && `${hidden.edges} edges`}
            {" hidden"}
          </span>
        </div>
      )}
    </div>
  );
}
