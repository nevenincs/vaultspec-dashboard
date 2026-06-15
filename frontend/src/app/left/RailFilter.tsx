// The in-rail filter (dashboard-left-rail ADR "In-rail filter"): an optional
// affordance scoped to the active browser mode that narrows the ALREADY-FETCHED
// listing client-side by name / stem / tag. It issues NO wire request (the
// narrowing happens in the VaultBrowser / CodeTree over entries the stores query
// already returned) and clears on scope swap (the browser-mode store's per-scope
// reset). It is the deliberate counterpart to the global right-rail SEARCH
// pillar (`POST /search`), and must read as a DIFFERENT surface:
//
//   - it carries a Lucide FUNNEL (`Filter`) mark, not the right rail's SEARCH
//     (magnifying-glass) mark, so the two "find" affordances never look alike;
//   - its placeholder says "filter <mode>…", naming the client-side narrowing,
//     not "search";
//   - it lives inline in the rail's browser region, not in the activity rail.
//
// Read-only navigation law: this is a view-local affordance only — it emits no
// scope/node selection and never fetches; it writes the filter text into the
// browser-mode store and nothing else.

import { Filter, X } from "lucide-react";

// 12px chrome size (one density step below the 14px domain-mark gate) so the
// funnel reads as attenuated structural chrome, matching the rail's chevrons.
const CHROME_PX = 12;

export interface RailFilterProps {
  /** The active browser mode, named in the placeholder so the filter reads as
   *  scoped to the current listing ("filter vault…" / "filter code…"). */
  modeLabel: string;
  value: string;
  onChange: (value: string) => void;
}

export function RailFilter({ modeLabel, value, onChange }: RailFilterProps) {
  const has = value.length > 0;
  return (
    <div
      // Figma `SearchField`: a paper-raised pill with the funnel mark. The
      // placeholder says "filter …" (not "search") and carries the funnel — NOT
      // the magnifying glass — so this client-side narrowing never looks like the
      // global right-rail search pillar (the deliberate distinction the IA fixes).
      className="flex shrink-0 items-center gap-vs-1-5 rounded-vs-md border border-rule bg-paper-raised px-vs-2 py-vs-1 focus-within:border-rule-strong"
      data-rail-filter
    >
      {/* The FUNNEL mark — deliberately NOT the right-rail search glass — so the
          client-side filter never looks like the global semantic search. */}
      <span className="shrink-0 text-ink-faint" aria-hidden>
        <Filter size={CHROME_PX} />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`filter ${modeLabel}…`}
        aria-label={`filter the ${modeLabel} listing`}
        // role/spellcheck off: this is a path/stem/tag narrowing, not prose.
        spellCheck={false}
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent font-mono text-2xs text-ink placeholder:text-ink-faint focus-visible:outline-none"
        data-rail-filter-input
      />
      {has && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="clear the filter"
          className="shrink-0 rounded-vs-sm text-ink-faint transition-colors hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          data-rail-filter-clear
        >
          <X size={CHROME_PX} />
        </button>
      )}
    </div>
  );
}
