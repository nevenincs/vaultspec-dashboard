// Pure unit coverage for the transcript proposal correlation (agent-wire-gaps S42).
// No wire: the function is pure logic over served projections, so it is driven
// directly. The correlation is now an EXACT bind on the served `run_id` (the former
// actor-identity-floored-on-session-start heuristic is retired): a proposal binds to
// the turn whose run produced it, and a proposal with no served run_id (or a run
// that matches nothing) does not correlate.

import { describe, expect, it } from "vitest";

import type { ProposalProjection } from "../../stores/server/authoring";
import { correlateProposalByRun } from "./ProposalCard";

function proposal(overrides: { id: string; runId?: string }): ProposalProjection {
  // Only the fields the correlation reads are load-bearing; the rest are shaped to
  // the served contract so the cast is honest rather than a fabricated wire body.
  return {
    changeset_id: overrides.id,
    changeset_revision: `rev:${overrides.id}`,
    kind: "authoring",
    status: "needs_review",
    summary: "",
    actor: { id: "agent:panel-writer", kind: "agent" },
    origin_actor: { id: "agent:panel-writer", kind: "agent" },
    operation_count: 1,
    validation: { present: false, approval_ready: false },
    approval: { present: false, stale: false },
    eligibility: [],
    rollback: { available: false },
    created_at_ms: 1_000,
    ...(overrides.runId ? { run_id: overrides.runId } : {}),
  } as ProposalProjection;
}

describe("correlateProposalByRun", () => {
  it("returns null for a null run id or an empty queue", () => {
    expect(correlateProposalByRun([], "run:1")).toBeNull();
    expect(
      correlateProposalByRun([proposal({ id: "c1", runId: "run:1" })], null),
    ).toBeNull();
  });

  it("binds the proposal whose served run_id matches this turn's run", () => {
    const mine = proposal({ id: "mine", runId: "run:1" });
    const other = proposal({ id: "other", runId: "run:2" });
    expect(correlateProposalByRun([other, mine], "run:1")?.changeset_id).toBe("mine");
    expect(correlateProposalByRun([other, mine], "run:2")?.changeset_id).toBe("other");
  });

  it("does not correlate a proposal with no served run_id (a non-agent changeset)", () => {
    expect(correlateProposalByRun([proposal({ id: "no-run" })], "run:1")).toBeNull();
  });

  it("returns null when no proposal carries the requested run", () => {
    expect(
      correlateProposalByRun([proposal({ id: "c1", runId: "run:9" })], "run:1"),
    ).toBeNull();
  });
});
