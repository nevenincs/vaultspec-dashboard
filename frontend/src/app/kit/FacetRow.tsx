// Kit FacetRow (filter-controls campaign — binding Figma "graph/Filter menu" 217:633
// checkbox/radio row). The single centralized filter-facet row every filter section
// composes from: a custom check/radio control, an optional status/health dot, a label,
// and an optional trailing count. Replaces the per-surface raw <input> rows the old
// FilterSidebar hand-built, so a facet row on screen is always this one shared
// definition (design-system-is-centralized).
//
// Display-only and prop-driven: holds no wire state, issues no fetch, emits the
// toggle through `onToggle`. The dot fill binds to a semantic state/health CSS
// variable (themeable, never raw hex).

import { Check } from "lucide-react";

/** Semantic dot tones — bound to the scene state / diff CSS variables. */
export type FacetDotTone =
  | "active"
  | "complete"
  | "archived"
  | "stale"
  | "broken"
  | "provisional"
  | "danger";

const DOT_VAR: Record<FacetDotTone, string> = {
  active: "var(--color-state-active)",
  complete: "var(--color-state-complete)",
  archived: "var(--color-state-archived)",
  stale: "var(--color-state-stale)",
  broken: "var(--color-state-broken)",
  provisional: "var(--color-status-provisional)",
  danger: "var(--color-diff-remove)",
};

/** The CSS-variable color for a facet dot tone — the one place the status/health
 *  tone→color binding lives, so FacetRow and any other facet renderer agree. */
export function facetDotColor(tone: FacetDotTone): string {
  return DOT_VAR[tone];
}

export interface FacetRowProps {
  /** The facet label (e.g. "Research", "dangling links"). */
  label: string;
  /** Whether the facet is selected. */
  checked: boolean;
  /** Toggle the facet. */
  onToggle: () => void;
  /** Optional trailing count (corpus members carrying this facet). */
  count?: string;
  /** Optional leading status/health dot. */
  dot?: FacetDotTone;
  /** Control kind — checkbox (multi-select, default) or radio (single-select). */
  control?: "checkbox" | "radio";
  /** Radio group name (required when control="radio"). */
  name?: string;
}

export function FacetRow({
  label,
  checked,
  onToggle,
  count,
  dot,
  control = "checkbox",
  name,
}: FacetRowProps) {
  const isRadio = control === "radio";
  return (
    <label
      className="flex w-full cursor-pointer items-center gap-[0.625rem] rounded-fg-md px-fg-1-5 py-[0.3125rem] transition-colors duration-ui-fast hover:bg-paper-sunken"
      data-kit="facet-row"
    >
      <input
        type={isRadio ? "radio" : "checkbox"}
        name={name}
        checked={checked}
        onChange={onToggle}
        className="peer sr-only"
      />
      {/* Custom control glyph — focus ring rides the peer-focus-visible state. */}
      {isRadio ? (
        <span
          aria-hidden
          className={`grid size-[1rem] shrink-0 place-items-center rounded-full border-[0.0875rem] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-focus ${
            checked ? "border-accent" : "border-rule"
          }`}
        >
          {checked && <span className="size-[0.5rem] rounded-full bg-accent" />}
        </span>
      ) : (
        <span
          aria-hidden
          className={`grid size-[1rem] shrink-0 place-items-center rounded-fg-xs border-[0.075rem] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-focus ${
            checked ? "border-accent bg-accent text-paper" : "border-rule bg-paper"
          }`}
        >
          {checked && <Check size={11} strokeWidth={3} />}
        </span>
      )}
      {dot && (
        <span
          aria-hidden
          className="size-[0.5rem] shrink-0 rounded-full"
          style={{ backgroundColor: DOT_VAR[dot] }}
        />
      )}
      <span
        className={`text-[0.78125rem] text-ink ${checked ? "font-medium" : "font-normal"}`}
      >
        {label}
      </span>
      {count != null && (
        <>
          <span className="w-[0.25rem] shrink-0" />
          <span data-tabular className="text-[0.6875rem] tabular-nums text-ink-muted">
            {count}
          </span>
        </>
      )}
    </label>
  );
}
