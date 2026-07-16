// Auto-split from authoring.ts (module-decomposition mandate, 2026-07-14).
// The served wire vocabulary — projection shapes, command payloads, and command
// outcomes — as pure types. Domain submodule of the authoring barrel; see ./index.ts.

import type { TiersBlock } from "../engine";

// --- served vocabulary (snake_case as the wire carries it) ----------------------

/** The V1 changeset lifecycle status (engine `ChangesetStatus`). */
export type ChangesetStatus =
  | "draft"
  | "generating"
  | "proposed"
  | "needs_review"
  | "approved"
  | "applying"
  | "applied"
  | "partially_applied"
  | "compensation_required"
  | "rejected"
  | "conflicted"
  | "superseded"
  | "failed"
  | "rollback_proposed"
  | "cancelled";

/** Whether the changeset is an authoring proposal or a generated rollback. */
export type ChangesetKind = "authoring" | "rollback";

/** The actor kind (engine `ActorKind`) — human/agent/system/tool_executor. */
export type ActorKind = "human" | "agent" | "system" | "tool_executor";

/** A resolved actor reference (engine `ActorRef`). */
export interface ActorRef {
  id: string;
  kind: ActorKind;
  delegated_by?: string;
}

/** Operation-mode policy vocabulary served by the backend. */
export type OperationMode = "manual" | "assisted" | "autonomous";

/** Changeset risk class served by the approval policy matrix. */
export type RiskClass = "non_destructive" | "destructive";

/** What approval the backend policy requires for the projected changeset. */
export type ApprovalRequirement = "human_approval_required" | "system_auto_approvable";

/** The V1 approval queue state (agentic-review-station-state ADR, ASA-003:
 *  FOUR states collapsed to the single-reviewer reality). */
export type ApprovalQueueState = "queued" | "decision_submitted" | "closed";

/** A recorded review decision (engine `ApprovalDecision`). */
export type ApprovalDecision = "approve" | "reject" | "request_changes";

/** The validation status (engine `ValidationStatus`). */
export type ValidationStatus = "valid" | "valid_with_warnings" | "invalid" | "stale";

/** A backend-served action eligibility (engine `ActionEligibility`): the UI
 *  renders `allowed` + `reason` DIRECTLY — it never re-derives eligibility. */
export interface ActionEligibility {
  /** The command this eligibility governs (snake_case `CommandKind`). */
  command: string;
  allowed: boolean;
  reason?: string;
}

/** The backend-owned approval-policy decision for one changeset. The client
 *  renders these fields directly; it never re-derives mode, risk, requirement, or
 *  reason from status/operation fields. */
export interface PolicyDecisionProjection {
  policy_version: string;
  scope_mode: OperationMode;
  session_override?: OperationMode;
  effective_mode: OperationMode;
  session_override_ignored: boolean;
  risk: RiskClass;
  requirement: ApprovalRequirement;
  reason: string;
}

/** The validation state a reviewer sees for a proposal. */
export interface ValidationStateProjection {
  present: boolean;
  status?: ValidationStatus;
  approval_ready: boolean;
  validation_digest?: string;
}

/** The approval state a reviewer sees for a proposal. `approval_id` /
 *  `proposal_id` / `reviewed_proposal_revision` are the identity a reviewer needs
 *  to drive a decision or apply FROM THE QUEUE (they never held the submit
 *  response that echoed them). They are OPTIONAL because a projection that
 *  predates the identity addition omits them — the decision/apply affordances
 *  render only once the served projection carries the identity (no
 *  frontend re-derivation of the backend-hashed ids; stable-keys/provenance). */
export interface ApprovalStateProjection {
  present: boolean;
  queue_state?: ApprovalQueueState;
  decision?: ApprovalDecision;
  stale: boolean;
  stale_reason?: string;
  /** The opened approval's id — required to drive a review decision. */
  approval_id?: string;
  /** The 1:1 proposal id — required to drive a review decision. */
  proposal_id?: string;
  /** The exact proposal revision the approval was opened against — the reviewer
   *  attests to this (a mismatch is a stale-review 409). Falls back to the
   *  changeset revision for a NeedsReview item when absent. */
  reviewed_proposal_revision?: string;
}

/** A target-document conflict: a child's reviewed base no longer matches the
 *  current worktree revision (an out-of-band edit since review). */
export interface ConflictProjection {
  child_key: string;
  reason: string;
  reviewed_base_revision?: string;
  current_revision?: string;
}

/** Whether an applied changeset can be rolled back, with an honest reason. */
export interface RollbackAvailabilityProjection {
  available: boolean;
  reason?: string;
  child_key?: string;
}

/** The backend-served review projection for one changeset (engine
 *  `ProposalProjection`): its lifecycle state plus every derived, frontend-
 *  visible value — validation, approval, conflict, action eligibility, rollback.
 *  The store consumes this shape unchanged. */
export interface ProposalProjection {
  changeset_id: string;
  changeset_revision: string;
  kind: ChangesetKind;
  status: ChangesetStatus;
  summary: string;
  actor: ActorRef;
  origin_actor: ActorRef;
  operation_count: number;
  validation: ValidationStateProjection;
  approval: ApprovalStateProjection;
  /** The backend-served policy decision for this changeset. Omitted only by
   *  sparse/non-current wires; consumers must not synthesize policy locally. */
  policy?: PolicyDecisionProjection;
  conflict?: ConflictProjection;
  /** The served action eligibility for the current status — rendered directly. */
  eligibility: ActionEligibility[];
  rollback: RollbackAvailabilityProjection;
  created_at_ms: number;
}

/** A changeset that has already applied under recorded mode-policy authority.
 *  The nested proposal remains the normal backend-served projection, so rollback
 *  and eligibility stay on the same command surface as the review queue. */
export interface AppliedUnderPolicyProjection {
  proposal: ProposalProjection;
  policy_id: string;
  policy_version: string;
  mode: OperationMode;
  system_actor: ActorRef;
  applied_at_ms: number;
  acknowledgement_count: number;
}

/** The after-the-fact review lane served by the backend. */
export interface AppliedUnderPolicyLaneProjection {
  items: AppliedUnderPolicyProjection[];
  truncated: boolean;
  cap: number;
}

/** The bounded review-queue page (engine `ProposalListProjection`). `truncated`
 *  is honest: the UI shows a "more exist" affordance, never a silent clip. */
export interface ProposalListResult {
  items: ProposalProjection[];
  truncated: boolean;
  cap: number;
  applied_under_policy: AppliedUnderPolicyLaneProjection;
  tiers: TiersBlock;
}

/** A bounded whole-document text (engine `BoundedDocumentText`): the served body
 *  for one side of the review diff, with an honest byte-cap marker. */
export interface BoundedDocumentText {
  text: string;
  truncated: boolean;
  total_bytes: number;
  returned_bytes: number;
}

/** The base + proposed whole-document texts for ONE replace-body operation
 *  (engine `ReviewDocumentProjection`), served ONLY on the review DETAIL
 *  projection. NO server-side diff — the two bounded texts are the backend's whole
 *  obligation; hunking is client-rendered presentation (a diff is a derived review
 *  artifact, never authority). */
export interface ReviewDocumentProjection {
  child_key: string;
  document: unknown;
  /** The current worktree body (the diff's "before"). */
  base: BoundedDocumentText;
  /** The proposed new body (the diff's "after"). */
  proposed: BoundedDocumentText;
}

/** One changeset's review DETAIL (engine `ProposalDetailProjection`): the proposal
 *  projection plus the per-operation base+proposed texts the review diff renders
 *  over. The DETAIL route carries bodies; the bounded LIST never does. */
export interface ProposalDetail {
  proposal: ProposalProjection;
  review_documents: ReviewDocumentProjection[];
  tiers: TiersBlock;
}

/** One changeset's full revision history + latest aggregate + latest validation
 *  (the lower-level read behind the review projection). Shapes are served
 *  domain records; kept loose here (the thin UI reads only identity + status). */
export interface ProposalSnapshotResult {
  changeset_id: string;
  history: unknown[];
  latest: unknown | null;
  latest_validation: unknown | null;
  tiers: TiersBlock;
}

/** Capability flags served by `GET /authoring/status`. */
export interface AuthoringStatusCapabilities {
  proposals: boolean;
  review: boolean;
  apply: boolean;
  rollback: boolean;
  /** Whether direct-changeset editor saves are enabled — a pure kill switch
   *  (on by default); direct-changeset is the sole editor-save path, so no
   *  legacy/dual-run authority flag remains (W14.P47). */
  direct_write: boolean;
  sessions: boolean;
  leases: boolean;
  streams: boolean;
  langgraph: boolean;
}

/** Backend-served authoring status snapshot. */
export interface AuthoringStatus {
  feature: string;
  enabled: boolean;
  status: string;
  route_family: string;
  ownership: unknown;
  capabilities: AuthoringStatusCapabilities;
  tiers: TiersBlock;
}

/** One durable lifecycle event replayed from the authoring outbox. It is an
 *  invalidation signal only; proposal rows remain backend-served projections. */
export interface AuthoringLifecycleEvent {
  seq: number;
  event_id: string;
  aggregate_kind: string;
  aggregate_id: string;
  event_kind: string;
  schema_version: number;
  actor: ActorRef;
  command?: string;
  idempotency_key?: string;
  payload: unknown;
  payload_hash: string;
  created_at_ms: number;
}

export type AuthoringStreamFrame =
  | { kind: "lifecycle"; event: AuthoringLifecycleEvent }
  | {
      kind: "gap";
      reason: string;
      requested_last_seq: number | null;
      latest_outbox_seq: number | null;
      next_recovery_seq: number | null;
    }
  | { kind: "error"; error_kind: string; error: string; tiers: TiersBlock }
  | { kind: "ignored"; channel: string };

export interface AuthoringRecoverySnapshot {
  proposals: ProposalListResult;
  generation_channels: {
    implemented: boolean;
    cap: number;
    authoritative: boolean;
  };
}

export interface AuthoringRecoveryResult {
  api_version: string;
  family: string;
  latest_outbox_seq: number;
  next_seq: number;
  requested_last_seq: number;
  snapshot: AuthoringRecoverySnapshot;
  tiers: TiersBlock;
}

// --- command payloads (wire request DTOs) ---------------------------------------

/** A single drafted child operation (engine `ChangesetChildOperationDraft`). */
export interface ChangesetChildOperationDraft {
  child_key: string;
  operation: string;
  target: unknown;
  draft: { mode: "whole_document" | "append"; body: string };
}

/** `POST /authoring/v1/proposals` payload (engine `CreateProposalRequest`). */
export interface CreateProposalPayload {
  session_id: string;
  changeset_id: string;
  summary: string;
  operations: ChangesetChildOperationDraft[];
}

/** `POST /authoring/v1/proposals/{id}/submit` payload. */
export interface SubmitForReviewPayload {
  expected_revision: string;
  summary: string;
}

/** `POST /authoring/v1/reviews/{approvalId}/decisions` payload. The reviewer is
 *  the server-resolved principal — NEVER named in the body (ASA-010). */
export interface ReviewDecisionPayload {
  proposal_id: string;
  approval_id: string;
  decision: "approve" | "reject";
  reviewed_revision: string;
  comment?: string;
}

/** `POST /authoring/v1/apply-requests` payload. */
export interface ApplyPayload {
  changeset_id: string;
  approval_id: string;
}

/** `POST /authoring/v1/rollback-proposals` payload. */
export interface RollbackPayload {
  source_changeset_id: string;
  source_children: { source_child_key: string }[];
  reason: string;
}

/** `POST /authoring/v1/mode` payload (engine `SetOperationModeRequest`): set the
 *  active worktree's operation mode. The scope is backend-derived from the active
 *  workspace root — never client-claimed. */
export interface SetOperationModePayload {
  mode: OperationMode;
}

/** `POST /authoring/v1/direct-writes` frontmatter fields (the `edit_frontmatter`
 *  operation's payload). Every field is optional — only the ones the editor
 *  actually changed are sent. */
export interface DirectWriteFrontmatterFields {
  date?: string;
  tags?: string[];
  related?: string[];
}

/** `POST /authoring/v1/direct-writes` create-document params (the
 *  `create_document` operation's payload). */
export interface DirectWriteCreateParams {
  doc_type: string;
  feature: string;
  title: string;
  related?: string[];
}

/** The desired state of a plan Step's checkbox (authoring-surface ADR D1):
 *  `checked` closes the Step (`vault plan step check`), `unchecked` re-opens it
 *  (`vault plan step uncheck`). */
export type PlanStepDesiredState = "checked" | "unchecked";

/** `POST /authoring/v1/direct-writes` set-plan-step-state params (the
 *  `set_plan_step_state` operation's payload, authoring-surface ADR D1): the
 *  canonical step id (`S##`) and the desired open/closed state. The plan CLI
 *  verb is idempotent, so re-requesting the state a Step already holds is a
 *  no-op success (`core_status: "unchanged"`), never an error. */
export interface DirectWritePlanStep {
  stepId: string;
  state: PlanStepDesiredState;
}

/**
 * `POST /authoring/v1/direct-writes` payload — a human editor save routed
 * through the ledger as a self-approved direct changeset, generalized to every
 * content kind the route materializes (ledgered-edit-migration W02.P06). The
 * route composes create-proposal → validate → submit → human self-approve →
 * apply SERVER-SIDE; the client sends only the `operation` discriminator + the
 * fields THAT kind uses — never an accepted-but-ignored field (the backend
 * refuses a mismatched field at validation, e.g. `frontmatter` set on a
 * `replace_body` request).
 *
 * `scope` is the OPTIONAL scope pin (the same worktree-scope string already
 * threaded through the app as `scope`/`MapWorktree.id`, e.g.
 * `SaveBodyArgs.scope`): when present it must match the server's current
 * active workspace or the save is refused as a denial value, closing the
 * scope-switch race a save with no pin is silently exposed to.
 */
export type DirectWritePayload =
  | {
      operation: "replace_body";
      ref: string;
      body: string;
      expected_blob_hash: string;
      scope?: string | null;
      summary?: string;
    }
  | {
      operation: "edit_frontmatter";
      ref: string;
      frontmatter: DirectWriteFrontmatterFields;
      expected_blob_hash: string;
      scope?: string | null;
      summary?: string;
    }
  | {
      operation: "rename";
      ref: string;
      new_stem: string;
      expected_blob_hash: string;
      scope?: string | null;
      summary?: string;
    }
  | {
      operation: "create_document";
      create: DirectWriteCreateParams;
      scope?: string | null;
      summary?: string;
    }
  | {
      // Tick/untick a plan Step through the ledger (authoring-surface ADR D1).
      // The plan document is named by `ref`; `expected_blob_hash` is the
      // engine-side stale-base fence (the substitute for the plan CLI's absent
      // expected-blob-hash flag). The `planStep` carries the canonical step id +
      // desired state.
      operation: "set_plan_step_state";
      ref: string;
      planStep: DirectWritePlanStep;
      expected_blob_hash: string;
      scope?: string | null;
      summary?: string;
    };

/** The conflict the direct-write route serves when the target moved since the
 *  editor's optimistic base: `expected` is the editor's stale base, `actual`
 *  is the blob now on disk, `target` is the blob the save would have produced
 *  had the base still matched. */
export interface DirectWriteConflict {
  document_ref: string;
  document_path: string;
  expected_blob_hash: string;
  actual_blob_hash: string;
  target_blob_hash: string;
}

/**
 * The structured WHY behind a `denied` direct-write outcome (W05.P14), matching
 * the backend `DirectWriteDenialKind` enum verbatim. Replaces reason-text
 * substring matching (`RENAME_COLLISION_REASON_HINT`, retired): a `denied`
 * outcome ALWAYS carries one of these (the backend defaults to `"other"` rather
 * than omitting it), so a caller routes on `denialKind`, never on the prose.
 */
export type DirectWriteDenialKind =
  | "path_collision"
  | "stale_base"
  | "scope_mismatch"
  | "forbidden_actor"
  | "self_approval"
  | "other";

/**
 * The interpreted direct-write outcome. DENIALS ARE VALUES: `conflict` (a
 * stale optimistic base) and `denied` (an ineligible actor — e.g. a non-human
 * principal) ride the success (200) envelope as VALUES, never a thrown fault.
 * `applied` carries the changeset id + the new blob hash the editor adopts as
 * its next optimistic-concurrency base. `resultNodeId`/`resultStem` (W03.P09a)
 * are populated ONLY for a successfully-applied `create_document` — the
 * server-resolved identity of the newly-created document (`apply_receipt.
 * child.result_node_id`/`result_stem`), letting the create dialog auto-open it
 * without predicting a stem client-side; `undefined` for every other kind.
 */
export type DirectWriteOutcome =
  | {
      kind: "applied";
      changesetId: string;
      documentPath: string | null;
      blobHash: string | null;
      replayed: boolean;
      resultNodeId?: string;
      resultStem?: string;
      tiers: TiersBlock;
    }
  | { kind: "conflict"; conflict: DirectWriteConflict; tiers: TiersBlock }
  | {
      kind: "denied";
      reason: string | null;
      denialKind?: DirectWriteDenialKind;
      tiers: TiersBlock;
    }
  | { kind: "failed"; reason: string | null; tiers: TiersBlock }
  | { kind: "in_flight"; tiers: TiersBlock };

/** `POST /authoring/v1/actor-tokens` payload (machine-bearer-gated bootstrap). */
export interface IssueActorTokenPayload {
  actor: ActorRef;
  lifetime_ms?: number;
}

/** The issued token: the raw token returned EXACTLY ONCE (the store persists only
 *  its hash), plus the durable record. */
export interface IssuedActorToken {
  raw_token: string;
  record: unknown;
  tiers: TiersBlock;
}

// --- command outcomes (denials are values) --------------------------------------

/**
 * The interpreted outcome of one mutating command. DENIALS ARE VALUES: an
 * ineligible command is a `denied` outcome the UI renders as a refusal + reason,
 * not an error. `unavailable` is the rollback-generation refusal value (carries a
 * manual-repair hook). `in_flight` is a prior attempt still running (202). `ok`
 * is any accepted/replayed/decided/recorded/generated success, carrying the
 * served data verbatim.
 */
export type AuthoringCommandOutcome =
  | { kind: "denied"; command: string; reason: string | null; tiers: TiersBlock }
  | {
      kind: "unavailable";
      command: string;
      reason: string | null;
      manual_repair: unknown;
      tiers: TiersBlock;
    }
  | { kind: "in_flight"; tiers: TiersBlock }
  | {
      kind: "ok";
      status: string;
      data: Record<string, unknown>;
      tiers: TiersBlock;
    };

export type Rec = Record<string, unknown>;
export const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
export const asStr = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;
export const asBool = (v: unknown): boolean => v === true;
export const asNum = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
export const asTiers = (v: unknown): TiersBlock => (isRec(v) ? (v as TiersBlock) : {});

const DIRECT_WRITE_DENIAL_KINDS: readonly DirectWriteDenialKind[] = [
  "path_collision",
  "stale_base",
  "scope_mismatch",
  "forbidden_actor",
  "self_approval",
  "other",
];
/** Narrow the served `denial_kind` string to the closed union, tolerant of an
 *  absent/unrecognized value (a future backend variant this client hasn't been
 *  taught yet degrades to `undefined`, not a thrown parse fault). */
export const asDenialKind = (v: unknown): DirectWriteDenialKind | undefined =>
  DIRECT_WRITE_DENIAL_KINDS.includes(v as DirectWriteDenialKind)
    ? (v as DirectWriteDenialKind)
    : undefined;
