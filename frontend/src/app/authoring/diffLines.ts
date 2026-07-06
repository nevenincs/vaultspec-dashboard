// A small, bounded line-level diff between two whole-document texts (agentic
// plan W03.P40). The authoring backend serves the review base + proposed BODIES
// (bounded, with an honest truncation flag) and computes NO diff — "a diff is a
// DERIVED review artifact, never authority" (agentic-change-format ADR). So the
// diff is PRESENTATION, computed client-side here and rendered by the DiffPanel.
//
// There is no diff library in the project and no existing two-plain-text differ
// (the `GitFileDiff` type only ever parsed git's own unified-diff output). This
// is a compact LCS line diff — O(n·m) over the served texts, which are byte-
// bounded upstream; a defensive line cap keeps a pathological input from spinning
// the table (resource-bounds: bounded at creation).

export type DiffLineKind = "add" | "remove" | "context";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

/** The per-side line ceiling. The served texts are byte-bounded, so this only
 *  guards a pathological input; beyond it each side is trimmed and the trim is
 *  surfaced by the caller's truncation affordance (never a silent clip). */
export const MAX_DIFF_LINES = 3_000;

/** Split a document body into lines, treating an empty body as zero lines (so a
 *  brand-new document diffs as all-additions, not one phantom empty line) and
 *  dropping a single trailing newline (so a well-formed doc does not diff a
 *  phantom trailing blank). */
function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\n$/, "").split("\n");
}

/**
 * The line-level diff turning `base` into `proposed`, as an ordered list of
 * add/remove/context lines. Uses a longest-common-subsequence walk so unchanged
 * lines stay context and only genuine insertions/deletions are marked. Each side
 * is capped at [`MAX_DIFF_LINES`]; a longer input is trimmed to the cap before
 * diffing (the caller surfaces the served `truncated` flag honestly).
 */
export function diffLines(base: string, proposed: string): DiffLine[] {
  const a = splitLines(base).slice(0, MAX_DIFF_LINES);
  const b = splitLines(proposed).slice(0, MAX_DIFF_LINES);
  const n = a.length;
  const m = b.length;

  // LCS length table: lcs[i][j] = LCS length of a[i..] and b[j..].
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] =
        a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "context", text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: "remove", text: a[i] });
      i += 1;
    } else {
      out.push({ kind: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ kind: "remove", text: a[i] });
    i += 1;
  }
  while (j < m) {
    out.push({ kind: "add", text: b[j] });
    j += 1;
  }
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
