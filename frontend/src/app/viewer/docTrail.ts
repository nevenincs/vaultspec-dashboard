// The canonical document-reader breadcrumb trail (Vault / <doc-type> / <title>),
// hoisted out of DocPanel so the desktop dock reader (DocPanel) and the compact
// slide-in reader (CompactDocReader) derive ONE trail — retiring the compact
// reader's bare 2-item breadcrumb (mobile-enrichment ADR D3). Presentation only,
// over the preserved stores header model (dashboard-layer-ownership).

import type { MarkdownHeaderView } from "../../stores/server/queries";
import type { BreadcrumbItem } from "../kit";

/** Build the canonical Vault / <doc-type> / <title> trail from the preserved
 *  stores header model — the binding reader path (455:1117).
 *
 *  `includeRoot` (default true) prepends the "Vault" root. The compact reader
 *  passes `false` (mobile-enrichment ADR D6): in the narrow 390px reader chrome the
 *  root is the least informative segment, and dropping it leaves the doc-type /
 *  title pair enough room to read without ellipsizing every crumb. */
export function buildDocTrail(
  header: MarkdownHeaderView,
  opts: { includeRoot?: boolean; rootLabel?: string; typeLabel?: string } = {},
): BreadcrumbItem[] {
  const { includeRoot = true, rootLabel, typeLabel } = opts;
  const items: BreadcrumbItem[] =
    includeRoot && rootLabel !== undefined ? [{ label: rootLabel }] : [];
  if (typeLabel !== undefined) items.push({ label: typeLabel });
  items.push({ label: header.title });
  return items;
}
