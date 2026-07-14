// Auto-split from authoring.ts (module-decomposition mandate, 2026-07-14).
// Tolerant adapters (anti-corruption over the served wire) + the lifecycle
// stream-sequence helpers. Domain submodule of the authoring barrel; see ./index.ts.

import type { StreamChunk } from "../queries";
import type {
  ActionEligibility,
  ActorKind,
  ActorRef,
  AppliedUnderPolicyLaneProjection,
  AppliedUnderPolicyProjection,
  ApprovalDecision,
  ApprovalQueueState,
  ApprovalRequirement,
  AuthoringCommandOutcome,
  AuthoringLifecycleEvent,
  AuthoringRecoveryResult,
  AuthoringRecoverySnapshot,
  AuthoringStatus,
  AuthoringStreamFrame,
  BoundedDocumentText,
  ChangesetKind,
  ChangesetStatus,
  DirectWriteOutcome,
  DirectWritePayload,
  OperationMode,
  PolicyDecisionProjection,
  ProposalDetail,
  ProposalListResult,
  ProposalProjection,
  ProposalSnapshotResult,
  RiskClass,
  ValidationStatus,
  Rec,
} from "./wireTypes";
import { isRec, asStr, asBool, asNum, asTiers, asDenialKind } from "./wireTypes";

export const AUTHORING_STREAM_SEQ_MAX = Number.MAX_SAFE_INTEGER;
export const AUTHORING_STREAM_REOPEN_MS = 1_000;
export const AUTHORING_STREAM_RETRY_BASE_MS = 250;
export const AUTHORING_STREAM_RETRY_MAX_MS = 30_000;

export function normalizeAuthoringStreamSeq(seq: unknown): number | null {
  if (typeof seq !== "number" || !Number.isFinite(seq) || seq < 0) return null;
  const normalized = Math.floor(seq);
  return Number.isSafeInteger(normalized) && normalized <= AUTHORING_STREAM_SEQ_MAX
    ? normalized
    : null;
}

export function lastSeqBefore(nextSeq: unknown): number {
  const normalized = normalizeAuthoringStreamSeq(nextSeq);
  if (normalized === null) return 0;
  return Math.max(0, normalized - 1);
}

// --- tolerant adapters (anti-corruption over the served wire) -------------------

function adaptActorRef(raw: unknown): ActorRef {
  if (!isRec(raw)) return { id: "", kind: "system" };
  return {
    id: asStr(raw.id) ?? "",
    kind: (asStr(raw.kind) as ActorKind) ?? "system",
    delegated_by: asStr(raw.delegated_by),
  };
}

function adaptEligibility(raw: unknown): ActionEligibility[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRec).map((entry) => ({
    command: asStr(entry.command) ?? "",
    allowed: asBool(entry.allowed),
    reason: asStr(entry.reason),
  }));
}

function adaptPolicyDecision(raw: unknown): PolicyDecisionProjection | undefined {
  if (!isRec(raw)) return undefined;
  const r = raw;
  return {
    policy_version: asStr(r.policy_version) ?? "",
    scope_mode: asStr(r.scope_mode) as OperationMode,
    session_override: asStr(r.session_override) as OperationMode | undefined,
    effective_mode: asStr(r.effective_mode) as OperationMode,
    session_override_ignored: asBool(r.session_override_ignored),
    risk: asStr(r.risk) as RiskClass,
    requirement: asStr(r.requirement) as ApprovalRequirement,
    reason: asStr(r.reason) ?? "",
  };
}

/** Adapt one served proposal projection, flooring optionals so a sparse wire
 *  shape never crashes the review row. Consumes the served shape unchanged. */
export function adaptProposalProjection(raw: unknown): ProposalProjection {
  const r: Rec = isRec(raw) ? raw : {};
  const validation: Rec = isRec(r.validation) ? r.validation : {};
  const approval: Rec = isRec(r.approval) ? r.approval : {};
  const conflict = isRec(r.conflict) ? r.conflict : undefined;
  const rollback: Rec = isRec(r.rollback) ? r.rollback : {};
  return {
    changeset_id: asStr(r.changeset_id) ?? "",
    changeset_revision: asStr(r.changeset_revision) ?? "",
    kind: (asStr(r.kind) as ChangesetKind) ?? "authoring",
    status: (asStr(r.status) as ChangesetStatus) ?? "draft",
    summary: asStr(r.summary) ?? "",
    actor: adaptActorRef(r.actor),
    origin_actor: adaptActorRef(r.origin_actor),
    operation_count: asNum(r.operation_count),
    validation: {
      present: asBool(validation.present),
      status: asStr(validation.status) as ValidationStatus | undefined,
      approval_ready: asBool(validation.approval_ready),
      validation_digest: asStr(validation.validation_digest),
    },
    approval: {
      present: asBool(approval.present),
      queue_state: asStr(approval.queue_state) as ApprovalQueueState | undefined,
      decision: asStr(approval.decision) as ApprovalDecision | undefined,
      stale: asBool(approval.stale),
      stale_reason: asStr(approval.stale_reason),
      approval_id: asStr(approval.approval_id),
      proposal_id: asStr(approval.proposal_id),
      reviewed_proposal_revision: asStr(approval.reviewed_proposal_revision),
    },
    policy: adaptPolicyDecision(r.policy),
    conflict: conflict
      ? {
          child_key: asStr(conflict.child_key) ?? "",
          reason: asStr(conflict.reason) ?? "",
          reviewed_base_revision: asStr(conflict.reviewed_base_revision),
          current_revision: asStr(conflict.current_revision),
        }
      : undefined,
    eligibility: adaptEligibility(r.eligibility),
    rollback: {
      available: asBool(rollback.available),
      reason: asStr(rollback.reason),
      child_key: asStr(rollback.child_key),
    },
    created_at_ms: asNum(r.created_at_ms),
  };
}

function adaptAppliedUnderPolicy(raw: unknown): AppliedUnderPolicyProjection {
  const r: Rec = isRec(raw) ? raw : {};
  return {
    proposal: adaptProposalProjection(r.proposal),
    policy_id: asStr(r.policy_id) ?? "",
    policy_version: asStr(r.policy_version) ?? "",
    mode: (asStr(r.mode) as OperationMode) ?? "manual",
    system_actor: adaptActorRef(r.system_actor),
    applied_at_ms: asNum(r.applied_at_ms),
    acknowledgement_count: asNum(r.acknowledgement_count),
  };
}

function adaptAppliedUnderPolicyLane(raw: unknown): AppliedUnderPolicyLaneProjection {
  const r: Rec = isRec(raw) ? raw : {};
  const items = Array.isArray(r.items) ? r.items.map(adaptAppliedUnderPolicy) : [];
  return {
    items,
    truncated: asBool(r.truncated),
    cap: asNum(r.cap, items.length),
  };
}

/** Adapt the bounded proposal-list projection. */
export function adaptProposalList(raw: unknown): ProposalListResult {
  const r: Rec = isRec(raw) ? raw : {};
  const items = Array.isArray(r.items) ? r.items.map(adaptProposalProjection) : [];
  return {
    items,
    truncated: asBool(r.truncated),
    cap: asNum(r.cap, items.length),
    applied_under_policy: adaptAppliedUnderPolicyLane(r.applied_under_policy),
    tiers: asTiers(r.tiers),
  };
}

function adaptBoundedText(raw: unknown): BoundedDocumentText {
  const r: Rec = isRec(raw) ? raw : {};
  return {
    text: asStr(r.text) ?? "",
    truncated: asBool(r.truncated),
    total_bytes: asNum(r.total_bytes),
    returned_bytes: asNum(r.returned_bytes),
  };
}

/** Adapt the review DETAIL projection: the nested proposal projection plus the
 *  per-operation base+proposed diff texts. The DETAIL wire nests the projection
 *  under `proposal` (the LIST serves the projection rows flat). */
export function adaptProposalDetail(raw: unknown): ProposalDetail {
  const r: Rec = isRec(raw) ? raw : {};
  const documents = Array.isArray(r.review_documents) ? r.review_documents : [];
  return {
    proposal: adaptProposalProjection(r.proposal),
    review_documents: documents.filter(isRec).map((doc) => ({
      child_key: asStr(doc.child_key) ?? "",
      document: doc.document ?? null,
      base: adaptBoundedText(doc.base),
      proposed: adaptBoundedText(doc.proposed),
    })),
    tiers: asTiers(r.tiers),
  };
}

/** Adapt one proposal's full snapshot (history + latest + latest validation). The
 *  wire `history` is the domain `ChangesetHistory` wrapper `{revisions:[...]}`, so
 *  the revisions list is lifted out (tolerant to a bare array too). */
export function adaptProposalSnapshot(raw: unknown): ProposalSnapshotResult {
  const r: Rec = isRec(raw) ? raw : {};
  // Bare-array first (an array is also `typeof "object"`); else the domain
  // `ChangesetHistory` wrapper `{revisions:[...]}`.
  const revisions = Array.isArray(r.history)
    ? r.history
    : isRec(r.history) && Array.isArray(r.history.revisions)
      ? r.history.revisions
      : [];
  return {
    changeset_id: asStr(r.changeset_id) ?? "",
    history: revisions,
    latest: r.latest ?? null,
    latest_validation: r.latest_validation ?? null,
    tiers: asTiers(r.tiers),
  };
}

export function adaptAuthoringStatus(raw: unknown): AuthoringStatus {
  const r: Rec = isRec(raw) ? raw : {};
  const capabilities: Rec = isRec(r.capabilities) ? r.capabilities : {};
  return {
    feature: asStr(r.feature) ?? "",
    enabled: asBool(r.enabled),
    status: asStr(r.status) ?? "disabled",
    route_family: asStr(r.route_family) ?? "",
    ownership: r.ownership ?? null,
    capabilities: {
      proposals: asBool(capabilities.proposals),
      review: asBool(capabilities.review),
      apply: asBool(capabilities.apply),
      rollback: asBool(capabilities.rollback),
      direct_write: asBool(capabilities.direct_write),
      sessions: asBool(capabilities.sessions),
      leases: asBool(capabilities.leases),
      streams: asBool(capabilities.streams),
      langgraph: asBool(capabilities.langgraph),
    },
    tiers: asTiers(r.tiers),
  };
}

function adaptGenerationChannels(
  raw: unknown,
): AuthoringRecoverySnapshot["generation_channels"] {
  const r: Rec = isRec(raw) ? raw : {};
  return {
    implemented: asBool(r.implemented),
    cap: asNum(r.cap),
    authoritative: asBool(r.authoritative),
  };
}

export function adaptAuthoringRecovery(raw: unknown): AuthoringRecoveryResult {
  const r: Rec = isRec(raw) ? raw : {};
  const snapshot: Rec = isRec(r.snapshot) ? r.snapshot : {};
  return {
    api_version: asStr(r.api_version) ?? "v1",
    family: asStr(r.family) ?? "recovery",
    latest_outbox_seq: asNum(r.latest_outbox_seq),
    next_seq: asNum(r.next_seq, 1),
    requested_last_seq: asNum(r.requested_last_seq),
    snapshot: {
      proposals: adaptProposalList(snapshot.proposals),
      generation_channels: adaptGenerationChannels(snapshot.generation_channels),
    },
    tiers: asTiers(r.tiers),
  };
}

function adaptLifecycleEvent(raw: unknown): AuthoringLifecycleEvent | null {
  if (!isRec(raw)) return null;
  const seq = normalizeAuthoringStreamSeq(raw.seq);
  if (seq === null) return null;
  return {
    seq,
    event_id: asStr(raw.event_id) ?? "",
    aggregate_kind: asStr(raw.aggregate_kind) ?? "",
    aggregate_id: asStr(raw.aggregate_id) ?? "",
    event_kind: asStr(raw.event_kind) ?? "",
    schema_version: asNum(raw.schema_version),
    actor: adaptActorRef(raw.actor),
    command: asStr(raw.command),
    idempotency_key: asStr(raw.idempotency_key),
    payload: raw.payload ?? null,
    payload_hash: asStr(raw.payload_hash) ?? "",
    created_at_ms: asNum(raw.created_at_ms),
  };
}

export function adaptAuthoringStreamFrame(frame: StreamChunk): AuthoringStreamFrame {
  if (frame.channel === "lifecycle") {
    const event = adaptLifecycleEvent(frame.data);
    return event
      ? { kind: "lifecycle", event }
      : { kind: "ignored", channel: frame.channel };
  }
  if (frame.channel === "gap") {
    const r: Rec = isRec(frame.data) ? frame.data : {};
    return {
      kind: "gap",
      reason: asStr(r.reason) ?? "unknown_gap",
      requested_last_seq: normalizeAuthoringStreamSeq(r.requested_last_seq),
      latest_outbox_seq: normalizeAuthoringStreamSeq(r.latest_outbox_seq),
      next_recovery_seq: normalizeAuthoringStreamSeq(r.next_recovery_seq),
    };
  }
  if (frame.channel === "error") {
    const r: Rec = isRec(frame.data) ? frame.data : {};
    return {
      kind: "error",
      error_kind: asStr(r.error_kind) ?? "authoring_stream_error",
      error: asStr(r.error) ?? "authoring stream error",
      tiers: asTiers(r.tiers),
    };
  }
  return { kind: "ignored", channel: frame.channel };
}

/**
 * Interpret a command's flat unwrapped body into an `AuthoringCommandOutcome`.
 * The discriminator is the served `status` value — a denial (`denied`) and a
 * rollback-unavailable (`unavailable`) ride the SUCCESS envelope as VALUES
 * (denials-are-values ADR), never faults; everything else is an accepted/replayed
 * success carrying its data verbatim.
 */
export function interpretCommandOutcome(raw: unknown): AuthoringCommandOutcome {
  const r: Rec = isRec(raw) ? raw : {};
  const tiers = asTiers(r.tiers);
  const status = asStr(r.status);
  if (status === "denied") {
    return {
      kind: "denied",
      command: asStr(r.command) ?? "",
      reason: asStr(r.reason) ?? null,
      tiers,
    };
  }
  if (status === "unavailable") {
    return {
      kind: "unavailable",
      command: asStr(r.command) ?? "",
      reason: asStr(r.reason) ?? null,
      manual_repair: r.manual_repair ?? null,
      tiers,
    };
  }
  if (status === "in_flight") {
    return { kind: "in_flight", tiers };
  }
  const { tiers: _tiers, ...data } = r;
  return { kind: "ok", status: status ?? "ok", data, tiers };
}

/**
 * Interpret a direct-write command's flat unwrapped body into a
 * `DirectWriteOutcome`. The status vocabulary is the direct-write route's own
 * (`applied|failed|in_flight|conflict|denied`), distinct from the generic
 * command outcome's — `conflict` and `denied` ride the SUCCESS envelope as
 * VALUES (denials-are-values), never faults.
 */
export function adaptDirectWriteOutcome(raw: unknown): DirectWriteOutcome {
  const r: Rec = isRec(raw) ? raw : {};
  const tiers = asTiers(r.tiers);
  const status = asStr(r.status);
  if (status === "in_flight") return { kind: "in_flight", tiers };
  if (status === "conflict") {
    const c: Rec = isRec(r.conflict) ? r.conflict : {};
    return {
      kind: "conflict",
      conflict: {
        document_ref: asStr(c.document_ref) ?? "",
        document_path: asStr(c.document_path) ?? "",
        expected_blob_hash: asStr(c.expected_blob_hash) ?? "",
        actual_blob_hash: asStr(c.actual_blob_hash) ?? "",
        target_blob_hash: asStr(c.target_blob_hash) ?? "",
      },
      tiers,
    };
  }
  if (status === "denied") {
    const eligibility: Rec = isRec(r.eligibility) ? r.eligibility : {};
    return {
      kind: "denied",
      reason: asStr(eligibility.reason) ?? null,
      denialKind: asDenialKind(r.denial_kind),
      tiers,
    };
  }
  if (status === "failed") {
    const receipt: Rec = isRec(r.apply_receipt) ? r.apply_receipt : {};
    const child: Rec = isRec(receipt.child) ? receipt.child : {};
    return { kind: "failed", reason: asStr(child.diagnostic) ?? null, tiers };
  }
  // "applied" — the terminal accepted save.
  const record: Rec = isRec(r.record) ? r.record : {};
  const receipt: Rec = isRec(r.apply_receipt) ? r.apply_receipt : {};
  const child: Rec = isRec(receipt.child) ? receipt.child : {};
  return {
    kind: "applied",
    changesetId: asStr(r.changeset_id) ?? "",
    // `child.document_path` is the apply receipt's resolved path — populated
    // for EVERY kind including `create_document` (W03.P09a, re-resolved from
    // the created document's real identity); `record.document_path` stays the
    // fallback for a sparser response.
    documentPath: asStr(child.document_path) ?? asStr(record.document_path) ?? null,
    blobHash: asStr(child.observed_result_blob_hash) ?? null,
    resultNodeId: asStr(child.result_node_id),
    resultStem: asStr(child.result_stem),
    replayed: asBool(r.replayed),
    tiers,
  };
}

/**
 * Marshal a `DirectWritePayload` onto the wire `DirectWriteRequest` shape —
 * `operation` + ONLY the fields that kind uses (never an accepted-but-ignored
 * field: the backend refuses a mismatched combination at validation, so
 * sending, say, `frontmatter` on a `replace_body` request would be a live
 * fault, not a harmless no-op). `scope` (the optional scope pin) and
 * `summary` are common to every kind.
 */
export function directWriteWirePayload(payload: DirectWritePayload): Rec {
  const common: Rec = {
    operation: payload.operation,
    scope: payload.scope ?? undefined,
    summary: payload.summary,
  };
  switch (payload.operation) {
    case "replace_body":
      return {
        ...common,
        ref: payload.ref,
        body: payload.body,
        expected_blob_hash: payload.expected_blob_hash,
      };
    case "edit_frontmatter":
      return {
        ...common,
        ref: payload.ref,
        frontmatter: payload.frontmatter,
        expected_blob_hash: payload.expected_blob_hash,
      };
    case "rename":
      return {
        ...common,
        ref: payload.ref,
        new_stem: payload.new_stem,
        expected_blob_hash: payload.expected_blob_hash,
      };
    case "create_document":
      return { ...common, create: payload.create };
    case "set_plan_step_state":
      return {
        ...common,
        ref: payload.ref,
        plan_step: {
          step_id: payload.planStep.stepId,
          state: payload.planStep.state,
        },
        expected_blob_hash: payload.expected_blob_hash,
      };
    default: {
      const exhaustive: never = payload;
      return exhaustive;
    }
  }
}
