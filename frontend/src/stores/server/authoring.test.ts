// Authoring store adapter + outcome-interpretation unit tests (W03.P40 CHUNK A).
//
// These exercise the PURE adapters/interpreters over literal wire shapes captured
// from the served envelope grammar — NOT a mocked engine wire (the live-wire
// contract is exercised separately in the online suite). The properties under
// test are the contract seams the review station rides: denials-are-values
// discrimination, backend-served eligibility passthrough, tolerant flooring of a
// sparse projection, and degradation read from the `tiers` block + the typed
// store-unavailable error envelope.

import { describe, expect, it } from "vitest";

import { EngineError, type TiersBlock } from "./engine";
import {
  AUTHORING_STORE_UNAVAILABLE_KIND,
  adaptProposalDetail,
  adaptProposalList,
  adaptProposalProjection,
  adaptProposalSnapshot,
  interpretCommandOutcome,
  newIdempotencyKey,
  readAuthoringDegradation,
} from "./authoring";

const availableTiers: TiersBlock = {
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic: { available: true },
};

/** A served NeedsReview projection carrying backend-owned approve/reject
 *  eligibility, exactly as `/authoring/v1/proposals` serves each item. */
function needsReviewProjectionWire() {
  return {
    changeset_id: "changeset_1",
    changeset_revision: "proposal:rev2",
    kind: "authoring",
    status: "needs_review",
    summary: "Rewrite the ADR introduction",
    actor: { id: "agent:writer", kind: "agent" },
    origin_actor: { id: "agent:writer", kind: "agent" },
    operation_count: 1,
    validation: {
      present: true,
      status: "valid",
      approval_ready: true,
      validation_digest: "validation:v1",
    },
    approval: { present: true, queue_state: "queued", stale: false },
    eligibility: [
      { command: "approve", allowed: true },
      {
        command: "reject",
        allowed: true,
      },
    ],
    rollback: { available: false, reason: "changeset is not applied" },
    created_at_ms: 1_775_000_000_000,
  };
}

describe("adaptProposalProjection", () => {
  it("consumes the served projection shape and passes through backend-served eligibility", () => {
    const projection = adaptProposalProjection(needsReviewProjectionWire());

    expect(projection.status).toBe("needs_review");
    expect(projection.summary).toBe("Rewrite the ADR introduction");
    expect(projection.actor).toEqual({ id: "agent:writer", kind: "agent" });
    // Eligibility is served, backend-owned — the store never re-derives it.
    expect(projection.eligibility).toEqual([
      { command: "approve", allowed: true, reason: undefined },
      { command: "reject", allowed: true, reason: undefined },
    ]);
    expect(projection.validation.approval_ready).toBe(true);
    expect(projection.rollback.available).toBe(false);
  });

  it("floors a sparse projection so a missing nested block never crashes the row", () => {
    const projection = adaptProposalProjection({
      changeset_id: "changeset_2",
      status: "draft",
    });

    expect(projection.changeset_id).toBe("changeset_2");
    expect(projection.status).toBe("draft");
    expect(projection.summary).toBe("");
    expect(projection.eligibility).toEqual([]);
    expect(projection.validation.present).toBe(false);
    expect(projection.approval.present).toBe(false);
    expect(projection.conflict).toBeUndefined();
    expect(projection.rollback.available).toBe(false);
  });

  it("surfaces a served target-fence conflict as a rendered value", () => {
    const projection = adaptProposalProjection({
      ...needsReviewProjectionWire(),
      conflict: {
        child_key: "child_1",
        reason: "target document changed since review",
        reviewed_base_revision: "blob:aaa",
        current_revision: "blob:bbb",
      },
      eligibility: [
        {
          command: "approve",
          allowed: false,
          reason: "target revisions are no longer current",
        },
        {
          command: "reject",
          allowed: false,
          reason: "target revisions are no longer current",
        },
      ],
    });

    expect(projection.conflict?.child_key).toBe("child_1");
    // A denied review decision keeps its backend-authored reason for the UI.
    expect(projection.eligibility.every((entry) => !entry.allowed)).toBe(true);
    expect(projection.eligibility[0].reason).toContain("target revisions");
  });
});

describe("adaptProposalList", () => {
  it("adapts the bounded page and preserves the honest truncation flag", () => {
    const list = adaptProposalList({
      items: [needsReviewProjectionWire()],
      truncated: true,
      cap: 200,
      tiers: availableTiers,
    });

    expect(list.items).toHaveLength(1);
    expect(list.items[0].changeset_id).toBe("changeset_1");
    expect(list.truncated).toBe(true);
    expect(list.cap).toBe(200);
    expect(list.tiers).toBe(availableTiers);
  });

  it("tolerates an empty/absent body", () => {
    const list = adaptProposalList(undefined);
    expect(list.items).toEqual([]);
    expect(list.truncated).toBe(false);
    expect(list.tiers).toEqual({});
  });
});

describe("adaptProposalDetail", () => {
  it("reads the nested projection plus the per-operation base+proposed diff texts", () => {
    const detail = adaptProposalDetail({
      proposal: needsReviewProjectionWire(),
      review_documents: [
        {
          child_key: "child_1",
          document: { kind: "existing", stem: "alpha-research" },
          base: {
            text: "original body\n",
            truncated: false,
            total_bytes: 14,
            returned_bytes: 14,
          },
          proposed: {
            text: "original body\n\nnew paragraph\n",
            truncated: false,
            total_bytes: 29,
            returned_bytes: 29,
          },
        },
      ],
      tiers: availableTiers,
    });

    expect(detail.proposal.changeset_id).toBe("changeset_1");
    // The identity fields the queue-driven decision needs are read through.
    expect(detail.proposal.approval).toBeTruthy();
    expect(detail.review_documents).toHaveLength(1);
    expect(detail.review_documents[0].base.text).toBe("original body\n");
    expect(detail.review_documents[0].proposed.text).toContain("new paragraph");
    expect(detail.tiers).toBe(availableTiers);
  });

  it("tolerates a detail with no review documents", () => {
    const detail = adaptProposalDetail({ proposal: needsReviewProjectionWire() });
    expect(detail.review_documents).toEqual([]);
    expect(detail.proposal.status).toBe("needs_review");
  });

  it("reads served approval identity through the projection (queue-driven decision)", () => {
    const detail = adaptProposalDetail({
      proposal: {
        ...needsReviewProjectionWire(),
        approval: {
          present: true,
          queue_state: "queued",
          stale: false,
          approval_id: "approval:abc",
          proposal_id: "proposal:abc",
          reviewed_proposal_revision: "proposal:rev2",
        },
      },
    });
    expect(detail.proposal.approval.approval_id).toBe("approval:abc");
    expect(detail.proposal.approval.proposal_id).toBe("proposal:abc");
    expect(detail.proposal.approval.reviewed_proposal_revision).toBe("proposal:rev2");
  });
});

describe("adaptProposalSnapshot", () => {
  it("floors history + latest so a thin snapshot is safe to render", () => {
    const snapshot = adaptProposalSnapshot({
      changeset_id: "changeset_1",
      history: [{ status: "draft" }, { status: "needs_review" }],
      latest: { status: "needs_review" },
      latest_validation: null,
      tiers: availableTiers,
    });

    expect(snapshot.changeset_id).toBe("changeset_1");
    expect(snapshot.history).toHaveLength(2);
    expect(snapshot.latest).toEqual({ status: "needs_review" });
    expect(snapshot.latest_validation).toBeNull();
  });

  it("lifts the revisions out of the served ChangesetHistory wrapper", () => {
    // The wire serves `history` as the domain `{revisions:[...]}` wrapper — the
    // adapter unwraps it so the full lifecycle sequence is readable.
    const snapshot = adaptProposalSnapshot({
      changeset_id: "changeset_1",
      history: {
        revisions: [
          { status: "draft" },
          { status: "needs_review" },
          { status: "approved" },
          { status: "applying" },
          { status: "applied" },
        ],
      },
      latest: { status: "applied" },
      latest_validation: null,
      tiers: availableTiers,
    });

    expect(snapshot.history).toHaveLength(5);
    expect((snapshot.history[4] as { status?: string }).status).toBe("applied");
  });
});

describe("interpretCommandOutcome (denials are values)", () => {
  it("maps a denial VALUE to a denied outcome, never a fault", () => {
    const outcome = interpretCommandOutcome({
      status: "denied",
      command: "approve",
      allowed: false,
      reason: "an agent may not approve its own proposal",
      tiers: availableTiers,
    });

    expect(outcome.kind).toBe("denied");
    if (outcome.kind === "denied") {
      expect(outcome.command).toBe("approve");
      expect(outcome.reason).toContain("may not approve");
    }
  });

  it("maps a rollback-unavailable value to an unavailable outcome with its repair hook", () => {
    const outcome = interpretCommandOutcome({
      status: "unavailable",
      command: "create_rollback",
      reason: "no preimage is available for the applied child",
      manual_repair: { hint: "restore from history" },
      tiers: availableTiers,
    });

    expect(outcome.kind).toBe("unavailable");
    if (outcome.kind === "unavailable") {
      expect(outcome.reason).toContain("no preimage");
      expect(outcome.manual_repair).toEqual({ hint: "restore from history" });
    }
  });

  it("maps a still-in-flight prior attempt to an in_flight outcome (202)", () => {
    const outcome = interpretCommandOutcome({
      status: "in_flight",
      tiers: availableTiers,
    });
    expect(outcome.kind).toBe("in_flight");
  });

  it("maps an accepted decision to an ok outcome carrying its data verbatim", () => {
    const outcome = interpretCommandOutcome({
      status: "decided",
      approval: { approval_id: "approval:abc", decision: { decision: "reject" } },
      tiers: availableTiers,
    });

    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") {
      expect(outcome.status).toBe("decided");
      expect(outcome.data.approval).toEqual({
        approval_id: "approval:abc",
        decision: { decision: "reject" },
      });
      // The tiers block is lifted out of `data`, not duplicated into it.
      expect(outcome.data.tiers).toBeUndefined();
    }
  });
});

describe("readAuthoringDegradation", () => {
  it("reports not-degraded when every tier is available", () => {
    const degradation = readAuthoringDegradation({ data: { tiers: availableTiers } });
    expect(degradation.degraded).toBe(false);
    expect(degradation.storeUnavailable).toBe(false);
  });

  it("reads tier degradation from the served block, not a guess", () => {
    const degradation = readAuthoringDegradation({
      data: {
        tiers: {
          ...availableTiers,
          structural: { available: false, reason: "core unreachable" },
        },
      },
    });
    expect(degradation.degraded).toBe(true);
    expect(degradation.degradedTiers).toContain("structural");
    expect(degradation.reasons.structural).toBe("core unreachable");
  });

  it("reads a typed store-unavailable off the error envelope (a fresh error wins)", () => {
    const error = new EngineError("/authoring/v1/proposals", 503, {
      tiers: availableTiers,
      body: { error_kind: AUTHORING_STORE_UNAVAILABLE_KIND },
    });
    const degradation = readAuthoringDegradation({
      data: { tiers: availableTiers },
      error,
    });
    expect(degradation.storeUnavailable).toBe(true);
  });

  it("does not treat a non-store transport fault as store-unavailable", () => {
    const error = new EngineError("/authoring/v1/proposals", 500, {
      body: { error_kind: "authoring_internal_error" },
    });
    const degradation = readAuthoringDegradation({ error });
    expect(degradation.storeUnavailable).toBe(false);
  });
});

describe("newIdempotencyKey", () => {
  it("mints a wire-safe, unique key", () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).not.toBe(b);
    expect(a.startsWith("idem:")).toBe(true);
    // The wire IdempotencyKey grammar allows ascii alnum + _-:./ only.
    expect(a).toMatch(/^[A-Za-z0-9_:./-]+$/);
  });
});
