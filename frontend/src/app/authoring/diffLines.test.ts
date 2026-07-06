// Line-diff unit tests (W03.P40). Pure function over two texts — no wire.

import { describe, expect, it } from "vitest";

import { diffLines, diffStat, MAX_DIFF_LINES } from "./diffLines";

describe("diffLines", () => {
  it("keeps unchanged lines as context and marks the single appended line", () => {
    const base = "line one\nline two\n";
    const proposed = "line one\nline two\n\nnew paragraph\n";
    const lines = diffLines(base, proposed);

    expect(lines.filter((l) => l.kind === "context").map((l) => l.text)).toEqual([
      "line one",
      "line two",
    ]);
    expect(lines.filter((l) => l.kind === "add").map((l) => l.text)).toEqual([
      "",
      "new paragraph",
    ]);
    expect(lines.some((l) => l.kind === "remove")).toBe(false);
    expect(diffStat(lines)).toEqual({ added: 2, removed: 0 });
  });

  it("marks a replaced line as one remove + one add, not a whole-body churn", () => {
    const lines = diffLines("alpha\nbeta\ngamma\n", "alpha\nBETA\ngamma\n");
    expect(lines).toEqual([
      { kind: "context", text: "alpha" },
      { kind: "remove", text: "beta" },
      { kind: "add", text: "BETA" },
      { kind: "context", text: "gamma" },
    ]);
  });

  it("treats an empty base as all-additions (a new document)", () => {
    const lines = diffLines("", "first\nsecond\n");
    expect(lines).toEqual([
      { kind: "add", text: "first" },
      { kind: "add", text: "second" },
    ]);
  });

  it("treats an emptied document as all-removals", () => {
    const lines = diffLines("only line\n", "");
    expect(lines).toEqual([{ kind: "remove", text: "only line" }]);
  });

  it("produces no lines for two identical bodies", () => {
    const lines = diffLines("same\nbody\n", "same\nbody\n");
    expect(lines.every((l) => l.kind === "context")).toBe(true);
    expect(diffStat(lines)).toEqual({ added: 0, removed: 0 });
  });

  it("caps each side at the defensive line ceiling without throwing", () => {
    const big = Array.from(
      { length: MAX_DIFF_LINES + 500 },
      (_, i) => `line ${i}`,
    ).join("\n");
    const lines = diffLines(big, `${big}\nextra`);
    // Bounded work: neither side exceeds the cap, so the walk stays finite.
    expect(lines.length).toBeLessThanOrEqual(MAX_DIFF_LINES * 2);
  });
});
