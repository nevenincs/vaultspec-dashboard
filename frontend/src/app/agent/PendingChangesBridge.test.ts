// Pure unit coverage for the pending-changes bridge derivation (review-surface-flow
// ADR F1). No wire: the function is pure logic over served projections + the current
// session's run ids, so it is driven directly. Only the fields the derivation reads
// are load-bearing; the rest are shaped to the served contract so the cast is honest.

import { describe, expect, it } from "vitest";

import type {
  AppliedUnderPolicyProjection,
  ProposalProjection,
} from "../../stores/server/authoring";
import { derivePendingChangesBridge } from "./PendingChangesBridge";

function proposal(overrides: { id: string; runId?: string }): ProposalProjection {
  return {
    changeset_id: overrides.id,
    changeset_revision: `rev:${overrides.id}`,
    kind: "authoring",
    status: "needs_review",
    summary: "",
    actor: { id: "agent:writer", kind: "agent" },
    origin_actor: { id: "agent:writer", kind: "agent" },
    operation_count: 1,
    validation: { present: false, approval_ready: false },
    approval: { present: false, stale: false },
    eligibility: [],
    rollback: { available: false },
    created_at_ms: 1_000,
    ...(overrides.runId ? { run_id: overrides.runId } : {}),
  } as ProposalProjection;
}

function afterFact(overrides: {
  id: string;
  acks: number;
}): AppliedUnderPolicyProjection {
  return {
    proposal: proposal({ id: overrides.id }),
    applied_at_ms: 2_000,
    acknowledgement_count: overrides.acks,
  } as AppliedUnderPolicyProjection;
}

const NONE = new Set<string>();

describe("derivePendingChangesBridge", () => {
  it("renders nothing for an empty queue", () => {
    expect(
      derivePendingChangesBridge({
        rows: [],
        afterFactRows: [],
        truncated: false,
        afterFactTruncated: false,
        currentSessionRunIds: NONE,
      }),
    ).toEqual({ present: false, count: 0 });
  });

  it("counts out-of-session rows and excludes rows bound to the current session's runs", () => {
    const result = derivePendingChangesBridge({
      rows: [
        proposal({ id: "mine", runId: "run:1" }), // in-session -> inline, excluded
        proposal({ id: "other-session", runId: "run:9" }), // other session -> counted
        proposal({ id: "no-run" }), // non-agent changeset -> counted
      ],
      afterFactRows: [],
      truncated: false,
      afterFactTruncated: false,
      currentSessionRunIds: new Set(["run:1"]),
    });
    expect(result).toEqual({ present: true, count: 2 });
  });

  it("counts only UNACKNOWLEDGED after-the-fact rows", () => {
    const result = derivePendingChangesBridge({
      rows: [],
      afterFactRows: [
        afterFact({ id: "unseen", acks: 0 }), // counted
        afterFact({ id: "seen", acks: 3 }), // acknowledged -> excluded
      ],
      truncated: false,
      afterFactTruncated: false,
      currentSessionRunIds: NONE,
    });
    expect(result).toEqual({ present: true, count: 1 });
  });

  it("sums out-of-session rows and unacknowledged after-fact rows", () => {
    const result = derivePendingChangesBridge({
      rows: [proposal({ id: "a", runId: "run:9" }), proposal({ id: "b" })],
      afterFactRows: [afterFact({ id: "c", acks: 0 })],
      truncated: false,
      afterFactTruncated: false,
      currentSessionRunIds: new Set(["run:1"]),
    });
    expect(result).toEqual({ present: true, count: 3 });
  });

  it("drops the numeral (count-less) when the queue is truncated", () => {
    expect(
      derivePendingChangesBridge({
        rows: [proposal({ id: "a", runId: "run:9" })],
        afterFactRows: [],
        truncated: true,
        afterFactTruncated: false,
        currentSessionRunIds: NONE,
      }),
    ).toEqual({ present: true, count: null });
  });

  it("drops the numeral when only the after-the-fact lane is truncated", () => {
    expect(
      derivePendingChangesBridge({
        rows: [],
        afterFactRows: [afterFact({ id: "c", acks: 0 })],
        truncated: false,
        afterFactTruncated: true,
        currentSessionRunIds: NONE,
      }),
    ).toEqual({ present: true, count: null });
  });

  it("renders nothing when every served row is in-session, even if truncated", () => {
    // Truncation only degrades the count of rows we CAN see; it never fabricates a
    // bridge when the served slice holds nothing out-of-session.
    expect(
      derivePendingChangesBridge({
        rows: [proposal({ id: "mine", runId: "run:1" })],
        afterFactRows: [afterFact({ id: "seen", acks: 2 })],
        truncated: true,
        afterFactTruncated: true,
        currentSessionRunIds: new Set(["run:1"]),
      }),
    ).toEqual({ present: false, count: 0 });
  });
});
