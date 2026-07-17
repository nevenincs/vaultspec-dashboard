// The editor's change model: which DRAFT LINES changed, and how (editor-change-fidelity
// D5). This is what the gutter paints and what next/previous-change navigation walks.
//
// DERIVED, NOT ACCUMULATED. The change set is computed from `diffLines(baseText,
// draftText)` on demand — the exact pair the store already maintains (`editorBaseText`
// is advanced by `markSaved` to the committed text, so it always means "what is on
// disk"). Nothing is accumulated, so there is no accumulator to bound: this satisfies
// the resource-bounds rule by construction rather than by cap. It is only viable
// because the line diff now costs about what the EDIT costs rather than what the
// DOCUMENT costs (see diffLines.ts) — a full-table diff could not be run live.
//
// CLASSIFICATION follows VS Code's dirty-diff exactly, because the three-state
// grammar is what makes a gutter readable at a glance:
//   removes + adds  -> modified   (the line changed in place)
//   adds only       -> added      (new lines appeared)
//   removes only    -> removed    (lines vanished; a tick BETWEEN the surviving lines)
// Collapsing "modified" into remove+add would render a one-word edit as a two-line
// churn, which is precisely the noise the owner asked to avoid.

import { diffLines, type DiffLine } from "./diffLines";

/** How a run of draft lines differs from the saved base. */
export type ChangeKind = "added" | "modified" | "removed";

/** One contiguous changed run, addressed in DRAFT line space (what the gutter and
 *  the caret both index by). */
export interface LineChange {
  /** 0-based draft line where the run starts. For `removed` — which occupies no
   *  draft line — the line the deletion sits immediately ABOVE. */
  line: number;
  kind: ChangeKind;
  /** How many draft lines the run covers. Always 0 for `removed`: a deletion has
   *  no lines left to mark, so it renders as a tick between rows, never as a bar. */
  span: number;
}

/**
 * The changed runs between the saved base and the current draft, in draft-line
 * order. An unchanged document yields an empty list.
 */
export function deriveLineChanges(base: string, draft: string): LineChange[] {
  return classifyDiff(diffLines(base, draft));
}

/** The classification half, over an already-computed diff — exported so the gutter
 *  can reuse a diff it already has rather than diffing the same pair twice. */
export function classifyDiff(lines: DiffLine[]): LineChange[] {
  const changes: LineChange[] = [];
  let draftLine = 0;
  let i = 0;

  while (i < lines.length) {
    if (lines[i].kind === "context") {
      draftLine += 1;
      i += 1;
      continue;
    }
    // Consume the whole non-context run as ONE hunk. The runs are counted rather
    // than assumed to be remove-then-add, because an LCS walk may interleave them
    // within a single changed region.
    const start = draftLine;
    let adds = 0;
    let removes = 0;
    while (i < lines.length && lines[i].kind !== "context") {
      if (lines[i].kind === "add") adds += 1;
      else removes += 1;
      i += 1;
    }
    if (adds > 0 && removes > 0) {
      changes.push({ line: start, kind: "modified", span: adds });
    } else if (adds > 0) {
      changes.push({ line: start, kind: "added", span: adds });
    } else {
      changes.push({ line: start, kind: "removed", span: 0 });
    }
    draftLine += adds;
  }

  return changes;
}

/** The tally a compact summary shows ("3 changes") without re-walking the list. */
export function changeCount(changes: LineChange[]): number {
  return changes.length;
}

/** The gutter mark for one draft line: the change kind, and whether it is a
 *  zero-height tick (a deletion sitting above the line) rather than a bar. */
export interface LineMarker {
  kind: ChangeKind;
  /** True for a `removed` deletion — rendered as a tick between rows, since the
   *  deleted lines occupy no space in the draft. */
  tick: boolean;
}

/**
 * A draft-line → marker lookup for the gutter: every line of an added/modified run
 * gets a bar of that kind (so a multi-line run reads as one continuous region), and
 * a removal gets a single tick on the line it sits above. Built once per render
 * rather than probing `changeAtLine` per row.
 */
export function lineMarkers(changes: LineChange[]): Map<number, LineMarker> {
  const markers = new Map<number, LineMarker>();
  for (const change of changes) {
    if (change.kind === "removed") {
      // A tick wins its row only if no bar already claims it (an edit that both
      // deletes and changes a line reads as the in-place change, not the tick).
      if (!markers.has(change.line))
        markers.set(change.line, { kind: "removed", tick: true });
      continue;
    }
    for (let line = change.line; line < change.line + change.span; line += 1) {
      markers.set(line, { kind: change.kind, tick: false });
    }
  }
  return markers;
}

/**
 * The next change strictly after `fromLine`, wrapping to the first when there is
 * none below. Returns null only when there are no changes at all. Wrapping matches
 * both references' next-change commands and keeps repeated invocation a cycle
 * rather than a dead end at the last change.
 */
export function nextChange(changes: LineChange[], fromLine: number): LineChange | null {
  if (changes.length === 0) return null;
  return changes.find((c) => c.line > fromLine) ?? changes[0];
}

/** The previous change strictly before `fromLine`, wrapping to the last. */
export function previousChange(
  changes: LineChange[],
  fromLine: number,
): LineChange | null {
  if (changes.length === 0) return null;
  for (let i = changes.length - 1; i >= 0; i -= 1) {
    if (changes[i].line < fromLine) return changes[i];
  }
  return changes[changes.length - 1];
}

/**
 * The change covering `line`, or null. A `removed` tick is reported for the line it
 * sits above, so clicking the gutter at that row opens the right hunk.
 */
export function changeAtLine(changes: LineChange[], line: number): LineChange | null {
  for (const change of changes) {
    if (change.kind === "removed") {
      if (change.line === line) return change;
      continue;
    }
    if (line >= change.line && line < change.line + change.span) return change;
  }
  return null;
}
