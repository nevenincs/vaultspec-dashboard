// The in-conversation "changes awaiting review" region (D9): the cross-run
// review queue as a BOUNDED disclosure inside the panel's one conversation view,
// expanded/collapsed by `PendingChangesBridge` and by the footer pending chip.
// There is no view switch — the transcript and composer stay mounted around it.
// A DUMB view — it re-hosts the existing review-queue body (`ReviewStationBody`,
// which itself renders the applied-under-policy lane) over the SAME store hooks
// the retired inbox view used, unchanged. No new fetch, no raw tiers, no card
// fork (a view rewrite freezes the contract): the queue rows, degraded/truncation
// states, and after-the-fact lane are the station body's.
//
// READING AS PART OF THE PANEL, not as a station someone re-hosted. The owner's
// note is that this surface still looks borrowed, and it did — a hard rule across
// the top and its own inset padding drew it as a separate pane bolted under the
// conversation. What it actually is, is more conversation: the same review cards
// the transcript shows inline, gathered across runs. So it now carries the
// transcript's own rhythm (`gap-fg-3` between cards, the same horizontal inset)
// and no border of its own; the panel's layout decides where regions divide.
//
// What does NOT change is the bound. This region can hold a queue of any depth,
// so it stays height-capped and scrollable — an unbounded list would push the
// composer off-screen, which is the one thing a conversation surface must never
// do. Bounded is not the same as bolted-on.

import { useReviewStationView } from "../../stores/server/authoring";
import { ReviewStationBody, useReviewActions } from "../authoring/ReviewStation";

export function PendingChangesView() {
  const view = useReviewStationView();
  const actions = useReviewActions();
  return (
    <div
      className="flex max-h-80 shrink-0 flex-col gap-fg-3 overflow-y-auto px-fg-3 py-fg-3 text-body"
      data-agent-pending-changes
    >
      <ReviewStationBody view={view} actions={actions} />
    </div>
  );
}
