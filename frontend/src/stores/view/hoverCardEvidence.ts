import type { NodeEvidence } from "../server/engine";

export const HOVER_COMMIT_SUBJECT_CAP = 4;

/** Safe hover evidence. Wire identity and diagnostic metadata never cross this seam. */
export interface HoverEvidenceSummary {
  readonly documentCount: number;
  readonly commitCount: number;
  readonly commitSubjects: readonly string[];
}

function authoredSubject(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Reduce evidence to semantic counts plus byte-exact authored commit subjects. */
export function deriveHoverEvidenceSummary(
  evidence: NodeEvidence | undefined,
): HoverEvidenceSummary {
  const documents = evidence?.documents ?? [];
  const commits = evidence?.commits ?? [];
  return Object.freeze({
    documentCount: documents.length,
    commitCount: commits.length,
    commitSubjects: Object.freeze(
      commits
        .map((commit) => commit.subject)
        .filter(authoredSubject)
        .slice(0, HOVER_COMMIT_SUBJECT_CAP),
    ),
  });
}

export function hasEvidence(evidence: NodeEvidence): boolean {
  const summary = deriveHoverEvidenceSummary(evidence);
  return summary.documentCount > 0 || summary.commitCount > 0;
}
