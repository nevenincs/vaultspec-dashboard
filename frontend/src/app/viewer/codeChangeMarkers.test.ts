// Converter tests: a served git file diff → read-only code gutter markers
// (editor-change-fidelity D5). Pure over the parsed GitFileDiff shape — no wire.

import { describe, expect, it } from "vitest";

import { parseUnifiedDiff } from "../../stores/server/liveAdapters/git";
import { gitFileDiffToLineChanges } from "./codeChangeMarkers";

/** Build a GitFileDiff from raw unified-diff text via the real parser, so the
 *  conversion is proven against the actual served shape, not a hand-made stub. */
function diffOf(unified: string) {
  return parseUnifiedDiff(unified, "src/x.ts");
}

describe("gitFileDiffToLineChanges", () => {
  it("has no markers for an undefined or binary diff", () => {
    expect(gitFileDiffToLineChanges(undefined)).toEqual([]);
    expect(gitFileDiffToLineChanges({ path: "x", hunks: [], binary: true })).toEqual(
      [],
    );
  });

  it("marks an added line at its new-side position", () => {
    // Insert one line after line 2.
    const diff = diffOf(["@@ -2,2 +2,3 @@", " b", "+inserted", " c"].join("\n"));
    // New-side: line 2 = "b" (idx1), 3 = "inserted" (idx2), 4 = "c". The add is idx2.
    expect(gitFileDiffToLineChanges(diff)).toEqual([
      { line: 2, kind: "added", span: 1 },
    ]);
  });

  it("marks an in-place edit as modified, not remove+add", () => {
    const diff = diffOf(["@@ -1,3 +1,3 @@", " a", "-b", "+B", " c"].join("\n"));
    // New-side line 2 (idx1) changed in place.
    expect(gitFileDiffToLineChanges(diff)).toEqual([
      { line: 1, kind: "modified", span: 1 },
    ]);
  });

  it("marks a pure deletion as a zero-span tick above the surviving line", () => {
    const diff = diffOf(["@@ -1,3 +1,2 @@", " a", "-b", " c"].join("\n"));
    // "b" deleted; "c" now sits at new-side line 2 (idx1); the tick anchors there.
    expect(gitFileDiffToLineChanges(diff)).toEqual([
      { line: 1, kind: "removed", span: 0 },
    ]);
  });

  it("addresses markers across the gap between two hunks in file line space", () => {
    // Two separated hunks: an edit near the top and one far below. The second
    // marker must land at its real new-side line, not offset by the first hunk.
    const diff = diffOf(
      [
        "@@ -2,3 +2,3 @@",
        " a",
        "-b",
        "+B",
        " c",
        "@@ -40,3 +40,4 @@",
        " x",
        "+added",
        " y",
        " z",
      ].join("\n"),
    );
    expect(gitFileDiffToLineChanges(diff)).toEqual([
      { line: 2, kind: "modified", span: 1 },
      { line: 40, kind: "added", span: 1 },
    ]);
  });

  it("handles a multi-line addition as one run", () => {
    const diff = diffOf(["@@ -1,1 +1,3 @@", " a", "+one", "+two"].join("\n"));
    expect(gitFileDiffToLineChanges(diff)).toEqual([
      { line: 1, kind: "added", span: 2 },
    ]);
  });
});
