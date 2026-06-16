// The read-only diff view (figma-parity-reconciliation W02.P05.S32; binding
// DiffView frame, Figma node 17:965).
//
// A reviewable, scannable document (the instrument-surface grammar) — NOT a chat
// or a modal: a hunk-by-hunk body in monospace, each hunk introduced by its
// range header, with twin (old/new) line-number gutters in tabular numerals and
// a change-type gutter glyph. Added lines are high-contrast green with a `+`
// glyph and an "added" label; removed lines are high-contrast red with a `-`
// glyph and a "removed" label; context lines are neutral ink.
//
// SOURCE-AGNOSTIC: this view is a pure projection of a parsed `GitFileDiff` body
// and renders it identically whether it came from the working-tree `diff` verb OR
// the bounded read-only HISTORICAL two-rev `histdiff` route (the new engine route
// added in W01.P02.S14). The owning stores selector chooses the verb; the view
// renders the resulting hunks, truncation, and binary/empty states unchanged.
//
// Rebuilt onto the NEW Figma role-named token foundation: canonical radius
// (`rounded-fg-xs`) on the diff body, the `caption` type role for the hunk header
// and truncation receipt. The sacred diff add/remove tokens are NEVER warmth- or
// foundation-overridden — they stay the high-contrast `--color-diff-*` tokens.
//
// DIFF LEGIBILITY IS SACRED (design-language ADR layer 3 / git-diff-browser ADR):
// add/remove keep their high-contrast green/red even in the warm theme — these
// use the `--color-diff-add` / `--color-diff-remove` tokens directly and are
// NEVER warmth-overridden. COLOUR IS NEVER THE SOLE SIGNAL: every add/remove
// line carries a `+`/`-` gutter glyph AND a programmatic ("added"/"removed")
// label, so the diff reads correctly in grayscale, for colour-blind operators,
// and to assistive technology.
//
// Layer boundary: this is a dumb projection over read-only git data the stores
// layer owns; it fetches nothing and writes NOTHING — there is no line-staging or
// any write affordance, by design (engine-read-and-infer).

import type { GitDiffHunk, GitDiffLine, GitFileDiff } from "../../stores/server/engine";
import { openContextMenu } from "../../stores/view/contextMenu";

// Self-register the change resolver at module load so the context-menu host can
// resolve a hunk's menu (open-in-editor / reveal / copy path / copy hunk).
import "./menus/changeMenu";

// The diff body is keyboard-navigable hunk-to-hunk; each hunk header is a
// landmark a keyboard operator can step through without a pointer.
const HUNK_NAV_ATTR = "data-diff-hunk";

/** Move hunk-header focus within the diff body (keyboard hunk-to-hunk nav). */
export function moveHunkFocus(from: HTMLElement, delta: number): void {
  const body = from.closest("[data-diff-body]");
  if (!body) return;
  const headers = Array.from(body.querySelectorAll<HTMLElement>(`[${HUNK_NAV_ATTR}]`));
  const at = headers.indexOf(from);
  if (at === -1) return;
  headers[Math.min(headers.length - 1, Math.max(0, at + delta))]?.focus();
}

/** The `+`/`-`/` ` gutter glyph — the non-colour identity of a diff line. */
export function lineGlyph(kind: GitDiffLine["kind"]): string {
  return kind === "add" ? "+" : kind === "remove" ? "-" : " ";
}

/** The programmatic label a screen reader hears for a diff line. */
export function lineLabel(kind: GitDiffLine["kind"]): string {
  return kind === "add" ? "added" : kind === "remove" ? "removed" : "context";
}

/**
 * Serialize a hunk to its unified-diff text (header plus glyph-prefixed lines) —
 * the text the "copy hunk" context-menu action writes to the clipboard.
 */
export function hunkText(hunk: GitDiffHunk): string {
  const body = hunk.lines.map((line) => `${lineGlyph(line.kind)}${line.text}`);
  return [hunk.header, ...body].join("\n");
}

// Per-kind treatment: the SACRED diff tokens for add/remove (never warmth-
// overridden), neutral ink for context. The glyph + label carry the meaning so
// the row is correct without colour.
function lineClass(kind: GitDiffLine["kind"]): string {
  if (kind === "add") return "bg-diff-add/10 text-diff-add";
  if (kind === "remove") return "bg-diff-remove/10 text-diff-remove";
  return "text-ink-muted";
}

/** A line number cell, tabular, blank when the line is absent on that side. */
function GutterNum({ n }: { n: number | null | undefined }) {
  return (
    <span
      className="w-8 shrink-0 select-none px-fg-1 text-right text-ink-faint"
      data-tabular
      aria-hidden
    >
      {n ?? ""}
    </span>
  );
}

function DiffLineRow({ line }: { line: GitDiffLine }) {
  const glyph = lineGlyph(line.kind);
  const label = lineLabel(line.kind);
  return (
    <div
      className={`flex items-stretch font-mono text-code-sm ${lineClass(line.kind)}`}
    >
      <GutterNum n={line.old} />
      <GutterNum n={line.new} />
      {/* The change-type gutter glyph — non-colour identity, mirrored to the SR
          via the row's data-line-kind + the sr-only label. */}
      <span className="w-4 shrink-0 select-none text-center" aria-hidden>
        {glyph}
      </span>
      <span className="sr-only">{label}: </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words pr-fg-1">
        {line.text}
      </span>
    </div>
  );
}

function HunkBlock({
  hunk,
  index,
  path,
}: {
  hunk: GitDiffHunk;
  index: number;
  /** The owning file path — the ChangeEntity path for this hunk's menu. */
  path: string;
}) {
  // The ChangeEntity this hunk publishes to the context-menu host: the file path
  // plus the hunk text, so the resolver offers open/reveal/copy-path AND copy-hunk.
  const changeEntity = () => ({
    kind: "change" as const,
    id: `${path}:${index}`,
    path,
    hunk: hunkText(hunk),
  });

  return (
    <div className="border-t border-rule first:border-t-0">
      {/* The range header is a keyboard landmark (focusable, arrow-navigable
          hunk-to-hunk) and reads in mono as code identity. */}
      <div
        {...{ [HUNK_NAV_ATTR]: "" }}
        tabIndex={0}
        role="button"
        aria-label={`hunk ${index + 1}: ${hunk.header}`}
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(changeEntity(), { x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            moveHunkFocus(e.currentTarget, 1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            moveHunkFocus(e.currentTarget, -1);
          } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            openContextMenu(changeEntity(), { x: r.left, y: r.bottom });
          }
        }}
        className="bg-paper-sunken px-fg-2 py-fg-0-5 font-mono text-caption text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        {hunk.header}
      </div>
      <div>
        {hunk.lines.map((line, i) => (
          <DiffLineRow
            key={`${line.kind}:${line.old ?? "_"}:${line.new ?? "_"}:${i}`}
            line={line}
          />
        ))}
      </div>
    </div>
  );
}

export interface DiffViewProps {
  /**
   * The structured diff to render — parsed by `useGitFileDiff` from the read-only
   * `/ops/git/diff` pass-through (unified diff for a path). The owning stores
   * selector handles loading/error; this view is a pure projection of the body.
   */
  diff: GitFileDiff;
}

/**
 * The diff body for a selected changed file: a hunk-by-hunk render of the parsed
 * read-only diff with the sacred add/remove treatment, twin (old/new) line-number
 * gutters, `+`/`-` glyphs + labels (colour is never the sole signal), and honest
 * binary / empty / truncation states. A pure projection over read-only git data
 * the stores layer owns — it fetches nothing and writes NOTHING (read-and-infer).
 */
export function DiffView({ diff }: DiffViewProps) {
  if (diff.binary) {
    return (
      <p className="px-fg-2 py-fg-1 text-label text-ink-faint" data-diff-binary>
        no textual diff — binary file or pure rename
      </p>
    );
  }

  if (diff.hunks.length === 0) {
    return (
      <p className="px-fg-2 py-fg-1 text-label text-ink-faint" data-diff-empty>
        no changes to show in this file
      </p>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-fg-xs border border-rule bg-paper-raised"
      data-diff-body
    >
      {diff.hunks.map((hunk, i) => (
        <HunkBlock key={`${hunk.header}:${i}`} hunk={hunk} index={i} path={diff.path} />
      ))}
      {diff.truncated && (
        <p
          className="border-t border-rule px-fg-2 py-fg-0-5 text-caption text-ink-faint"
          data-diff-truncated
          data-tabular
        >
          showing {diff.truncated.returned_hunks} of {diff.truncated.total_hunks} hunks
          — {diff.truncated.reason}
        </p>
      )}
    </div>
  );
}
