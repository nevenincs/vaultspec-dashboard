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
// Correlation (the load-bearing seam), now an EXACT per-run bind (S42): the served
// `ProposalProjection` carries the agent provenance `run_id` (agent-wire-gaps D4/D5),
// so a proposal binds to the turn whose run PRODUCED it — no heuristic. The former
// actor-identity-floored-on-session-start guess (which could not separate two
// same-millisecond sessions) is RETIRED; a proposal with no served `run_id` (a
// non-agent changeset) simply does not correlate and the slot stays honestly empty.
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
 *  correlation is the EXACT served-run_id bind, not a heuristic. */
export const AGENT_PROPOSAL_CORRELATION = "run-id" as const;

/** Bind the proposal whose served `run_id` matches this turn's run (S42). Pure and
 *  exported so the correlation is unit-tested directly. Returns `null` when the run
 *  is unknown or no proposal carries that run_id — the slot stays honestly empty. */
export function correlateProposalByRun(
  rows: readonly ProposalProjection[],
  runId: string | null,
): ProposalProjection | null {
  if (!runId) return null;
  return rows.find((row) => row.run_id === runId) ?? null;
}

/**
 * The transcript's proposal mount, bound to ONE turn's run by its served `run_id`
 * (S42). Renders nothing until a proposal carrying this run's id exists — an honest
 * empty slot. The caller mounts it per-turn (each turn shows only its own run's
 * proposal); the review-queue read + review mutations are shared store hooks.
 */
export function AgentTurnProposal({ runId }: { runId: string | null }) {
  const view = useReviewStationView();
  const actions = useReviewActions();
  const proposal = useMemo(
    () => correlateProposalByRun(view.rows, runId),
    [view.rows, runId],
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
