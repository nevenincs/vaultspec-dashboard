// The proposal card's diffstat (research C4; agent-panel-shell-integration D4c): an
// aggregate `+X −Y` with a per-file breakdown, so a reviewer sees the SHAPE of a
// change before deciding, without the card turning into a diff.
//
// Where the numbers come from, stated plainly: the engine deliberately serves NO
// diff — `wireTypes.ts` says so ("hunking is client-rendered presentation; a diff is
// a derived review artifact, never authority"). The bounded LIST projection the card
// renders from carries `operation_count` and nothing finer. So the stat is computed
// from the DETAIL route's served base/proposed texts through the SAME `diffLines` /
// `diffStat` pair the DiffPanel already hunks with — one diff implementation, no new
// wire, and no number invented here.
//
// Cost: this mounts the detail read per card. It is the identical query the diff
// expansion uses, so TanStack serves the expansion from cache afterwards rather than
// re-fetching — the read moved earlier, it did not double.
//
// Layer ownership: dumb app chrome over `useProposalDetail`. No wire, no raw tiers.

import { useMemo } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { authoredDisplayText } from "../../platform/localization/displayText";
import {
  useProposalDetail,
  type ReviewDocumentProjection,
} from "../../stores/server/authoring";
import { diffLines, diffStat } from "./diffLines";

const MSG = {
  aggregate: "documents:reviewStation.diffstat.aggregate",
  added: "documents:reviewStation.diffstat.added",
  removed: "documents:reviewStation.diffstat.removed",
} as const;

export interface FileDiffstat {
  label: string;
  added: number;
  removed: number;
  /** True when either served side was byte-capped, so the counts are a FLOOR. The
   *  card says so rather than presenting a truncated tally as exact. */
  truncated: boolean;
}

export interface ProposalDiffstatView {
  files: FileDiffstat[];
  added: number;
  removed: number;
  truncated: boolean;
}

/** A human label for a review document's target — its path/stem when the served ref
 *  carries one, else the child key. Presentation only; the ref is opaque. */
export function diffstatLabel(document: unknown, childKey: string): string {
  if (document && typeof document === "object") {
    const ref = document as { path?: unknown; stem?: unknown };
    if (typeof ref.path === "string" && ref.path) return ref.path;
    if (typeof ref.stem === "string" && ref.stem) return ref.stem;
  }
  return childKey;
}

/** Fold the served review documents into the aggregate + per-file stat. Pure so the
 *  tally rules — including truncation honesty — are driven directly by test. */
export function deriveProposalDiffstat(
  documents: readonly ReviewDocumentProjection[],
): ProposalDiffstatView {
  const files = documents.map((doc): FileDiffstat => {
    const stat = diffStat(diffLines(doc.base.text, doc.proposed.text));
    return {
      label: diffstatLabel(doc.document, doc.child_key),
      added: stat.added,
      removed: stat.removed,
      truncated: doc.base.truncated || doc.proposed.truncated,
    };
  });
  return {
    files,
    added: files.reduce((total, file) => total + file.added, 0),
    removed: files.reduce((total, file) => total + file.removed, 0),
    truncated: files.some((file) => file.truncated),
  };
}

function StatPair({
  added,
  removed,
  truncated,
}: {
  added: number;
  removed: number;
  truncated: boolean;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const addedLabel = resolveMessage({ key: MSG.added, values: { count: added } });
  const removedLabel = resolveMessage({ key: MSG.removed, values: { count: removed } });
  if (addedLabel.usedFallback || removedLabel.usedFallback) return null;
  return (
    <span
      className="flex shrink-0 items-center gap-fg-1 text-caption tabular-nums"
      data-diffstat-pair
      data-diffstat-truncated={truncated ? "" : undefined}
    >
      <span className="text-state-complete">{addedLabel.message}</span>
      <span className="text-state-broken">{removedLabel.message}</span>
    </span>
  );
}

/**
 * The card's stat block. Renders nothing until the detail resolves — a proposal
 * whose bodies have not arrived has no honest tally to show, and a placeholder
 * `+0 −0` would read as "this changes nothing".
 */
export function ProposalDiffstat({ changesetId }: { changesetId: string }) {
  const resolveMessage = useLocalizedMessageResolver();
  const detail = useProposalDetail(changesetId);
  const documents = detail.data?.review_documents;
  const view = useMemo(
    () => (documents === undefined ? null : deriveProposalDiffstat(documents)),
    [documents],
  );
  if (view === null || view.files.length === 0) return null;

  const aggregate = resolveMessage({ key: MSG.aggregate });
  return (
    <div className="flex flex-col gap-fg-1" data-proposal-diffstat>
      <div className="flex items-center justify-between gap-fg-2">
        {!aggregate.usedFallback && (
          <span className="min-w-0 truncate text-caption text-ink-faint">
            {aggregate.message}
          </span>
        )}
        <StatPair
          added={view.added}
          removed={view.removed}
          truncated={view.truncated}
        />
      </div>
      <ul className="flex flex-col gap-fg-0-5">
        {view.files.map((file) => (
          <li
            key={file.label}
            className="flex items-center justify-between gap-fg-2"
            data-diffstat-file={file.label}
          >
            <span className="min-w-0 truncate font-mono text-caption text-ink-muted">
              {authoredDisplayText(file.label)}
            </span>
            <StatPair
              added={file.added}
              removed={file.removed}
              truncated={file.truncated}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
