// Authoring wire client + review-station store (agentic plan W03.P40, Increment 1).
//
// The SOLE frontend wire client for the fenced authoring backend
// (`/authoring/v1/*`): the only place that fetches the propose → review → apply →
// rollback route family, holds its query cache + polling clock, and reads the
// `tiers` block. `scene`/`app` NEVER fetch it (architecture-boundaries); the
// review station is a pure consumer of what this store serves.
//
// Contract fidelity (agentic-authoring-api-contract ADR):
//   - Every response rides the shared `{data, tiers}` envelope; degradation is
//     read ONLY from `tiers` (+ the typed `authoring_store_unavailable` error
//     envelope), never guessed from a bare transport fault (wire-contract).
//   - DENIALS ARE VALUES: an ineligible command returns HTTP 200 with a denial
//     VALUE (`{status:"denied", command, allowed:false, reason}`), which this
//     client surfaces as a `denied` OUTCOME the UI renders as "can't do that +
//     reason" — never an error toast. A 5xx is a genuine fault; a 409 is a stale
//     conflict.
//   - The review station is a BACKEND-SERVED projection (agentic-review-station-
//     state ADR): button enablement comes from the served `eligibility` entries,
//     never a frontend derivation from events.
//
// The store consumes the SERVED projection shapes unchanged (no new client
// model); it maps only presentation. Wire values stay snake_case as served.

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  bearerToken,
  CANONICAL_TIERS,
  EngineError,
  readTierAvailability,
  tiersFromQuery,
  type FetchLike,
  type TierAvailability,
  type TiersBlock,
} from "./engine";
import { unwrapEnvelope } from "./liveAdapters";
import { queryClient as defaultQueryClient } from "./queryClient";
import { sseChunks, streamReducer, type StreamChunk } from "./queries";

// In dev Vite proxies /api to the engine; in production the SPA shares the engine
// origin and the prefix collapses — identical to the `EngineClient` base rule.
const AUTHORING_BASE = import.meta.env.DEV ? "/api" : "";

/** The per-principal actor-token header the command routes resolve identity from
 *  (ASA-010 / security-provenance ADR). The wire envelope carries NO actor; the
 *  server resolves it from this header alone. */
const ACTOR_TOKEN_HEADER = "x-authoring-actor-token";

/** The typed error kind the engine returns when the durable authoring store
 *  cannot be opened/read — the honest "authoring backend unavailable" signal a
 *  consumer degrades on (read from the error envelope, not guessed). */
export const AUTHORING_STORE_UNAVAILABLE_KIND = "authoring_store_unavailable";

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
 * The interpreted direct-write outcome. DENIALS ARE VALUES: `conflict` (a
 * stale optimistic base) and `denied` (an ineligible actor — e.g. a non-human
 * principal) ride the success (200) envelope as VALUES, never a thrown fault.
 * `applied` carries the changeset id + the new blob hash the editor adopts as
 * its next optimistic-concurrency base.
 */
export type DirectWriteOutcome =
  | {
      kind: "applied";
      changesetId: string;
      documentPath: string | null;
      blobHash: string | null;
      replayed: boolean;
      tiers: TiersBlock;
    }
  | { kind: "conflict"; conflict: DirectWriteConflict; tiers: TiersBlock }
  | { kind: "denied"; reason: string | null; tiers: TiersBlock }
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

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const asStr = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;
const asBool = (v: unknown): boolean => v === true;
const asNum = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const asTiers = (v: unknown): TiersBlock => (isRec(v) ? (v as TiersBlock) : {});

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
    return { kind: "denied", reason: asStr(eligibility.reason) ?? null, tiers };
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
    documentPath: asStr(record.document_path) ?? null,
    blobHash: asStr(child.observed_result_blob_hash) ?? null,
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
    default: {
      const exhaustive: never = payload;
      return exhaustive;
    }
  }
}

// --- degradation read (from tiers + the typed store-unavailable error) ----------

/** The interpreted authoring degradation a consumer renders. `storeUnavailable`
 *  is read from the typed error envelope (`authoring_store_unavailable`), the
 *  authoring domain's honest "backend down" signal; tier degradation is read from
 *  the `tiers` block. Neither is guessed from a bare transport fault. */
export interface AuthoringDegradation extends TierAvailability {
  /** The durable authoring store could not be opened/read (typed 503). */
  storeUnavailable: boolean;
}

/**
 * Derive authoring degradation from a query's success data + error state. Tier
 * availability reads the `tiers` block with fresh-error precedence over a stale
 * held-success block (`tiersFromQuery`); `storeUnavailable` reads the typed
 * `authoring_store_unavailable` error kind off the `EngineError` envelope.
 */
export function readAuthoringDegradation(query: {
  data?: { tiers?: TiersBlock } | undefined;
  error?: unknown;
}): AuthoringDegradation {
  const tiers = tiersFromQuery(query);
  const availability = readTierAvailability(tiers, CANONICAL_TIERS);
  const storeUnavailable =
    query.error instanceof EngineError &&
    query.error.errorKind === AUTHORING_STORE_UNAVAILABLE_KIND;
  return { ...availability, storeUnavailable };
}

// --- the wire client ------------------------------------------------------------

/** The production base transport: the machine bearer from the injected meta tag
 *  (identical to `EngineClient`'s default). A command layers the per-principal
 *  actor-token header on top of this (see `AuthoringClient.withActor`). The test
 *  harness swaps this for the live transport that carries the spawned engine's
 *  bearer, so the SAME client code runs against the real wire. */
const defaultBearerTransport: FetchLike = (input, init) => {
  const bearer = bearerToken();
  if (!bearer) return fetch(input, init);
  const headers = new Headers(init?.headers);
  if (!headers.has("authorization")) {
    headers.set("Authorization", `Bearer ${bearer}`);
  }
  return fetch(input, { ...init, headers });
};

/** Build an `EngineError` from a non-ok authoring response, PRESERVING the tiers
 *  block + typed `error_kind` the engine attaches to its error envelope so a
 *  denied-store 503 or a 409 conflict reaches the consumer as degradation truth,
 *  never a tiers-less bare failure (wire-contract). */
async function authoringErrorFrom(
  path: string,
  response: Response,
): Promise<EngineError> {
  let body: unknown;
  let tiers: TiersBlock | undefined;
  try {
    body = unwrapEnvelope(await response.json());
    if (isRec(body) && "tiers" in body && isRec(body.tiers)) {
      tiers = body.tiers as TiersBlock;
    }
  } catch {
    // No structured JSON body — nothing to preserve.
  }
  return new EngineError(path, response.status, { tiers, body });
}

/** A generated idempotency key for a mutating command (changeset-ledger ADR: a
 *  mutating command is idempotent). The composed key is ascii-safe for the wire
 *  `IdempotencyKey` grammar; a caller may pass its own for replay control. */
export function newIdempotencyKey(prefix = "idem"): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${uuid}`;
}

interface CommandOptions {
  /** The per-principal actor token identity resolves from (required for a
   *  command; reads need none). */
  actorToken: string;
  /** An explicit idempotency key for replay control; generated when omitted. */
  idempotencyKey?: string;
}

export interface AuthoringClientOptions {
  baseUrl?: string;
  /** The base transport (bearer-carrying). Defaults to the meta-tag bearer
   *  transport; the test harness injects the live transport. The actor-token
   *  header is layered on top per command by `withActor`. */
  fetchImpl?: FetchLike;
}

/**
 * The authoring wire client. Lives in `stores/` (the sole wire client boundary);
 * `scene`/`app` consume its hooks, never it directly. Reads are unauthenticated;
 * commands thread the actor-token header + an idempotency envelope.
 */
export class AuthoringClient {
  readonly baseUrl: string;
  private readonly baseFetch: FetchLike;

  constructor(options: AuthoringClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? AUTHORING_BASE;
    this.baseFetch = options.fetchImpl ?? defaultBearerTransport;
  }

  /** Layer the per-principal actor-token header onto the base (bearer) transport.
   *  Reads pass no token; a command passes the resolved actor token. */
  private withActor(actorToken?: string): FetchLike {
    return (input, init) => {
      if (!actorToken) return this.baseFetch(input, init);
      const headers = new Headers(init?.headers);
      headers.set(ACTOR_TOKEN_HEADER, actorToken);
      return this.baseFetch(input, { ...init, headers });
    };
  }

  // --- reads (principal-permissive) ---

  /** `GET /authoring/status` — backend-owned feature and capability status. */
  async status(signal?: AbortSignal): Promise<AuthoringStatus> {
    return adaptAuthoringStatus(await this.get("/authoring/status", signal));
  }

  /** `GET /authoring/v1/proposals` — the bounded review-station queue. */
  async listProposals(signal?: AbortSignal): Promise<ProposalListResult> {
    return adaptProposalList(await this.get("/authoring/v1/proposals", signal));
  }

  /** `GET /authoring/v1/proposals/{id}` — one changeset's review DETAIL (the
   *  projection plus the per-operation base+proposed diff texts), or `null` when
   *  the changeset is unknown (a typed 404 → an honest absence, not a thrown query
   *  error). */
  async projectProposal(
    changesetId: string,
    signal?: AbortSignal,
  ): Promise<ProposalDetail | null> {
    try {
      const body = await this.get(
        `/authoring/v1/proposals/${encodeURIComponent(changesetId)}`,
        signal,
      );
      return adaptProposalDetail(body);
    } catch (err) {
      if (err instanceof EngineError && err.status === 404) return null;
      throw err;
    }
  }

  /** `GET /authoring/v1/proposals/{id}/snapshot` — the full changeset history. */
  async proposalSnapshot(
    changesetId: string,
    signal?: AbortSignal,
  ): Promise<ProposalSnapshotResult> {
    return adaptProposalSnapshot(
      await this.get(
        `/authoring/v1/proposals/${encodeURIComponent(changesetId)}/snapshot`,
        signal,
      ),
    );
  }

  /** `GET /authoring/v1/events?last_seq=N` — finite durable lifecycle replay.
   *  The caller consumes the SSE body and resubscribes from its durable cursor
   *  after clean replay completion. */
  async openEventStream(lastSeq: unknown, signal?: AbortSignal): Promise<Response> {
    const cursor = normalizeAuthoringStreamSeq(lastSeq) ?? 0;
    const path = `/authoring/v1/events?last_seq=${cursor}`;
    const response = await this.withActor()(
      `${this.baseUrl}${path}`,
      signal ? { signal } : undefined,
    );
    if (!response.ok) throw await authoringErrorFrom(path, response);
    return response;
  }

  /** `GET /authoring/v1/recovery?last_seq=N` — authoritative snapshot plus the
   *  next durable sequence the stream should resume after. */
  async recoverEventStream(
    lastSeq: unknown,
    signal?: AbortSignal,
  ): Promise<AuthoringRecoveryResult> {
    const cursor = normalizeAuthoringStreamSeq(lastSeq) ?? 0;
    return adaptAuthoringRecovery(
      await this.get(`/authoring/v1/recovery?last_seq=${cursor}`, signal),
    );
  }

  // --- bootstrap: mint a per-principal actor token (machine-bearer-gated) ---

  async issueActorToken(payload: IssueActorTokenPayload): Promise<IssuedActorToken> {
    const body = await this.postJson(
      "/authoring/v1/actor-tokens",
      payload,
      this.withActor(),
    );
    const r: Rec = isRec(body) ? body : {};
    return {
      raw_token: asStr(r.raw_token) ?? "",
      record: r.record ?? null,
      tiers: asTiers(r.tiers),
    };
  }

  // --- direct editor save (every content kind, ledgered-edit-migration W02.P06) --

  /** `POST /authoring/v1/direct-writes` — route a human editor save through the
   *  authoring ledger as a self-approved direct changeset, for any of the
   *  generalized content kinds (body/frontmatter/rename/create). The route
   *  composes create-proposal → validate → submit → human self-approve →
   *  apply SERVER-SIDE (one call replaces what used to be a legacy `/ops/core`
   *  write per kind). */
  async directWrite(
    payload: DirectWritePayload,
    opts: CommandOptions,
  ): Promise<DirectWriteOutcome> {
    const envelope = {
      api_version: "v1",
      command: "direct_write",
      idempotency_key: opts.idempotencyKey ?? newIdempotencyKey(),
      payload: directWriteWirePayload(payload),
    };
    const body = await this.postJson(
      "/authoring/v1/direct-writes",
      envelope,
      this.withActor(opts.actorToken),
    );
    return adaptDirectWriteOutcome(body);
  }

  // --- mutating commands (denials are values) ---

  /** `POST /authoring/v1/proposals` — open a new Draft proposal. */
  async createProposal(
    payload: CreateProposalPayload,
    opts: CommandOptions,
  ): Promise<AuthoringCommandOutcome> {
    return this.command("/authoring/v1/proposals", "create_proposal", payload, opts);
  }

  /** `POST /authoring/v1/proposals/{id}/submit` — move a Draft into review
   *  (validate + submit + open-approval, composed server-side). */
  async submitForReview(
    changesetId: string,
    payload: SubmitForReviewPayload,
    opts: CommandOptions,
  ): Promise<AuthoringCommandOutcome> {
    return this.command(
      `/authoring/v1/proposals/${encodeURIComponent(changesetId)}/submit`,
      "submit_for_review",
      payload,
      opts,
    );
  }

  /** `POST /authoring/v1/reviews/{approvalId}/decisions` — record approve/reject.
   *  The self-approval ban + freshness gate run server-side; a refusal (or a
   *  stale review) comes back as a `denied` outcome value (a stale review is a
   *  409 fault the caller surfaces distinctly). */
  async reviewDecision(
    approvalId: string,
    payload: ReviewDecisionPayload,
    opts: CommandOptions,
  ): Promise<AuthoringCommandOutcome> {
    return this.command(
      `/authoring/v1/reviews/${encodeURIComponent(approvalId)}/decisions`,
      payload.decision,
      payload,
      opts,
    );
  }

  /** `POST /authoring/v1/apply-requests` — materialize an APPROVED changeset. */
  async applyChangeset(
    payload: ApplyPayload,
    opts: CommandOptions,
  ): Promise<AuthoringCommandOutcome> {
    return this.command("/authoring/v1/apply-requests", "request_apply", payload, opts);
  }

  /** `POST /authoring/v1/rollback-proposals` — generate an inverse rollback
   *  proposal. An unavailable rollback rides back as an `unavailable` value. */
  async createRollback(
    payload: RollbackPayload,
    opts: CommandOptions,
  ): Promise<AuthoringCommandOutcome> {
    return this.command(
      "/authoring/v1/rollback-proposals",
      "create_rollback",
      payload,
      opts,
    );
  }

  // --- transport ---

  private async get(path: string, signal?: AbortSignal): Promise<unknown> {
    const response = await this.withActor()(
      `${this.baseUrl}${path}`,
      signal ? { signal } : undefined,
    );
    if (!response.ok) throw await authoringErrorFrom(path, response);
    return unwrapEnvelope(await response.json());
  }

  /** Issue a mutating command through the shared `CommandEnvelope` + the actor
   *  token header, then interpret the result (denials are values). A 4xx/5xx
   *  FAULT throws a tiers-bearing `EngineError`; a 200 denial/success does not. */
  private async command(
    path: string,
    command: string,
    payload: unknown,
    opts: CommandOptions,
  ): Promise<AuthoringCommandOutcome> {
    const envelope = {
      api_version: "v1",
      command,
      idempotency_key: opts.idempotencyKey ?? newIdempotencyKey(),
      payload,
    };
    const body = await this.postJson(path, envelope, this.withActor(opts.actorToken));
    return interpretCommandOutcome(body);
  }

  private async postJson(
    path: string,
    body: unknown,
    transport: FetchLike,
  ): Promise<unknown> {
    const response = await transport(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await authoringErrorFrom(path, response);
    return unwrapEnvelope(await response.json());
  }
}

/** The app-wide authoring client, bound to the live engine origin. */
export const authoringClient = new AuthoringClient();

// --- lifecycle stream cursor ----------------------------------------------------

export interface AuthoringStreamCursorState {
  streamConnected: boolean | null;
  recovering: boolean;
  lastSeq: number | null;
  lastGapReason: string | null;
  lastErrorKind: string | null;
  retained: readonly StreamChunk[];
}

const AUTHORING_STREAM_INITIAL: AuthoringStreamCursorState = {
  streamConnected: null,
  recovering: false,
  lastSeq: null,
  lastGapReason: null,
  lastErrorKind: null,
  retained: [],
};

let authoringStreamCursor: AuthoringStreamCursorState = AUTHORING_STREAM_INITIAL;
const authoringStreamListeners = new Set<() => void>();

function publishAuthoringStreamCursor(
  next: AuthoringStreamCursorState,
): AuthoringStreamCursorState {
  if (next === authoringStreamCursor) return authoringStreamCursor;
  authoringStreamCursor = next;
  for (const listener of authoringStreamListeners) listener();
  return authoringStreamCursor;
}

export function getAuthoringStreamCursor(): AuthoringStreamCursorState {
  return authoringStreamCursor;
}

function subscribeAuthoringStreamCursor(listener: () => void): () => void {
  authoringStreamListeners.add(listener);
  return () => authoringStreamListeners.delete(listener);
}

export function resetAuthoringStreamCursor(): void {
  publishAuthoringStreamCursor({
    ...AUTHORING_STREAM_INITIAL,
    retained: [],
  });
}

function setAuthoringStreamConnected(connected: boolean | null): void {
  publishAuthoringStreamCursor({
    ...authoringStreamCursor,
    streamConnected: connected,
    lastErrorKind: connected === false ? authoringStreamCursor.lastErrorKind : null,
  });
}

function setAuthoringStreamRecovering(recovering: boolean): void {
  publishAuthoringStreamCursor({ ...authoringStreamCursor, recovering });
}

function noteAuthoringStreamError(errorKind: string): void {
  publishAuthoringStreamCursor({
    ...authoringStreamCursor,
    streamConnected: false,
    recovering: false,
    lastErrorKind: errorKind,
  });
}

function appendAuthoringStreamFrame(chunk: StreamChunk): void {
  publishAuthoringStreamCursor({
    ...authoringStreamCursor,
    retained: streamReducer([...authoringStreamCursor.retained], chunk),
  });
}

export function advanceAuthoringStreamSeq(seq: unknown): void {
  const normalized = normalizeAuthoringStreamSeq(seq);
  if (
    normalized === null ||
    (authoringStreamCursor.lastSeq !== null &&
      normalized <= authoringStreamCursor.lastSeq)
  ) {
    return;
  }
  publishAuthoringStreamCursor({
    ...authoringStreamCursor,
    lastSeq: normalized,
    streamConnected: true,
    lastErrorKind: null,
  });
}

function setAuthoringStreamGap(
  frame: Extract<AuthoringStreamFrame, { kind: "gap" }>,
): void {
  publishAuthoringStreamCursor({
    ...authoringStreamCursor,
    recovering: true,
    lastGapReason: frame.reason,
  });
}

export function useAuthoringStreamCursor(): AuthoringStreamCursorState {
  return useSyncExternalStore(
    subscribeAuthoringStreamCursor,
    getAuthoringStreamCursor,
    () => AUTHORING_STREAM_INITIAL,
  );
}

function invalidateAuthoring(): void {
  void defaultQueryClient.invalidateQueries({ queryKey: authoringKeys.all });
}

export function applyAuthoringRecovery(recovery: AuthoringRecoveryResult): void {
  defaultQueryClient.setQueryData(
    authoringKeys.proposals(),
    recovery.snapshot.proposals,
  );
  publishAuthoringStreamCursor({
    ...authoringStreamCursor,
    recovering: false,
    streamConnected: true,
    lastSeq: lastSeqBefore(recovery.next_seq),
    lastErrorKind: null,
  });
  invalidateAuthoring();
}

export async function recoverAuthoringLifecycleStream(
  lastSeq: unknown,
  signal?: AbortSignal,
): Promise<AuthoringRecoveryResult> {
  setAuthoringStreamRecovering(true);
  try {
    const recovery = await authoringClient.recoverEventStream(lastSeq, signal);
    applyAuthoringRecovery(recovery);
    return recovery;
  } catch (err) {
    if (!(err instanceof Error && err.name === "AbortError")) {
      noteAuthoringStreamError(
        err instanceof EngineError
          ? (err.errorKind ?? AUTHORING_STORE_UNAVAILABLE_KIND)
          : "authoring_stream_recovery_failed",
      );
    }
    throw err;
  }
}

export async function handleAuthoringStreamChunk(
  chunk: StreamChunk,
  signal?: AbortSignal,
): Promise<void> {
  appendAuthoringStreamFrame(chunk);
  const frame = adaptAuthoringStreamFrame(chunk);
  switch (frame.kind) {
    case "lifecycle":
      advanceAuthoringStreamSeq(frame.event.seq);
      invalidateAuthoring();
      return;
    case "gap":
      setAuthoringStreamGap(frame);
      await recoverAuthoringLifecycleStream(
        frame.requested_last_seq ?? authoringStreamCursor.lastSeq ?? 0,
        signal,
      );
      return;
    case "error":
      noteAuthoringStreamError(frame.error_kind);
      return;
    case "ignored":
      return;
  }
}

function authoringStreamRetryDelay(attempt: number): number {
  return attempt === 0
    ? AUTHORING_STREAM_RETRY_BASE_MS
    : Math.min(
        AUTHORING_STREAM_RETRY_MAX_MS,
        AUTHORING_STREAM_RETRY_BASE_MS * 2 ** attempt,
      );
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

let authoringLifecycleSubscriberCount = 0;
let stopAuthoringLifecycleLoop: (() => void) | null = null;

function startAuthoringLifecycleLoop(): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let retryAttempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearPendingTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = (delayMs: number) => {
    clearPendingTimer();
    timer = setTimeout(() => {
      void run();
    }, delayMs);
  };

  const run = async () => {
    if (stopped) return;
    controller = new AbortController();
    try {
      setAuthoringStreamConnected(true);
      const response = await authoringClient.openEventStream(
        authoringStreamCursor.lastSeq ?? 0,
        controller.signal,
      );
      for await (const chunk of sseChunks(response)) {
        if (stopped) return;
        await handleAuthoringStreamChunk(chunk, controller.signal);
      }
      retryAttempt = 0;
      if (!stopped) schedule(AUTHORING_STREAM_REOPEN_MS);
    } catch (err) {
      if (stopped || isAbortError(err)) return;
      noteAuthoringStreamError(
        err instanceof EngineError
          ? (err.errorKind ?? "authoring_stream_http_error")
          : "authoring_stream_lost",
      );
      schedule(authoringStreamRetryDelay(retryAttempt));
      retryAttempt += 1;
    }
  };

  void run();
  return () => {
    stopped = true;
    clearPendingTimer();
    controller?.abort();
  };
}

export function subscribeAuthoringLifecycle(): () => void {
  authoringLifecycleSubscriberCount += 1;
  if (authoringLifecycleSubscriberCount === 1) {
    stopAuthoringLifecycleLoop = startAuthoringLifecycleLoop();
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    authoringLifecycleSubscriberCount = Math.max(
      0,
      authoringLifecycleSubscriberCount - 1,
    );
    if (authoringLifecycleSubscriberCount === 0) {
      stopAuthoringLifecycleLoop?.();
      stopAuthoringLifecycleLoop = null;
    }
  };
}

/** Subscribe the review station to durable lifecycle replay. Backend `/events`
 *  is currently finite replay, so clean completion deliberately reopens from the
 *  last durable cursor instead of assuming a held socket. */
export function useAuthoringLifecycleSubscription(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    return subscribeAuthoringLifecycle();
  }, [enabled]);
}

// --- in-memory actor-token holder ------------------------------------------------
//
// The raw actor token is returned exactly once at issuance and is session
// identity, not durable product state (the store persists only its hash). It is
// held in memory for the browser session — never persisted, never re-derivable —
// and read by the command mutations. `authoring-state-is-product-data` is about
// proposals/approvals/receipts (backend-owned), NOT this ephemeral credential.

let sessionActorToken: string | null = null;
const tokenListeners = new Set<() => void>();

/** Set the session's active actor token (after `issueActorToken`), notifying any
 *  subscribed identity readers. */
export function setActorToken(token: string | null): void {
  sessionActorToken = token;
  for (const listener of tokenListeners) listener();
}

/** Read the session's active actor token, or `null` when none is bootstrapped. */
export function getActorToken(): string | null {
  return sessionActorToken;
}

/** Subscribe to actor-token changes (for `useSyncExternalStore`). */
function subscribeActorToken(onChange: () => void): () => void {
  tokenListeners.add(onChange);
  return () => tokenListeners.delete(onChange);
}

/** Whether a reviewer actor token is bootstrapped — the identity gate the review
 *  station reads to know a human can act. Returns a primitive (value-compared), so
 *  it is a stable external-store read (frontend-store-selectors). */
export function useHasActorToken(): boolean {
  return useSyncExternalStore(
    subscribeActorToken,
    () => getActorToken() !== null,
    () => false,
  );
}

// --- query keys + hooks ----------------------------------------------------------

export const authoringKeys = {
  all: ["authoring"] as const,
  status: () => [...authoringKeys.all, "status"] as const,
  proposals: () => [...authoringKeys.all, "proposals"] as const,
  proposal: (changesetId: string) =>
    [...authoringKeys.all, "proposal", changesetId] as const,
  snapshot: (changesetId: string) =>
    [...authoringKeys.all, "snapshot", changesetId] as const,
};

export function proposalsQueryOptions() {
  return queryOptions({
    queryKey: authoringKeys.proposals(),
    queryFn: ({ signal }) => authoringClient.listProposals(signal),
    // Smoothness across stream-triggered invalidations: keep the prior page
    // while the next backend-served projection loads.
    placeholderData: keepPreviousData,
    staleTime: 2_000,
    gcTime: 60_000,
  });
}

/** The review-station queue: the bounded, backend-served proposal list. Freshness
 *  is driven by the authoring lifecycle stream cursor/recovery path. Returns the
 *  raw query result (derive in `useMemo` at the call site). */
export function useProposals(): UseQueryResult<ProposalListResult, Error> {
  return useQuery(proposalsQueryOptions());
}

/** Backend-served authoring status, including the direct-write capability and
 *  authority flags the UI must consume rather than inferring from core routes. */
export function useAuthoringStatus(): UseQueryResult<AuthoringStatus, Error> {
  return useQuery({
    queryKey: authoringKeys.status(),
    queryFn: ({ signal }) => authoringClient.status(signal),
    staleTime: 5_000,
    gcTime: 60_000,
  });
}

/** The interpreted review-station view model the dumb app surface consumes: the
 *  served rows plus the four mutually-exclusive display modes and the honest
 *  degradation truth. Derivation lives here (stores layer) so the app view reads
 *  it flat and maps only presentation (architecture-boundaries). */
export interface ReviewStationView {
  /** The served proposal projections, consumed unchanged (no client model). */
  rows: ProposalProjection[];
  /** The after-the-fact lane served by the backend for policy-applied work. */
  afterFactRows: AppliedUnderPolicyProjection[];
  /** First load in flight (no data yet). */
  loading: boolean;
  /** A tier the queue depends on is degraded (read from `tiers`). */
  degraded: boolean;
  /** The durable authoring store is unavailable (typed 503) — a fail-closed mode
   *  distinct from tier degradation. */
  storeUnavailable: boolean;
  /** A one-sentence, leak-free degradation notice, or `null` when healthy. */
  degradedMessage: string | null;
  /** Loaded with no proposals in the queue. */
  empty: boolean;
  /** The corpus has more changesets than the served page cap. */
  truncated: boolean;
  /** The after-the-fact lane has more items than the served page cap. */
  afterFactTruncated: boolean;
}

/**
 * The review-station queue as an interpreted view model. Composes the polled
 * `useProposals` query with the tiers/store degradation read, keyed on the raw
 * query slices so the derived object is referentially stable across re-renders
 * that change nothing (frontend-store-selectors: derive in `useMemo`).
 */
export function useReviewStationView(): ReviewStationView {
  useAuthoringLifecycleSubscription();
  const query = useProposals();
  const data = query.data;
  const error = query.error;
  const isLoading = query.isLoading;
  return useMemo(() => {
    const degradation = readAuthoringDegradation({ data, error });
    const rows = data?.items ?? [];
    const afterFactRows = data?.applied_under_policy.items ?? [];
    const degradedMessage = degradation.storeUnavailable
      ? "The authoring service is unavailable right now — the review queue can’t be loaded."
      : degradation.degraded
        ? "Some review information may be out of date."
        : null;
    return {
      rows,
      afterFactRows,
      loading: isLoading && !data,
      degraded: degradation.degraded,
      storeUnavailable: degradation.storeUnavailable,
      degradedMessage,
      empty: !!data && rows.length === 0 && afterFactRows.length === 0,
      truncated: data?.truncated ?? false,
      afterFactTruncated: data?.applied_under_policy.truncated ?? false,
    };
  }, [data, error, isLoading]);
}

/** One changeset's review DETAIL — the projection plus the base+proposed diff
 *  texts (`null` when unknown). Enabled only for a non-empty id so the detail pane
 *  can mount before a selection exists. */
export function useProposalDetail(
  changesetId: string | null,
): UseQueryResult<ProposalDetail | null, Error> {
  return useQuery({
    queryKey: authoringKeys.proposal(changesetId ?? ""),
    queryFn: ({ signal }) => authoringClient.projectProposal(changesetId ?? "", signal),
    enabled: !!changesetId,
    placeholderData: keepPreviousData,
    staleTime: 2_000,
    gcTime: 60_000,
  });
}

/** One changeset's full snapshot (history), enabled only for a non-empty id. */
export function useProposalSnapshot(
  changesetId: string | null,
): UseQueryResult<ProposalSnapshotResult, Error> {
  return useQuery({
    queryKey: authoringKeys.snapshot(changesetId ?? ""),
    queryFn: ({ signal }) =>
      authoringClient.proposalSnapshot(changesetId ?? "", signal),
    enabled: !!changesetId,
    staleTime: 2_000,
    gcTime: 60_000,
  });
}

/** Bootstrap a per-principal actor token, caching the raw token in the session
 *  holder so subsequent commands present it. */
export function useIssueActorToken() {
  return useMutation({
    mutationFn: (payload: IssueActorTokenPayload) =>
      authoringClient.issueActorToken(payload),
    onSuccess: (issued) => {
      if (issued.raw_token) setActorToken(issued.raw_token);
    },
  });
}

// --- current-editor identity (shared editor + review-station bootstrap) --------
//
// The ledgered-edit-migration ADR chose a first-class, shared editor identity
// over an anonymous per-edit token: the SAME human principal must be coherent
// across a plain editing session and the review station. This generalizes what
// was previously the review station's private, hardcoded-actor issuance into one
// hook both surfaces consume.

/** The shared human principal a plain editing session and the review station
 *  both bootstrap through `issueActorToken` — one local-operator identity, not a
 *  fresh anonymous actor per edit. */
export const CURRENT_EDITOR_ACTOR: ActorRef = {
  id: "human:local-operator",
  kind: "human",
};

/** The current-editor identity: whether a human actor token is bootstrapped for
 *  this session, plus the bootstrap/sign-out actions. */
export interface CurrentEditorIdentity {
  /** A human actor token is bootstrapped for this session. */
  hasToken: boolean;
  /** A bootstrap mint is in flight. */
  bootstrapping: boolean;
  /** The bootstrap mint's error, if the last attempt failed. */
  bootstrapError: Error | null;
  /** Mint the shared human actor token. No-op while already bootstrapped or a
   *  mint is already in flight. */
  bootstrap(): void;
  /** Clear the session's token (sign out). */
  signOut(): void;
}

/** The shared current-editor identity: bootstrap/read the ONE human actor token
 *  an editing session and the review station both resolve to. Both surfaces call
 *  this rather than each minting their own actor, so signing in from either one
 *  is visible from the other. */
export function useCurrentEditorIdentity(): CurrentEditorIdentity {
  const hasToken = useHasActorToken();
  const issue = useIssueActorToken();
  const bootstrap = useCallback(() => {
    if (hasToken || issue.isPending) return;
    issue.mutate({ actor: CURRENT_EDITOR_ACTOR });
  }, [hasToken, issue]);
  return {
    hasToken,
    bootstrapping: issue.isPending,
    bootstrapError: issue.error,
    bootstrap,
    signOut: () => setActorToken(null),
  };
}

/** Ensure a fresh editing session holds the bootstrapped human actor token
 *  BEFORE any ledgered edit can fire: auto-mints on mount (and whenever
 *  `enabled` turns true with no token yet). This is the fail-safe's proactive
 *  half — the reactive half is `requireActorToken()` below, which still throws
 *  if the mint hasn't resolved, so an edit attempted with no identity is
 *  refused, never silently dropped.
 *
 *  A failing mint backs off exponentially rather than hot-looping the
 *  actor-token endpoint while the editing session stays open — the SAME
 *  backoff shape as the lifecycle stream's reconnect retry
 *  (`authoringStreamRetryDelay`): the first attempt fires immediately, every
 *  subsequent attempt after a failure doubles from
 *  `AUTHORING_STREAM_RETRY_BASE_MS`, capped at `AUTHORING_STREAM_RETRY_MAX_MS`.
 *  The attempt counter resets once a mint succeeds. */
export function useEnsureCurrentEditorIdentity(enabled = true): CurrentEditorIdentity {
  const identity = useCurrentEditorIdentity();
  const { hasToken, bootstrapping, bootstrapError, bootstrap } = identity;
  const retryAttemptRef = useRef(0);

  useEffect(() => {
    if (hasToken) retryAttemptRef.current = 0;
  }, [hasToken]);

  useEffect(() => {
    if (!enabled || hasToken || bootstrapping) return;
    if (!bootstrapError) {
      // No prior failure yet: mint immediately (the original "auto-mints on
      // mount" behavior) — this attempt does not consume the backoff budget.
      const timer = setTimeout(bootstrap, 0);
      return () => clearTimeout(timer);
    }
    // A prior failure: back off before the next attempt, then advance the
    // counter for whichever attempt comes after this one.
    const attempt = retryAttemptRef.current;
    retryAttemptRef.current = attempt + 1;
    const timer = setTimeout(bootstrap, authoringStreamRetryDelay(attempt));
    return () => clearTimeout(timer);
  }, [enabled, hasToken, bootstrapping, bootstrapError, bootstrap]);

  return identity;
}

/** Require the bootstrapped session actor token, or throw a clear error the
 *  command mutation surfaces (a command needs a resolved principal). Exported
 *  so a cross-store mutation (e.g. `useSaveBody`'s direct-write call) shares
 *  the SAME fail-safe refusal, rather than re-deriving its own null check. */
export function requireActorToken(): string {
  const token = getActorToken();
  if (!token) {
    throw new Error(
      "no authoring actor token is bootstrapped — issue one before running a command",
    );
  }
  return token;
}

/** Record a reviewer's approve/reject decision. This is the human-in-the-loop
 *  seam — the walking skeleton "is not done until a human can click deny." A
 *  denial/refusal comes back as a `denied` OUTCOME (not a thrown error); the UI
 *  renders it as a refusal + reason. */
export function useReviewDecision() {
  return useMutation({
    mutationFn: (args: { approvalId: string; payload: ReviewDecisionPayload }) =>
      authoringClient.reviewDecision(args.approvalId, args.payload, {
        actorToken: requireActorToken(),
      }),
    onSuccess: invalidateAuthoring,
  });
}

/** Submit a drafted proposal for review (validate + submit + open-approval). */
export function useSubmitForReview() {
  return useMutation({
    mutationFn: (args: { changesetId: string; payload: SubmitForReviewPayload }) =>
      authoringClient.submitForReview(args.changesetId, args.payload, {
        actorToken: requireActorToken(),
      }),
    onSuccess: invalidateAuthoring,
  });
}

/** Materialize an approved changeset. */
export function useApplyChangeset() {
  return useMutation({
    mutationFn: (payload: ApplyPayload) =>
      authoringClient.applyChangeset(payload, { actorToken: requireActorToken() }),
    onSuccess: invalidateAuthoring,
  });
}

/** Generate a rollback of an applied changeset. */
export function useCreateRollback() {
  return useMutation({
    mutationFn: (payload: RollbackPayload) =>
      authoringClient.createRollback(payload, { actorToken: requireActorToken() }),
    onSuccess: invalidateAuthoring,
  });
}

/** Create a new Draft proposal. */
export function useCreateProposal() {
  return useMutation({
    mutationFn: (payload: CreateProposalPayload) =>
      authoringClient.createProposal(payload, { actorToken: requireActorToken() }),
    onSuccess: invalidateAuthoring,
  });
}
