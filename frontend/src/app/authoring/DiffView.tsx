// The ONE diff primitive (agentic-authoring-ux ADR D7). A single line-diff
// renderer parameterized by `source` — the in-editor draft-vs-saved comparison
// and the agent-proposal preview both mount THIS component, so there is exactly
// one visual grammar (gutter, `text-diff-add`/`text-diff-remove` tones, honest
// truncation notice) and exactly one line-diff implementation (`diffLines`).
//
// Layer ownership (architecture-boundaries): a DUMB presentation view. It takes
// two served `BoundedDocumentText`s as props and never touches the wire — the
// proposal source feeds it from `useProposalDetail` (in `DiffPanel`), the editor
// source feeds it client-held draft/base strings. The line diff itself is a
// DERIVED review artifact, computed client-side; the backend serves no diff.
//
// Design system: kit StateBlock for the non-diff states; diff identity stays in
// the bound `text-diff-*` tones and the grayscale-safe +/− gutter, while snippet
// text reuses the shared token-tier highlighter. No background tints, no
// hardcoded px.

import { useMemo } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { authoredDisplayText } from "../../platform/localization/displayText";
import type { BoundedDocumentText } from "../../stores/server/authoring";
import { DecorativeGlyph, StateBlock } from "../kit";
import { HighlightedLineContent } from "../viewer/HighlightedCode";
import { languageHintFromPath } from "../viewer/languages";
import { useTokenLines } from "../viewer/useHighlighter";
import { diffLines, diffStat, type DiffLineKind } from "./diffLines";

/** The origin of the two texts a `DiffView` compares. `draft-vs-saved` is the
 *  in-editor toggle (client-held draft against the saved base); `proposal-preview`
 *  is an agent proposal's served base against its proposed body. The primitive is
 *  otherwise source-agnostic; the value is surfaced as `data-diff-source` so both
 *  call sites are provably exercising the one implementation. */
export type DiffViewSource = "draft-vs-saved" | "proposal-preview";

const GUTTER: Record<DiffLineKind, string> = {
  add: "+",
  remove: "−",
  context: " ",
};

const LINE_TONE: Record<DiffLineKind, string> = {
  add: "text-diff-add",
  remove: "text-diff-remove",
  context: "text-ink-muted",
};

/** The honest truncation notice when either served side was byte-capped. A
 *  client-held draft never truncates, so this only ever fires for a served
 *  proposal preview. */
function truncationSide(base: BoundedDocumentText, proposed: BoundedDocumentText) {
  const side = base.truncated ? base : proposed.truncated ? proposed : null;
  if (!side) return null;
  return side;
}

/** The one line-diff renderer over two served texts. Both diff call sites in the
 *  product mount this; `source` distinguishes them for inspection/tests without
 *  branching the grammar. Exported so a wire-free render test drives it directly. */
export function DiffView({
  base,
  proposed,
  label,
  source,
}: {
  base: BoundedDocumentText;
  proposed: BoundedDocumentText;
  label: string;
  source: DiffViewSource;
}) {
  const lines = useMemo(
    () => diffLines(base.text, proposed.text),
    [base.text, proposed.text],
  );
  const stat = useMemo(() => diffStat(lines), [lines]);
  const resolveMessage = useLocalizedMessageResolver();
  const truncated = truncationSide(base, proposed);
  const languageHint = useMemo(() => languageHintFromPath(label), [label]);
  const { lines: tokenLines } = useTokenLines(
    lines.map((line) => line.text).join("\n"),
    languageHint,
  );

  return (
    <div
      className="flex flex-col gap-fg-1-5"
      data-review-doc-diff
      data-diff-source={source}
      data-doc={label}
    >
      <div className="flex flex-wrap items-center gap-fg-2 text-meta text-ink-muted">
        <span
          className="min-w-0 truncate font-mono text-ink-muted"
          title={authoredDisplayText(label)}
        >
          {label}
        </span>
        <span className="tabular-nums text-diff-add" data-diff-added>
          <DecorativeGlyph name="plus" />
          {stat.added}
        </span>
        <span className="tabular-nums text-diff-remove" data-diff-removed>
          <DecorativeGlyph name="minus" />
          {stat.removed}
        </span>
      </div>
      {stat.added === 0 && stat.removed === 0 ? (
        <StateBlock
          mode="empty"
          layout="inline"
          message={
            resolveMessage({
              key: "documents:localizationWave.authoring.noTextChange",
            }).message
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-fg-xs border border-rule bg-paper-sunken">
          <pre className="min-w-full text-meta leading-relaxed" data-diff-lines>
            {lines.map((line, index) => (
              <div
                // Diff lines have no stable id; index is the stable order here.
                key={index}
                className={`flex gap-fg-1-5 px-fg-2 ${LINE_TONE[line.kind]}`}
                data-diff-line={line.kind}
              >
                <span aria-hidden className="select-none tabular-nums">
                  {GUTTER[line.kind]}
                </span>
                <span className="whitespace-pre-wrap break-words">
                  <HighlightedLineContent
                    raw={line.text}
                    tokens={tokenLines?.[index]}
                  />
                </span>
              </div>
            ))}
          </pre>
        </div>
      )}
      {truncated && (
        <StateBlock
          mode="degraded"
          layout="inline"
          message={
            resolveMessage({
              key: "documents:localizationWave.authoring.truncatedPreview",
              values: {
                returned: truncated.returned_bytes,
                total: truncated.total_bytes,
              },
            }).message
          }
        />
      )}
    </div>
  );
}
