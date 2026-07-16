// The review DIFF panel (agentic plan W03.P40): renders the base-vs-proposed
// change for a proposal so a reviewer sees WHAT they are approving — a reviewer
// who can't see the change is a rubber stamp (arch-reviewer diff ruling).
//
// Layer ownership (architecture-boundaries): a DUMB app-chrome view. `DiffPanel`
// consumes the authoring store's `useProposalDetail` (the only fetch seam); it
// never touches the wire or the raw `tiers` block. The DETAIL projection serves
// the bounded base + proposed TEXTS (no server-side diff — a diff is a derived
// review artifact); the line diff itself is PRESENTATION, rendered by the one
// shared `DiffView` primitive (ADR D7). Truncation is surfaced honestly from the
// served `BoundedDocumentText`.

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";

import {
  useProposalDetail,
  type ReviewDocumentProjection,
} from "../../stores/server/authoring";
import { Skeleton, SkeletonRow, StateBlock } from "../kit";
import { DiffView } from "./DiffView";

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

function ReviewDocumentDiff({ doc }: { doc: ReviewDocumentProjection }) {
  return (
    <DiffView
      base={doc.base}
      proposed={doc.proposed}
      label={documentLabel(doc.document, doc.child_key)}
      source="proposal-preview"
    />
  );
}

/** The per-proposal diff panel: lazily reads the review DETAIL (the base +
 *  proposed texts) for `changesetId` and renders the per-operation diff. Mounted
 *  only when a card expands, so the body-free queue never pays the detail cost. */
export function DiffPanel({ changesetId }: { changesetId: string }) {
  const resolveMessage = useLocalizedMessageResolver();
  const detail = useProposalDetail(changesetId);

  if (detail.isLoading) {
    return (
      <Skeleton
        label={
          resolveMessage({
            key: "documents:localizationWave.authoring.loadingPreview",
          }).message
        }
      >
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
        message={
          resolveMessage({
            key: "documents:localizationWave.authoring.previewLoadFailed",
          }).message
        }
      />
    );
  }

  const documents = detail.data?.review_documents ?? [];
  if (documents.length === 0) {
    return (
      <StateBlock
        mode="empty"
        layout="inline"
        message={
          resolveMessage({
            key: "documents:localizationWave.authoring.previewUnavailable",
          }).message
        }
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
