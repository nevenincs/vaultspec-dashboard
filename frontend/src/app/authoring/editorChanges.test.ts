// Change-model unit tests (editor-change-fidelity D5). Pure functions over two
// texts — no wire, no store.

import { describe, expect, it } from "vitest";

import {
  caretToLine,
  changeAtLine,
  deriveAgentChanges,
  deriveEffectiveChanges,
  deriveLineChanges,
  lineMarkers,
  lineSpaceProjection,
  lineToCaret,
  nextChange,
  previousChange,
} from "./editorChanges";
import { diffLines } from "./diffLines";

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

describe("agent provenance (D4)", () => {
  it("tags an agent change with origin agent and unseen", () => {
    // old base → new base (an agent applied a modified line 2).
    expect(deriveAgentChanges("a\nb\nc\n", "a\nB\nc\n")).toEqual([
      { line: 1, kind: "modified", span: 1, origin: "agent", unseen: true },
    ]);
  });

  it("carries origin and unseen into the gutter markers", () => {
    const markers = lineMarkers(deriveAgentChanges("a\nb\n", "a\nB\n"));
    expect(markers.get(1)).toEqual({
      kind: "modified",
      origin: "agent",
      unseen: true,
      tick: false,
    });
  });

  it("defaults a user change to origin user, seen", () => {
    // A plain deriveLineChanges result carries no origin; lineMarkers fills user.
    const markers = lineMarkers(deriveLineChanges("a\nb\n", "a\nB\n"));
    expect(markers.get(1)).toEqual({
      kind: "modified",
      origin: "user",
      unseen: false,
      tick: false,
    });
  });
});

describe("anchor stability (D11: deriveEffectiveChanges)", () => {
  it("with no agent change, is exactly the user diff", () => {
    expect(deriveEffectiveChanges(null, "a\nb\n", "a\nB\n", false)).toEqual(
      deriveLineChanges("a\nb\n", "a\nB\n"),
    );
  });

  it("keeps an agent mark in place when the user edits a DIFFERENT line", () => {
    // Agent modified line 1 (baseline a\nb → base a\nB). The user then appends a new
    // line 3. The agent mark must stay on line 1 (now still line 1 in the draft),
    // and the user's addition shows separately.
    const baseline = "a\nb\nc\n";
    const base = "a\nB\nc\n"; // agent changed line 1
    const draft = "a\nB\nc\nd\n"; // user appended line 3
    const changes = deriveEffectiveChanges(baseline, base, draft, false);
    const markers = lineMarkers(changes);
    // Agent mark survived at draft line 1.
    expect(markers.get(1)).toMatchObject({ origin: "agent", kind: "modified" });
    // The user's appended line is a user add.
    expect(markers.get(3)).toMatchObject({ origin: "user", kind: "added" });
  });

  it("re-projects an agent mark DOWN when the user inserts lines above it", () => {
    const baseline = "a\nb\n";
    const base = "a\nB\n"; // agent changed line 1
    const draft = "x\ny\na\nB\n"; // user inserted two lines at the top
    const markers = lineMarkers(deriveEffectiveChanges(baseline, base, draft, false));
    // The agent's line, originally index 1, is now index 3 in the draft.
    expect(markers.get(3)).toMatchObject({ origin: "agent", kind: "modified" });
    // The inserted lines are user adds.
    expect(markers.get(0)?.origin).toBe("user");
  });

  it("reclassifies an agent line as the user's once the user edits it (merge law)", () => {
    const baseline = "a\nb\n";
    const base = "a\nAGENT\n"; // agent changed line 1
    const draft = "a\nUSER\n"; // user overwrote the agent's line 1
    const markers = lineMarkers(deriveEffectiveChanges(baseline, base, draft, false));
    // Touching agent text makes it yours: line 1 is a USER change now, not agent.
    expect(markers.get(1)?.origin).toBe("user");
  });

  it("honors agentSeen (unseen cue drops once acknowledged)", () => {
    const args = ["a\nb\n", "a\nB\n", "a\nB\n"] as const;
    expect(deriveEffectiveChanges(...args, false)[0]).toMatchObject({ unseen: true });
    expect(deriveEffectiveChanges(...args, true)[0]).toMatchObject({ unseen: false });
  });
});

describe("lineSpaceProjection", () => {
  it("maps surviving base lines to their draft positions, dropping edited ones", () => {
    // base a,b,c → draft a,c,d: b removed, d added. Surviving: a(0→0), c(2→1).
    const proj = lineSpaceProjection(diffLines("a\nb\nc\n", "a\nc\nd\n"));
    expect(proj.get(0)).toBe(0); // a
    expect(proj.has(1)).toBe(false); // b removed → no draft counterpart
    expect(proj.get(2)).toBe(1); // c shifted up
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
