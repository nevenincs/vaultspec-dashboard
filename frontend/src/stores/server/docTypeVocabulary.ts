// The ONE canonical vault doc-type vocabulary (terminology-standardization ADR
// D1/D2). Every user-facing rendering of a vault doc type reads its word and its
// display order from THIS module — the rail sections, the filter facets, the search
// pills, the graph legend, the timeline lanes. The three formerly-divergent maps
// (rail group labels, filter-sidebar labels, search-pill words) now delegate here,
// so the same doc type can never read "Steps" on one surface and "Note" on another
// (research F2 / the single-registry discipline).
//
// Layer law (dashboard-layer-ownership): this lives in `stores/server` so BOTH the
// stores layer and the app layer can import it without the app→stores→engine
// boundary ever being crossed backwards (stores must NOT import app). It is pure
// data + pure functions: no wire access, no node identity, no raw `tiers` read.
//
// `index` is deliberately absent from the displayed schema (D5: index is never a
// displayable node). It still resolves through `docTypeLabel` (→ "Index") for any
// diagnostic surface, but it is never part of `DOC_TYPE_ORDER`, so no pipeline
// projection orders or surfaces it.

/** The canonical user-facing word per vault doc type (ADR D1). */
export const DOC_TYPE_LABEL: Record<string, string> = {
  research: "Research",
  adr: "Decisions",
  plan: "Plans",
  exec: "Steps",
  audit: "Audits",
  reference: "References",
  index: "Index",
};

/** The canonical pipeline display order (ADR D2): research → decisions → plans →
 *  steps → audits → references, the workflow's natural reading order. `index` is
 *  excluded — it is never a displayed group. */
export const DOC_TYPE_ORDER = [
  "research",
  "adr",
  "plan",
  "exec",
  "audit",
  "reference",
] as const;

/** The display label for a vault doc type. A known type uses the canonical schema;
 *  an unknown type Title-Cases its first letter (a graceful fallback, never a raw
 *  slug). */
export function docTypeLabel(docType: string): string {
  return DOC_TYPE_LABEL[docType] ?? docType.charAt(0).toUpperCase() + docType.slice(1);
}
