// Change-model unit tests (editor-change-fidelity D5). Pure functions over two
// texts — no wire, no store.

import { describe, expect, it } from "vitest";

import {
  caretToLine,
  changeAtLine,
  deriveLineChanges,
  lineToCaret,
  nextChange,
  previousChange,
} from "./editorChanges";

describe("deriveLineChanges", () => {
  it("reports nothing for an unedited draft", () => {
    expect(deriveLineChanges("a\nb\nc\n", "a\nb\nc\n")).toEqual([]);
  });

  it("classifies an in-place edit as modified, not as a remove plus an add", () => {
    // The distinction that keeps the gutter readable: a one-word edit is ONE
    // modified line, not a two-line churn.
    expect(deriveLineChanges("a\nb\nc\n", "a\nB\nc\n")).toEqual([
      { line: 1, kind: "modified", span: 1 },
    ]);
  });

  it("classifies pure insertions as added, spanning the new lines", () => {
    expect(deriveLineChanges("a\nc\n", "a\nb1\nb2\nc\n")).toEqual([
      { line: 1, kind: "added", span: 2 },
    ]);
  });

  it("classifies pure deletions as a zero-span tick above the surviving line", () => {
    // A deletion leaves no line to paint, so it must not claim one.
    expect(deriveLineChanges("a\nb\nc\n", "a\nc\n")).toEqual([
      { line: 1, kind: "removed", span: 0 },
    ]);
  });

  it("addresses changes in DRAFT line space, not base line space", () => {
    // The gutter and the caret both index the draft. If a change were reported in
    // base space, every marker after an insertion would paint on the wrong row.
    const base = "keep\ndrop1\ndrop2\ntail\n";
    const draft = "keep\nnew1\nnew2\nnew3\ntail\n";
    const [change] = deriveLineChanges(base, draft);
    expect(change).toEqual({ line: 1, kind: "modified", span: 3 });
    // The trailing context line sits at draft index 4, after the 3 new lines.
    expect(draft.split("\n")[4]).toBe("tail");
  });

  it("separates multiple hunks and keeps them in draft order", () => {
    const base = "a\nb\nc\nd\ne\n";
    const draft = "a\nB\nc\nd\nE\n";
    expect(deriveLineChanges(base, draft)).toEqual([
      { line: 1, kind: "modified", span: 1 },
      { line: 4, kind: "modified", span: 1 },
    ]);
  });

  it("treats a whole new document as one added run", () => {
    expect(deriveLineChanges("", "a\nb\n")).toEqual([
      { line: 0, kind: "added", span: 2 },
    ]);
  });

  it("treats an emptied document as one removal at the top", () => {
    expect(deriveLineChanges("a\nb\n", "")).toEqual([
      { line: 0, kind: "removed", span: 0 },
    ]);
  });
});

describe("change navigation", () => {
  const changes = deriveLineChanges("a\nb\nc\nd\ne\n", "a\nB\nc\nd\nE\n");

  it("finds the next change strictly below the caret", () => {
    expect(nextChange(changes, 0)?.line).toBe(1);
    expect(nextChange(changes, 1)?.line).toBe(4);
  });

  it("wraps to the first change past the last one", () => {
    // Repeated next-change cycles rather than dead-ending at the bottom.
    expect(nextChange(changes, 4)?.line).toBe(1);
  });

  it("finds the previous change strictly above the caret, wrapping to the last", () => {
    expect(previousChange(changes, 4)?.line).toBe(1);
    expect(previousChange(changes, 1)?.line).toBe(4);
  });

  it("returns null when there is nothing to navigate", () => {
    expect(nextChange([], 0)).toBeNull();
    expect(previousChange([], 0)).toBeNull();
  });
});

describe("caret <-> line mapping", () => {
  const text = "alpha\nbeta\ngamma";

  it("maps a caret offset to its draft line", () => {
    expect(caretToLine(text, 0)).toBe(0); // start of "alpha"
    expect(caretToLine(text, 5)).toBe(0); // end of "alpha", before the newline
    expect(caretToLine(text, 6)).toBe(1); // start of "beta"
    expect(caretToLine(text, 11)).toBe(2); // into "gamma"
  });

  it("maps a draft line back to its start offset (round-trips at boundaries)", () => {
    expect(lineToCaret(text, 0)).toBe(0);
    expect(lineToCaret(text, 1)).toBe(6);
    expect(lineToCaret(text, 2)).toBe(11);
    // Each line start round-trips through caretToLine.
    for (let line = 0; line < 3; line += 1) {
      expect(caretToLine(text, lineToCaret(text, line))).toBe(line);
    }
  });

  it("clamps a target past the last line to the end of the text", () => {
    // A change navigation that lands beyond EOF must not produce an out-of-range
    // caret; it settles at the end.
    expect(lineToCaret(text, 99)).toBe(text.length);
    expect(caretToLine(text, 999)).toBe(2);
  });
});

describe("changeAtLine", () => {
  it("resolves any line within a multi-line run", () => {
    // Pure insertion between two surviving lines: `added`, spanning draft rows 1-3.
    const changes = deriveLineChanges("a\nz\n", "a\nb1\nb2\nb3\nz\n");
    expect(changes).toEqual([{ line: 1, kind: "added", span: 3 }]);
    expect(changeAtLine(changes, 1)?.kind).toBe("added");
    expect(changeAtLine(changes, 3)?.kind).toBe("added");
    // One past the run is outside it — `z` is unchanged context.
    expect(changeAtLine(changes, 4)).toBeNull();
  });

  it("resolves a zero-span removal at the line it sits above", () => {
    // A zero-span run would be unreachable under a `line < line + span` test, so
    // the removal tick is matched exactly — otherwise its gutter click is dead.
    const changes = deriveLineChanges("a\nb\nc\n", "a\nc\n");
    expect(changeAtLine(changes, 1)?.kind).toBe("removed");
    expect(changeAtLine(changes, 0)).toBeNull();
  });
});
