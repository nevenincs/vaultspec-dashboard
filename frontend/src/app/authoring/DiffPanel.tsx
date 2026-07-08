// The review DIFF panel (agentic plan W03.P40): renders the base-vs-proposed
// change for a proposal so a reviewer sees WHAT they are approving — a reviewer
// who can't see the change is a rubber stamp (arch-reviewer diff ruling).
//
// Layer ownership (architecture-boundaries): a DUMB app-chrome view. `DiffPanel`
// consumes the authoring store's `useProposalDetail` (the only fetch seam); it
// never touches the wire or the raw `tiers` block. The DETAIL projection serves
// the bounded base + proposed TEXTS (no server-side diff — a diff is a derived
// review artifact); the line diff itself is PRESENTATION, computed client-side by
// `diffLines`. Truncation is surfaced honestly from the served `BoundedDocumentText`.
//
// Design system: kit StateBlock/Skeleton for the non-diff states; diff identity
// stays in the bound `--color-diff-*` tally and grayscale-safe +/− gutter, while
// snippet text reuses the shared token-tier highlighter. No background tints, no
// hardcoded px.

import { useMemo } from "react";

import {
  useProposalDetail,
  type BoundedDocumentText,
  type ReviewDocumentProjection,
} from "../../stores/server/authoring";
import { Skeleton, SkeletonRow, StateBlock } from "../kit";
import { HighlightedLineContent } from "../viewer/HighlightedCode";
import { languageHintFromPath } from "../viewer/languages";
import { useTokenLines } from "../viewer/useHighlighter";
import { diffLines, diffStat, type DiffLineKind } from "./diffLines";

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

/** A human label for a review document's target — its path/stem when the served
 *  ref carries one, else the child key. Presentation only; the ref is opaque. */
function documentLabel(document: unknown, childKey: string): string {
  if (document && typeof document === "object") {
    const ref = document as { path?: unknown; stem?: unknown };
    if (typeof ref.path === "string" && ref.path) return ref.path;
    if (typeof ref.stem === "string" && ref.stem) return ref.stem;
  }
  return childKey;
}

/** The honest truncation notice when either served side was byte-capped. */
function truncationNotice(base: BoundedDocumentText, proposed: BoundedDocumentText) {
  const side = base.truncated ? base : proposed.truncated ? proposed : null;
  if (!side) return null;
  return `Preview truncated — showing ${side.returned_bytes} of ${side.total_bytes} bytes. Open the document for the full body.`;
}

/** The pure diff renderer over two served texts. Exported so a wire-free render
 *  test drives it without the store. */
export function DiffLinesView({
  base,
  proposed,
  label,
}: {
  base: BoundedDocumentText;
  proposed: BoundedDocumentText;
  label: string;
}) {
  const lines = useMemo(
    () => diffLines(base.text, proposed.text),
    [base.text, proposed.text],
  );
  const stat = useMemo(() => diffStat(lines), [lines]);
  const truncated = truncationNotice(base, proposed);
  const languageHint = useMemo(() => languageHintFromPath(label), [label]);
  const { lines: tokenLines } = useTokenLines(
    lines.map((line) => line.text).join("\n"),
    languageHint,
  );

  return (
    <div className="flex flex-col gap-fg-1-5" data-review-doc-diff data-doc={label}>
      <div className="flex flex-wrap items-center gap-fg-2 text-meta text-ink-faint">
        <span className="min-w-0 truncate font-mono text-ink-muted" title={label}>
          {label}
        </span>
        <span className="tabular-nums text-diff-add" data-diff-added>
          +{stat.added}
        </span>
        <span className="tabular-nums text-diff-remove" data-diff-removed>
          −{stat.removed}
        </span>
      </div>
      {stat.added === 0 && stat.removed === 0 ? (
        <StateBlock
          mode="empty"
          layout="inline"
          message="No textual change in this document."
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
      {truncated && <StateBlock mode="degraded" layout="inline" message={truncated} />}
    </div>
  );
}

function ReviewDocumentDiff({ doc }: { doc: ReviewDocumentProjection }) {
  return (
    <DiffLinesView
      base={doc.base}
      proposed={doc.proposed}
      label={documentLabel(doc.document, doc.child_key)}
    />
  );
}

/** The per-proposal diff panel: lazily reads the review DETAIL (the base +
 *  proposed texts) for `changesetId` and renders the per-operation diff. Mounted
 *  only when a card expands, so the body-free queue never pays the detail cost. */
export function DiffPanel({ changesetId }: { changesetId: string }) {
  const detail = useProposalDetail(changesetId);

  if (detail.isLoading) {
    return (
      <Skeleton label="Loading the change preview">
        <SkeletonRow width="w-3/4" />
        <SkeletonRow width="w-2/3" />
      </Skeleton>
    );
  }
  if (detail.isError) {
    return (
      <StateBlock
        mode="degraded"
        layout="inline"
        message="The change preview couldn’t be loaded."
      />
    );
  }

  const documents = detail.data?.review_documents ?? [];
  if (documents.length === 0) {
    return (
      <StateBlock
        mode="empty"
        layout="inline"
        message="No change preview is available for this proposal."
      />
    );
  }
  return (
    <div className="flex flex-col gap-fg-3" data-diff-panel>
      {documents.map((doc) => (
        <ReviewDocumentDiff key={doc.child_key} doc={doc} />
      ))}
    </div>
  );
}
