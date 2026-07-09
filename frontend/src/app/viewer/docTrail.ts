// The canonical document-reader breadcrumb trail (Vault / <doc-type> / <title>),
// hoisted out of DocPanel so the desktop dock reader (DocPanel) and the compact
// slide-in reader (CompactDocReader) derive ONE trail — retiring the compact
// reader's bare 2-item breadcrumb (mobile-enrichment ADR D3). Presentation only,
// over the preserved stores header model (dashboard-layer-ownership).

import type { MarkdownHeaderView } from "../../stores/server/queries";
import type { BreadcrumbItem } from "../kit";

/** Plain-language display labels for the breadcrumb's doc-type segment (an ADR
 *  reads "Decisions", not "adr"), matching the binding reader chrome. */
const DOC_TYPE_CRUMB: Record<string, string> = {
  adr: "Decisions",
  research: "Research",
  plan: "Plans",
  exec: "Execution",
  audit: "Audits",
  reference: "Reference",
  index: "Index",
};

/** Build the canonical Vault / <doc-type> / <title> trail from the preserved
 *  stores header model — the binding reader path (455:1117).
 *
 *  `includeRoot` (default true) prepends the "Vault" root. The compact reader
 *  passes `false` (mobile-enrichment ADR D6): in the narrow 390px reader chrome the
 *  root is the least informative segment, and dropping it leaves the doc-type /
 *  title pair enough room to read without ellipsizing every crumb. */
export function buildDocTrail(
  header: MarkdownHeaderView,
  opts: { includeRoot?: boolean } = {},
): BreadcrumbItem[] {
  const { includeRoot = true } = opts;
  const items: BreadcrumbItem[] = includeRoot ? [{ label: "Vault" }] : [];
  const type = header.categoryLabel;
  if (type) {
    items.push({
      label: DOC_TYPE_CRUMB[type] ?? type.charAt(0).toUpperCase() + type.slice(1),
    });
  }
  items.push({ label: header.title });
  return items;
}
