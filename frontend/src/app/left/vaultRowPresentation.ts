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
  MinusCircle,
  Pencil,
  SealCheck,
  Stack,
  XCircle,
} from "@phosphor-icons/react";

import { docTypeLabel } from "../../stores/server/docTypeVocabulary";
import { featureTagDisplayName } from "../../stores/featureQuery";
import type { Category } from "../kit";
import { freshnessLabel, isFresh } from "../presentation/freshness";

export { freshnessLabel, isFresh };

/** The token class for a compact freshness label. Only the truly live `now`
 * bucket receives active ink; older buckets stay quiet. */
export function freshnessToneClass(label: string): string {
  return isFresh(label) ? "text-state-active" : "text-ink-muted";
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
 *  drift from the filter facets and search pills. The label text keeps catalog casing
 *  so the kit `SectionLabel` renders it verbatim. Kept exported here for the VAULT
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
// Progress is SERVED: `/vault-tree` rows carry the plan's checkbox
// `progress {done, total}` (dashboard-pipeline-wire W01, read from the same
// `lifecycle_in_scope` facet the graph consumes), so the pip lights from wire
// truth. A plan without served progress reads the honest not-started baseline.

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
      return "text-ink-muted";
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

// --- ADR acceptance status (left-rail-tree-controls ADR D1) ------------------------
//
// The served `status` vocabulary is the ADR H1 status set. Plain-language labels
// only (ui-labels-are-user-facing): the wire token capitalizes to a readable word;
// an unknown future token still reads as a word, never raw internal casing.

const ADR_STATUS_LABELS: Record<string, string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  rejected: "Rejected",
  superseded: "Superseded",
  deprecated: "Deprecated",
};

/** The display label for a served ADR acceptance status. */
export function adrStatusLabel(status: string): string {
  const known = ADR_STATUS_LABELS[status];
  if (known) return known;
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Tone class for the ADR status mark — sanctioned state tokens only:
 *  accepted reads settled-active, proposed reads in-flight amber, rejected
 *  reads broken, retired states read quiet faint ink. */
export function adrStatusToneClass(status: string): string {
  switch (status) {
    case "accepted":
      return "text-state-active";
    case "proposed":
      return "text-state-stale";
    case "rejected":
      return "text-state-broken";
    default:
      return "text-ink-muted";
  }
}

// The ADR acceptance-status MARK (left-rail-tree-controls ADR D1, densified):
// a compact grayscale-by-shape mark in the plan-pip family — the 16rem rail
// cannot afford the status WORD on every ADR row, so the word rides the
// tooltip + aria-label and the row carries the shape+tone mark: filled tick
// (accepted), empty ring (proposed / unknown-future), crossed ring (rejected),
// minus ring (superseded / deprecated).
const ADR_STATUS_MARKS: Record<string, Icon> = {
  accepted: CheckCircle,
  proposed: Circle,
  rejected: XCircle,
  superseded: MinusCircle,
  deprecated: MinusCircle,
};

/** The shape-distinct mark for a served ADR acceptance status. */
export function adrStatusMark(status: string): Icon {
  return ADR_STATUS_MARKS[status] ?? Circle;
}

// --- plan tier + document weight labels (left-rail-tree-controls ADR D1/D2) --------

/** Plain-language plan tier ("L2" → "Tier 2"); empty for an unrecognised token
 *  so the internal wire form never reaches the screen. */
export function planTierLabel(tier: string): string {
  const match = /^L([1-4])$/.exec(tier);
  return match ? `Tier ${match[1]}` : "";
}

/** Compact human word count ("310 words", "1.2k words"). */
export function wordCountLabel(words: number): string {
  if (words >= 10_000) return `${Math.round(words / 1000)}k words`;
  if (words >= 1000) return `${(words / 1000).toFixed(1)}k words`;
  return `${words} ${words === 1 ? "word" : "words"}`;
}

/** Human byte size for the tooltip ("8.1 KB", "912 B"). */
export function byteSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** A feature's corpus-weight share as a compact percent (left-rail-tree-controls
 *  corpus-weight sort): its summed member bytes normalized over the WHOLE vault's
 *  served bytes. "12%" / "4.2%" / "<1%"; empty when either side is unmeasured so
 *  an unserved weight never reads as a fabricated zero. */
export function corpusWeightLabel(weightBytes: number, totalBytes: number): string {
  if (totalBytes <= 0 || weightBytes <= 0) return "";
  const percent = (weightBytes / totalBytes) * 100;
  if (percent >= 10) return `${Math.round(percent)}%`;
  if (percent >= 1) return `${percent.toFixed(1)}%`;
  return "<1%";
}

/** The document leaf's full-metadata tooltip (left-rail-tree-controls ADR D1):
 *  path, then the three date semantics in plain language, then the weight —
 *  each line only when its fact is served (honest absence). */
export function docTooltip(
  path: string,
  dates: { created?: string; modified?: string; stamped?: string },
  size?: { bytes: number; words: number },
): string {
  const lines = [path];
  const dateParts = [
    dates.created ? `Authored ${dates.created}` : null,
    dates.stamped ? `Updated ${dates.stamped}` : null,
    dates.modified ? `Edited ${dates.modified}` : null,
  ].filter((part): part is string => part !== null);
  if (dateParts.length > 0) lines.push(dateParts.join(" · "));
  if (size) lines.push(`${wordCountLabel(size.words)} · ${byteSizeLabel(size.bytes)}`);
  return lines.join("\n");
}

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
