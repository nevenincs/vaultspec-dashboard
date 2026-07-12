// Auto-split from liveAdapters.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the liveAdapters barrel; see ./index.ts.

import type {
  ChangedFile,
  GitChangeGroup,
  GitChangesSummary,
  GitDiffHunk,
  GitDiffLine,
  GitFileDiff,
  GitOpResponse,
  TiersBlock,
} from "../engine";
import { isRec } from "./internal";

export const GIT_OP_VERB_MAX_CHARS = 32;
export const GIT_OP_OUTPUT_MAX_CHARS = 1024 * 1024;

function normalizeGitOpVerb(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.length <= GIT_OP_VERB_MAX_CHARS ? value : "";
}

function normalizeGitOpOutput(value: unknown): {
  output: string;
  truncated?: GitOpResponse["truncated"];
} {
  if (typeof value !== "string") return { output: "" };
  if (value.length <= GIT_OP_OUTPUT_MAX_CHARS) return { output: value };
  return {
    output: value.slice(0, GIT_OP_OUTPUT_MAX_CHARS),
    truncated: {
      returned_chars: GIT_OP_OUTPUT_MAX_CHARS,
      reason: "git output ceiling",
    },
  };
}

/** Live `/ops/git/{verb}` → the internal git-op response. TOLERANT: an absent
 *  `output` defaults to the empty string (no changes / empty diff), `verb` to the
 *  empty string. git's text output is capped at the stores boundary before the
 *  parser projects it into changed-files or diff state. */
export function adaptGitOp(body: unknown): GitOpResponse {
  if (!isRec(body)) return { verb: "", output: "", tiers: {} };
  const { output, truncated } = normalizeGitOpOutput(body.output);
  return {
    verb: normalizeGitOpVerb(body.verb),
    output,
    ...(truncated === undefined ? {} : { truncated }),
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

/** A tolerant non-negative integer read for the engine-served summary counts: a
 *  non-finite / non-number / negative field reads as 0 (a count is never
 *  negative), so a shape drift degrades to an honest zero rather than NaN in the
 *  header. */
function summaryCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/** Live `/ops/git/changes-summary` → the engine-reduced fold-header rollup.
 *  TOLERANT: absent/malformed counts read as 0; `clean` defaults to the
 *  counts-are-zero truth when the engine omits it (engine-read-and-infer
 *  corollary — a new field is additive, a missing one degrades honestly). */
export function adaptGitChangesSummary(body: unknown): GitChangesSummary {
  if (!isRec(body)) {
    return {
      files: 0,
      documents: 0,
      additions: 0,
      deletions: 0,
      clean: true,
      tiers: {},
    };
  }
  const files = summaryCount(body.files);
  const documents = summaryCount(body.documents);
  return {
    files,
    documents,
    additions: summaryCount(body.additions),
    deletions: summaryCount(body.deletions),
    clean: typeof body.clean === "boolean" ? body.clean : files + documents === 0,
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

// --- git output parsers (git-diff-browser ADR / missing-backend-inventory B) ----------
//
// The `/ops/git` pass-through forwards git's stdout VERBATIM; the parse from that
// text into the chrome's structured shapes lives here in the stores layer (the
// chrome never re-parses unified-diff text on paint, and never fetches). The wire
// formats the engine whitelist produces:
//   • status : `git status --porcelain=v1 --branch` → a `## branch` header line,
//              then `XY path` per file (`R  old -> new` for renames).
//   • numstat: `git diff --numstat --no-color`       → `adds\tdels\tpath` per file
//              (`-\t-\tpath` for a binary file).
//   • diff   : `git diff --no-color -- <path>`        → a standard unified diff.

const VAULT_RE = /(^|\/)\.vault\//;
const PORCELAIN_CODES = new Set([" ", "M", "A", "D", "R", "C", "?", "U"]);
export const GIT_CHANGED_FILES_MAX_ROWS = 512;
export const GIT_PATH_MAX_CHARS = 4096;

function isVaultEntry(path: string): boolean {
  return VAULT_RE.test(path);
}

function normalizeGitPath(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= GIT_PATH_MAX_CHARS
    ? normalized
    : null;
}

function isPorcelainCode(code: string): boolean {
  return (
    code.length === 2 &&
    PORCELAIN_CODES.has(code.charAt(0)) &&
    PORCELAIN_CODES.has(code.charAt(1))
  );
}

/** Bucket a porcelain `XY` status into a render group + a grayscale-safe letter.
 *  X is the index (staged) side, Y the worktree side. A non-space, non-`?` index
 *  char means the change is staged; `??` is untracked; otherwise the worktree
 *  char drives the group. */
function classifyPorcelain(code: string): { group: GitChangeGroup; letter: string } {
  const x = code.charAt(0);
  const y = code.charAt(1);
  if (x === "?" || y === "?") return { group: "untracked", letter: "?" };
  // A staged (index-side) change: X carries a status and it is not a worktree-only
  // change. Renames are reported on the index side (`R `), so check rename first.
  if (x === "R" || y === "R") return { group: "renamed", letter: "R" };
  if (x !== " " && x !== "?") {
    const letter = x === "A" ? "A" : x === "D" ? "D" : "M";
    return { group: "staged", letter };
  }
  if (y === "D") return { group: "deleted", letter: "D" };
  if (y === "A") return { group: "added", letter: "A" };
  return { group: "modified", letter: "M" };
}

/** Parse `git status --porcelain=v1 --branch` output into changed-file entries
 *  (one per file). The `## branch` header line and blank lines are skipped; a
 *  rename's `old -> new` path keeps the NEW path (the entry git tracks forward).
 *  numstat tallies (`adds`/`dels`) are filled by `mergeNumstat`. */
export function parseGitStatus(output: string): ChangedFile[] {
  const entries: ChangedFile[] = [];
  for (const raw of output.split("\n")) {
    if (raw.trim().length === 0 || raw.startsWith("## ")) continue;
    // Porcelain v1: two status chars, a separator space, then the path.
    if (raw.length < 4 || raw.charAt(2) !== " ") continue;
    const code = raw.slice(0, 2);
    if (!isPorcelainCode(code)) continue;
    let path = raw.slice(3);
    // Rename/copy: `old -> new` — track the new path.
    const arrow = path.indexOf(" -> ");
    if (arrow !== -1) path = path.slice(arrow + 4);
    const normalizedPath = normalizeGitPath(path);
    if (normalizedPath === null) continue;
    const { group, letter } = classifyPorcelain(code);
    entries.push({
      path: normalizedPath,
      code,
      letter,
      group,
      adds: null,
      dels: null,
      vault: isVaultEntry(normalizedPath),
    });
    if (entries.length >= GIT_CHANGED_FILES_MAX_ROWS) break;
  }
  return entries;
}

function normalizeGitNumstatCount(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Parse `git diff --numstat` output into a path → {adds, dels} map. A binary
 *  file's `-\t-\tpath` row maps to null tallies. */
export function parseGitNumstat(
  output: string,
): Map<string, { adds: number | null; dels: number | null }> {
  const tallies = new Map<string, { adds: number | null; dels: number | null }>();
  for (const raw of output.split("\n")) {
    if (raw === "") continue;
    const parts = raw.split("\t");
    if (parts.length < 3) continue;
    const [addsStr, delsStr, ...rest] = parts;
    let path = rest.join("\t");
    // numstat renames render as `old => new` or `pre{old => new}post`; the diff
    // browser keys on the new path the status list also tracks.
    const brace = path.indexOf("{");
    if (brace !== -1 && path.includes(" => ")) {
      path = path.replace(/\{[^}]* => ([^}]*)\}/, "$1").replace(/ => /, "");
    } else if (path.includes(" => ")) {
      path = path.split(" => ").pop() ?? path;
    }
    const normalizedPath = normalizeGitPath(path);
    if (normalizedPath === null) continue;
    const adds = addsStr === "-" ? null : normalizeGitNumstatCount(addsStr);
    const dels = delsStr === "-" ? null : normalizeGitNumstatCount(delsStr);
    if ((addsStr !== "-" && adds === null) || (delsStr !== "-" && dels === null)) {
      continue;
    }
    tallies.set(normalizedPath, {
      adds,
      dels,
    });
    if (tallies.size >= GIT_CHANGED_FILES_MAX_ROWS) break;
  }
  return tallies;
}

/** Reconcile parsed status entries with numstat tallies (path-keyed), returning
 *  the entries with `adds`/`dels` filled where numstat carried a row. */
export function mergeNumstat(
  entries: ChangedFile[],
  tallies: Map<string, { adds: number | null; dels: number | null }>,
): ChangedFile[] {
  return entries.map((e) => {
    const t = tallies.get(e.path);
    if (!t) return e;
    // A numstat ROW with both tallies null is git's binary marker (`-\t-`). An
    // entry with NO row (untracked) keeps null tallies but is NOT binary — the
    // two states must read differently in the UI.
    const binary = t.adds === null && t.dels === null;
    return { ...e, adds: t.adds, dels: t.dels, binary };
  });
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const GIT_DIFF_STATUS_LETTERS = new Set(["M", "A", "D", "R", "?"]);
export const GIT_DIFF_MAX_HUNKS = 256;
export const GIT_DIFF_MAX_LINES = 5_000;
export const GIT_DIFF_LINE_MAX_CHARS = 8_192;

export function normalizeGitDiffStatus(status: unknown): string | undefined {
  if (typeof status !== "string") return undefined;
  const normalized = status.trim().toUpperCase();
  return GIT_DIFF_STATUS_LETTERS.has(normalized) ? normalized : undefined;
}

function normalizeGitDiffLineText(text: string): {
  text: string;
  truncated: boolean;
} {
  return text.length <= GIT_DIFF_LINE_MAX_CHARS
    ? { text, truncated: false }
    : { text: text.slice(0, GIT_DIFF_LINE_MAX_CHARS), truncated: true };
}

/** Parse a single file's `git diff --no-color` output into the structured
 *  `GitFileDiff` the `DiffView` renders: hunk-per-entry with twin (old/new) line
 *  numbers and a per-line change kind. A diff with a `Binary files ... differ`
 *  marker (or no hunks) reports `binary`. */
export function parseUnifiedDiff(
  output: string,
  path: string,
  status?: unknown,
): GitFileDiff {
  const normalizedStatus = normalizeGitDiffStatus(status);
  const normalizedPath = normalizeGitPath(path) ?? "";
  const lines = output.split("\n");
  const totalHunks = lines.reduce(
    (count, line) => count + (HUNK_HEADER_RE.test(line) ? 1 : 0),
    0,
  );
  const binary = lines.some(
    (l) => l.startsWith("Binary files ") && l.endsWith(" differ"),
  );
  const hunks: GitDiffHunk[] = [];
  let current: GitDiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  let returnedLines = 0;
  let truncatedReason: string | null = null;
  for (const line of lines) {
    const m = HUNK_HEADER_RE.exec(line);
    if (m) {
      if (hunks.length >= GIT_DIFF_MAX_HUNKS) {
        truncatedReason = "hunk ceiling";
        break;
      }
      current = { header: line, lines: [] };
      hunks.push(current);
      oldNo = Number(m[1]);
      newNo = Number(m[2]);
      continue;
    }
    if (!current) continue; // pre-hunk preamble (diff --git, index, ---, +++)
    if (returnedLines >= GIT_DIFF_MAX_LINES) {
      truncatedReason = "line ceiling";
      break;
    }
    const marker = line.charAt(0);
    if (marker === "+") {
      const normalizedText = normalizeGitDiffLineText(line.slice(1));
      if (normalizedText.truncated) truncatedReason = "line length ceiling";
      const diffLine: GitDiffLine = {
        kind: "add",
        old: null,
        new: newNo,
        text: normalizedText.text,
      };
      current.lines.push(diffLine);
      returnedLines += 1;
      newNo += 1;
    } else if (marker === "-") {
      const normalizedText = normalizeGitDiffLineText(line.slice(1));
      if (normalizedText.truncated) truncatedReason = "line length ceiling";
      const diffLine: GitDiffLine = {
        kind: "remove",
        old: oldNo,
        new: null,
        text: normalizedText.text,
      };
      current.lines.push(diffLine);
      returnedLines += 1;
      oldNo += 1;
    } else if (marker === " ") {
      const normalizedText = normalizeGitDiffLineText(line.slice(1));
      if (normalizedText.truncated) truncatedReason = "line length ceiling";
      const diffLine: GitDiffLine = {
        kind: "context",
        old: oldNo,
        new: newNo,
        text: normalizedText.text,
      };
      current.lines.push(diffLine);
      returnedLines += 1;
      oldNo += 1;
      newNo += 1;
    }
    // `\ No newline at end of file` and any other line is ignored.
  }
  return {
    path: normalizedPath,
    ...(normalizedStatus === undefined ? {} : { status: normalizedStatus }),
    hunks,
    binary: binary && hunks.length === 0,
    ...(truncatedReason === null
      ? {}
      : {
          truncated: {
            total_hunks: totalHunks,
            returned_hunks: hunks.length,
            reason: truncatedReason,
          },
        }),
  };
}
