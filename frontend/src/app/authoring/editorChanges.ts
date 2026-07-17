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

/** Who authored a change (editor-change-fidelity D4): the USER's own manual edit,
 *  or an AGENT change that landed externally through the ledger. */
export type ChangeOrigin = "user" | "agent";

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
  /** Author of the change; absent means `user` (the manual-edit default). */
  origin?: ChangeOrigin;
  /** An agent change not yet acknowledged in this session (D6). Absent = seen. */
  unseen?: boolean;
}

/**
 * The changed runs between the saved base and the current draft, in draft-line
 * order — the USER's manual edits. An unchanged document yields an empty list.
 */
export function deriveLineChanges(base: string, draft: string): LineChange[] {
  return classifyDiff(diffLines(base, draft));
}

/**
 * The changed runs an AGENT introduced, as the diff of the OLD base (what the user
 * last saw) against the NEW base an external apply landed (editor-change-fidelity
 * D4). Addressed in new-base line space, which — in the D2 clean arm, where the
 * draft is reseeded to the new base — is the draft's own line space. Tagged
 * `agent` + `unseen` so the gutter renders the distinct provenance treatment.
 */
export function deriveAgentChanges(oldBase: string, newBase: string): LineChange[] {
  return classifyDiff(diffLines(oldBase, newBase)).map((change) => ({
    ...change,
    origin: "agent",
    unseen: true,
  }));
}

/**
 * A base-line → draft-line map over a base→draft diff (editor-change-fidelity D11):
 * every SURVIVING (context) base line maps to the draft line it now occupies. A
 * removed base line (the user deleted or edited it) is absent — it has no draft
 * counterpart. This is the projection that carries an agent mark, addressed in base
 * space, onto the draft the user is editing: an agent line the user left untouched
 * is context here and keeps its mark; an agent line the user changed is a remove
 * here (absent) and reclassifies as the user's own change.
 */
export function lineSpaceProjection(lines: DiffLine[]): Map<number, number> {
  const projection = new Map<number, number>();
  let baseLine = 0;
  let draftLine = 0;
  for (const line of lines) {
    if (line.kind === "context") {
      projection.set(baseLine, draftLine);
      baseLine += 1;
      draftLine += 1;
    } else if (line.kind === "remove") {
      baseLine += 1;
    } else {
      draftLine += 1;
    }
  }
  return projection;
}

/**
 * The effective change set the gutter paints (editor-change-fidelity D11): the
 * user's own edits PLUS the agent's changes projected into the current draft's line
 * space, so agent marks survive as the user edits above or around them. Recomputed
 * per render (two diffs, both bounded) — there is no stored, transformed decoration
 * state; the anchor is a derivation the client repeats.
 *
 * Merge law: a user run wins every line it touches. An agent line the user left
 * untouched keeps `agent` origin (and its unseen cue); an agent line the user edited
 * or deleted falls out of the projection and shows as the user's change — touching
 * agent text makes it yours, matching the ledger's provenance (the next save is the
 * user's revision). `userChanges` are appended LAST so the per-line marker map lets
 * a user edit overwrite a coincident projected agent line.
 */
export function deriveEffectiveChanges(
  agentBaseline: string | null,
  baseText: string,
  draftText: string,
  agentSeen: boolean,
): LineChange[] {
  const baseDiff = diffLines(baseText, draftText);
  const userChanges = classifyDiff(baseDiff);
  if (agentBaseline === null) return userChanges;

  const agentChanges = deriveAgentChanges(agentBaseline, baseText);
  const projection = lineSpaceProjection(baseDiff);
  const projectedAgent: LineChange[] = [];
  for (const change of agentChanges) {
    if (change.kind === "removed") {
      // A deletion tick sits above base line `change.line`; project that anchor.
      const draftLine = projection.get(change.line);
      if (draftLine !== undefined) {
        projectedAgent.push({
          line: draftLine,
          kind: "removed",
          span: 0,
          origin: "agent",
          unseen: !agentSeen,
        });
      }
      continue;
    }
    // An added/modified run covers base lines [line, line + span); project each
    // surviving line individually (adjacent per-line bars read as one region), so a
    // user edit that splits the run drops only the touched lines, not the whole run.
    for (let base = change.line; base < change.line + change.span; base += 1) {
      const draftLine = projection.get(base);
      if (draftLine !== undefined) {
        projectedAgent.push({
          line: draftLine,
          kind: change.kind,
          span: 1,
          origin: "agent",
          unseen: !agentSeen,
        });
      }
    }
  }
  return [...projectedAgent, ...userChanges];
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

/** The gutter mark for one draft line: the change kind, its author, whether the
 *  agent change is still unseen, and whether it is a zero-height tick (a deletion
 *  sitting above the line) rather than a bar. */
export interface LineMarker {
  kind: ChangeKind;
  origin: ChangeOrigin;
  /** True for an agent change not yet acknowledged this session (D6). */
  unseen: boolean;
  /** True for a `removed` deletion — rendered as a tick between rows, since the
   *  deleted lines occupy no space in the draft. */
  tick: boolean;
}

/**
 * A draft-line → marker lookup for the gutter: every line of an added/modified run
 * gets a bar of that kind (so a multi-line run reads as one continuous region), and
 * a removal gets a single tick on the line it sits above. Built once per render
 * rather than probing `changeAtLine` per row. Origin/unseen ride from the change so
 * the gutter renders the user-vs-agent (and seen-vs-new) treatment.
 */
export function lineMarkers(changes: LineChange[]): Map<number, LineMarker> {
  const markers = new Map<number, LineMarker>();
  for (const change of changes) {
    const origin = change.origin ?? "user";
    const unseen = change.unseen ?? false;
    if (change.kind === "removed") {
      // A tick wins its row only if no bar already claims it (an edit that both
      // deletes and changes a line reads as the in-place change, not the tick).
      if (!markers.has(change.line))
        markers.set(change.line, { kind: "removed", origin, unseen, tick: true });
      continue;
    }
    for (let line = change.line; line < change.line + change.span; line += 1) {
      markers.set(line, { kind: change.kind, origin, unseen, tick: false });
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

/** The 0-based draft line the caret at `caretIndex` sits on — the count of
 *  newlines before it. Used to seed change navigation from the current caret. */
export function caretToLine(value: string, caretIndex: number): number {
  let line = 0;
  const end = Math.min(caretIndex, value.length);
  for (let i = 0; i < end; i += 1) {
    if (value[i] === "\n") line += 1;
  }
  return line;
}

/** The character offset of the START of 0-based draft `line`. Past the last line
 *  it returns the end of the text (so a target beyond EOF lands at the end, never
 *  out of range). The inverse of `caretToLine` at a line boundary. */
export function lineToCaret(value: string, line: number): number {
  if (line <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "\n") {
      seen += 1;
      if (seen === line) return i + 1;
    }
  }
  return value.length;
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
