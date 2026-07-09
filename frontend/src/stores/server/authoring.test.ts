// Authoring store adapter + outcome-interpretation unit tests (W03.P40 CHUNK A).
//
// These exercise the PURE adapters/interpreters over literal wire shapes captured
// from the served envelope grammar — NOT a mocked engine wire (the live-wire
// contract is exercised separately in the online suite). The properties under
// test are the contract seams the review station rides: denials-are-values
// discrimination, backend-served eligibility passthrough, tolerant flooring of a
// sparse projection, and degradation read from the `tiers` block + the typed
// store-unavailable error envelope.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EngineError, type TiersBlock } from "./engine";
import {
  AUTHORING_STORE_UNAVAILABLE_KIND,
  adaptAuthoringRecovery,
  adaptAuthoringStatus,
  adaptAuthoringStreamFrame,
  adaptDirectWriteOutcome,
  adaptProposalDetail,
  adaptProposalList,
  adaptProposalProjection,
  adaptProposalSnapshot,
  advanceAuthoringStreamSeq,
  applyAuthoringRecovery,
  authoringKeys,
  directWriteWirePayload,
  getAuthoringStreamCursor,
  handleAuthoringStreamChunk,
  interpretCommandOutcome,
  lastSeqBefore,
  newIdempotencyKey,
  proposalsQueryOptions,
  readAuthoringDegradation,
  resetAuthoringStreamCursor,
} from "./authoring";
import { queryClient } from "./queryClient";

const availableTiers: TiersBlock = {
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic: { available: true },
};

beforeEach(() => {
  resetAuthoringStreamCursor();
  queryClient.clear();
});

afterEach(() => {
  resetAuthoringStreamCursor();
  queryClient.clear();
});

describe("adaptAuthoringStatus", () => {
  it("consumes the backend-served direct-write capability flag", () => {
    const status = adaptAuthoringStatus({
      feature: "agentic-spec-authoring-backend",
      enabled: true,
      status: "enabled",
      route_family: "authoring",
      ownership: { backend: "vaultspec-api authoring domain" },
      capabilities: {
        proposals: true,
        review: true,
        apply: true,
        rollback: true,
        direct_write: true,
        sessions: false,
        leases: false,
        streams: false,
        langgraph: false,
      },
      tiers: availableTiers,
    });

    expect(status.enabled).toBe(true);
    expect(status.capabilities.direct_write).toBe(true);
    expect(status.capabilities.proposals).toBe(true);
    expect(status.tiers).toBe(availableTiers);
  });

  it("floors a sparse direct-write status to disabled", () => {
    const status = adaptAuthoringStatus({
      capabilities: {},
    });

    expect(status.enabled).toBe(false);
    expect(status.status).toBe("disabled");
    expect(status.capabilities.direct_write).toBe(false);
  });
});

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
    policy: {
      policy_version: "authoring.approval_policy.v1",
      scope_mode: "manual",
      effective_mode: "manual",
      session_override_ignored: false,
      risk: "non_destructive",
      requirement: "human_approval_required",
      reason: "manual mode requires an eligible human approval before apply",
    },
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

function lifecycleWire(seq: number, eventKind = "proposal.updated") {
  return {
    seq,
    event_id: `event:${seq}`,
    aggregate_kind: "proposal",
    aggregate_id: `proposal_${seq}`,
    event_kind: eventKind,
    schema_version: 1,
    actor: { id: "agent:writer", kind: "agent" },
    command: "edit_proposal",
    idempotency_key: `idem:${seq}`,
    payload: {
      event_kind: eventKind,
      status: "needs_review",
      eligibility: [{ command: "approve", allowed: false }],
    },
    payload_hash: `hash:${seq}`,
    created_at_ms: 1_775_000_000_000 + seq,
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
    expect(projection.policy).toEqual({
      policy_version: "authoring.approval_policy.v1",
      scope_mode: "manual",
      session_override: undefined,
      effective_mode: "manual",
      session_override_ignored: false,
      risk: "non_destructive",
      requirement: "human_approval_required",
      reason: "manual mode requires an eligible human approval before apply",
    });
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
    expect(projection.policy).toBeUndefined();
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

  it("preserves a backend-served approval stale reason", () => {
    const projection = adaptProposalProjection({
      ...needsReviewProjectionWire(),
      approval: {
        present: true,
        queue_state: "queued",
        stale: true,
        stale_reason: "policy_version_changed",
      },
    });

    expect(projection.approval.stale).toBe(true);
    expect(projection.approval.stale_reason).toBe("policy_version_changed");
  });
});

describe("adaptProposalList", () => {
  it("adapts the bounded page and preserves the honest truncation flag", () => {
    const list = adaptProposalList({
      items: [needsReviewProjectionWire()],
      truncated: true,
      cap: 200,
      applied_under_policy: {
        items: [
          {
            proposal: {
              ...needsReviewProjectionWire(),
              changeset_id: "changeset_applied",
              status: "applied",
              rollback: { available: true, child_key: "child_1" },
              policy: {
                policy_version: "authoring.approval_policy.v1",
                scope_mode: "autonomous",
                effective_mode: "autonomous",
                session_override_ignored: false,
                risk: "non_destructive",
                requirement: "system_auto_approvable",
                reason: "autonomous mode auto-approves non-destructive changes",
              },
            },
            policy_id: "authoring.operation_modes",
            policy_version: "authoring.operation_modes.v1",
            mode: "autonomous",
            system_actor: { id: "system:operation-modes", kind: "system" },
            applied_at_ms: 1_775_000_000_100,
            acknowledgement_count: 2,
          },
        ],
        truncated: false,
        cap: 200,
      },
      tiers: availableTiers,
    });

    expect(list.items).toHaveLength(1);
    expect(list.items[0].changeset_id).toBe("changeset_1");
    expect(list.truncated).toBe(true);
    expect(list.cap).toBe(200);
    expect(list.applied_under_policy.items).toHaveLength(1);
    expect(list.applied_under_policy.items[0].proposal.changeset_id).toBe(
      "changeset_applied",
    );
    expect(list.applied_under_policy.items[0].mode).toBe("autonomous");
    expect(list.applied_under_policy.items[0].acknowledgement_count).toBe(2);
    expect(list.tiers).toBe(availableTiers);
  });

  it("tolerates an empty/absent body", () => {
    const list = adaptProposalList(undefined);
    expect(list.items).toEqual([]);
    expect(list.applied_under_policy.items).toEqual([]);
    expect(list.truncated).toBe(false);
    expect(list.tiers).toEqual({});
  });
});

describe("authoring lifecycle stream adapters", () => {
  it("adapts lifecycle frames without treating payload fields as proposal projection state", () => {
    const frame = adaptAuthoringStreamFrame({
      channel: "lifecycle",
      data: lifecycleWire(7, "approval.resolved"),
    });

    expect(frame.kind).toBe("lifecycle");
    if (frame.kind === "lifecycle") {
      expect(frame.event.seq).toBe(7);
      expect(frame.event.event_kind).toBe("approval.resolved");
      expect(frame.event.actor).toEqual({ id: "agent:writer", kind: "agent" });
      expect(frame.event.payload).toEqual({
        event_kind: "approval.resolved",
        status: "needs_review",
        eligibility: [{ command: "approve", allowed: false }],
      });
    }
  });

  it("adapts explicit gap and error frames with recovery cursors and tiers", () => {
    const gap = adaptAuthoringStreamFrame({
      channel: "gap",
      data: {
        reason: "cursor_ahead_of_high_water",
        requested_last_seq: 99,
        latest_outbox_seq: 12,
        next_recovery_seq: 13,
      },
    });
    expect(gap).toEqual({
      kind: "gap",
      reason: "cursor_ahead_of_high_water",
      requested_last_seq: 99,
      latest_outbox_seq: 12,
      next_recovery_seq: 13,
    });

    const error = adaptAuthoringStreamFrame({
      channel: "error",
      data: {
        error_kind: AUTHORING_STORE_UNAVAILABLE_KIND,
        error: "store unavailable",
        tiers: availableTiers,
      },
    });
    expect(error).toEqual({
      kind: "error",
      error_kind: AUTHORING_STORE_UNAVAILABLE_KIND,
      error: "store unavailable",
      tiers: availableTiers,
    });
  });

  it("normalizes recovery next_seq into the last_seq resume cursor", () => {
    expect(lastSeqBefore(1)).toBe(0);
    expect(lastSeqBefore(13)).toBe(12);
    expect(lastSeqBefore(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("authoring lifecycle stream cursor", () => {
  it("advances monotonically and ignores duplicate or old lifecycle sequences", async () => {
    await handleAuthoringStreamChunk({
      channel: "lifecycle",
      data: lifecycleWire(2),
    });
    advanceAuthoringStreamSeq(2);
    await handleAuthoringStreamChunk({
      channel: "lifecycle",
      data: lifecycleWire(1),
    });

    const cursor = getAuthoringStreamCursor();
    expect(cursor.streamConnected).toBe(true);
    expect(cursor.lastSeq).toBe(2);
    expect(cursor.retained.map((frame) => frame.data)).toEqual([
      lifecycleWire(2),
      lifecycleWire(1),
    ]);
  });

  it("uses lifecycle events only to invalidate; cached proposal state is not derived from the event payload", async () => {
    const servedList = adaptProposalList({
      items: [needsReviewProjectionWire()],
      truncated: false,
      cap: 200,
      tiers: availableTiers,
    });
    queryClient.setQueryData(authoringKeys.proposals(), servedList);

    await handleAuthoringStreamChunk({
      channel: "lifecycle",
      data: lifecycleWire(3, "proposal.updated"),
    });

    const cached = queryClient.getQueryData(authoringKeys.proposals());
    expect(cached).toBe(servedList);
    expect((cached as typeof servedList).items[0].eligibility).toEqual([
      { command: "approve", allowed: true, reason: undefined },
      { command: "reject", allowed: true, reason: undefined },
    ]);
    expect(getAuthoringStreamCursor().lastSeq).toBe(3);
  });

  it("applies recovery snapshots into the proposal-list cache and resumes from next_seq - 1", () => {
    const recovery = adaptAuthoringRecovery({
      api_version: "v1",
      family: "recovery",
      latest_outbox_seq: 8,
      next_seq: 9,
      requested_last_seq: 2,
      snapshot: {
        proposals: {
          items: [
            {
              ...needsReviewProjectionWire(),
              changeset_id: "changeset_recovered",
              summary: "Recovered from snapshot",
            },
          ],
          truncated: false,
          cap: 200,
          applied_under_policy: { items: [], truncated: false, cap: 200 },
          tiers: availableTiers,
        },
        generation_channels: {
          implemented: false,
          cap: 0,
          authoritative: false,
        },
      },
      tiers: availableTiers,
    });

    applyAuthoringRecovery(recovery);

    const cached = queryClient.getQueryData<ReturnType<typeof adaptProposalList>>(
      authoringKeys.proposals(),
    );
    expect(cached?.items[0].changeset_id).toBe("changeset_recovered");
    expect(cached?.items[0].summary).toBe("Recovered from snapshot");
    expect(getAuthoringStreamCursor().recovering).toBe(false);
    expect(getAuthoringStreamCursor().streamConnected).toBe(true);
    expect(getAuthoringStreamCursor().lastSeq).toBe(8);
  });
});

describe("authoring proposal query options", () => {
  it("does not carry a polling refetch interval", () => {
    const options = proposalsQueryOptions() as Record<string, unknown>;
    expect(options.refetchInterval).toBeUndefined();
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

describe("adaptDirectWriteOutcome (ledgered-edit-migration W01.P02)", () => {
  it("reads a terminal applied outcome, including the observed post-state blob hash", () => {
    const outcome = adaptDirectWriteOutcome({
      status: "applied",
      replayed: false,
      changeset_id: "changeset_1",
      apply_receipt: {
        child: { observed_result_blob_hash: "new-hash" },
      },
      record: { document_path: ".vault/adr/x.md" },
      tiers: availableTiers,
    });

    expect(outcome.kind).toBe("applied");
    if (outcome.kind === "applied") {
      expect(outcome.changesetId).toBe("changeset_1");
      expect(outcome.blobHash).toBe("new-hash");
      expect(outcome.documentPath).toBe(".vault/adr/x.md");
      expect(outcome.replayed).toBe(false);
      // A ReplaceBody/EditFrontmatter/Rename apply never echoes a create
      // identity — `resultNodeId`/`resultStem` stay undefined.
      expect(outcome.resultNodeId).toBeUndefined();
      expect(outcome.resultStem).toBeUndefined();
    }
  });

  it("reads the echoed create-document identity off a landed create's apply receipt (W03.P09a)", () => {
    const outcome = adaptDirectWriteOutcome({
      status: "applied",
      replayed: false,
      changeset_id: "changeset_create",
      apply_receipt: {
        child: {
          document_path: ".vault/research/2026-07-09-alpha-research.md",
          result_node_id: "doc:2026-07-09-alpha-research",
          result_stem: "2026-07-09-alpha-research",
        },
      },
      tiers: availableTiers,
    });

    expect(outcome.kind).toBe("applied");
    if (outcome.kind === "applied") {
      // The apply receipt's `document_path` (populated for a landed create)
      // is preferred over the top-level record's (which stays empty for
      // create, per direct_write.rs's own `existing_target`-only derivation).
      expect(outcome.documentPath).toBe(".vault/research/2026-07-09-alpha-research.md");
      expect(outcome.resultNodeId).toBe("doc:2026-07-09-alpha-research");
      expect(outcome.resultStem).toBe("2026-07-09-alpha-research");
    }
  });

  it("reads a conflict outcome's 3-way blob-hash shape as a VALUE, never a fault", () => {
    const outcome = adaptDirectWriteOutcome({
      status: "conflict",
      conflict: {
        document_ref: "2026-01-01-alpha-research",
        document_path: ".vault/research/2026-01-01-alpha-research.md",
        expected_blob_hash: "old-hash",
        actual_blob_hash: "drifted-hash",
        target_blob_hash: "would-have-been-hash",
      },
      tiers: availableTiers,
    });

    expect(outcome.kind).toBe("conflict");
    if (outcome.kind === "conflict") {
      expect(outcome.conflict.expected_blob_hash).toBe("old-hash");
      expect(outcome.conflict.actual_blob_hash).toBe("drifted-hash");
      expect(outcome.conflict.target_blob_hash).toBe("would-have-been-hash");
    }
  });

  it("reads a denied outcome's reason off the served eligibility", () => {
    const outcome = adaptDirectWriteOutcome({
      status: "denied",
      eligibility: {
        command: "direct_write",
        allowed: false,
        reason:
          "direct editor saves require a human actor; agents must propose changesets",
      },
      tiers: availableTiers,
    });

    expect(outcome.kind).toBe("denied");
    if (outcome.kind === "denied") {
      expect(outcome.reason).toContain("agents must propose changesets");
    }
  });

  it("reads a failed outcome's redacted diagnostic off the apply receipt's child", () => {
    const outcome = adaptDirectWriteOutcome({
      status: "failed",
      apply_receipt: {
        child: { diagnostic: "core_write_rejected" },
      },
      tiers: availableTiers,
    });

    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.reason).toBe("core_write_rejected");
    }
  });

  it("reads an in-flight outcome as a value with no data to render yet", () => {
    const outcome = adaptDirectWriteOutcome({
      status: "in_flight",
      tiers: availableTiers,
    });
    expect(outcome.kind).toBe("in_flight");
  });

  it("floors a sparse/absent body so a malformed response never crashes the save UX", () => {
    const outcome = adaptDirectWriteOutcome(undefined);
    expect(outcome.kind).toBe("applied");
    if (outcome.kind === "applied") {
      expect(outcome.changesetId).toBe("");
      expect(outcome.blobHash).toBeNull();
      expect(outcome.documentPath).toBeNull();
    }
  });
});

describe("directWriteWirePayload (ledgered-edit-migration W02.P06 generalization)", () => {
  it("marshals `replace_body` sending only ref/body/expected_blob_hash (+ common scope/summary)", () => {
    const wire = directWriteWirePayload({
      operation: "replace_body",
      ref: "2026-01-01-alpha-research",
      body: "the new body",
      expected_blob_hash: "old-hash",
      scope: "Y:/repo",
      summary: "save",
    });

    expect(wire).toEqual({
      operation: "replace_body",
      scope: "Y:/repo",
      summary: "save",
      ref: "2026-01-01-alpha-research",
      body: "the new body",
      expected_blob_hash: "old-hash",
    });
    // No accepted-but-ignored fields from the other kinds leak through.
    expect(wire.frontmatter).toBeUndefined();
    expect(wire.new_stem).toBeUndefined();
    expect(wire.create).toBeUndefined();
  });

  it("marshals `edit_frontmatter` sending only ref/frontmatter/expected_blob_hash — never `body`", () => {
    const wire = directWriteWirePayload({
      operation: "edit_frontmatter",
      ref: "2026-06-12-dashboard-gui-adr",
      frontmatter: { date: "2026-06-18", tags: ["#adr"] },
      expected_blob_hash: "base-h",
      scope: "Y:/repo",
    });

    expect(wire).toEqual({
      operation: "edit_frontmatter",
      scope: "Y:/repo",
      summary: undefined,
      ref: "2026-06-12-dashboard-gui-adr",
      frontmatter: { date: "2026-06-18", tags: ["#adr"] },
      expected_blob_hash: "base-h",
    });
    expect(wire.body).toBeUndefined();
  });

  it("marshals `rename` sending only ref/new_stem/expected_blob_hash", () => {
    const wire = directWriteWirePayload({
      operation: "rename",
      ref: "old-stem",
      new_stem: "new-stem",
      expected_blob_hash: "base-h",
    });

    expect(wire).toEqual({
      operation: "rename",
      scope: undefined,
      summary: undefined,
      ref: "old-stem",
      new_stem: "new-stem",
      expected_blob_hash: "base-h",
    });
    expect(wire.body).toBeUndefined();
    expect(wire.frontmatter).toBeUndefined();
  });

  it("marshals `create_document` sending only `create` — never `ref`/`expected_blob_hash` (the backend refuses either as unexpected)", () => {
    const wire = directWriteWirePayload({
      operation: "create_document",
      create: { doc_type: "research", feature: "alpha", title: "New note" },
    });

    expect(wire).toEqual({
      operation: "create_document",
      scope: undefined,
      summary: undefined,
      create: { doc_type: "research", feature: "alpha", title: "New note" },
    });
    expect(wire.ref).toBeUndefined();
    expect(wire.expected_blob_hash).toBeUndefined();
    expect(wire.body).toBeUndefined();
  });
});
