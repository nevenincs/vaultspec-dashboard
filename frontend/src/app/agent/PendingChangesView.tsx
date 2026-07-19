// The Agent panel's "Pending changes" view (review-surface-flow ADR F1): the
// cross-run review inbox, folded into the Agent panel in place of the modal
// "Approvals" dialog. A DUMB view — it re-hosts the existing review-queue body
// (`ReviewStationBody`, which itself renders the applied-under-policy lane) over
// the SAME store hooks the deleted dialog used, unchanged. No new fetch, no raw
// tiers, no card fork (a view rewrite freezes the contract): the queue rows,
// degraded/truncation states, and after-the-fact lane are the station body's.
//
// The autonomy control is NOT here — it relocates composer-adjacent (ADR F2, a
// later phase); this view is the inbox only, and the inbox carries no composer.

import { useReviewStationView } from "../../stores/server/authoring";
import { ReviewStationBody, useReviewActions } from "../authoring/ReviewStation";

export function PendingChangesView() {
  const view = useReviewStationView();
  const actions = useReviewActions();
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-fg-3 overflow-y-auto px-fg-2 py-fg-2 text-body"
      data-agent-pending-changes
    >
      <ReviewStationBody view={view} actions={actions} />
    </div>
  );
}
