// Shared vault-row presentation helpers (Figma `LeftRail` Vault mode): doc-type
// marks, compact freshness labels, and plan-status marks. The Vault tree is a
// pure client-side projection of the SAME `/vault-tree` model the former grouped
// listing read (views-are-projections-of-one-model), so presentation tokens stay
// centralized here instead of drifting across row surfaces.
//
// No wire access, no node identity minted here — pure derivation over the entries
// the `/vault-tree` stores query already returned (dashboard-layer-ownership).

import {
  BookOpen,
  CheckCircle,
  Circle,
  CircleHalf,
  ClipboardText,
  Diamond,
  FileDashed,
  type Icon,
  ListBullets,
  Pencil,
  SealCheck,
  Stack,
} from "@phosphor-icons/react";

import { docTypeLabel } from "../../stores/server/docTypeVocabulary";
import { featureTagDisplayName } from "../../stores/featureQuery";
import type { Category } from "../kit";
import { freshnessLabel, isFresh } from "../presentation/freshness";

export { freshnessLabel, isFresh };

/** The token class for a compact freshness label. Only the truly live `now`
 * bucket receives active ink; older buckets stay quiet. */
export function freshnessToneClass(label: string): string {
  return isFresh(label) ? "text-state-active" : "text-ink-faint";
}

// --- icon sizing (token-aligned, not arbitrary px) -------------------------------
// 14px is the iconography ADR's grayscale-by-shape gate size; the disclosure
// chevrons read one density step smaller so the structural chrome stays attenuated
// relative to the doc-type marks. The plan-status mark reads one step smaller still
// (10px in the binding design — a quiet leading status pip on plan rows).
export const DOC_MARK_PX = 14;
export const CHEVRON_PX = 12;
export const STATUS_MARK_PX = 10;

/** Canonical `.vault/` group order — the pipeline reading order (terminology-
 *  standardization ADR D2); unknown groups append alphabetically. `index` is never
 *  a displayed group (ADR D5), so it is not listed here. */
export const VAULT_GROUPS = [
  "research",
  "adr",
  "plan",
  "exec",
  "audit",
  "reference",
] as const;

// Doc-type marks (sidebar ADR / iconography ADR): one Phosphor mark per doc type,
// each grayscale-distinct by SHAPE at 14px (pencil / diamond / clipboard /
// stacked layers / sealed check / open book / list lines), with a dashed-file
// fallback. They read in `currentColor` and inherit the rail's dimmed ink, so hue
// is never the identity channel.
const DOC_MARKS: Record<string, Icon> = {
  research: Pencil,
  adr: Diamond,
  plan: ClipboardText,
  exec: Stack,
  audit: SealCheck,
  reference: BookOpen,
  index: ListBullets,
};

export function docMark(docType: string): Icon {
  return DOC_MARKS[docType] ?? FileDashed;
}

/** The display label for a doc-type group header (binding Figma `LeftRail` 244:750
 *  group headers: RESEARCH / DECISIONS / PLANS / STEPS / AUDITS / REFERENCES). The
 *  human plural vocabulary is the ONE canonical doc-type schema (terminology-
 *  standardization ADR D1) — this delegates to it so the rail headers can never
 *  drift from the filter facets and search pills. The label text is Title-Cased and
 *  the kit `SectionLabel` applies the uppercase, so the casing stays data (an
 *  acronym is never mangled by a CSS `capitalize`). Kept exported here for the VAULT
 *  and TREE browser headers. */
export function docGroupLabel(docType: string): string {
  return docTypeLabel(docType);
}

// Doc-type → kit category token (binding board 135:2 StatusDot/Chip category set).
// The canonical scene/category colors emitted on :root cover adr/audit/exec/feature/
// plan/reference/research — the SAME colors the graph nodes paint with, so a row's
// leading StatusDot and its node always agree. `reference` now has its own bound
// `scene/category-reference` color (terminology-standardization ADR D3). `index` is
// never a displayed row (ADR D5), so it carries no category here.
const DOC_TYPE_CATEGORY: Record<string, Category> = {
  research: "research",
  adr: "adr",
  plan: "plan",
  exec: "exec",
  audit: "audit",
  reference: "reference",
};

/** The kit category whose bound scene color tints a doc row's leading StatusDot,
 *  or null for a doc type with no bound category color. */
export function docTypeCategory(docType: string): Category | null {
  return DOC_TYPE_CATEGORY[docType] ?? null;
}

/**
 * The set of doc types with a distinct mark — exported so the unit test can
 * assert grayscale-by-shape distinctness without rendering React.
 */
export function docMarkName(docType: string): string {
  const mark = docMark(docType);
  return mark.displayName ?? mark.name ?? "FileDashed";
}

// --- plan-status mark (Figma `LeftRail_*` plan rows) ------------------------------
//
// The binding design paints each PLAN row with a leading 10-12px status pip —
// ✓ complete / ◐ in-progress / ○ not-started — in place of the generic accent bar.
// Honest grayscale-by-shape marks: a filled ring with a tick (complete), a
// half-filled ring (in-progress), an empty ring (not-started), each distinct by
// SHAPE so the status survives without hue.
//
// HONESTY NOTE (the one place this projection cannot fully reach the design): plan
// progress (`lifecycle.progress.done/total`) is a GRAPH-NODE / pipeline facet, NOT
// carried on the `/vault-tree` `VaultTreeEntry` this projection reads. Deriving a
// ✓/◐ from data the projection does not hold would be a guess — and Vault mode is
// bound to be a PURE projection of `/vault-tree` with no engine work. So when no
// progress is known the row reads the honest NOT-STARTED baseline (the empty ring),
// matching the design's neutral plan pip; a caller that DOES hold progress (a future
// surface that joins the pipeline projection) passes it and the mark lights up.

export type PlanStatus = "complete" | "in-progress" | "not-started";

const PLAN_STATUS_MARKS: Record<PlanStatus, Icon> = {
  complete: CheckCircle,
  "in-progress": CircleHalf,
  "not-started": Circle,
};

/** Derive the plan status from an optional progress pair. Absent progress reads
 *  the honest not-started baseline (see the honesty note above): the projection
 *  never invents a ✓/◐ from data the `/vault-tree` entry does not carry. */
export function planStatus(progress?: { done: number; total: number }): PlanStatus {
  if (!progress || progress.total <= 0) return "not-started";
  if (progress.done >= progress.total) return "complete";
  if (progress.done > 0) return "in-progress";
  return "not-started";
}

export function planStatusMark(status: PlanStatus): Icon {
  return PLAN_STATUS_MARKS[status];
}

/** The Tailwind text-color class for a plan-status mark — sanctioned state tokens
 *  only (no raw hex): complete=active-green, in-progress=stale-amber, not-started
 *  reads as quiet faint ink so it never shouts. */
export function planStatusToneClass(status: PlanStatus): string {
  switch (status) {
    case "complete":
      return "text-state-active";
    case "in-progress":
      return "text-state-stale";
    case "not-started":
      return "text-ink-faint";
  }
}

export function planStatusLabel(status: PlanStatus): string {
  switch (status) {
    case "complete":
      return "complete";
    case "in-progress":
      return "in progress";
    case "not-started":
      return "not started";
  }
}

// --- human display title (Figma rows show readable titles, not date-stems) -------
//
// The binding `LeftRail` rows (244:750) read as human titles ("Live delta sync",
// "Graph scale"), but the `/vault-tree` wire carries only the path/stem — no title
// field — so the readable title is DERIVED from the stem: drop the leading
// `yyyy-mm-dd-` date prefix and a trailing doc-type token (adr/plan/research/…),
// then de-kebab to sentence case. Canonical structural tokens (W##/P##/S##) keep
// their uppercase form. Pure + deterministic; this is presentation only and never
// the selection-join identity (that stays the real stem/path).

const DOC_TYPE_SUFFIXES = new Set([
  "research",
  "adr",
  "plan",
  "exec",
  "audit",
  "reference",
  "index",
  "rule",
  "summary",
]);

// Short absolute date label for a DocRow's meta line (binding `LeftRail` 238:600
// shows "Jun 14", not a relative "2d"). Parsed from the ISO `yyyy-mm-dd` string
// directly (no `Date` / timezone shift) so the printed day matches the stored day.
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** "Jun 14" from an ISO `yyyy-mm-dd` modified date; empty string when absent. */
export function docDateLabel(iso?: string): string {
  if (!iso) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return "";
  const month = SHORT_MONTHS[Number(match[2]) - 1] ?? "";
  return month ? `${month} ${Number(match[3])}` : "";
}

/** A readable FEATURE name for the Features section rows (binding `LeftRail`
 *  238:600 — "Dashboard Left Rail", not the raw `#dashboard-left-rail` tag).
 *  Delegates to the shared `featureTagDisplayName` so the rail rows, the feature
 *  search autofill, and the feature-query narrow all sanitize identically.
 *  Presentation only; the selection-join identity stays the real feature tag. */
export const featureDisplayName = featureTagDisplayName;

/** A readable row title derived from the document stem (see note above). */
export function docDisplayTitle(path: string): string {
  let stem = pathStemLocal(path).replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const parts = stem.split("-");
  if (parts.length > 1 && DOC_TYPE_SUFFIXES.has(parts[parts.length - 1]!)) {
    parts.pop();
  }
  stem = parts.join(" ").trim();
  if (stem.length === 0) return pathStemLocal(path);
  // Sentence-case the first character; keep canonical W##/P##/S## tokens uppercase.
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

/** Local stem helper (filename without directory or extension) — kept here so the
 *  presentation module has no import cycle with the selection module. */
function pathStemLocal(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "");
}
