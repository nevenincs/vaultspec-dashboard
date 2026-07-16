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
} from "../engine";
import { unwrapEnvelope } from "../liveAdapters";
import {
  adaptCommentList,
  adaptCommentRecord,
  commentUpdateWirePayload,
  type CommentListResult,
  type CommentRecord,
  type CommentUpdate,
  type CreateCommentPayload,
} from "../authoringComments";
import { queryClient as defaultQueryClient } from "../queryClient";
import { sseChunks, streamReducer, type StreamChunk } from "../queries";

import type {
  ActorRef,
  AppliedUnderPolicyProjection,
  ApplyPayload,
  AuthoringCommandOutcome,
  AuthoringRecoveryResult,
  AuthoringStatus,
  AuthoringStreamFrame,
  CreateProposalPayload,
  DirectWriteOutcome,
  DirectWritePayload,
  IssueActorTokenPayload,
  IssuedActorToken,
  ProposalDetail,
  ProposalListResult,
  ProposalProjection,
  ProposalSnapshotResult,
  ReviewDecisionPayload,
  RollbackPayload,
  SubmitForReviewPayload,
  Rec,
} from "./wireTypes";
import { isRec, asStr, asTiers } from "./wireTypes";
import {
  AUTHORING_STREAM_REOPEN_MS,
  AUTHORING_STREAM_RETRY_BASE_MS,
  AUTHORING_STREAM_RETRY_MAX_MS,
  adaptAuthoringRecovery,
  adaptAuthoringStatus,
  adaptAuthoringStreamFrame,
  adaptDirectWriteOutcome,
  adaptProposalDetail,
  adaptProposalList,
  adaptProposalSnapshot,
  directWriteWirePayload,
  interpretCommandOutcome,
  lastSeqBefore,
  normalizeAuthoringStreamSeq,
} from "./adapters";

// Re-export the split vocabulary + adapters so `stores/server/authoring` stays a
// stable specifier: every former export resolves here unchanged.
export * from "./wireTypes";
export * from "./adapters";
export * from "./reviewStationOutcome";
export * from "./reviewStationVocabulary";
export * from "./commentVocabulary";

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

// --- section-anchored document comments (authoring-surface ADR D2) --------------
//
// The comment vocabulary + adapters live in `./authoringComments` (module-size:
// this wire client is a grandfathered monolith that may only shrink). They are
// re-exported here so the public `stores/server/authoring` surface stays stable —
// viewer consumers still import the comment types from this specifier, and the
// comment methods below compose the re-exported adapters.
export {
  adaptCommentList,
  adaptCommentRecord,
  adaptServedComment,
} from "../authoringComments";
export type {
  SectionSelector,
  CommentOrphanEvidence,
  CommentAnchorState,
  CommentRecord,
  ServedComment,
  CommentListResult,
  CreateCommentPayload,
  CommentUpdate,
} from "../authoringComments";

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
  private baseFetch: FetchLike;

  constructor(options: AuthoringClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? AUTHORING_BASE;
    this.baseFetch = options.fetchImpl ?? defaultBearerTransport;
  }

  /** Rebind the base transport at runtime. Mirrors {@link EngineClient.useTransport}:
   *  the test harness injects the live transport so render tests that fire mutations
   *  through {@link usePlanStepTick} speak to the real engine (testing/liveSetup). */
  useTransport(fetchImpl: FetchLike): void {
    this.baseFetch = fetchImpl;
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

  // --- section-anchored document comments (authoring-surface ADR D2) ---
  //
  // The comment routes are NOT denials-are-values commands: a create/edit/delete
  // returns its record (or `deleted` flag) directly, and a genuine refusal
  // (unknown document, oversized body, unregistered actor) is a tiers-bearing
  // typed EngineError the caller surfaces — never a `denied` VALUE. The list read
  // is principal-permissive (no actor token).

  /** `GET /authoring/v1/documents/{node_id}/comments` — the bounded, backend-
   *  served comment listing. Each stored anchor is resolved EXACT-OR-CONFLICT
   *  against the current worktree body server-side, so the served `orphaned` flag
   *  is authoritative. */
  async listComments(
    nodeId: string,
    cap?: number,
    signal?: AbortSignal,
  ): Promise<CommentListResult> {
    const query =
      typeof cap === "number" ? `?cap=${encodeURIComponent(String(cap))}` : "";
    return adaptCommentList(
      await this.get(
        `/authoring/v1/documents/${encodeURIComponent(nodeId)}/comments${query}`,
        signal,
      ),
    );
  }

  /** `POST /authoring/v1/documents/{node_id}/comments` — create a section-anchored
   *  comment attributed to the resolved principal (the node id rides the route;
   *  the body carries only `{selector, body}`). Returns the created record. */
  async createComment(
    nodeId: string,
    payload: CreateCommentPayload,
    opts: CommandOptions,
  ): Promise<CommentRecord> {
    const body = await this.postJson(
      `/authoring/v1/documents/${encodeURIComponent(nodeId)}/comments`,
      {
        api_version: "v1",
        command: "create_comment",
        idempotency_key: opts.idempotencyKey ?? newIdempotencyKey("comment"),
        payload,
      },
      this.withActor(opts.actorToken),
    );
    return adaptCommentRecord(isRec(body) ? body.comment : undefined);
  }

  /** `PATCH /authoring/v1/comments/{comment_id}` — edit the body, toggle resolved,
   *  or explicitly re-anchor to the current section (one tagged op per request). */
  async updateComment(
    commentId: string,
    update: CommentUpdate,
    opts: CommandOptions,
  ): Promise<CommentRecord> {
    const body = await this.sendJson(
      "PATCH",
      `/authoring/v1/comments/${encodeURIComponent(commentId)}`,
      {
        api_version: "v1",
        command: "update_comment",
        idempotency_key: opts.idempotencyKey ?? newIdempotencyKey("comment"),
        payload: commentUpdateWirePayload(update),
      },
      this.withActor(opts.actorToken),
    );
    return adaptCommentRecord(isRec(body) ? body.comment : undefined);
  }

  /** `DELETE /authoring/v1/comments/{comment_id}` — delete a comment (idempotent:
   *  an absent id returns `deleted: false`). */
  async deleteComment(commentId: string, opts: CommandOptions): Promise<boolean> {
    const body = await this.sendJson(
      "DELETE",
      `/authoring/v1/comments/${encodeURIComponent(commentId)}`,
      {
        api_version: "v1",
        command: "delete_comment",
        idempotency_key: opts.idempotencyKey ?? newIdempotencyKey("comment"),
        payload: {},
      },
      this.withActor(opts.actorToken),
    );
    return isRec(body) && body.deleted === true;
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

  private postJson(
    path: string,
    body: unknown,
    transport: FetchLike,
  ): Promise<unknown> {
    return this.sendJson("POST", path, body, transport);
  }

  /** Issue a JSON command over an arbitrary method (POST/PATCH/DELETE), throwing a
   *  tiers-bearing `EngineError` on a 4xx/5xx fault and returning the unwrapped
   *  envelope on success. The comment PATCH/DELETE routes carry the command
   *  envelope in the body exactly like the POST commands. */
  private async sendJson(
    method: string,
    path: string,
    body: unknown,
    transport: FetchLike,
  ): Promise<unknown> {
    const response = await transport(`${this.baseUrl}${path}`, {
      method,
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
  // The per-document comment listing (authoring-surface ADR D2): keyed by
  // (scope, node id) so a scope switch re-reads and two documents never share a
  // cache entry. Under the `authoring` prefix so the existing lifecycle-stream
  // invalidation (`invalidateAuthoring`, fired on every authoring SSE frame —
  // including the `comment.created/.updated/.deleted` events) refreshes it for
  // free, the same delta path the review queue rides.
  comments: (scope: string, nodeId: string) =>
    [...authoringKeys.all, "comments", scope, nodeId] as const,
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
  /** A semantic availability state resolved to localized copy by the view. */
  availabilityIssue: "queueUnavailable" | "informationMayBeOutOfDate" | null;
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
    const availabilityIssue = degradation.storeUnavailable
      ? "queueUnavailable"
      : degradation.degraded
        ? "informationMayBeOutOfDate"
        : null;
    return {
      rows,
      afterFactRows,
      loading: isLoading && !data,
      degraded: degradation.degraded,
      storeUnavailable: degradation.storeUnavailable,
      availabilityIssue,
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
 *  the SAME fail-safe refusal, rather than re-deriving its own null check.
 *
 *  Used by the paths that already carry their own ambient bootstrap trigger —
 *  editing (mount-mints via `useEnsureCurrentEditorIdentity`) and commenting
 *  (thread-open bootstrap). The REVIEW path has no such trigger, so it uses the
 *  ambient `ensureActorToken` below instead (agentic-authoring-ux ADR D5). */
export function requireActorToken(): string {
  const token = getActorToken();
  if (!token) {
    throw new Error(
      "no authoring actor token is bootstrapped — issue one before running a command",
    );
  }
  return token;
}

// De-duplicates concurrent ambient mints: while one `ensureActorToken` mint is
// in flight, every other caller awaits the SAME promise rather than firing a
// second `issueActorToken` request. Cleared once the mint settles.
let inflightActorMint: Promise<string> | null = null;

/** Ambiently ensure a session actor token exists, minting the shared local
 *  operator principal on first use and returning it (agentic-authoring-ux ADR
 *  D5). Provenance is plumbing, not ceremony: the first mutating REVIEW intent
 *  (approve, reject, submit, apply, rollback) transparently bootstraps the token
 *  — no surface renders auth vocabulary, and a reviewer never hits a sign-in
 *  wall before acting. A present token is returned as-is (no re-mint); a failed
 *  mint rejects so the calling mutation surfaces the failure honestly. */
export async function ensureActorToken(): Promise<string> {
  const existing = getActorToken();
  if (existing) return existing;
  if (!inflightActorMint) {
    inflightActorMint = (async () => {
      const issued = await authoringClient.issueActorToken({
        actor: CURRENT_EDITOR_ACTOR,
      });
      if (!issued.raw_token) {
        throw new Error("actor-token mint returned no token");
      }
      setActorToken(issued.raw_token);
      return issued.raw_token;
    })().finally(() => {
      inflightActorMint = null;
    });
  }
  return inflightActorMint;
}

/** Record a reviewer's approve/reject decision. This is the human-in-the-loop
 *  seam — the walking skeleton "is not done until a human can click deny." A
 *  denial/refusal comes back as a `denied` OUTCOME (not a thrown error); the UI
 *  renders it as a refusal + reason. */
export function useReviewDecision() {
  return useMutation({
    mutationFn: async (args: { approvalId: string; payload: ReviewDecisionPayload }) =>
      authoringClient.reviewDecision(args.approvalId, args.payload, {
        actorToken: await ensureActorToken(),
      }),
    onSuccess: invalidateAuthoring,
  });
}

/** Submit a drafted proposal for review (validate + submit + open-approval). */
export function useSubmitForReview() {
  return useMutation({
    mutationFn: async (args: {
      changesetId: string;
      payload: SubmitForReviewPayload;
    }) =>
      authoringClient.submitForReview(args.changesetId, args.payload, {
        actorToken: await ensureActorToken(),
      }),
    onSuccess: invalidateAuthoring,
  });
}

/** Materialize an approved changeset. */
export function useApplyChangeset() {
  return useMutation({
    mutationFn: async (payload: ApplyPayload) =>
      authoringClient.applyChangeset(payload, { actorToken: await ensureActorToken() }),
    onSuccess: invalidateAuthoring,
  });
}

/** Generate a rollback of an applied changeset. */
export function useCreateRollback() {
  return useMutation({
    mutationFn: async (payload: RollbackPayload) =>
      authoringClient.createRollback(payload, { actorToken: await ensureActorToken() }),
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
