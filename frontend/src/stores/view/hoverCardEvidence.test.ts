// Hover-card evidence-derivation tests (W03.P08.S50): the PURE fold from the
// enriched node-evidence wire shape into the card's bounded grouped lines. No DOM,
// no store — the fold is a pure function tested by calling it directly. Asserts the
// group bounding ("+N more"), the empty-group omission, the resolution-state
// pass-through, and the path → file-name compaction.

import { describe, expect, it } from "vitest";

import type { NodeEvidence } from "../server/engine";
import {
  HOVER_EVIDENCE_GROUP_CAP,
  deriveEvidenceGroups,
  hasEvidence,
} from "./hoverCardEvidence";

const emptyTiers = {} as NodeEvidence["tiers"];

function evidence(partial: Partial<NodeEvidence>): NodeEvidence {
  return {
    documents: [],
    code_locations: [],
    commits: [],
    tiers: emptyTiers,
    ...partial,
  };
}

describe("deriveEvidenceGroups", () => {
  it("omits empty groups entirely", () => {
    const groups = deriveEvidenceGroups(
      evidence({ documents: [{ path: ".vault/adr/x.md", doc_type: "adr" }] }),
    );
    expect(groups.map((g) => g.heading)).toEqual(["documents"]);
    expect(groups[0].lines).toHaveLength(1);
  });

  it("compacts a document path to its file name and carries the doc type", () => {
    const groups = deriveEvidenceGroups(
      evidence({
        documents: [{ path: ".vault/plan/2026-foo-plan.md", doc_type: "plan" }],
      }),
    );
    expect(groups[0].lines[0].label).toBe("2026-foo-plan.md");
    expect(groups[0].lines[0].detail).toBe("plan");
  });

  it("passes the code resolution state through and names the symbol when present", () => {
    const groups = deriveEvidenceGroups(
      evidence({
        code_locations: [
          { path: "src/lib.rs", symbol: "build", line: 42, state: "resolved" },
          { path: "src/gone.rs", state: "broken" },
        ],
      }),
    );
    const code = groups.find((g) => g.heading === "code")!;
    expect(code.lines[0].label).toBe("lib.rs#build");
    expect(code.lines[0].detail).toBe(":42");
    expect(code.lines[0].state).toBe("resolved");
    expect(code.lines[1].state).toBe("broken");
  });

  it("bounds a group to the cap and reports the overflow count", () => {
    const docs = Array.from({ length: HOVER_EVIDENCE_GROUP_CAP + 3 }, (_, i) => ({
      path: `.vault/research/r${i}.md`,
      doc_type: "research",
    }));
    const groups = deriveEvidenceGroups(evidence({ documents: docs }));
    expect(groups[0].lines).toHaveLength(HOVER_EVIDENCE_GROUP_CAP);
    expect(groups[0].overflow).toBe(3);
  });

  it("shortens a commit sha to 7 chars and carries the subject", () => {
    const groups = deriveEvidenceGroups(
      evidence({
        commits: [{ sha: "abcdef1234567890", subject: "fix the thing" }],
      }),
    );
    const commits = groups.find((g) => g.heading === "commits")!;
    expect(commits.lines[0].label).toBe("abcdef1");
    expect(commits.lines[0].detail).toBe("fix the thing");
  });

  it("appends the correlating confidence as a '~NN%' qualifier when the wire carries it", () => {
    const groups = deriveEvidenceGroups(
      evidence({
        commits: [
          { sha: "abc1234", subject: "feat: land it", confidence: 0.7 },
          { sha: "def5678", subject: "no confidence" },
        ],
      }),
    );
    const commits = groups.find((g) => g.heading === "commits")!;
    // Confidence present → appended; absent → subject alone (never fabricated).
    expect(commits.lines[0].detail).toBe("feat: land it · ~70%");
    expect(commits.lines[1].detail).toBe("no confidence");
  });

  it("orders groups documents → code → commits", () => {
    const groups = deriveEvidenceGroups(
      evidence({
        documents: [{ path: ".vault/adr/x.md", doc_type: "adr" }],
        code_locations: [{ path: "src/x.ts", state: "resolved" }],
        commits: [{ sha: "deadbeef", subject: "s" }],
      }),
    );
    expect(groups.map((g) => g.heading)).toEqual(["documents", "code", "commits"]);
  });
});

describe("hasEvidence", () => {
  it("is false for a node with no evidence at all", () => {
    expect(hasEvidence(evidence({}))).toBe(false);
  });

  it("is true when any group carries a line", () => {
    expect(hasEvidence(evidence({ commits: [{ sha: "a", subject: "s" }] }))).toBe(true);
  });
});
