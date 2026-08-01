// Proposal diffstat tally rules (research C4; plan P07.S27). Pure.
//
// The card asserts a NUMBER to a reviewer deciding whether to approve, so the rules
// that matter are the ones that could make that number a lie: a truncated body must
// not be presented as an exact count, and the aggregate must be the sum of what is
// actually shown per file.

import { describe, expect, it } from "vitest";

import type { ReviewDocumentProjection } from "../../stores/server/authoring";
import { deriveProposalDiffstat, diffstatLabel } from "./ProposalDiffstat";

function doc(
  childKey: string,
  base: string,
  proposed: string,
  overrides: {
    document?: unknown;
    baseTruncated?: boolean;
    proposedTruncated?: boolean;
  } = {},
): ReviewDocumentProjection {
  return {
    child_key: childKey,
    document: overrides.document ?? { path: childKey },
    base: {
      text: base,
      truncated: overrides.baseTruncated ?? false,
      total_bytes: base.length,
      returned_bytes: base.length,
    },
    proposed: {
      text: proposed,
      truncated: overrides.proposedTruncated ?? false,
      total_bytes: proposed.length,
      returned_bytes: proposed.length,
    },
  };
}

describe("diffstatLabel", () => {
  it("prefers the served ref's path, then its stem, then the child key", () => {
    expect(diffstatLabel({ path: "docs/a.md" }, "child")).toBe("docs/a.md");
    expect(diffstatLabel({ stem: "a" }, "child")).toBe("a");
    expect(diffstatLabel(null, "child")).toBe("child");
    expect(diffstatLabel({}, "child")).toBe("child");
  });
});

describe("deriveProposalDiffstat", () => {
  it("is empty for a proposal with no review documents", () => {
    const view = deriveProposalDiffstat([]);
    expect(view).toEqual({ files: [], added: 0, removed: 0, truncated: false });
  });

  it("counts added and removed lines per file", () => {
    const view = deriveProposalDiffstat([
      doc("a.md", "one\ntwo\n", "one\ntwo\nthree\n"),
    ]);
    expect(view.files).toHaveLength(1);
    expect(view.files[0]?.label).toBe("a.md");
    expect(view.files[0]?.added).toBe(1);
    expect(view.files[0]?.removed).toBe(0);
  });

  it("aggregates to exactly the sum of the per-file rows it shows", () => {
    // The headline number and the breakdown must never disagree — a reviewer who
    // adds up the rows has to land on the aggregate.
    const view = deriveProposalDiffstat([
      doc("a.md", "one\n", "one\ntwo\n"),
      doc("b.md", "keep\ndrop\n", "keep\n"),
    ]);
    expect(view.added).toBe(view.files.reduce((n, f) => n + f.added, 0));
    expect(view.removed).toBe(view.files.reduce((n, f) => n + f.removed, 0));
    expect(view.added).toBe(1);
    expect(view.removed).toBe(1);
  });

  it("carries truncation up from either served side", () => {
    // A byte-capped body makes the count a FLOOR, not a measurement. The flag has
    // to survive to the aggregate so the card can say so.
    const baseCapped = deriveProposalDiffstat([
      doc("a.md", "one\n", "one\ntwo\n", { baseTruncated: true }),
    ]);
    expect(baseCapped.files[0]?.truncated).toBe(true);
    expect(baseCapped.truncated).toBe(true);

    const proposedCapped = deriveProposalDiffstat([
      doc("a.md", "one\n", "one\ntwo\n", { proposedTruncated: true }),
    ]);
    expect(proposedCapped.truncated).toBe(true);

    const exact = deriveProposalDiffstat([doc("a.md", "one\n", "one\ntwo\n")]);
    expect(exact.truncated).toBe(false);
  });

  it("reports zero for an unchanged document rather than omitting it", () => {
    // A file the proposal touched but did not change is still part of the change's
    // shape; dropping it would misrepresent how many files are in play.
    const view = deriveProposalDiffstat([doc("a.md", "same\n", "same\n")]);
    expect(view.files).toHaveLength(1);
    expect(view.files[0]).toMatchObject({ added: 0, removed: 0 });
    expect(view.added).toBe(0);
  });
});
