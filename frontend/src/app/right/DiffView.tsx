// The read-only diff view (git-diff-browser surface adoption, W02.P13.S29).
//
// A reviewable, scannable document (the instrument-surface grammar) — NOT a chat
// or a modal: a hunk-by-hunk body in monospace, each hunk introduced by its
// range header, with twin (old/new) line-number gutters in tabular numerals and
// a change-type gutter glyph. Added lines are high-contrast green with a `+`
// glyph and an "added" label; removed lines are high-contrast red with a `-`
// glyph and a "removed" label; context lines are neutral ink.
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

import { FileDashed } from "@phosphor-icons/react";

import type { GitDiffHunk, GitDiffLine, GitFileDiff } from "../../stores/server/engine";

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
      className="w-8 shrink-0 select-none px-vs-1 text-right text-ink-faint"
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
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words pr-vs-1">
        {line.text}
      </span>
    </div>
  );
}

function HunkBlock({ hunk, index }: { hunk: GitDiffHunk; index: number }) {
  return (
    <div className="border-t border-rule first:border-t-0">
      {/* The range header is a keyboard landmark (focusable, arrow-navigable
          hunk-to-hunk) and reads in mono as code identity. */}
      <div
        {...{ [HUNK_NAV_ATTR]: "" }}
        tabIndex={0}
        role="button"
        aria-label={`hunk ${index + 1}: ${hunk.header}`}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            moveHunkFocus(e.currentTarget, 1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            moveHunkFocus(e.currentTarget, -1);
          }
        }}
        className="bg-paper-sunken px-vs-2 py-vs-0-5 font-mono text-2xs text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
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
   * The read-only diff capability is not served by the live engine (the live ops
   * whitelist is `/ops/core/*` and `/ops/rag/*` only — there is no `/ops/git/*`).
   * When true (the case today) the surface renders the honest "engine capability
   * pending" state and makes NO network call. Default true.
   */
  engineBlocked?: boolean;
  /**
   * A structured diff to render — supplied only when a FUTURE engine serves the
   * proposed read-only diff. Not produced by any live query today; present so the
   * render chrome is complete and testable.
   */
  diff?: GitFileDiff;
}

/**
 * The diff body for a selected changed file.
 *
 * Today this renders ONE honest state: "diff unavailable — engine capability
 * pending", because the live engine serves no read-only diff (engine-blocked, by
 * the read-and-infer boundary). The structured render path below (hunks with the
 * sacred add/remove treatment, binary / empty / truncation) is retained for when
 * the proposed read-only diff capability lands as a contract amendment; it is the
 * `DiffView` prop contract, never reached against the current wire.
 */
export function DiffView({ engineBlocked = true, diff }: DiffViewProps) {
  if (engineBlocked || !diff) {
    return (
      <p
        className="flex items-start gap-vs-1-5 rounded-vs-sm bg-paper-sunken px-vs-2 py-vs-1 text-label text-ink-muted"
        data-diff-unavailable
      >
        <span className="mt-px shrink-0 text-ink-faint" aria-hidden>
          <FileDashed size={14} />
        </span>
        <span>diff unavailable — engine capability pending</span>
      </p>
    );
  }

  if (diff.binary) {
    return (
      <p className="px-vs-2 py-vs-1 text-label text-ink-faint" data-diff-binary>
        no textual diff — binary file or pure rename
      </p>
    );
  }

  if (diff.hunks.length === 0) {
    return (
      <p className="px-vs-2 py-vs-1 text-label text-ink-faint" data-diff-empty>
        no changes to show in this file
      </p>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-vs-sm border border-rule bg-paper-raised"
      data-diff-body
    >
      {diff.hunks.map((hunk, i) => (
        <HunkBlock key={`${hunk.header}:${i}`} hunk={hunk} index={i} />
      ))}
      {diff.truncated && (
        <p
          className="border-t border-rule px-vs-2 py-vs-0-5 text-2xs text-ink-faint"
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
