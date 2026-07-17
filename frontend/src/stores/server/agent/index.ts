// The SOLE frontend wire client for the fenced authoring AGENT plane
// (`/authoring/v1/sessions|runs|interrupts|agent-tools`): the only place that
// fetches sessions/turns/runs, holds their bounded query caches, and threads the
// ambient actor token for the mutating commands. `scene`/`app` NEVER fetch it
// (architecture-boundaries); the agent surfaces are pure consumers of the hooks
// below.
//
// It mirrors the sibling authoring review-station store: the SAME command
// envelope (`{api_version, command, idempotency_key, payload}` + the actor-token
// header), the SAME tolerant-adapter discipline, the SAME `{data, tiers}`
// envelope unwrap, and the SAME EngineError fault handling. Reads are principal-
// permissive; the mutating commands ambient-mint the actor token exactly as the
// review actions do.
//
// Live-stream wiring: session and run lifecycle events ride the shared
// authoring SSE feed the review store already pumps. This slice registers a
// listener on that shared feed (`onAuthoringLifecycleEvent`) so a
// `session.created`/`run.started` refreshes the session caches WITHOUT a poll —
// stopping the silent data loss the current-state inventory named. A terminal
// `run.completed` (and the cancel/fail terminals) refetches even an inactive
// cached session so the settled snapshot — which the transcript renders as the
// Done turn status — lands durably rather than sitting stale behind a collapsed
// panel.

import {
  keepPreviousData,
  useMutation,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";

import { bearerToken, EngineError, type FetchLike, type TiersBlock } from "../engine";
import { unwrapEnvelope } from "../liveAdapters";
import { queryClient as defaultQueryClient } from "../queryClient";
import {
  ensureActorToken,
  newIdempotencyKey,
  onAuthoringLifecycleEvent,
  useAuthoringLifecycleSubscription,
  type AuthoringLifecycleEvent,
} from "../authoring";
import {
  adaptFeedbackBatchReceipt,
  adaptInterruptListPage,
  adaptInterruptResumeOutcome,
  adaptPreparedToolCall,
  adaptSessionCommandOutcome,
  adaptSessionListPage,
  adaptSessionSnapshot,
  adaptToolCatalog,
  adaptToolPermissionOutcome,
  type AgentToolCallInput,
  type AgentToolCatalog,
  type InterruptListPage,
  type CancelRunPayload,
  type CancelSessionPayload,
  type CompleteRunPayload,
  type CreateFeedbackBatchPayload,
  type CreateSessionPayload,
  type FeedbackBatchReceipt,
  type InterruptResumeOutcome,
  type PreparedAgentToolCall,
  type ResumeInterruptPayload,
  type ResumeRunPayload,
  type SessionCommandOutcome,
  type SessionListPage,
  type SessionListParams,
  type SessionSnapshot,
  type StartTurnPayload,
  type ToolPermissionDecisionPayload,
  type ToolPermissionOutcome,
} from "./wireTypes";

export * from "./wireTypes";
export * from "./a2aTeam";

// Same base rule as the authoring/engine clients: dev proxies /api → engine; in
// production the SPA shares the engine origin and the prefix collapses.
const AGENT_BASE = import.meta.env.DEV ? "/api" : "";

/** The per-principal actor-token header the command routes resolve identity from
 *  (shared with the authoring plane — one session credential, ambient-minted). */
const ACTOR_TOKEN_HEADER = "x-authoring-actor-token";

/** The production base transport: the machine bearer from the injected meta tag,
 *  identical to `AuthoringClient`. The test harness swaps this for the live
 *  transport carrying the spawned engine's bearer. */
const defaultBearerTransport: FetchLike = (input, init) => {
  const bearer = bearerToken();
  if (!bearer) return fetch(input, init);
  const headers = new Headers(init?.headers);
  if (!headers.has("authorization")) {
    headers.set("Authorization", `Bearer ${bearer}`);
  }
  return fetch(input, { ...init, headers });
};

/** Build a tiers-preserving `EngineError` from a non-ok agent response, so a
 *  degraded-store 503 or a 409 conflict reaches the consumer as degradation
 *  truth, never a tiers-less bare failure (wire-contract). */
async function agentErrorFrom(path: string, response: Response): Promise<EngineError> {
  let body: unknown;
  let tiers: TiersBlock | undefined;
  try {
    body = unwrapEnvelope(await response.json());
    if (
      body &&
      typeof body === "object" &&
      "tiers" in body &&
      typeof (body as { tiers: unknown }).tiers === "object"
    ) {
      tiers = (body as { tiers: TiersBlock }).tiers;
    }
  } catch {
    // No structured JSON body — nothing to preserve.
  }
  return new EngineError(path, response.status, { tiers, body });
}

export interface AgentClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

interface CommandOptions {
  actorToken: string;
  idempotencyKey?: string;
}

/**
 * The agent wire client. Lives in `stores/` (the sole wire client boundary);
 * `scene`/`app` consume its hooks, never it directly. Reads pass no token; a
 * command threads the actor-token header + an idempotency envelope.
 */
export class AgentClient {
  readonly baseUrl: string;
  private baseFetch: FetchLike;

  constructor(options: AgentClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? AGENT_BASE;
    this.baseFetch = options.fetchImpl ?? defaultBearerTransport;
  }

  /** Rebind the base transport (the live-wire test harness injects the spawned
   *  engine's transport, so the SAME client code runs against the real engine). */
  useTransport(fetchImpl: FetchLike): void {
    this.baseFetch = fetchImpl;
  }

  private withActor(actorToken?: string): FetchLike {
    return (input, init) => {
      if (!actorToken) return this.baseFetch(input, init);
      const headers = new Headers(init?.headers);
      headers.set(ACTOR_TOKEN_HEADER, actorToken);
      return this.baseFetch(input, { ...init, headers });
    };
  }

  // --- reads (principal-permissive) ---

  /** `GET /authoring/v1/sessions` — the bounded session listing. */
  async listSessions(
    params: SessionListParams = {},
    signal?: AbortSignal,
  ): Promise<SessionListPage> {
    const query = new URLSearchParams();
    if (typeof params.cap === "number") query.set("cap", String(params.cap));
    if (typeof params.after_ms === "number") {
      query.set("after_ms", String(params.after_ms));
    }
    if (params.after_session_id) {
      query.set("after_session_id", params.after_session_id);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return adaptSessionListPage(
      await this.get(`/authoring/v1/sessions${suffix}`, signal),
    );
  }

  /** `GET /authoring/v1/sessions/{id}` — one durable session snapshot. An unknown
   *  (or malformed) session id FAULTS on the wire (the engine maps an unknown
   *  session to a 422, not a silent empty), so it rejects with a tiers-bearing
   *  `EngineError` the query surfaces as an error state — never a fabricated
   *  empty snapshot. */
  async getSession(sessionId: string, signal?: AbortSignal): Promise<SessionSnapshot> {
    return adaptSessionSnapshot(
      await this.get(`/authoring/v1/sessions/${encodeURIComponent(sessionId)}`, signal),
    );
  }

  /** `GET /authoring/v1/agent-tools` — the semantic agent-tool catalog. */
  async toolCatalog(signal?: AbortSignal): Promise<AgentToolCatalog> {
    return adaptToolCatalog(await this.get("/authoring/v1/agent-tools", signal));
  }

  /** `GET /authoring/v1/runs/{run_id}/interrupts` — the bounded, raise-order pending
   *  interrupt listing for a run (agent-wire-gaps D3). The SERVED recovery read that
   *  replaces the client-staged interrupt annex: a client reads its pending
   *  `awaiting_permission` interrupts (and their typed decision projections) back from
   *  here instead of retaining the tool-execute response. */
  async listRunInterrupts(
    runId: string,
    signal?: AbortSignal,
  ): Promise<InterruptListPage> {
    return adaptInterruptListPage(
      await this.get(
        `/authoring/v1/runs/${encodeURIComponent(runId)}/interrupts`,
        signal,
      ),
    );
  }

  // --- mutating commands (ambient actor token) ---

  /** `POST /authoring/v1/sessions` — open a durable authoring session. */
  async createSession(
    payload: CreateSessionPayload,
    opts: CommandOptions,
  ): Promise<SessionCommandOutcome> {
    return adaptSessionCommandOutcome(
      await this.command("/authoring/v1/sessions", "create_session", payload, opts),
    );
  }

  /** `POST /authoring/v1/sessions/{id}/turns` — start a prompt turn (or join the
   *  session's active run). */
  async startTurn(
    sessionId: string,
    payload: StartTurnPayload,
    opts: CommandOptions,
  ): Promise<SessionCommandOutcome> {
    return adaptSessionCommandOutcome(
      await this.command(
        `/authoring/v1/sessions/${encodeURIComponent(sessionId)}/turns`,
        "start_prompt_turn",
        payload,
        opts,
      ),
    );
  }

  /** `POST /authoring/v1/feedback-batches` — freeze the reviewer's chosen comments
   *  into an immutable engine feedback batch (feedback-loop ADR D4). Dual-auth like
   *  every authoring command (machine bearer + the ambient actor token; the author
   *  is the server-resolved principal). Returns the content-addressed
   *  `{batch_id, digest}`; the next turn carries the `batch_id`. */
  async createFeedbackBatch(
    payload: CreateFeedbackBatchPayload,
    opts: CommandOptions,
  ): Promise<FeedbackBatchReceipt> {
    return adaptFeedbackBatchReceipt(
      await this.command(
        "/authoring/v1/feedback-batches",
        "create_feedback_batch",
        payload,
        opts,
      ),
    );
  }

  /** `POST /authoring/v1/runs/{id}/cancel` — record a durable run cancellation. */
  async cancelRun(
    runId: string,
    payload: CancelRunPayload,
    opts: CommandOptions,
  ): Promise<SessionCommandOutcome> {
    return adaptSessionCommandOutcome(
      await this.command(
        `/authoring/v1/runs/${encodeURIComponent(runId)}/cancel`,
        "cancel_run",
        payload,
        opts,
      ),
    );
  }

  /** `POST /authoring/v1/sessions/{id}/cancel` — explicitly END the conversation
   *  (agent-wire-gaps D2, S45): cancels the active run, voids queued turns, and marks
   *  the session cancelled. Distinct from the run-scoped `cancelRun` (Stop), which
   *  leaves the session active. */
  async cancelSession(
    sessionId: string,
    payload: CancelSessionPayload,
    opts: CommandOptions,
  ): Promise<SessionCommandOutcome> {
    return adaptSessionCommandOutcome(
      await this.command(
        `/authoring/v1/sessions/${encodeURIComponent(sessionId)}/cancel`,
        "cancel_session",
        payload,
        opts,
      ),
    );
  }

  /** `POST /authoring/v1/runs/{id}/complete` — the driver-reported run settle
   *  (agent-wire-gaps D1, S61): transitions the run to its terminal state and emits
   *  `run.completed`, which the lifecycle feed consumes to render Done/Failed and to
   *  promote the next queued turn. Without this call a client-driven run never
   *  completes. `completed` carries no failure_reason; `failed` requires one. */
  async completeRun(
    runId: string,
    payload: CompleteRunPayload,
    opts: CommandOptions,
  ): Promise<SessionCommandOutcome> {
    return adaptSessionCommandOutcome(
      await this.command(
        `/authoring/v1/runs/${encodeURIComponent(runId)}/complete`,
        "complete_run",
        payload,
        opts,
      ),
    );
  }

  /** `POST /authoring/v1/runs/{id}/resume` — join/read an existing run. */
  async resumeRun(
    runId: string,
    payload: ResumeRunPayload,
    opts: CommandOptions,
  ): Promise<SessionCommandOutcome> {
    return adaptSessionCommandOutcome(
      await this.command(
        `/authoring/v1/runs/${encodeURIComponent(runId)}/resume`,
        "resume_run",
        payload,
        opts,
      ),
    );
  }

  /** `POST /authoring/v1/interrupts/{id}/resume` — resume a parked run by
   *  resolving its interrupt (replay-safe: an already-resolved interrupt returns
   *  its recorded decision unchanged). */
  async resumeInterrupt(
    interruptId: string,
    payload: ResumeInterruptPayload,
    opts: CommandOptions,
  ): Promise<InterruptResumeOutcome> {
    const body = await this.command(
      `/authoring/v1/interrupts/${encodeURIComponent(interruptId)}/resume`,
      "resume_run",
      payload,
      opts,
    );
    return adaptInterruptResumeOutcome(body);
  }

  /** `POST /authoring/v1/agent-tools/{id}/permission-decision` — a human grants
   *  or rejects a queued tool-permission request. The reviewer is the server-
   *  resolved principal; an authority denial rides the 200 envelope as a value. */
  async decideToolPermission(
    toolCallId: string,
    payload: ToolPermissionDecisionPayload,
    opts: CommandOptions,
  ): Promise<ToolPermissionOutcome> {
    const body = await this.command(
      `/authoring/v1/agent-tools/${encodeURIComponent(toolCallId)}/permission-decision`,
      "request_tool_permission",
      payload,
      opts,
    );
    return adaptToolPermissionOutcome(body);
  }

  /** `POST /authoring/v1/agent-tools/prepare` — validate one semantic tool call
   *  and return the dispatch alias it would use (no execution). */
  async prepareToolCall(
    payload: AgentToolCallInput,
    opts: CommandOptions,
  ): Promise<PreparedAgentToolCall> {
    const body = await this.command(
      "/authoring/v1/agent-tools/prepare",
      "request_tool_permission",
      payload,
      opts,
    );
    return adaptPreparedToolCall(body);
  }

  /** `POST /authoring/v1/runs/{id}/agent-tools/execute` — run one semantic tool
   *  call through the permission gate. The
   *  served body is a tool-execute value the caller interprets. */
  async executeToolCall(
    runId: string,
    payload: AgentToolCallInput,
    opts: CommandOptions,
  ): Promise<unknown> {
    return this.command(
      `/authoring/v1/runs/${encodeURIComponent(runId)}/agent-tools/execute`,
      "request_tool_permission",
      payload,
      opts,
    );
  }

  // --- transport (mirrors AuthoringClient) ---

  private async get(path: string, signal?: AbortSignal): Promise<unknown> {
    const response = await this.withActor()(
      `${this.baseUrl}${path}`,
      signal ? { signal } : undefined,
    );
    if (!response.ok) throw await agentErrorFrom(path, response);
    return unwrapEnvelope(await response.json());
  }

  private async command(
    path: string,
    command: string,
    payload: unknown,
    opts: CommandOptions,
  ): Promise<unknown> {
    const envelope = {
      api_version: "v1",
      command,
      idempotency_key: opts.idempotencyKey ?? newIdempotencyKey("agent"),
      payload,
    };
    const response = await this.withActor(opts.actorToken)(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
    });
    if (!response.ok) throw await agentErrorFrom(path, response);
    return unwrapEnvelope(await response.json());
  }
}

/** The app-wide agent client, bound to the live engine origin. */
export const agentClient = new AgentClient();

// --- query keys + bounded caches ------------------------------------------------

export const agentKeys = {
  all: ["agent"] as const,
  sessions: () => [...agentKeys.all, "sessions"] as const,
  sessionList: (params: SessionListParams) =>
    [...agentKeys.sessions(), "list", params] as const,
  session: (sessionId: string) =>
    [...agentKeys.sessions(), "detail", sessionId] as const,
  toolCatalog: () => [...agentKeys.all, "tool-catalog"] as const,
  runInterrupts: (runId: string) =>
    [...agentKeys.all, "run-interrupts", runId] as const,
};

/** Invalidate the whole agent read cache — fired after a mutating command and by
 *  the shared-feed lifecycle listener below. */
export function invalidateAgent(): void {
  void defaultQueryClient.invalidateQueries({ queryKey: agentKeys.all });
}

/** Invalidate only the session caches (list + open snapshots). Fired by the
 *  lifecycle listener on a session/run event so an open panel refreshes without a
 *  poll while the tool catalog (static) is left untouched.
 *
 *  `includeInactive` carries the terminal-vs-in-flight distinction: an in-flight
 *  event refreshes only the ACTIVE (on-screen) caches — react-query's default —
 *  so a streaming run does not churn every backgrounded session. A terminal run
 *  event is the run's LAST event, so it refetches even an INACTIVE cached session
 *  detail (`refetchType: "all"`); the settled snapshot (and its served terminal
 *  status the transcript renders as Done) lands durably rather than sitting stale-
 *  "working" behind a collapsed panel until the next focus-driven refetch. */
function invalidateAgentSessions(options: { includeInactive?: boolean } = {}): void {
  void defaultQueryClient.invalidateQueries({
    queryKey: agentKeys.sessions(),
    refetchType: options.includeInactive ? "all" : "active",
  });
}

// --- reads (bounded staleTime/gcTime per resource-bounds) -----------------------

/** The bounded session listing. `placeholderData: keepPreviousData` keeps the
 *  list smooth across a cursor advance. */
export function useSessionList(
  params: SessionListParams = {},
): UseQueryResult<SessionListPage, Error> {
  return useQuery({
    queryKey: agentKeys.sessionList(params),
    queryFn: ({ signal }) => agentClient.listSessions(params, signal),
    placeholderData: keepPreviousData,
    staleTime: 2_000,
    gcTime: 60_000,
  });
}

/** One session snapshot, enabled only for a non-empty id. */
export function useSession(
  sessionId: string | null,
): UseQueryResult<SessionSnapshot, Error> {
  return useQuery({
    queryKey: agentKeys.session(sessionId ?? ""),
    queryFn: ({ signal }) => agentClient.getSession(sessionId ?? "", signal),
    enabled: !!sessionId,
    placeholderData: keepPreviousData,
    staleTime: 2_000,
    gcTime: 60_000,
  });
}

/** The semantic agent-tool catalog. The catalog is effectively static, so it is
 *  cached long but still bounded (gcTime) — never `staleTime: Infinity`. */
export function useAgentToolCatalog(): UseQueryResult<AgentToolCatalog, Error> {
  return useQuery({
    queryKey: agentKeys.toolCatalog(),
    queryFn: ({ signal }) => agentClient.toolCatalog(signal),
    staleTime: 300_000,
    gcTime: 600_000,
  });
}

/** The bounded pending-interrupt listing for a run (agent-wire-gaps D3, S41): the
 *  SERVED recovery read the transcript's Approve/Deny surface consumes instead of a
 *  client-staged annex. Enabled only for a live run; the shared lifecycle feed
 *  invalidates the agent caches so a newly-parked run refreshes without a poll. */
export function useRunInterrupts(
  runId: string | null,
): UseQueryResult<InterruptListPage, Error> {
  return useQuery({
    queryKey: agentKeys.runInterrupts(runId ?? ""),
    queryFn: ({ signal }) => agentClient.listRunInterrupts(runId ?? "", signal),
    enabled: !!runId,
    placeholderData: keepPreviousData,
    staleTime: 2_000,
    gcTime: 60_000,
  });
}

// The operation-mode read lives in ONE home (S43): the authoring store's
// `useAuthoringOperationMode`, consumed by `useReviewStationView` for the autonomy
// control's pre-proposal fallback. It was consolidated OUT of this slice (no agent
// surface reads it) to avoid a duplicate hook against the same route.

// --- mutating commands (ambient actor token) -----------------------------------

/** Open a durable authoring session. */
export function useCreateSession() {
  return useMutation({
    mutationFn: async (payload: CreateSessionPayload) =>
      agentClient.createSession(payload, { actorToken: await ensureActorToken() }),
    onSuccess: invalidateAgent,
  });
}

/** Start a prompt turn in a session (or join its active run). */
export function useStartTurn() {
  return useMutation({
    mutationFn: async (args: { sessionId: string; payload: StartTurnPayload }) =>
      agentClient.startTurn(args.sessionId, args.payload, {
        actorToken: await ensureActorToken(),
      }),
    onSuccess: invalidateAgent,
  });
}

/** Freeze the composer's staged comments into an engine feedback batch, returning
 *  its content-addressed id for the turn to carry (feedback-loop ADR D4). Does not
 *  invalidate the session caches — a batch is immutable and not a session event. */
export function useCreateFeedbackBatch() {
  return useMutation({
    mutationFn: async (payload: CreateFeedbackBatchPayload) =>
      agentClient.createFeedbackBatch(payload, {
        actorToken: await ensureActorToken(),
      }),
  });
}

/** Cancel (stop) a streaming run. */
export function useCancelRun() {
  return useMutation({
    mutationFn: async (args: { runId: string; payload: CancelRunPayload }) =>
      agentClient.cancelRun(args.runId, args.payload, {
        actorToken: await ensureActorToken(),
      }),
    onSuccess: invalidateAgent,
  });
}

/** Explicitly END the conversation (S45): cancel the active run, void queued turns,
 *  and mark the session cancelled. Distinct from Stop (`useCancelRun`), which is
 *  run-scoped and leaves the session active. */
export function useCancelSession() {
  return useMutation({
    mutationFn: async (args: { sessionId: string; payload: CancelSessionPayload }) =>
      agentClient.cancelSession(args.sessionId, args.payload, {
        actorToken: await ensureActorToken(),
      }),
    onSuccess: invalidateAgent,
  });
}

/** Report a run's terminal settle (S61): the driver calls this on finish so
 *  `run.completed` fires and the run transitions to Done/Failed. */
export function useCompleteRun() {
  return useMutation({
    mutationFn: async (args: { runId: string; payload: CompleteRunPayload }) =>
      agentClient.completeRun(args.runId, args.payload, {
        actorToken: await ensureActorToken(),
      }),
    onSuccess: invalidateAgent,
  });
}

/** Join/read an existing run. */
export function useResumeRun() {
  return useMutation({
    mutationFn: async (args: { runId: string; payload: ResumeRunPayload }) =>
      agentClient.resumeRun(args.runId, args.payload, {
        actorToken: await ensureActorToken(),
      }),
    onSuccess: invalidateAgent,
  });
}

/** Resume a parked run by resolving its interrupt (steer). */
export function useResumeInterrupt() {
  return useMutation({
    mutationFn: async (args: {
      interruptId: string;
      payload: ResumeInterruptPayload;
    }) =>
      agentClient.resumeInterrupt(args.interruptId, args.payload, {
        actorToken: await ensureActorToken(),
      }),
    onSuccess: invalidateAgent,
  });
}

/** Decide (allow/deny) a queued tool-permission request. */
export function useDecideToolPermission() {
  return useMutation({
    mutationFn: async (args: {
      toolCallId: string;
      payload: ToolPermissionDecisionPayload;
    }) =>
      agentClient.decideToolPermission(args.toolCallId, args.payload, {
        actorToken: await ensureActorToken(),
      }),
    onSuccess: invalidateAgent,
  });
}

// --- shared-feed lifecycle routing ----------------------------------------------

/** The lifecycle aggregate kinds whose events belong to the agent plane. A
 *  `session.created`/`run.started` (and every later session/run transition,
 *  through the terminal `run.completed`/`run.cancelled`/`run.failed`) rides the
 *  SHARED authoring SSE feed; this slice refreshes its session caches on them so a
 *  session/run transition appears without a poll. */
const AGENT_LIFECYCLE_AGGREGATES: ReadonlySet<string> = new Set(["session", "run"]);

/** The specific TURN-aggregate event kinds the agent slice reacts to (S37). We do
 *  NOT widen `AGENT_LIFECYCLE_AGGREGATES` to include the whole `turn` aggregate —
 *  that would push every turn-aggregate event to every consumer of this predicate
 *  (which none of them handle). Only `turn.queued` changes a session snapshot's
 *  served `queued_turn_ids`, so we match that ONE kind precisely and refresh the
 *  session caches for it. */
const AGENT_TURN_EVENT_KINDS: ReadonlySet<string> = new Set(["turn.queued"]);

/** The run lifecycle event kinds that SETTLE a run. `run.completed` (the driver-
 *  reported normal settle) joins the cancel/fail terminals: each is the run's LAST
 *  event, after which the transcript renders the served terminal status verbatim
 *  (`completed` -> Done). A terminal event therefore invalidates more aggressively
 *  than an in-flight one — see `invalidateAgentSessions`. */
const TERMINAL_RUN_EVENT_KINDS: ReadonlySet<string> = new Set([
  "run.completed",
  "run.cancelled",
  "run.failed",
]);

/** The SESSION lifecycle event kinds that terminate a session (S37): an explicit
 *  `session.cancelled` is the session's last state change, so — like a terminal run —
 *  it must reach inactive caches to land the cancelled snapshot even behind a
 *  collapsed panel. */
const TERMINAL_SESSION_EVENT_KINDS: ReadonlySet<string> = new Set([
  "session.cancelled",
]);

/** True when a shared-feed lifecycle event belongs to the agent plane and this slice
 *  should refresh for it: a session or run aggregate event, OR the specific
 *  `turn.queued` kind (S37) that changes served queue state. */
export function isAgentLifecycleEvent(event: AuthoringLifecycleEvent): boolean {
  return (
    AGENT_LIFECYCLE_AGGREGATES.has(event.aggregate_kind) ||
    AGENT_TURN_EVENT_KINDS.has(event.event_kind)
  );
}

/** True when a shared-feed event is a run or session that has settled (terminal), so
 *  its invalidation must reach inactive caches to land the settled snapshot. Exported
 *  so the adapter test drives the terminal-vs-in-flight distinction directly. */
export function isTerminalRunLifecycleEvent(event: AuthoringLifecycleEvent): boolean {
  return (
    (event.aggregate_kind === "run" &&
      TERMINAL_RUN_EVENT_KINDS.has(event.event_kind)) ||
    (event.aggregate_kind === "session" &&
      TERMINAL_SESSION_EVENT_KINDS.has(event.event_kind))
  );
}

/** Route one shared-feed lifecycle event into the agent caches. Exported so the
 *  adapter test drives it directly, and registered on the shared feed below. A
 *  terminal run/session event lands the settled snapshot even for an inactive
 *  session; a `turn.queued` refreshes the active session's served queue state. */
export function routeAgentLifecycleEvent(event: AuthoringLifecycleEvent): void {
  if (!isAgentLifecycleEvent(event)) return;
  invalidateAgentSessions({ includeInactive: isTerminalRunLifecycleEvent(event) });
}

/**
 * Own the shared durable lifecycle connection for the agent surface. The agent
 * panel is mounted for the lifetime of the application shell, including while
 * collapsed, so session and run events continue to reach this slice without
 * depending on review or comment surfaces being open.
 */
export function useAgentLifecycleSubscription(): void {
  useAuthoringLifecycleSubscription();
}

// Register on the shared authoring lifecycle feed at module load, so a
// `session.created`/`run.started` (previously dropped for want of a consumer)
// refreshes the agent caches the moment this slice is in play. The slice is a
// process-lifetime singleton, so the registration never needs teardown.
onAuthoringLifecycleEvent(routeAgentLifecycleEvent);
