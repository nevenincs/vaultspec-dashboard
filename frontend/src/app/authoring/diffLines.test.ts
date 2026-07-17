// Line-diff unit tests (W03.P40). Pure function over two texts — no wire.

import { describe, expect, it } from "vitest";

import { diffCapped, diffLines, diffStat, MAX_DIFF_LINES } from "./diffLines";

/** Reconstruct both sides from a diff. This is THE correctness invariant, and the
 *  reason it is worth stating: the diff is now Myers with a linear-space
 *  divide-and-conquer recursion, which is subtle enough that example-based tests
 *  alone would not catch an off-by-one in the middle-snake search. Whatever the
 *  algorithm does internally, `context+remove` must rebuild `base` exactly and
 *  `context+add` must rebuild `proposed` exactly. */
function reconstruct(lines: ReturnType<typeof diffLines>) {
  const base: string[] = [];
  const proposed: string[] = [];
  for (const line of lines) {
    if (line.kind === "context") {
      base.push(line.text);
      proposed.push(line.text);
    } else if (line.kind === "remove") base.push(line.text);
    else proposed.push(line.text);
  }
  return { base, proposed };
}

/** A deterministic PRNG — a seeded generator keeps a failure reproducible, which
 *  a bare Math.random() property test would not. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

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

describe("diffLines correctness (trim + bounded exact middle)", () => {
  it("reconstructs both sides for randomized edits", () => {
    const random = makeRandom(0x5eed);
    for (let round = 0; round < 300; round += 1) {
      // A random base, then a random sequence of edits applied to it — the shape
      // of a real edit session, not two unrelated blobs.
      const baseLines = Array.from({ length: Math.floor(random() * 24) }, () =>
        String.fromCharCode(97 + Math.floor(random() * 6)),
      );
      const proposedLines = [...baseLines];
      const edits = Math.floor(random() * 8);
      for (let e = 0; e < edits; e += 1) {
        const at = Math.floor(random() * (proposedLines.length + 1));
        const roll = random();
        if (roll < 0.4) {
          proposedLines.splice(
            at,
            0,
            String.fromCharCode(97 + Math.floor(random() * 6)),
          );
        } else if (roll < 0.8 && proposedLines.length > 0) {
          proposedLines.splice(Math.min(at, proposedLines.length - 1), 1);
        } else if (proposedLines.length > 0) {
          proposedLines[Math.min(at, proposedLines.length - 1)] = String.fromCharCode(
            97 + Math.floor(random() * 6),
          );
        }
      }
      const base = baseLines.join("\n");
      const proposed = proposedLines.join("\n");
      const { base: rebuiltBase, proposed: rebuiltProposed } = reconstruct(
        diffLines(base, proposed),
      );
      const label = `round ${round}: ${JSON.stringify(base)} -> ${JSON.stringify(proposed)}`;
      expect(rebuiltBase.join("\n"), label).toBe(base);
      expect(rebuiltProposed.join("\n"), label).toBe(proposed);
    }
  });

  it("reconstructs both sides for two wholly unrelated documents", () => {
    // The adverse case for Myers: nothing in common, so D approaches n+m.
    const base = Array.from({ length: 60 }, (_, i) => `alpha ${i}`).join("\n");
    const proposed = Array.from({ length: 60 }, (_, i) => `omega ${i}`).join("\n");
    const { base: rebuiltBase, proposed: rebuiltProposed } = reconstruct(
      diffLines(base, proposed),
    );
    expect(rebuiltBase.join("\n")).toBe(base);
    expect(rebuiltProposed.join("\n")).toBe(proposed);
  });

  it("stays minimal for a one-line edit in a large document", () => {
    // The property the O(n·m) table could not give us: work scales with the EDIT,
    // not the document, which is what makes a live per-keystroke dirty diff viable.
    const lines = Array.from({ length: MAX_DIFF_LINES }, (_, i) => `line ${i}`);
    const base = lines.join("\n");
    const edited = [...lines];
    edited[1500] = "line 1500 EDITED";
    const diff = diffLines(base, edited.join("\n"));
    // Exactly one line replaced — not a whole-body churn.
    expect(diffStat(diff)).toEqual({ added: 1, removed: 1 });
    expect(diffCapped()).toBe(false);
  });

  it("degrades honestly when the changed middle exceeds the cell ceiling", () => {
    // Two wholly-unrelated full-size documents: nothing to trim, so the middle is
    // 3000x3000 — the ~9M-cell table this bound exists to refuse.
    const base = Array.from({ length: MAX_DIFF_LINES }, (_, i) => `a${i}`).join("\n");
    const proposed = Array.from({ length: MAX_DIFF_LINES }, (_, i) => `b${i}`).join(
      "\n",
    );
    const diff = diffLines(base, proposed);
    // Capped, and SAID so — never a silent non-minimal diff.
    expect(diffCapped()).toBe(true);
    // Still a true diff: it reconstructs both sides exactly.
    const { base: rebuiltBase, proposed: rebuiltProposed } = reconstruct(diff);
    expect(rebuiltBase.join("\n")).toBe(base);
    expect(rebuiltProposed.join("\n")).toBe(proposed);
  });

  it("keeps the degrade LOCAL — shared context around a huge middle survives", () => {
    // The reason the cap degrades the MIDDLE rather than the whole body: a big
    // unrelated middle must not churn the parts that plainly did not change.
    const head = "shared head";
    const tail = "shared tail";
    const bigA = Array.from({ length: 1200 }, (_, i) => `a${i}`);
    const bigB = Array.from({ length: 1200 }, (_, i) => `b${i}`);
    const base = [head, ...bigA, tail].join("\n");
    const proposed = [head, ...bigB, tail].join("\n");
    const diff = diffLines(base, proposed);

    expect(diffCapped()).toBe(true);
    // The trimmed prefix/suffix are still context, not churn.
    expect(diff[0]).toEqual({ kind: "context", text: head });
    expect(diff[diff.length - 1]).toEqual({ kind: "context", text: tail });
    const { base: rebuiltBase, proposed: rebuiltProposed } = reconstruct(diff);
    expect(rebuiltBase.join("\n")).toBe(base);
    expect(rebuiltProposed.join("\n")).toBe(proposed);
  });

  it("reports uncapped for a normal diff", () => {
    diffLines("a\nb\n", "a\nc\n");
    expect(diffCapped()).toBe(false);
  });
});
