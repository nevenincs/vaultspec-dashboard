// Hover-card evidence derivation (binding graph/HoverCard frame 84:2;
// figma-parity-reconciliation W03.P08.S50).
//
// The binding hover-card is a TRANSIENT projection over a hovered node's ENRICHED
// evidence: the documents it attaches, the code locations it mentions (with their
// live resolution state), and the commits correlated to it. This module is the
// PURE projection seam: it folds the stores-served `NodeEvidence` (the enriched
// S13 shape — `documents: {path, doc_type}`, `code_locations` keyed on `path` with
// `state`, `commits` carrying `subject`) into a render-ready, BOUNDED set of
// grouped lines the dumb card renders. Keeping the fold pure (no React, no fetch,
// no `tiers` read) makes every sourcing/bounding rule unit-testable and keeps the
// card a dumb view (dashboard-layer-ownership, views-are-projections-of-one-model).
//
// The card NEVER fetches: the evidence arrives through the `useNodeEvidence` stores
// hook (the sole wire client), and this module only shapes what that hook already
// holds. A field genuinely absent from the wire is omitted, never fabricated.

import type { NodeEvidence } from "../../../stores/server/engine";

/** How many lines a single evidence group shows before the "+N more" tail; the
 *  transient card stays compact (graph-queries-are-bounded-by-default in spirit —
 *  the card is a glance, not the inspector). */
export const HOVER_EVIDENCE_GROUP_CAP = 4;

/** One rendered evidence line: a primary label, an optional muted detail, and an
 *  optional resolution-state tag (resolved/stale/broken) that tints the line. */
export interface EvidenceLine {
  readonly key: string;
  readonly label: string;
  readonly detail?: string;
  readonly state?: string;
}

/** One evidence group: a heading, its bounded lines, and how many the cap hid. */
export interface EvidenceGroup {
  readonly heading: string;
  readonly lines: EvidenceLine[];
  /** Count beyond the cap, surfaced as a "+N more" tail (0 = none hidden). */
  readonly overflow: number;
}

/** Strip a path to its file name for the compact card label. */
function baseName(path: string): string {
  return path.replace(/^.*\//, "");
}

/** Bound a list to the group cap, returning the kept slice and the overflow. */
function bound<T>(items: T[]): { kept: T[]; overflow: number } {
  if (items.length <= HOVER_EVIDENCE_GROUP_CAP) {
    return { kept: items, overflow: 0 };
  }
  return {
    kept: items.slice(0, HOVER_EVIDENCE_GROUP_CAP),
    overflow: items.length - HOVER_EVIDENCE_GROUP_CAP,
  };
}

/**
 * Fold the enriched node-evidence into the card's bounded, grouped lines. Only
 * non-empty groups are returned, so a node with (say) no code mentions shows no
 * empty "code" section. Pure: no fetch, no `tiers` read.
 */
export function deriveEvidenceGroups(evidence: NodeEvidence): EvidenceGroup[] {
  const groups: EvidenceGroup[] = [];

  if (evidence.documents.length > 0) {
    const { kept, overflow } = bound(evidence.documents);
    groups.push({
      heading: "documents",
      overflow,
      lines: kept.map((doc) => ({
        key: doc.path,
        label: baseName(doc.path),
        detail: doc.doc_type,
      })),
    });
  }

  if (evidence.code_locations.length > 0) {
    const { kept, overflow } = bound(evidence.code_locations);
    groups.push({
      heading: "code",
      overflow,
      lines: kept.map((loc) => ({
        key: loc.path + (loc.symbol ? `#${loc.symbol}` : ""),
        label: loc.symbol ? `${baseName(loc.path)}#${loc.symbol}` : baseName(loc.path),
        detail: loc.line !== undefined ? `:${loc.line}` : undefined,
        state: loc.state,
      })),
    });
  }

  if (evidence.commits.length > 0) {
    const { kept, overflow } = bound(evidence.commits);
    groups.push({
      heading: "commits",
      overflow,
      lines: kept.map((commit) => ({
        key: commit.sha,
        label: commit.sha.slice(0, 7),
        detail: commit.subject,
      })),
    });
  }

  return groups;
}

/** Whether the evidence carries anything at all (drives the empty-card guard). */
export function hasEvidence(evidence: NodeEvidence): boolean {
  return (
    evidence.documents.length > 0 ||
    evidence.code_locations.length > 0 ||
    evidence.commits.length > 0
  );
}
