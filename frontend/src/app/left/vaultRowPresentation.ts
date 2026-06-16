// Shared vault-row presentation helpers (Figma `LeftRail_vault` / `LeftRail_tree`):
// the doc-type marks, the compact freshness label, and the plan-status mark are
// consumed identically by the VAULT browser (grouped by `.vault/` subtree) and the
// TREE browser (the same `/vault-tree` projection nested feature → doc_type →
// document). They live here, in ONE place, so the two surfaces never drift — the
// tree mode is a pure client-side projection of the SAME model the vault mode reads
// (views-are-projections-of-one-model), so it must paint each row with the SAME
// marks, the SAME freshness buckets, and the SAME accent-bar selection cue.
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

import type { Category } from "../kit";

// --- icon sizing (token-aligned, not arbitrary px) -------------------------------
// 14px is the iconography ADR's grayscale-by-shape gate size; the disclosure
// chevrons read one density step smaller so the structural chrome stays attenuated
// relative to the doc-type marks. The plan-status mark reads one step smaller still
// (10px in the binding design — a quiet leading status pip on plan rows).
export const DOC_MARK_PX = 14;
export const CHEVRON_PX = 12;
export const STATUS_MARK_PX = 10;

/** Canonical `.vault/` group order; unknown groups append alphabetically. */
export const VAULT_GROUPS = [
  "research",
  "adr",
  "plan",
  "exec",
  "audit",
  "reference",
  "index",
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

// Doc-type group labels (binding Figma `LeftRail` 244:750 group headers): the
// human plural vocabulary the board prints as uppercase SectionLabels — RESEARCH /
// DECISIONS / PLANS / STEPS / AUDITS (and References / Index). The label text is
// authored Title-Cased here and the kit `SectionLabel` applies the uppercase, so
// the casing is data (an acronym is never mangled by a CSS `capitalize`) declared
// once here and consumed identically by the VAULT and TREE browser headers.
const DOC_GROUP_LABELS: Record<string, string> = {
  research: "Research",
  adr: "Decisions",
  plan: "Plans",
  exec: "Steps",
  audit: "Audits",
  reference: "References",
  index: "Index",
};

/** The display label for a doc-type group header. Known groups use the curated
 *  binding-board vocabulary; an unknown group Title-Cases its first letter. */
export function docGroupLabel(docType: string): string {
  return (
    DOC_GROUP_LABELS[docType] ?? docType.charAt(0).toUpperCase() + docType.slice(1)
  );
}

// Doc-type → kit category token (binding board 135:2 StatusDot/Chip category set).
// The eight canonical scene/category colors emitted on :root cover adr/audit/code/
// exec/feature/index/plan/research — the SAME colors the graph nodes paint with, so
// a row's leading StatusDot and its node always agree. `reference` has no bound
// scene/category color, so it has no dot (the row falls back to its doc-type mark).
const DOC_TYPE_CATEGORY: Record<string, Category> = {
  research: "research",
  adr: "adr",
  plan: "plan",
  exec: "exec",
  audit: "audit",
  index: "index",
};

/** The kit category whose bound scene color tints a doc row's leading StatusDot,
 *  or null for a doc type with no bound category color (e.g. `reference`). */
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
// ✓/◐ from data the projection does not hold would be a guess — and the tree mode
// is bound to be a PURE projection of `/vault-tree` with no engine work. So when no
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

// --- freshness label (Figma right-aligned recency) -------------------------------

/** Compact freshness label: <1h "now", then h/d/w buckets; cooled = "". */
export function freshnessLabel(modified: string | undefined, now: number): string {
  if (!modified) return "";
  const at = Date.parse(modified);
  if (!Number.isFinite(at)) return "";
  const age = now - at;
  if (age < 3600_000) return "now";
  if (age < 24 * 3600_000) return `${Math.floor(age / 3600_000)}h`;
  if (age < 7 * 24 * 3600_000) return `${Math.floor(age / (24 * 3600_000))}d`;
  if (age < 30 * 24 * 3600_000) return `${Math.floor(age / (7 * 24 * 3600_000))}w`;
  return "";
}

/** True only for genuinely fresh items (<1h) — the accent tints these alone. */
export function isFresh(label: string): boolean {
  return label === "now";
}
