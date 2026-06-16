// The in-rail filter (binding Figma `LeftRail` 244:750 — the "Filter documents…"
// SearchField beneath the mode toggle). Re-skinned (W02.P04.S07) onto the
// centralized kit `SearchField` (board "Design System — Components" 135:2) so the
// field is a real shared definition, not a per-surface hand-built input
// (design-system-is-centralized). It narrows the ALREADY-FETCHED listing
// client-side by name / stem / tag — it issues NO wire request (the narrowing
// happens in the VaultBrowser / CodeTree over entries the stores query already
// returned) and clears on scope swap (the browser-mode store's per-scope reset).
//
// It stays the deliberate counterpart to the global right-rail SEARCH pillar
// (`POST /search`): its placeholder names the client-side narrowing ("Filter
// documents…" / "Filter files…"), never "search", and it lives inline in the
// rail's browser region, not in the activity rail. (The binding Figma now draws
// this as the same SearchField primitive the stage toolbar uses, superseding the
// prior cycle's distinct funnel mark; the "Filter …" placeholder carries the
// distinction.)
//
// Read-only navigation law: this is a view-local affordance only — it emits no
// scope/node selection and never fetches; it writes the filter text into the
// browser-mode store and nothing else.

import { SearchField } from "../kit";

export interface RailFilterProps {
  /** The active browser mode, used to name the narrowed listing in the
   *  placeholder so the filter reads as scoped to the current mode. */
  modeLabel: string;
  value: string;
  onChange: (value: string) => void;
}

export function RailFilter({ modeLabel, value, onChange }: RailFilterProps) {
  // Name the narrowed listing for the active mode: vault/tree narrow documents,
  // code narrows files. Always begins with "Filter …" (never "search…").
  const noun = modeLabel === "code" ? "files" : "documents";
  return (
    <div data-rail-filter>
      <SearchField
        value={value}
        onChange={onChange}
        onClear={() => onChange("")}
        placeholder={`Filter ${noun}…`}
        ariaLabel={`filter the ${modeLabel} listing`}
      />
    </div>
  );
}
