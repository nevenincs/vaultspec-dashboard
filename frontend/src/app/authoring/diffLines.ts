// The ONE line-level diff between two whole-document texts (agentic plan W03.P40;
// bounded under editor-change-fidelity).
//
// The authoring backend serves the review base + proposed BODIES (bounded, with an
// honest truncation flag) and computes NO diff for the client — "a diff is a
// DERIVED review artifact, never authority" (agentic-change-format ADR). So the
// diff is PRESENTATION, computed client-side here and rendered by the ONE DiffView
// primitive (agentic-authoring-ux D7). (The engine DOES build its own hunks in
// `authoring/operations/diff.rs`, but only to detect changeset-vs-changeset overlap
// in `authoring/conflicts` — those hunks are internal and never served, so this is
// not a second copy of a served computation.)
//
// SHAPE (mirrors VS Code's `defaultLinesDiffComputer`): trim the common prefix and
// suffix, run a bounded exact diff over the small remaining middle, and degrade
// honestly if the middle is still too large. This is the structure that matters,
// and each part earns its place:
//
//   1. TRIM. A keystroke leaves the whole document as a shared prefix + suffix, so
//      the middle collapses to a line or two. This is what makes the diff cheap
//      enough to run live on every edit rather than only in a static review panel.
//   2. BOUNDED EXACT DIFF. The middle is diffed by an LCS walk over a FLAT
//      Int32Array (4 bytes/cell, one allocation) instead of the previous nested
//      `number[][]`. The old table was O(n·m) over the WHOLE document: at the
//      3,000-line cap that is ~9M cells of boxed JS numbers — tens of MB allocated
//      synchronously on the render path, for a one-word edit.
//   3. HONEST DEGRADE. Past MAX_DIFF_CELLS only the MIDDLE degrades to a
//      replace-in-place — the trimmed prefix/suffix context is retained, so the
//      result stays localized rather than churning the whole body — and
//      `diffCapped()` reports it.
//
// Deliberately NOT hand-rolled Myers O(ND): its middle-snake index arithmetic is
// subtle enough to silently mis-pair lines, and the trim already delivers the
// practical win (work proportional to the edit, not the document) with code whose
// correctness is provable by inspection.

export type DiffLineKind = "add" | "remove" | "context";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

/** The per-side line ceiling. The served texts are byte-bounded, so this only
 *  guards a pathological input; beyond it each side is trimmed and the trim is
 *  surfaced by the caller's truncation affordance (never a silent clip). */
export const MAX_DIFF_LINES = 3_000;

/**
 * The LCS table ceiling, in cells, for the POST-TRIM middle (resource-bounds:
 * bounded at creation). 1M cells is one 4MB Int32Array — it admits a ~1000×1000
 * changed middle, far beyond any real edit, while refusing the pathological
 * 3000×3000 whole-document table that motivated this bound.
 */
export const MAX_DIFF_CELLS = 1_000_000;

/** Split a document body into lines, treating an empty body as zero lines (so a
 *  brand-new document diffs as all-additions, not one phantom empty line) and
 *  dropping a single trailing newline (so a well-formed doc does not diff a
 *  phantom trailing blank). */
function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\n$/, "").split("\n");
}

/** Whether the last `diffLines` call exceeded `MAX_DIFF_CELLS` and degraded its
 *  middle to a replace. Module-level rather than part of the return type so the
 *  `DiffLine[]` contract (and every existing caller) is unchanged; read it
 *  immediately after the call. */
let lastDiffCapped = false;

/** True when the most recent `diffLines` degraded: its changed middle was too
 *  large to diff exactly and was emitted as a replace. Still a true diff — it
 *  reconstructs both sides — just not a minimal one. A caller that wants to say so
 *  ("too different to compare line by line") reads this right after diffing. */
export function diffCapped(): boolean {
  return lastDiffCapped;
}

/**
 * The exact LCS diff of two line slices, appended to `out` in document order.
 * The table is a single flat Int32Array indexed `i * (m + 1) + j`, holding the LCS
 * length of `a[i..]` vs `b[j..]` — the same recurrence as before, without the
 * nested-array allocation.
 */
function diffMiddleExact(a: string[], b: string[], out: DiffLine[]): void {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const lcs = new Int32Array((n + 1) * width);

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + (j + 1)] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + (j + 1)]);
    }
  }

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "context", text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + (j + 1)]) {
      out.push({ kind: "remove", text: a[i] });
      i += 1;
    } else {
      out.push({ kind: "add", text: b[j] });
      j += 1;
    }
  }
  for (; i < n; i += 1) out.push({ kind: "remove", text: a[i] });
  for (; j < m; j += 1) out.push({ kind: "add", text: b[j] });
}

/**
 * The line-level diff turning `base` into `proposed`, as an ordered list of
 * add/remove/context lines. Unchanged lines stay context; only genuine insertions
 * and deletions are marked.
 *
 * Common prefix/suffix are trimmed first, so work scales with the size of the EDIT
 * rather than the document — cheap enough for a live per-keystroke dirty diff. Each
 * side is capped at [`MAX_DIFF_LINES`]. If the changed middle would exceed
 * [`MAX_DIFF_CELLS`] the middle degrades to a replace and [`diffCapped`] reports it
 * (never a silent non-minimal diff, never an unbounded table).
 */
export function diffLines(base: string, proposed: string): DiffLine[] {
  const a = splitLines(base).slice(0, MAX_DIFF_LINES);
  const b = splitLines(proposed).slice(0, MAX_DIFF_LINES);
  lastDiffCapped = false;

  let aStart = 0;
  let bStart = 0;
  let aEnd = a.length;
  let bEnd = b.length;

  const out: DiffLine[] = [];

  // Common prefix → context, emitted up front.
  while (aStart < aEnd && bStart < bEnd && a[aStart] === b[bStart]) {
    out.push({ kind: "context", text: a[aStart] });
    aStart += 1;
    bStart += 1;
  }
  // Common suffix → context, held back until the middle is resolved.
  const suffix: DiffLine[] = [];
  while (aStart < aEnd && bStart < bEnd && a[aEnd - 1] === b[bEnd - 1]) {
    suffix.push({ kind: "context", text: a[aEnd - 1] });
    aEnd -= 1;
    bEnd -= 1;
  }
  suffix.reverse();

  const aMid = a.slice(aStart, aEnd);
  const bMid = b.slice(bStart, bEnd);

  if (aMid.length === 0) {
    // Pure insertion.
    for (const text of bMid) out.push({ kind: "add", text });
  } else if (bMid.length === 0) {
    // Pure deletion.
    for (const text of aMid) out.push({ kind: "remove", text });
  } else if ((aMid.length + 1) * (bMid.length + 1) > MAX_DIFF_CELLS) {
    // The middle is too large to diff exactly: replace it in place. The trimmed
    // context still surrounds it, so the degrade stays local, and it is stated.
    lastDiffCapped = true;
    for (const text of aMid) out.push({ kind: "remove", text });
    for (const text of bMid) out.push({ kind: "add", text });
  } else {
    diffMiddleExact(aMid, bMid, out);
  }

  for (const line of suffix) out.push(line);
  return out;
}

/** The change tally for a diff (added/removed line counts) — the compact summary
 *  a diff header shows without re-walking the list at the render site. */
export function diffStat(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === "add") added += 1;
    else if (line.kind === "remove") removed += 1;
  }
  return { added, removed };
}
