// Agent-conversation wire types and tolerant adapters. The served shapes of the
// authoring agent plane (`/authoring/v1/*` sessions / turns / runs / interrupts /
// agent-tools) are consumed unchanged; the
// slice maps only presentation, and wire values stay snake_case exactly as
// served (the same discipline the sibling authoring review-station store keeps).
//
// Tolerance: every adapter floors a sparse or wire-shape-varied body through the
// shared `isRec/asStr/asNum/asBool` helpers (re-used from the authoring wire
// types) rather than trusting the shape, so a field the engine adds or omits
// never throws at the boundary. Status vocabularies are BOUNDED enums served by
// the engine (`SessionStatus`, `RunStatus`); the frontend passes the served
// token through and maps it to a label/tone downstream, never deriving state.

import type { TiersBlock } from "../engine";
import {
  asBool,
  asNum,
  asStr,
  asTiers,
  isRec,
  type ActorKind,
  type ActorRef,
  type Rec,
} from "../authoring";

export type { ActorRef, ActorKind };

/** Bounded session lifecycle vocabulary (engine `SessionStatus`). */
export type SessionStatus = "active" | "cancelled" | "closed";

/** Bounded run lifecycle vocabulary (engine `RunStatus`). */
export type RunStatus =
  | "active"
  | "cancel_requested"
  | "cancelled"
  | "completed"
  | "failed";

const SESSION_STATUSES: readonly SessionStatus[] = ["active", "cancelled", "closed"];
const RUN_STATUSES: readonly RunStatus[] = [
  "active",
  "cancel_requested",
  "cancelled",
  "completed",
  "failed",
];

function adaptSessionStatus(raw: unknown): SessionStatus {
  const value = asStr(raw);
  return value && (SESSION_STATUSES as readonly string[]).includes(value)
    ? (value as SessionStatus)
    : "closed";
}

function adaptRunStatus(raw: unknown): RunStatus {
  const value = asStr(raw);
  return value && (RUN_STATUSES as readonly string[]).includes(value)
    ? (value as RunStatus)
    : "failed";
}

/** A resolved LangGraph runtime reference, when the session/run carries one. */
export interface LangGraphRef {
  [key: string]: unknown;
}

/** One durable authoring session (engine `AuthoringSessionRecord`). */
export interface AgentSessionRecord {
  schema_version: string;
  session_id: string;
  scope: string;
  title: string;
  status: SessionStatus;
  actor: ActorRef;
  langgraph: LangGraphRef | null;
  latest_turn_id: string | null;
  latest_run_id: string | null;
  created_at_ms: number;
  updated_at_ms: number;
  cancelled_at_ms: number | null;
}

/** One prompt turn within a session (engine `PromptTurnRecord`). */
export interface PromptTurnRecord {
  schema_version: string;
  turn_id: string;
  session_id: string;
  turn_index: number;
  prompt_digest: string;
  prompt_text: string;
  prompt_bytes: number;
  summary: string | null;
  actor: ActorRef;
  langgraph: LangGraphRef | null;
  created_at_ms: number;
}

/** One run of a session (engine `RunRecord`). */
export interface AgentRunRecord {
  schema_version: string;
  run_id: string;
  session_id: string;
  turn_id: string | null;
  status: RunStatus;
  active: boolean;
  owner: ActorRef;
  langgraph: LangGraphRef | null;
  cancellation_reason: string | null;
  created_at_ms: number;
  updated_at_ms: number;
  cancelled_at_ms: number | null;
  completed_at_ms: number | null;
}

/** The bounded caps a session snapshot was projected under. */
export interface SessionSnapshotCaps {
  turn_cap: number;
  run_cap: number;
}

/** A single durable session snapshot (engine `SessionSnapshot`): the session, its
 *  bounded turn/run history, and the active run when one is live. */
export interface SessionSnapshot {
  session: AgentSessionRecord;
  turns: PromptTurnRecord[];
  runs: AgentRunRecord[];
  active_run: AgentRunRecord | null;
  /** The ids of turns QUEUED behind the active run (engine `queued_turn_ids`,
   *  agent-wire-gaps D1): the SERVED queue state the composer reads instead of a
   *  client one-slot queue. Empty when nothing is queued. */
  queued_turn_ids: string[];
  caps: SessionSnapshotCaps;
  tiers: TiersBlock;
}

/** The bounded session listing (engine `SessionListPage`). */
export interface SessionListPage {
  items: AgentSessionRecord[];
  cap: number;
  truncated: boolean;
  next_after_ms: number | null;
  next_after_session_id: string | null;
  tiers: TiersBlock;
}

/** A settled session command (create/turn/cancel/resume): the receipt + the
 *  refreshed snapshot when one was returned. `in_flight` is the replay-dedupe
 *  state a concurrent identical command coalesces to. */
export type SessionCommandOutcome =
  | {
      kind: "settled";
      command: string;
      session_id: string;
      status: string;
      receipt_id: string;
      run_id: string | null;
      snapshot: SessionSnapshot | null;
      tiers: TiersBlock;
    }
  | {
      kind: "in_flight";
      command: string;
      idempotency_key: string;
      tiers: TiersBlock;
    };

/** A tool-permission decision outcome (engine `tool_permission_outcome_response`):
 *  the served eligibility (granted or a distinct denial reason) + whether it
 *  replayed an earlier decision. */
export interface ToolPermissionOutcome {
  status: "granted" | "denied";
  command: string;
  allowed: boolean;
  reason: string | null;
  replayed: boolean;
  record: unknown;
  tiers: TiersBlock;
}

/** An interrupt-resume outcome: the resolved interrupt record + whether the
 *  resume replayed an already-recorded decision (resolve-by-id is replay-safe). */
export interface InterruptResumeOutcome {
  status: string;
  replayed: boolean;
  interrupt: unknown;
  tiers: TiersBlock;
}

/** The semantic agent-tool catalog (engine `SemanticToolCatalog`), served as an
 *  opaque descriptor list the transcript's tool-call surface reads. */
export interface AgentToolCatalog {
  schema_version: string;
  tools: unknown[];
  tiers: TiersBlock;
}

/** A prepared agent-tool call (engine `prepare_agent_tool_call`): the resolved
 *  actor + the prepared dispatch descriptor. */
export interface PreparedAgentToolCall {
  actor: ActorRef | null;
  prepared: unknown;
  tiers: TiersBlock;
}

// --- request payloads (wire shapes; snake_case as the engine deserializes) ------

export interface CreateSessionPayload {
  scope: string;
  title: string;
}

export interface StartTurnPayload {
  prompt: string;
  summary?: string;
  /** The opaque feedback-batch id this turn consumes (feedback-loop ADR D4). When
   *  present the engine verifies the batch exists and belongs to the session before
   *  starting the turn, and threads the id to the a2a run. */
  feedback_batch_id?: string;
}

/** `POST /authoring/v1/feedback-batches` payload: the reviewer's chosen comments
 *  frozen into an immutable batch keyed to one source document + revision and the
 *  session (feedback-loop ADR D4). The author is the server-resolved principal. */
export interface CreateFeedbackBatchPayload {
  session_id: string;
  source_document: string;
  source_revision: string;
  items: {
    comment_id: string;
    body: string;
    anchor: { heading_path: string[]; content_start: number; content_end: number };
  }[];
  instruction?: string;
}

/** The `{batch_id, digest}` receipt the create returns; the turn carries `batch_id`
 *  (content-addressed: `feedback-batch:<digest>`). */
export interface FeedbackBatchReceipt {
  batchId: string;
  digest: string;
}

export interface CancelRunPayload {
  reason: string;
}

export interface ResumeRunPayload {
  session_id?: string;
}

/** The typed decision the resume WRITE carries (engine `InterruptResumeDecision`,
 *  agent-wire-gaps S18): approve/reject a tool permission, OR steer the parked run
 *  with a fresh prompt. UNTAGGED on the wire (disjoint by their required fields), the
 *  SAME language the read projection speaks. */
export type AgentInterruptDecision =
  | { decision: "approve" | "reject"; comment?: string }
  | { prompt: string };

export interface ResumeInterruptPayload {
  /** The typed decision the run resumes with (S18: no longer opaque). */
  decision: AgentInterruptDecision;
}

/** Bounded interrupt resume state (engine `InterruptResumeState`). A `pending`
 *  entry is the flag a client recovers a still-open permission prompt from. */
export type InterruptResumeState = "pending" | "resolved";

/** The typed, per-kind human decision projected onto a RESOLVED interrupt (engine
 *  `InterruptDecisionProjection`, D3/S18): tagged so the client switches on `kind`.
 *  A legacy opaque blob projects as `decision_unreadable`. */
export type InterruptDecisionProjection =
  | { kind: "tool_permission"; decision: "approve" | "reject"; comment?: string }
  | { kind: "steer"; prompt: string }
  | { kind: "decision_unreadable" };

/** One interrupt as served on the recovery listing (engine `InterruptProjection`,
 *  D3): the stable id, the run it gates, its kind, the gated tool call, its resume
 *  state, and — when resolved — the typed decision projection. */
export interface AgentInterrupt {
  interrupt_id: string;
  run_id: string;
  kind: string;
  tool_call_id: string | null;
  resume_state: InterruptResumeState;
  decision: InterruptDecisionProjection | null;
  created_at_ms: number;
  updated_at_ms: number;
}

/** A bounded page of interrupt projections for one run (engine `InterruptListPage`). */
export interface InterruptListPage {
  items: AgentInterrupt[];
  cap: number;
  truncated: boolean;
  tiers: TiersBlock;
}

/** The active scope's operation-mode record (engine `GET /authoring/v1/mode`,
 *  agent-wire-gaps D5): the SERVED mode the autonomy control renders pre-proposal.
 *  `mode` is the bounded served token the client maps to a plain label. */
export interface AgentOperationMode {
  scope_id: string;
  mode: string;
  policy_id: string | null;
  policy_version: number | null;
  updated_at_ms: number;
  tiers: TiersBlock;
}

export interface ToolPermissionDecisionPayload {
  decision: "approve" | "reject";
  comment?: string;
}

/** The semantic agent-tool call input (engine `AgentToolCall`). */
export interface AgentToolCallInput {
  tool_call_id: string;
  name: string;
  idempotency_key?: string;
  input: unknown;
}

export interface SessionListParams {
  cap?: number;
  after_ms?: number;
  after_session_id?: string;
}

// --- tolerant adapters ----------------------------------------------------------

const ACTOR_KINDS: readonly ActorKind[] = ["human", "agent", "system", "tool_executor"];

function adaptActorRef(raw: unknown): ActorRef {
  const r: Rec = isRec(raw) ? raw : {};
  const kind = asStr(r.kind);
  return {
    id: asStr(r.id) ?? "",
    kind:
      kind && (ACTOR_KINDS as readonly string[]).includes(kind)
        ? (kind as ActorKind)
        : "system",
    ...(asStr(r.delegated_by) ? { delegated_by: asStr(r.delegated_by) } : {}),
  };
}

function adaptLangGraph(raw: unknown): LangGraphRef | null {
  return isRec(raw) ? (raw as LangGraphRef) : null;
}

export function adaptSessionRecord(raw: unknown): AgentSessionRecord {
  const r: Rec = isRec(raw) ? raw : {};
  return {
    schema_version: asStr(r.schema_version) ?? "",
    session_id: asStr(r.session_id) ?? "",
    scope: asStr(r.scope) ?? "",
    title: asStr(r.title) ?? "",
    status: adaptSessionStatus(r.status),
    actor: adaptActorRef(r.actor),
    langgraph: adaptLangGraph(r.langgraph),
    latest_turn_id: asStr(r.latest_turn_id) ?? null,
    latest_run_id: asStr(r.latest_run_id) ?? null,
    created_at_ms: asNum(r.created_at_ms),
    updated_at_ms: asNum(r.updated_at_ms),
    cancelled_at_ms: r.cancelled_at_ms == null ? null : asNum(r.cancelled_at_ms),
  };
}

export function adaptTurnRecord(raw: unknown): PromptTurnRecord {
  const r: Rec = isRec(raw) ? raw : {};
  return {
    schema_version: asStr(r.schema_version) ?? "",
    turn_id: asStr(r.turn_id) ?? "",
    session_id: asStr(r.session_id) ?? "",
    turn_index: asNum(r.turn_index),
    prompt_digest: asStr(r.prompt_digest) ?? "",
    prompt_text: asStr(r.prompt_text) ?? "",
    prompt_bytes: asNum(r.prompt_bytes),
    summary: asStr(r.summary) ?? null,
    actor: adaptActorRef(r.actor),
    langgraph: adaptLangGraph(r.langgraph),
    created_at_ms: asNum(r.created_at_ms),
  };
}

export function adaptRunRecord(raw: unknown): AgentRunRecord {
  const r: Rec = isRec(raw) ? raw : {};
  const status = adaptRunStatus(r.status);
  return {
    schema_version: asStr(r.schema_version) ?? "",
    run_id: asStr(r.run_id) ?? "",
    session_id: asStr(r.session_id) ?? "",
    turn_id: asStr(r.turn_id) ?? null,
    status,
    active: status === "active" && asBool(r.active),
    owner: adaptActorRef(r.owner),
    langgraph: adaptLangGraph(r.langgraph),
    cancellation_reason: asStr(r.cancellation_reason) ?? null,
    created_at_ms: asNum(r.created_at_ms),
    updated_at_ms: asNum(r.updated_at_ms),
    cancelled_at_ms: r.cancelled_at_ms == null ? null : asNum(r.cancelled_at_ms),
    completed_at_ms: r.completed_at_ms == null ? null : asNum(r.completed_at_ms),
  };
}

function adaptCaps(raw: unknown): SessionSnapshotCaps {
  const r: Rec = isRec(raw) ? raw : {};
  return { turn_cap: asNum(r.turn_cap), run_cap: asNum(r.run_cap) };
}

function adaptList<T>(raw: unknown, adapt: (item: unknown) => T): T[] {
  return Array.isArray(raw) ? raw.map(adapt) : [];
}

function adaptStrList(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string")
    : [];
}

export function adaptSessionSnapshot(raw: unknown): SessionSnapshot {
  const r: Rec = isRec(raw) ? raw : {};
  return {
    session: adaptSessionRecord(r.session),
    turns: adaptList(r.turns, adaptTurnRecord),
    runs: adaptList(r.runs, adaptRunRecord),
    active_run: r.active_run == null ? null : adaptRunRecord(r.active_run),
    queued_turn_ids: adaptStrList(r.queued_turn_ids),
    caps: adaptCaps(r.caps),
    tiers: asTiers(r.tiers),
  };
}

export function adaptSessionListPage(raw: unknown): SessionListPage {
  const r: Rec = isRec(raw) ? raw : {};
  return {
    items: adaptList(r.items, adaptSessionRecord),
    cap: asNum(r.cap),
    truncated: asBool(r.truncated),
    next_after_ms: r.next_after_ms == null ? null : asNum(r.next_after_ms),
    next_after_session_id: asStr(r.next_after_session_id) ?? null,
    tiers: asTiers(r.tiers),
  };
}

const INTERRUPT_RESUME_STATES: readonly InterruptResumeState[] = [
  "pending",
  "resolved",
];

function adaptInterruptDecisionProjection(
  raw: unknown,
): InterruptDecisionProjection | null {
  if (!isRec(raw)) return null;
  const kind = asStr(raw.kind);
  if (kind === "tool_permission") {
    const decision = asStr(raw.decision);
    return {
      kind: "tool_permission",
      decision: decision === "reject" ? "reject" : "approve",
      ...(asStr(raw.comment) ? { comment: asStr(raw.comment) } : {}),
    };
  }
  if (kind === "steer") {
    return { kind: "steer", prompt: asStr(raw.prompt) ?? "" };
  }
  // Any unrecognized/legacy projection degrades to the unreadable escape.
  return { kind: "decision_unreadable" };
}

export function adaptInterrupt(raw: unknown): AgentInterrupt {
  const r: Rec = isRec(raw) ? raw : {};
  const state = asStr(r.resume_state);
  return {
    interrupt_id: asStr(r.interrupt_id) ?? "",
    run_id: asStr(r.run_id) ?? "",
    kind: asStr(r.kind) ?? "",
    tool_call_id: asStr(r.tool_call_id) ?? null,
    resume_state:
      state && (INTERRUPT_RESUME_STATES as readonly string[]).includes(state)
        ? (state as InterruptResumeState)
        : "pending",
    decision: r.decision == null ? null : adaptInterruptDecisionProjection(r.decision),
    created_at_ms: asNum(r.created_at_ms),
    updated_at_ms: asNum(r.updated_at_ms),
  };
}

export function adaptInterruptListPage(raw: unknown): InterruptListPage {
  const r: Rec = isRec(raw) ? raw : {};
  return {
    items: adaptList(r.items, adaptInterrupt),
    cap: asNum(r.cap),
    truncated: asBool(r.truncated),
    tiers: asTiers(r.tiers),
  };
}

export function adaptOperationMode(raw: unknown): AgentOperationMode {
  const r: Rec = isRec(raw) ? raw : {};
  return {
    scope_id: asStr(r.scope_id) ?? "",
    mode: asStr(r.mode) ?? "",
    policy_id: asStr(r.policy_id) ?? null,
    policy_version: r.policy_version == null ? null : asNum(r.policy_version),
    updated_at_ms: asNum(r.updated_at_ms),
    tiers: asTiers(r.tiers),
  };
}

export function adaptSessionCommandOutcome(raw: unknown): SessionCommandOutcome {
  const r: Rec = isRec(raw) ? raw : {};
  const tiers = asTiers(r.tiers);
  const status = asStr(r.status);
  // The in-flight replay-dedupe body carries no receipt; a settled outcome always
  // does. Discriminate on the receipt so a future extra field never misroutes.
  const receipt = asStr(r.receipt_id);
  if (status === "in_flight" || !receipt) {
    return {
      kind: "in_flight",
      command: asStr(r.command) ?? "",
      idempotency_key: asStr(r.idempotency_key) ?? "",
      tiers,
    };
  }
  return {
    kind: "settled",
    command: asStr(r.command) ?? "",
    session_id: asStr(r.session_id) ?? "",
    status: status ?? "",
    receipt_id: receipt,
    run_id: asStr(r.run_id) ?? null,
    snapshot: r.snapshot == null ? null : adaptSessionSnapshot(r.snapshot),
    tiers,
  };
}

export function adaptToolPermissionOutcome(raw: unknown): ToolPermissionOutcome {
  const r: Rec = isRec(raw) ? raw : {};
  return {
    status: asBool(r.allowed) ? "granted" : "denied",
    command: asStr(r.command) ?? "",
    allowed: asBool(r.allowed),
    reason: asStr(r.reason) ?? null,
    replayed: asBool(r.replayed),
    record: r.record ?? null,
    tiers: asTiers(r.tiers),
  };
}

export function adaptInterruptResumeOutcome(raw: unknown): InterruptResumeOutcome {
  const r: Rec = isRec(raw) ? raw : {};
  return {
    status: asStr(r.status) ?? "",
    replayed: asBool(r.replayed),
    interrupt: r.interrupt ?? null,
    tiers: asTiers(r.tiers),
  };
}

export function adaptToolCatalog(raw: unknown): AgentToolCatalog {
  const r: Rec = isRec(raw) ? raw : {};
  return {
    schema_version: asStr(r.schema_version) ?? "",
    tools: Array.isArray(r.tools) ? r.tools : [],
    tiers: asTiers(r.tiers),
  };
}

export function adaptPreparedToolCall(raw: unknown): PreparedAgentToolCall {
  const r: Rec = isRec(raw) ? raw : {};
  return {
    actor: r.actor == null ? null : adaptActorRef(r.actor),
    prepared: r.prepared ?? null,
    tiers: asTiers(r.tiers),
  };
}

export function adaptFeedbackBatchReceipt(raw: unknown): FeedbackBatchReceipt {
  const r: Rec = isRec(raw) ? raw : {};
  return {
    batchId: asStr(r.batch_id) ?? "",
    digest: asStr(r.digest) ?? "",
  };
}
