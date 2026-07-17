// Read-only code change markers (editor-change-fidelity D5): turn a served git
// unified diff into the SAME LineChange model the editor gutter renders, so a
// browsed source file shows which lines changed since HEAD — VS Code's dirty
// gutter, on a read-only file.
//
// DERIVED PRESENTATION over a served diff. The diff itself is fetched and parsed
// by the stores layer (`useGitFileDiff` → `GitFileDiff`, tiers-gated, bounded);
// this is a pure app-layer transform of that served shape into gutter markers, so
// the layer boundary holds (stores serves, app derives; app never fetches). No new
// wire, no new model — it reuses the one `LineChange` grammar.
//
// LINE SPACE. Markers are addressed in the file's CURRENT (new-side) line space,
// which is what the read-only viewer renders and numbers. Git lists only changed
// hunks with gaps of unlisted context between them, so the conversion tracks the
// new-side line counter across each hunk (from the `new` line numbers git provides)
// rather than concatenating hunk lines — concatenating would misplace every marker
// after the first gap.

import type { GitFileDiff } from "../../stores/server/engine/statusTypes";
import type { LineChange } from "../authoring/editorChanges";

/**
 * The changed-line runs of a served file diff, in current-file line order, as the
 * same add/modified/removed `LineChange`s the editor gutter renders. A binary or
 * empty diff yields no markers.
 *
 * Within each hunk, a maximal run of non-context lines is one change: removes plus
 * adds is a modified run (span = the added lines), adds alone an added run, removes
 * alone a zero-span removal tick on the line it sits above — the same classification
 * the editor's own dirty diff uses, so the two surfaces read identically.
 */
export function gitFileDiffToLineChanges(diff: GitFileDiff | undefined): LineChange[] {
  if (!diff || diff.binary) return [];
  const changes: LineChange[] = [];

  for (const hunk of diff.hunks) {
    const lines = hunk.lines;
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.kind === "context") {
        i += 1;
        continue;
      }
      // Consume the whole non-context run.
      let adds = 0;
      let removes = 0;
      let firstAddNew: number | null = null;
      // The new-side line a removes-only run sits above: the next context/add line's
      // number, resolved after the run is consumed.
      while (i < lines.length && lines[i].kind !== "context") {
        if (lines[i].kind === "add") {
          adds += 1;
          if (firstAddNew === null) {
            const n = lines[i].new;
            if (typeof n === "number") firstAddNew = n;
          }
        } else {
          removes += 1;
        }
        i += 1;
      }

      if (adds > 0 && firstAddNew !== null) {
        // A run that added lines: anchor at the first added line (0-based). Modified
        // when it also removed lines in place, else a pure addition.
        changes.push({
          line: firstAddNew - 1,
          kind: removes > 0 ? "modified" : "added",
          span: adds,
        });
      } else if (removes > 0) {
        // Removes only: the deletion sits above the line that now follows it — the
        // next line's new number, or the running new counter at hunk end.
        const follower = lines[i];
        const followerNew =
          follower && typeof follower.new === "number" ? follower.new : null;
        const anchor = followerNew !== null ? followerNew - 1 : nextNewLine(hunk) - 1;
        changes.push({ line: Math.max(0, anchor), kind: "removed", span: 0 });
      }
    }
  }

  return changes;
}

/** The new-side line number just past a hunk (its start plus its new-line count),
 *  for anchoring a removal that falls at the very end of the hunk. Parsed from the
 *  `@@ -a,b +c,d @@` header; falls back to 1 when the header is unparseable. */
function nextNewLine(hunk: GitFileDiff["hunks"][number]): number {
  const match = /\+(\d+)(?:,(\d+))?/.exec(hunk.header);
  if (!match) return 1;
  const start = Number(match[1]);
  const count = match[2] === undefined ? 1 : Number(match[2]);
  return start + count;
}
