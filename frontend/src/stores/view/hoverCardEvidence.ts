// Hover-card evidence derivation (binding graph/HoverCard frame 84:2).
//
// Pure stores-view projection from the enriched node-evidence wire shape into the
// bounded grouped lines the transient hover card renders. No React, no fetch, no
// tiers interpretation in the app layer.

import type { NodeEvidence } from "../server/engine";

/** How many lines a single evidence group shows before the "+N more" tail. */
export const HOVER_EVIDENCE_GROUP_CAP = 4;

/** One rendered evidence line: a primary label, optional muted detail, and an
 * optional resolution-state tag for code locations. */
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

/** Append a "~NN%" confidence qualifier when the wire carries confidence. */
function confidenceSuffix(subject: string, confidence: number | undefined): string {
  if (confidence === undefined) return subject;
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  return `${subject} · ~${pct}%`;
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
 * non-empty groups are returned. Pure: no fetch, no `tiers` read.
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
        detail: confidenceSuffix(commit.subject, commit.confidence),
      })),
    });
  }

  return groups;
}

/** Whether the evidence carries anything at all. */
export function hasEvidence(evidence: NodeEvidence): boolean {
  return (
    evidence.documents.length > 0 ||
    evidence.code_locations.length > 0 ||
    evidence.commits.length > 0
  );
}
