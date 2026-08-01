// The in-conversation "changes awaiting review" region (D9): the cross-run
// review queue as a BOUNDED disclosure inside the panel's one conversation view,
// expanded/collapsed by `PendingChangesBridge` and by the footer pending chip.
// There is no view switch — the transcript and composer stay mounted around it.
// A DUMB view — it re-hosts the existing review-queue body (`ReviewStationBody`,
// which itself renders the applied-under-policy lane) over the SAME store hooks
// the retired inbox view used, unchanged. No new fetch, no raw tiers, no card
// fork (a view rewrite freezes the contract): the queue rows, degraded/truncation
// states, and after-the-fact lane are the station body's.

import { useReviewStationView } from "../../stores/server/authoring";
import { ReviewStationBody, useReviewActions } from "../authoring/ReviewStation";

export function PendingChangesView() {
  const view = useReviewStationView();
  const actions = useReviewActions();
  return (
    <div
      className="flex max-h-80 shrink-0 flex-col gap-fg-3 overflow-y-auto border-t border-rule px-fg-2 py-fg-2 text-body"
      data-agent-pending-changes
    >
      <ReviewStationBody view={view} actions={actions} />
    </div>
  );
}
