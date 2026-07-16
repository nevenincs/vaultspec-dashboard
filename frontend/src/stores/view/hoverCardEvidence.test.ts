import { describe, expect, it } from "vitest";

import type { NodeEvidence } from "../server/engine";
import {
  HOVER_COMMIT_SUBJECT_CAP,
  deriveHoverEvidenceSummary,
  hasEvidence,
} from "./hoverCardEvidence";

const tiers = {} as NodeEvidence["tiers"];

function evidence(partial: Partial<NodeEvidence>): NodeEvidence {
  return {
    documents: [],
    code_locations: [],
    commits: [],
    tiers,
    ...partial,
  };
}

describe("deriveHoverEvidenceSummary", () => {
  it("keeps only semantic counts and byte-exact authored commit subjects", () => {
    const summary = deriveHoverEvidenceSummary(
      evidence({
        documents: [{ path: "/private/doc.md", doc_type: "private_kind" }],
        code_locations: [
          {
            path: "/private/code.ts",
            symbol: "secretSymbol",
            state: "private_state",
          },
        ],
        commits: [
          {
            sha: "private-sha",
            subject: "  Authored subject stays exact  ",
            confidence: 0.91,
          },
        ],
      }),
    );
    expect(summary).toEqual({
      documentCount: 1,
      codeLocationCount: 1,
      commitCount: 1,
      commitSubjects: ["  Authored subject stays exact  "],
    });
    expect(JSON.stringify(summary)).not.toContain("/private/");
    expect(JSON.stringify(summary)).not.toContain("secretSymbol");
    expect(JSON.stringify(summary)).not.toContain("private_state");
    expect(JSON.stringify(summary)).not.toContain("private-sha");
    expect(JSON.stringify(summary)).not.toContain("0.91");
  });

  it("bounds authored subjects while retaining the complete semantic count", () => {
    const commits = Array.from(
      { length: HOVER_COMMIT_SUBJECT_CAP + 3 },
      (_, index) => ({
        sha: `sha-${index}`,
        subject: `Subject ${index}`,
      }),
    );
    const summary = deriveHoverEvidenceSummary(evidence({ commits }));
    expect(summary.commitCount).toBe(HOVER_COMMIT_SUBJECT_CAP + 3);
    expect(summary.commitSubjects).toHaveLength(HOVER_COMMIT_SUBJECT_CAP);
  });

  it("defensively handles omitted arrays", () => {
    expect(deriveHoverEvidenceSummary({ tiers } as NodeEvidence)).toEqual({
      documentCount: 0,
      codeLocationCount: 0,
      commitCount: 0,
      commitSubjects: [],
    });
  });

  it("omits whitespace-only subjects without normalizing authored bytes", () => {
    expect(
      deriveHoverEvidenceSummary(
        evidence({ commits: [{ sha: "private-sha", subject: "   " }] }),
      ).commitSubjects,
    ).toEqual([]);
  });
});

describe("hasEvidence", () => {
  it("reports whether any semantic evidence count is nonzero", () => {
    expect(hasEvidence(evidence({}))).toBe(false);
    expect(hasEvidence(evidence({ commits: [{ sha: "a", subject: "s" }] }))).toBe(true);
  });
});
