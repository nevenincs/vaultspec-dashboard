// Typed hover-card content derivation (node-hover-typed-card enhancement of the
// node-visual-richness hover-bloom card; Figma 112-series, node 110:2).
//
// The hover-bloom card's CONTENT is conditional on the document type — not one
// generic shape. This module is the PURE projection seam: it folds an
// `EngineNode` (the one model, served through the stores layer — never fetched
// here, never reading the raw `tiers` block) plus, for plans, the already-cached
// bounded plan-interior into a discriminated `TypeCardContent` union the card
// renders. Keeping the derivation pure (no React, no fetch) means every
// per-type field-sourcing rule is unit-testable in isolation, and the card stays
// a dumb view (dashboard-layer-ownership, views-are-projections-of-one-model).
//
// DATA-SOURCING + GAPS (recorded honestly; a field genuinely absent from the
// wire is omitted, never fabricated):
//   - plan   : status = lifecycle.state; tier = node.tier ?? status_value;
//              steps = lifecycle.progress.{done,total}; phasesLeft derived from
//              the plan-interior phase/wave containers when supplied (else omit).
//   - adr    : status = status_value ?? status; references = degree total
//              (declared+structural+temporal+semantic) — a degree proxy. The
//              distinct "supersedes N" count is NOT on the node wire (GAP): a
//              superseding edge is in the lineage graph, not the hover detail, so
//              the strip omits it rather than inventing it.
//   - exec   : no per-type status on the wire (honest absence). The parent plan
//              title is NOT carried on the node detail (the detail's `interior`
//              is populated only for plan nodes) (GAP) — omitted gracefully.
//   - research: relative date from dates.created. The findings COUNT is not a
//              wire field (GAP) — omitted.
//   - audit  : the wire carries a graded SEVERITY (high/critical/medium/low),
//              not a PASS/FAIL verdict, and no findings count (GAP). The severity
//              is surfaced as the audit's status; verdict/findings are omitted.
//   - index/feature: documents = member_count.
//   - code   : path = id minus the `code:` prefix; language derived from the
//              path extension (the same extension→hint mapping the engine's
//              `language_hint` uses, mirrored client-side so no extra fetch). The
//              git-dirty flag is a tree-level boolean on `/status`, not a per-node
//              field (GAP) — surfaced only when explicitly supplied.

import type { EngineNode, PlanInterior } from "../../stores/server/engine";
import { nodeCategory, type NodeCategory } from "../../scene/field/categoryColor";

/** A document-type bucket the card renders type-specific content for. */
export type CardContentKind =
  | "plan"
  | "adr"
  | "exec"
  | "research"
  | "audit"
  | "topic"
  | "code"
  | "generic";

/** The plan card content: status pill + complexity tier + step/phase line. */
export interface PlanCardContent {
  readonly kind: "plan";
  /** The lifecycle phase as a human pill (e.g. "In progress"). */
  readonly status?: string;
  /** The complexity tier (L1..L4). */
  readonly tier?: string;
  readonly steps?: { done: number; total: number };
  /** Phases still open, derived from the plan-interior when supplied. */
  readonly phasesLeft?: number;
}

/** The ADR (Decision) card content: status + a reference-degree line. */
export interface AdrCardContent {
  readonly kind: "adr";
  readonly status?: string;
  /** Total incident degree across tiers — a "references" proxy. */
  readonly references?: number;
}

/** The exec (Step) card content: a parent-plan line when known. */
export interface ExecCardContent {
  readonly kind: "exec";
  readonly status?: string;
  /** The parent plan title — absent from the node wire (GAP), so usually undefined. */
  readonly inPlan?: string;
}

/** The research card content: a findings/recency line. */
export interface ResearchCardContent {
  readonly kind: "research";
  /** Findings count — not on the wire (GAP); usually undefined. */
  readonly findings?: number;
  /** A human relative date from dates.created (e.g. "3 days ago"). */
  readonly when?: string;
}

/** The audit (Review) card content: severity (verdict-shaped) + findings. */
export interface AuditCardContent {
  readonly kind: "audit";
  /** The graded severity (high/critical/...) — the wire's nearest verdict. */
  readonly severity?: string;
  /** Findings count — not on the wire (GAP); usually undefined. */
  readonly findings?: number;
}

/** The index/feature (Topic) card content: a document-count line. */
export interface TopicCardContent {
  readonly kind: "topic";
  readonly documents?: number;
}

/** The code card content: path + language + git-dirty. */
export interface CodeCardContent {
  readonly kind: "code";
  readonly path: string;
  readonly language?: string;
  readonly gitDirty?: boolean;
}

/** A type with no bespoke content shape renders only the shared header/chip. */
export interface GenericCardContent {
  readonly kind: "generic";
}

export type TypeCardContent =
  | PlanCardContent
  | AdrCardContent
  | ExecCardContent
  | ResearchCardContent
  | AuditCardContent
  | TopicCardContent
  | CodeCardContent
  | GenericCardContent;

/** The DOM-consumable scene-category token for a node category (a `var()` the
 *  chrome reads; the token is emitted per theme on :root so theme parity is
 *  automatic — themes-are-oklch-generated-from-a-token-tier). */
export function categoryTokenVar(category: NodeCategory): string {
  return `--color-scene-category-${category}`;
}

/** Map a plan lifecycle state to a human status pill. */
function planStatusLabel(state: string | undefined): string | undefined {
  switch (state) {
    case "active":
      return "In progress";
    case "complete":
      return "Complete";
    case "archived":
      return "Archived";
    default:
      return state || undefined;
  }
}

/** Count the open phases in a bounded plan-interior: a phase is open when at
 *  least one of its steps is not done. Spans the tier-honest shape (L1 flat
 *  steps carry no phases → 0; L2 `phases`; L3/L4 `waves[].phases`). */
export function phasesLeftFromInterior(
  interior: PlanInterior | undefined,
): number | undefined {
  if (!interior) return undefined;
  const allPhases = [...interior.phases, ...interior.waves.flatMap((w) => w.phases)];
  if (allPhases.length === 0) return undefined;
  return allPhases.filter((p) => p.steps.some((s) => !s.done)).length;
}

/** Total incident degree across the four tiers — the ADR "references" proxy. */
function totalDegree(node: EngineNode): number | undefined {
  const d = node.degree_by_tier;
  if (!d) return undefined;
  const sum =
    (d.declared ?? 0) + (d.structural ?? 0) + (d.temporal ?? 0) + (d.semantic ?? 0);
  return sum > 0 ? sum : undefined;
}

/** The extension→grammar-hint mapping, mirroring the engine's `language_hint`
 *  so the code card names the language with no extra fetch (the per-node wire
 *  carries no language; the path is enough). */
const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  rs: "Rust",
  py: "Python",
  md: "Markdown",
  json: "JSON",
  toml: "TOML",
  css: "CSS",
  html: "HTML",
  yml: "YAML",
  yaml: "YAML",
  sh: "Shell",
};

/** Derive a language label from a path extension; undefined when unrecognized. */
export function languageFromPath(path: string): string | undefined {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return undefined;
  const ext = path.slice(dot + 1).toLowerCase();
  return LANGUAGE_BY_EXT[ext];
}

/** A coarse human relative-date from an ISO date (created), e.g. "3 days ago".
 *  Pure and deterministic given a `now` (defaulting to Date.now). */
export function relativeDate(
  iso: string | undefined,
  now: number = Date.now(),
): string | undefined {
  if (!iso) return undefined;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return undefined;
  const deltaMs = Math.max(0, now - then);
  const day = 86_400_000;
  const days = Math.floor(deltaMs / day);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

export interface DeriveTypeContentOpts {
  /** The bounded plan-interior, when already fetched (plans only). */
  readonly interior?: PlanInterior;
  /** A tree-level git-dirty boolean, when known (code nodes only). */
  readonly gitDirty?: boolean;
  /** The clock for relative-date derivation (test seam). */
  readonly now?: number;
}

/**
 * Derive the per-type card content from a node (the one model) plus optional
 * already-cached side data. Pure: no fetch, no `tiers` read. A type whose
 * bespoke shape carries nothing renders the generic content (header + chip only).
 */
export function deriveTypeContent(
  node: EngineNode,
  opts: DeriveTypeContentOpts = {},
): TypeCardContent {
  const category = nodeCategory(node.kind);
  switch (bucketFor(node, category)) {
    case "plan":
      return {
        kind: "plan",
        status: planStatusLabel(node.lifecycle?.state),
        tier: node.tier ?? node.status_value,
        steps: node.lifecycle?.progress,
        phasesLeft: phasesLeftFromInterior(opts.interior),
      };
    case "adr":
      return {
        kind: "adr",
        status: node.status_value ?? node.status,
        references: totalDegree(node),
      };
    case "exec":
      return { kind: "exec", status: node.status_value };
    case "research":
      return {
        kind: "research",
        when: relativeDate(node.dates?.created, opts.now),
      };
    case "audit":
      return { kind: "audit", severity: node.status_value };
    case "topic":
      return { kind: "topic", documents: node.member_count };
    case "code": {
      const path = node.id.startsWith("code:")
        ? node.id.slice("code:".length)
        : node.id;
      return {
        kind: "code",
        path,
        language: languageFromPath(path),
        gitDirty: opts.gitDirty,
      };
    }
    default:
      return { kind: "generic" };
  }
}

/** Resolve which content bucket a node renders. The card buckets are coarser
 *  than the eight scene categories: `feature` and `index` collapse onto the
 *  "topic" (document-count) shape, `code` keeps its own, doc-types map 1:1, and
 *  anything else (rule/reference/summary) renders generic content. */
function bucketFor(node: EngineNode, category: NodeCategory): CardContentKind {
  switch (node.kind) {
    case "plan":
      return "plan";
    case "adr":
      return "adr";
    case "exec":
      return "exec";
    case "research":
      return "research";
    case "audit":
      return "audit";
    case "code":
      return "code";
    case "feature":
    case "index":
      return "topic";
    default:
      // reference folds onto research's category, summary onto index's — but
      // those carry no bespoke per-type content fields, so render generic.
      return category === "index" ? "topic" : "generic";
  }
}
