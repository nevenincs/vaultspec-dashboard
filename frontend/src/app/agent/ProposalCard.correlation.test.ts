// Pure unit coverage for the transcript proposal correlation (agentic-authoring-ux
// W03.P03.S16). No wire: the function is pure logic over served projections, so it
// is driven directly. The correlation is the documented actor-identity heuristic,
// FLOORED on the session start time — no run/turn link is served (see
// ProposalCard.tsx header) — and these cases pin exactly that behaviour: match by
// origin actor OR its delegator, exclude anything from before the session began,
// newest of the survivors wins, empty otherwise.

import { describe, expect, it } from "vitest";

import type { ProposalProjection } from "../../stores/server/authoring";
import { correlateSessionProposal } from "./ProposalCard";

function proposal(overrides: {
  id: string;
  actorId: string;
  delegatedBy?: string;
  createdAtMs: number;
}): ProposalProjection {
  // Only the fields the correlation reads are load-bearing; the rest are shaped to
  // the served contract so the cast is honest rather than a fabricated wire body.
  return {
    changeset_id: overrides.id,
    changeset_revision: `rev:${overrides.id}`,
    kind: "authoring",
    status: "needs_review",
    summary: "",
    actor: { id: overrides.actorId, kind: "agent" },
    origin_actor: {
      id: overrides.actorId,
      kind: "agent",
      ...(overrides.delegatedBy ? { delegated_by: overrides.delegatedBy } : {}),
    },
    operation_count: 1,
    validation: { present: false, approval_ready: false },
    approval: { present: false, stale: false },
    eligibility: [],
    rollback: { available: false },
    created_at_ms: overrides.createdAtMs,
  } as ProposalProjection;
}

describe("correlateSessionProposal", () => {
  const sessionActor = "agent:panel-writer";
  const sessionStart = 1_000;

  it("returns null for an empty actor or an empty queue", () => {
    expect(correlateSessionProposal([], sessionActor, sessionStart)).toBeNull();
    expect(
      correlateSessionProposal(
        [proposal({ id: "c1", actorId: sessionActor, createdAtMs: 1_010 })],
        "",
        sessionStart,
      ),
    ).toBeNull();
  });

  it("matches the session principal as the proposal's origin actor", () => {
    const mine = proposal({ id: "mine", actorId: sessionActor, createdAtMs: 1_010 });
    const other = proposal({
      id: "other",
      actorId: "agent:someone-else",
      createdAtMs: 1_099,
    });
    expect(
      correlateSessionProposal([other, mine], sessionActor, sessionStart)?.changeset_id,
    ).toBe("mine");
  });

  it("matches the session principal as the proposal's delegator (a2a delegated agent)", () => {
    const delegated = proposal({
      id: "delegated",
      actorId: "agent:sub-writer",
      delegatedBy: sessionActor,
      createdAtMs: 1_005,
    });
    expect(
      correlateSessionProposal([delegated], sessionActor, sessionStart)?.changeset_id,
    ).toBe("delegated");
  });

  it("picks the newest matching proposal by served creation time", () => {
    const older = proposal({ id: "older", actorId: sessionActor, createdAtMs: 1_100 });
    const newer = proposal({ id: "newer", actorId: sessionActor, createdAtMs: 1_200 });
    expect(
      correlateSessionProposal([older, newer], sessionActor, sessionStart)
        ?.changeset_id,
    ).toBe("newer");
    expect(
      correlateSessionProposal([newer, older], sessionActor, sessionStart)
        ?.changeset_id,
    ).toBe("newer");
  });

  it("excludes a same-actor proposal created before the session began", () => {
    // The stale-earlier-session bleed: a proposal by the same ambient operator but
    // created before THIS session started is floored out; only the in-session one
    // binds. (The same-millisecond-two-sessions case is the acknowledged residual.)
    const stale = proposal({
      id: "stale",
      actorId: sessionActor,
      createdAtMs: sessionStart - 1,
    });
    const fresh = proposal({
      id: "fresh",
      actorId: sessionActor,
      createdAtMs: sessionStart + 5,
    });
    expect(correlateSessionProposal([stale], sessionActor, sessionStart)).toBeNull();
    expect(
      correlateSessionProposal([stale, fresh], sessionActor, sessionStart)
        ?.changeset_id,
    ).toBe("fresh");
  });

  it("returns null when no proposal is authored by the session principal", () => {
    const foreign = proposal({
      id: "foreign",
      actorId: "agent:elsewhere",
      createdAtMs: 1_003,
    });
    expect(correlateSessionProposal([foreign], sessionActor, sessionStart)).toBeNull();
  });
});
