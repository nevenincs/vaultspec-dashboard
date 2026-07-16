// The inline proposal card for the Agent transcript (agentic-authoring-ux ADR D5,
// Figma proposal card in transcript frame 1223:4518): the preview-then-approve
// review happy path INSIDE the conversation. When a turn's run settles into a
// proposal, the transcript slot shows the served summary + change count, a
// Show-changes disclosure over the ONE diff primitive, and eligibility-driven
// Approve / Reject / Apply — all with ambient provenance (no sign-in wall, the
// W01 detangle).
//
// Reuse, not reinvention: this file is PURELY the correlation + mount layer. The
// card body itself is the canonical `ReviewStation` `ProposalCard` (served
// summary/ops/status, Show-changes → `DiffPanel` → the one `DiffView`
// proposal-preview, eligibility-gated action buttons wired to the review
// mutations), driven by the shared `useReviewActions` hook. There is exactly one
// proposal-card implementation in the product; the transcript just decides WHICH
// proposal mounts WHERE.
//
// Correlation honesty (the load-bearing seam): a served `ProposalProjection`
// carries NO `session_id`, `run_id`, or `turn_id` — only `origin_actor`/`actor`.
// The changeset is tied to a session INTERNALLY (a create requires `session_id`),
// but the projection omits it, and no run/turn link exists at all. So a proposal
// cannot be bound to a SPECIFIC turn/run from the wire. The one shared SERVED
// provenance is ACTOR identity — and in a single-operator product every session
// runs under the SAME ambient principal, so actor identity alone barely
// discriminates. We therefore floor the match on the session's OWN start time
// (`session.created_at_ms`): a proposal created BEFORE this session began cannot
// be this session's, which eliminates the realistic stale-earlier-session bleed
// (operator opens Session B while Session A's proposal sits pending). Among what
// survives the floor we take the NEWEST, bound to the session's LATEST turn only —
// a marked heuristic, never a fabricated per-run link. RESIDUAL: two sessions
// started in the same millisecond cannot be separated by this floor; only a served
// `session_id` (already stored internally) closes that. When the engine serves it
// (and ideally `run_id`), this narrows to an exact per-run bind without touching
// the card.
//
// Layer ownership (architecture-boundaries): a DUMB app-chrome view. It consumes
// the review-station store hooks (`useReviewStationView`, `useReviewActions`) and
// renders the served projection; it never touches the wire or raw `tiers`.

import { useMemo } from "react";

import {
  useReviewStationView,
  type ProposalProjection,
} from "../../stores/server/authoring";
import { ProposalCard, useReviewActions } from "../authoring/ReviewStation";

/** The marker surfaced on the mounted list so a test/inspector can prove the
 *  correlation is the documented actor-identity heuristic, not a served link. */
export const AGENT_PROPOSAL_CORRELATION = "session-actor-latest" as const;

/** Correlate the session principal's newest proposal from the scope-wide review
 *  queue. Pure and exported so the correlation is unit-tested directly.
 *
 *  Honest bounds (see file header): the ONLY shared served provenance between an
 *  agent run and an authoring proposal is actor identity, so we match the session
 *  principal as either the proposal's origin actor OR its delegator (the a2a
 *  delegated-agent case), FLOORED on the session's own start time so a proposal
 *  from an earlier session can't bleed in, then take the newest by served creation
 *  time. Returns `null` when nothing matches — the slot stays honestly empty. */
export function correlateSessionProposal(
  rows: readonly ProposalProjection[],
  sessionActorId: string,
  sessionStartedAtMs: number,
): ProposalProjection | null {
  if (!sessionActorId) return null;
  const mine = rows.filter(
    (row) =>
      (row.origin_actor.id === sessionActorId ||
        row.origin_actor.delegated_by === sessionActorId) &&
      row.created_at_ms >= sessionStartedAtMs,
  );
  if (mine.length === 0) return null;
  return mine.reduce((newest, row) =>
    row.created_at_ms > newest.created_at_ms ? row : newest,
  );
}

/**
 * The transcript's proposal mount. Mount-gated by the caller to the session's
 * LATEST turn only (so the review-queue read + review mutations mount ONCE, not
 * per-turn), since without a served run/turn link an older proposal cannot be
 * mapped to an older turn. Renders nothing until a correlated proposal exists — an
 * honest empty slot.
 */
export function AgentTurnProposal({
  sessionActorId,
  sessionStartedAtMs,
}: {
  sessionActorId: string;
  sessionStartedAtMs: number;
}) {
  const view = useReviewStationView();
  const actions = useReviewActions();
  const proposal = useMemo(
    () => correlateSessionProposal(view.rows, sessionActorId, sessionStartedAtMs),
    [view.rows, sessionActorId, sessionStartedAtMs],
  );
  if (!proposal) return null;
  return (
    <ul
      className="flex flex-col gap-fg-2"
      role="list"
      data-agent-proposal
      data-correlation={AGENT_PROPOSAL_CORRELATION}
    >
      <ProposalCard proposal={proposal} actions={actions} />
    </ul>
  );
}
