// The SOLE frontend client for a2a TEAM runs (agentic-authoring-ux ADR D9,
// a2a-orchestration-edge ADR D1/D3). The frontend NEVER calls the a2a gateway
// directly — every team operation transits the engine's whitelisted
// `/ops/a2a/{verb}` pass-through (`presets-list` feeds the Team selector,
// `run-start`/`run-status`/`run-cancel` bind team runs, `service-state` feeds
// degradation) and the per-run progress relay (`/ops/a2a/runs/{id}/stream`).
//
// Degradation is read from `tiers` ONLY (never a transport error): a2a-down
// renders the Team selector disabled-with-reason while single-agent authoring
// keeps working. Relay frames are non-authoritative (ADR D3) — truth is recovered
// by re-reading `run-status`, never reconstructed from a relay frame; when the
// relay signals a gap or degrades, the consumer falls back to bounded run-status
// polling with honest state, never faked liveness.

import {
  experimental_streamedQuery as streamedQuery,
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  bearerToken,
  CANONICAL_TIERS,
  EngineError,
  type FetchLike,
  type TiersBlock,
} from "../engine";
import { tiersFromQuery } from "../engine/tiers";
import { unwrapEnvelope } from "../liveAdapters";
import {
  adaptRelayFrame,
  EMPTY_RELAY_TRANSCRIPT,
  latestRelaySeq,
  relayFrameForcesReconcile,
  relayFrameIsTerminal,
  relayTranscriptReducer,
  relayTranscriptReconciliationGeneration,
  type RelayTranscriptFrame,
  type RelayTranscriptState,
} from "../liveAdapters/a2aRelay";
import { StreamLostError } from "../../../platform/policy/failurePolicy";
import { sseChunks } from "../queries/streams";
import { asBool, asStr, asTiers, isRec, type Rec } from "../authoring";

// Dev proxies `/api` → engine; production shares the engine origin.
const A2A_BASE = import.meta.env.DEV ? "/api" : "";

/** The machine-bearer transport (the `/ops/a2a/*` pass-through is machine-bearer-
 *  gated, NOT actor-token-gated — it carries no authoring identity). Mirrors the
 *  engine client's default transport. */
const defaultBearerTransport: FetchLike = (input, init) => {
  const bearer = bearerToken();
  if (!bearer) return fetch(input, init);
  const headers = new Headers(init?.headers);
  if (!headers.has("authorization")) headers.set("Authorization", `Bearer ${bearer}`);
  return fetch(input, { ...init, headers });
};

// --- served shapes (tolerant, wire values pass through snake_case) --------------

/** One selectable team preset (the a2a `PresetSummary`, forwarded through the
 *  pass-through). A preset that failed to load is still listed with
 *  `loadable:false` and a reason — the truthful set, never omitted. */
export interface TeamPreset {
  readonly id: string;
  readonly loadable: boolean;
  readonly unavailable_reason?: string;
  readonly display_name?: string;
  readonly description?: string;
  readonly topology?: string;
  readonly worker_count?: number;
  readonly required_roles: string[];
  readonly authoring_capability?: string;
  readonly is_mock: boolean;
  readonly origin?: string;
  readonly default_profile_id?: string;
}

/** The a2a run-start acknowledgement (the `RunStartResponse`), or a business
 *  refusal the sibling answered (a 4xx forwarded verbatim with `sibling_status`). */
export interface TeamRunStartResult {
  readonly ok: boolean;
  readonly run_id?: string;
  readonly status?: string;
  readonly nickname?: string;
  readonly eligible?: boolean;
  readonly profile_id?: string;
  /** The sibling HTTP status when it refused (>=400), else undefined. */
  readonly sibling_status?: number;
  /** The refusal detail the sibling served (its `detail` field). */
  readonly refusal_detail?: string;
  readonly tiers?: TiersBlock;
}

/** The a2a run-status recovery snapshot — the AUTHORITATIVE run truth. Wire values
 *  pass through; the frontend never derives status. */
export interface TeamRunStatus {
  readonly run_id: string;
  readonly status: string;
  readonly semantic_phase?: string;
  readonly feature_tag?: string;
  readonly authoring_session_id?: string;
  readonly proposal_ids: string[];
  readonly changeset_ids: string[];
  readonly last_sequence?: number;
  readonly tiers?: TiersBlock;
}

/** The a2a service readiness snapshot (`service-state`). */
export interface A2aServiceState {
  readonly status?: string;
  readonly alive?: boolean;
  readonly ready?: boolean;
  readonly can_accept_run?: boolean;
  readonly service_version?: string;
  readonly degraded_reasons: string[];
  readonly tiers?: TiersBlock;
}

/** The engine pass-through envelope, unwrapped: the sibling body under `envelope`,
 *  the optional `sibling_status` (present on a business refusal), and the tiers.
 *  Exported so the pure adapters below are unit-testable without a wire double. */
export interface PassThrough {
  readonly envelope: unknown;
  readonly siblingStatus?: number;
  readonly tiers?: TiersBlock;
}

export interface TeamRunStartPayload {
  run_id: string;
  team_preset: string;
  message: string;
  expected_scope: string;
  feature_tag?: string;
  profile_id?: string;
  title?: string;
  autonomous?: boolean;
}

/** Create the path-safe idempotency identity for one deliberate run-start
 * submission. The exact payload object (and therefore this id) is retained by
 * `startRun` across its bounded transport retry. A later user submit calls this
 * again and receives a fresh identity. */
export function createTeamRunId(): string {
  return `run-${crypto.randomUUID().replaceAll("-", "")}`;
}

const TERMINAL_TEAM_RUN_STATUSES: ReadonlySet<string> = new Set([
  "archived",
  "cancelled",
  "completed",
  "failed",
]);

/** Authoritative lifecycle classification over the reviewed sibling vocabulary.
 * Unknown/future values fail closed as nonterminal, so a relay presentation frame
 * can never independently license Dismiss or hide Cancel. */
export function isTeamRunTerminalStatus(status: string | undefined): boolean {
  return status !== undefined && TERMINAL_TEAM_RUN_STATUSES.has(status);
}

/** Scope-gate a cached authoritative snapshot before it can affect another run's
 * controls. This specifically fences React Query's `keepPreviousData` handoff. */
export function scopedTeamRunStatus(
  runId: string | null,
  status: TeamRunStatus | undefined,
): TeamRunStatus | undefined {
  return status?.run_id === runId ? status : undefined;
}

// --- tolerant adapters ----------------------------------------------------------

const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function adaptPreset(raw: unknown): TeamPreset | null {
  if (!isRec(raw)) return null;
  const id = asStr(raw.id);
  if (!id) return null;
  return {
    id,
    loadable: asBool(raw.loadable),
    unavailable_reason: asStr(raw.unavailable_reason),
    display_name: asStr(raw.display_name),
    description: asStr(raw.description),
    topology: asStr(raw.topology),
    worker_count: typeof raw.worker_count === "number" ? raw.worker_count : undefined,
    required_roles: strArr(raw.required_roles),
    authoring_capability: asStr(raw.authoring_capability),
    is_mock: asBool(raw.is_mock),
    origin: asStr(raw.origin),
    default_profile_id: asStr(raw.default_profile_id),
  };
}

/** Adapt the presets-list pass-through: the sibling `{presets:[...]}` (or null
 *  when a2a is down) into a bounded, tolerant list with the tiers block preserved
 *  for the degradation read. */
export function adaptPresetsList(pass: PassThrough): {
  presets: TeamPreset[];
  tiers?: TiersBlock;
} {
  const env = pass.envelope;
  const rawList = isRec(env) && Array.isArray(env.presets) ? env.presets : [];
  const presets = rawList.map(adaptPreset).filter((p): p is TeamPreset => p !== null);
  return { presets, tiers: pass.tiers };
}

export function adaptRunStart(pass: PassThrough): TeamRunStartResult {
  const env = pass.envelope;
  const refused = pass.siblingStatus !== undefined && pass.siblingStatus >= 400;
  if (refused || !isRec(env)) {
    return {
      ok: false,
      sibling_status: pass.siblingStatus,
      refusal_detail: isRec(env) ? asStr(env.detail) : undefined,
      tiers: pass.tiers,
    };
  }
  return {
    ok: true,
    run_id: asStr(env.run_id),
    status: asStr(env.status),
    nickname: asStr(env.nickname),
    eligible: env.eligible === undefined ? undefined : asBool(env.eligible),
    profile_id: asStr(env.profile_id),
    tiers: pass.tiers,
  };
}

export function adaptRunStatus(pass: PassThrough): TeamRunStatus {
  const env: Rec = isRec(pass.envelope) ? pass.envelope : {};
  return {
    run_id: asStr(env.run_id) ?? "",
    status: asStr(env.status) ?? "unknown",
    semantic_phase: asStr(env.semantic_phase),
    feature_tag: asStr(env.feature_tag),
    authoring_session_id: asStr(env.authoring_session_id),
    proposal_ids: strArr(env.proposal_ids),
    changeset_ids: strArr(env.changeset_ids),
    last_sequence:
      typeof env.last_sequence === "number" ? env.last_sequence : undefined,
    tiers: pass.tiers,
  };
}

/** One live (non-terminal) team run for the active workspace, from the a2a
 *  `active-runs` discovery projection (`ActiveRunsResponse.runs[]`). Identity-only
 *  by contract — no prompt/transcript, just enough to REBIND a viewing panel that
 *  lost its client-side run handle on reload. */
export interface ActiveTeamRun {
  readonly run_id: string;
  readonly status: string;
  readonly feature_tag?: string;
}

/** The adapted active-run discovery result: the bounded list plus the sibling's
 *  `truncated` flag (the a2a projection is capped) and the tiers block. */
export interface ActiveRunsResult {
  readonly state: "active";
  readonly runs: ActiveTeamRun[];
  readonly truncated: boolean;
  readonly contractValid: boolean;
  readonly tiers?: TiersBlock;
}

const ACTIVE_THREAD_STATUSES = new Set([
  "submitted",
  "running",
  "input_required",
  "cancelling",
  "repair_needed",
  "reconciling",
]);

/** Active discovery is a reload binding, so its envelope is intentionally
 * stricter than the presentation-oriented adapters: every canonical tier must
 * be present with a boolean verdict before any identity can be trusted. */
function hasCanonicalTiers(tiers: TiersBlock | undefined): tiers is TiersBlock {
  const agent = tiers?.agent;
  return (
    tiers !== undefined &&
    CANONICAL_TIERS.every((tier) => typeof tiers[tier]?.available === "boolean") &&
    (agent === undefined || typeof agent?.available === "boolean")
  );
}

export function adaptActiveRuns(pass: PassThrough): ActiveRunsResult {
  const env = pass.envelope;
  const invalid = (): ActiveRunsResult => ({
    state: "active",
    runs: [],
    truncated: true,
    contractValid: false,
    tiers: pass.tiers,
  });
  if (
    pass.siblingStatus !== undefined ||
    !hasCanonicalTiers(pass.tiers) ||
    !readAgentTierAvailability(pass.tiers).available ||
    !isRec(env) ||
    env.api_version !== "v1" ||
    env.state !== "active" ||
    typeof env.truncated !== "boolean" ||
    !Array.isArray(env.runs) ||
    env.runs.length > 2
  ) {
    return invalid();
  }

  const boundedToken = (value: unknown, max: number): string | undefined => {
    if (typeof value !== "string" || value.length === 0 || value.length > max) {
      return undefined;
    }
    return /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/.test(value) ? value : undefined;
  };
  const runs: ActiveTeamRun[] = [];
  for (const raw of env.runs) {
    if (!isRec(raw)) return invalid();
    const run_id =
      typeof raw.run_id === "string" &&
      raw.run_id.length > 0 &&
      raw.run_id.length <= 128 &&
      /^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(raw.run_id)
        ? raw.run_id
        : undefined;
    const status = boundedToken(raw.status, 64);
    const feature_tag =
      raw.feature_tag === undefined || raw.feature_tag === null
        ? undefined
        : boundedToken(raw.feature_tag, 128);
    if (
      !run_id ||
      !status ||
      !ACTIVE_THREAD_STATUSES.has(status) ||
      (raw.feature_tag != null && !feature_tag)
    )
      return invalid();
    runs.push({ run_id, status, feature_tag });
  }
  return {
    state: "active",
    runs,
    truncated: env.truncated,
    contractValid: true,
    tiers: pass.tiers,
  };
}

/** Select the only safe reload binding. Discovery is non-authoritative and may
 *  be scan-truncated, so a caller may rebind only one complete result; zero,
 *  multiple, or any truncation stays deliberately ambiguous. */
export function recoverableActiveRunId(
  result: ActiveRunsResult | undefined,
): string | null {
  if (!result?.contractValid || result.truncated || result.runs.length !== 1)
    return null;
  return result.runs[0]?.run_id ?? null;
}

export function adaptServiceState(pass: PassThrough): A2aServiceState {
  const env: Rec = isRec(pass.envelope) ? pass.envelope : {};
  return {
    status: asStr(env.status),
    alive: env.alive === undefined ? undefined : asBool(env.alive),
    ready: env.ready === undefined ? undefined : asBool(env.ready),
    can_accept_run:
      env.can_accept_run === undefined ? undefined : asBool(env.can_accept_run),
    service_version: asStr(env.service_version),
    degraded_reasons: strArr(env.degraded_reasons),
    tiers: pass.tiers,
  };
}

/** The interpreted availability of the a2a orchestration plane. */
export interface AgentAvailability {
  readonly available: boolean;
  readonly reason?: string;
}

/**
 * TOLERANT read of the dedicated `agent` tier (a2a-orchestration-edge). Unlike
 * the canonical `readTierAvailability` (where an ABSENT tier is degradation), the
 * `agent` tier appears ONLY when degraded — the engine's `tiers_block` does not
 * yet SEED it as an always-present canonical tier. So an absent `agent` tier is
 * HEALTHY (a2a reachable, or simply not probed on this response), and a PRESENT
 * `available:false` is a2a-down with the served reason.
 *
 * FOLLOW-UP (edge P05, a reviewed wire-contract event): seed `agent` as an
 * always-present canonical tier in `engine-query/src/envelope.rs`; then this can
 * collapse into `readTierAvailability(["agent"])` and this tolerant reader retires.
 */
export function readAgentTierAvailability(
  tiers: TiersBlock | undefined,
): AgentAvailability {
  const state = tiers?.agent;
  if (state && state.available === false) {
    return { available: false, reason: state.reason };
  }
  return { available: true };
}

// --- the client -----------------------------------------------------------------

export interface A2aTeamClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

/** The a2a team wire client. Lives in `stores/` (the sole wire client boundary);
 *  `app`/`scene` consume its hooks, never it directly. */
export class A2aTeamClient {
  readonly baseUrl: string;
  private baseFetch: FetchLike;

  constructor(options: A2aTeamClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? A2A_BASE;
    this.baseFetch = options.fetchImpl ?? defaultBearerTransport;
  }

  /** Rebind the transport (the live-wire harness injects the spawned engine's). */
  useTransport(fetchImpl: FetchLike): void {
    this.baseFetch = fetchImpl;
  }

  /** POST one whitelisted `/ops/a2a/{verb}` pass-through and unwrap the engine
   *  envelope into `{envelope, siblingStatus?, tiers}`. A non-2xx ENGINE response
   *  (an invalid arg 400, an auth 401) throws a tiers-bearing `EngineError`; a
   *  sibling-answered refusal rides the 200 envelope as `sibling_status`, and an
   *  a2a-down degradation rides the tiers block with a null envelope. */
  private async passThrough(
    verb: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<PassThrough> {
    const response = await this.baseFetch(`${this.baseUrl}/ops/a2a/${verb}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal,
    });
    const json = (await response.json()) as unknown;
    if (!response.ok) {
      const flat = unwrapEnvelope(json);
      const tiers = isRec(flat) ? asTiers(flat.tiers) : undefined;
      throw new EngineError(`/ops/a2a/${verb}`, response.status, {
        tiers,
        body: flat,
      });
    }
    const flat = unwrapEnvelope(json);
    if (!isRec(flat)) return { envelope: undefined };
    return {
      envelope: flat.envelope,
      siblingStatus:
        typeof flat.sibling_status === "number" ? flat.sibling_status : undefined,
      tiers: asTiers(flat.tiers),
    };
  }

  async listPresets(
    signal?: AbortSignal,
  ): Promise<{ presets: TeamPreset[]; tiers?: TiersBlock }> {
    return adaptPresetsList(await this.passThrough("presets-list", {}, signal));
  }

  async serviceState(signal?: AbortSignal): Promise<A2aServiceState> {
    return adaptServiceState(await this.passThrough("service-state", {}, signal));
  }

  async startRun(payload: TeamRunStartPayload): Promise<TeamRunStartResult> {
    // `run-start` is idempotent by its caller-supplied run_id. Retry one transport
    // failure with the EXACT same payload object; never retry an engine response
    // (EngineError) or a deliberate abort. This closes the lost-ack window without
    // turning a later user submit into the same run.
    for (let attempt = 0; ; attempt += 1) {
      try {
        return adaptRunStart(await this.passThrough("run-start", payload));
      } catch (error) {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        if (attempt >= 1 || error instanceof EngineError || aborted) throw error;
      }
    }
  }

  async runStatus(runId: string, signal?: AbortSignal): Promise<TeamRunStatus> {
    return adaptRunStatus(
      await this.passThrough("run-status", { run_id: runId }, signal),
    );
  }

  /** Discover the workspace's live team runs for reload recovery. The echoed
   *  expected scope is a generation fence only; the engine still injects its own
   *  active workspace root and rejects a concurrent scope change. */
  async activeRuns(
    expectedScope: string,
    featureTag?: string,
    signal?: AbortSignal,
  ): Promise<ActiveRunsResult> {
    return adaptActiveRuns(
      await this.passThrough(
        "active-runs",
        {
          expected_scope: expectedScope,
          ...(featureTag ? { feature_tag: featureTag } : {}),
        },
        signal,
      ),
    );
  }

  async cancelRun(runId: string): Promise<TeamRunStartResult> {
    // Cancel reuses the run-start result shape (ok / refusal / tiers); its
    // envelope is the a2a RunCancelResponse.
    return adaptRunStart(await this.passThrough("run-cancel", { run_id: runId }));
  }

  /** Open the per-run progress relay SSE stream (bearer-gated fetch stream, so the
   *  machine bearer rides the request — `EventSource` cannot carry it). Consumed
   *  by `sseChunks`. `since` resumes from the engine ring. */
  openRunStream(
    runId: string,
    since: number | undefined,
    signal?: AbortSignal,
  ): Promise<Response> {
    const suffix = since === undefined ? "" : `?since=${since}`;
    return this.baseFetch(
      `${this.baseUrl}/ops/a2a/runs/${encodeURIComponent(runId)}/stream${suffix}`,
      { signal },
    );
  }
}

/** The app-wide a2a team client, bound to the live engine origin. */
export const a2aTeamClient = new A2aTeamClient();

// --- query keys + bounded caches ------------------------------------------------

export const a2aKeys = {
  all: ["a2a"] as const,
  presets: () => [...a2aKeys.all, "presets"] as const,
  serviceState: () => [...a2aKeys.all, "service-state"] as const,
  runStatus: (runId: string) => [...a2aKeys.all, "run-status", runId] as const,
  runRelay: (runId: string) => [...a2aKeys.all, "run-relay", runId] as const,
  activeRuns: (scope: string, featureTag?: string) =>
    [...a2aKeys.all, "active-runs", scope, featureTag ?? ""] as const,
};

/** Bounded run-status poll cadence for the degraded fallback (D3): when the relay
 *  gaps or degrades, run-status is the authoritative recovery read. */
export const RUN_STATUS_POLL_MS = 5_000;

// --- reads + the Team selector state -------------------------------------------

/** The presets listing (bounded staleTime/gcTime). */
export function useTeamPresets(): UseQueryResult<
  { presets: TeamPreset[]; tiers?: TiersBlock },
  Error
> {
  return useQuery({
    queryKey: a2aKeys.presets(),
    queryFn: ({ signal }) => a2aTeamClient.listPresets(signal),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    gcTime: 60_000,
    // a2a-down is a DEGRADED 200 (tiers), never an error, so the query rarely
    // errors; a genuine engine fault degrades through the tiers reader below.
    retry: false,
  });
}

/** The interpreted Team selector state a consumer renders directly (deriving
 *  OUTSIDE the query in a memo, per the derive-outside-the-selector rule): the
 *  loadable presets and the disabled-with-reason verdict from the tolerant `agent`
 *  tier. `disabled` is true while a2a is down (or the presets read faulted); the
 *  reason is the engine-served degradation text. */
export interface TeamSelectorState {
  readonly presets: TeamPreset[];
  readonly disabled: boolean;
  readonly disabledReason?: string;
  readonly isLoading: boolean;
  readonly isError: boolean;
}

export function useTeamSelectorState(): TeamSelectorState {
  const query = useTeamPresets();
  return useMemo(() => {
    const tiers = tiersFromQuery(query);
    const availability = readAgentTierAvailability(tiers);
    const presets = query.data?.presets ?? [];
    // Disabled when a2a is down (tier degraded) OR the read genuinely faulted
    // (an engine error with no tiers). The reason is the served degradation text.
    const disabled = !availability.available || query.isError;
    const disabledReason = !availability.available
      ? (availability.reason ?? "The agent team service is unavailable.")
      : query.isError
        ? "The agent team service could not be reached."
        : undefined;
    return {
      presets,
      disabled,
      disabledReason,
      isLoading: query.isLoading,
      isError: query.isError,
    };
  }, [query]);
}

/** The a2a service readiness snapshot. */
export function useA2aServiceState(): UseQueryResult<A2aServiceState, Error> {
  return useQuery({
    queryKey: a2aKeys.serviceState(),
    queryFn: ({ signal }) => a2aTeamClient.serviceState(signal),
    staleTime: 10_000,
    gcTime: 60_000,
    retry: false,
  });
}

/** The workspace's live team runs, for reload-recovery of a lost viewing binding
 *  (a2a-edge D5). `enabled` gates the read to when recovery is actually needed (no
 *  run bound) so an already-bound panel never polls it. Bounded staleTime/gcTime;
 *  a2a-down degrades to an empty list through the tiers, never an error surface. */
export function useActiveTeamRuns(
  scope: string | null,
  options: { enabled?: boolean; featureTag?: string } = {},
): UseQueryResult<ActiveRunsResult, Error> {
  return useQuery({
    queryKey: a2aKeys.activeRuns(scope ?? "", options.featureTag),
    queryFn: ({ signal }) =>
      a2aTeamClient.activeRuns(scope ?? "", options.featureTag, signal),
    enabled: scope !== null && (options.enabled ?? true),
    staleTime: 10_000,
    gcTime: 30_000,
    refetchOnMount: "always",
    retry: false,
  });
}

/** The AUTHORITATIVE run-status read. `pollWhileDegraded` drives the bounded
 *  fallback poll (D3): a consumer sets it true when the relay signals a gap /
 *  degradation / loss so run-status stays fresh without the relay. */
export function useTeamRunStatus(
  runId: string | null,
  options: { pollWhileDegraded?: boolean } = {},
): UseQueryResult<TeamRunStatus, Error> {
  return useQuery({
    queryKey: a2aKeys.runStatus(runId ?? ""),
    queryFn: ({ signal }) => a2aTeamClient.runStatus(runId ?? "", signal),
    enabled: !!runId,
    placeholderData: keepPreviousData,
    staleTime: 2_000,
    gcTime: 60_000,
    refetchInterval: (query) => {
      const snapshot = query.state.data;
      const scopedTerminal =
        snapshot?.run_id === runId && isTeamRunTerminalStatus(snapshot.status);
      return options.pollWhileDegraded && !scopedTerminal ? RUN_STATUS_POLL_MS : false;
    },
    retry: false,
  });
}

// --- mutating commands ----------------------------------------------------------

/** Start a team run over the pass-through. */
export function useStartTeamRun() {
  return useMutation({
    mutationFn: (payload: TeamRunStartPayload) => a2aTeamClient.startRun(payload),
  });
}

/** Cancel a team run over the pass-through. */
export function useCancelTeamRun() {
  return useMutation({
    mutationFn: (runId: string) => a2aTeamClient.cancelRun(runId),
  });
}

// --- the run-progress relay + bounded polling fallback (S22, ADR D3) ------------

/** Adapt an SSE Response into a bounded stream of transcript frames. */
export async function* relayFrames(
  response: Response,
): AsyncGenerator<RelayTranscriptFrame, void, unknown> {
  let terminalObserved = false;
  try {
    for await (const chunk of sseChunks(response)) {
      const frame = adaptRelayFrame({ channel: chunk.channel, data: chunk.data });
      terminalObserved ||= relayFrameIsTerminal(frame);
      yield frame;
    }
  } catch (cause) {
    // The engine closes a relay after its terminal frame. That EOF is expected
    // completion; every pre-terminal EOF remains retryable transport loss.
    if (terminalObserved && cause instanceof StreamLostError) return;
    throw cause;
  }
}

export interface RelayResumeCursor {
  readonly runId: string | null;
  readonly since?: number;
}

/** Advance one hook-local resume cursor. A run change synchronously discards the
 * old identity; within one run only monotone engine sequences advance it. */
export function advanceRelayResumeCursor(
  current: RelayResumeCursor,
  runId: string | null,
  frame?: RelayTranscriptFrame,
): RelayResumeCursor {
  const since = current.runId === runId ? current.since : undefined;
  const candidate = frame?.seq;
  return {
    runId,
    since:
      candidate !== undefined && (since === undefined || candidate > since)
        ? candidate
        : since,
  };
}

/** The live relay transcript for a run. The cursor lives outside TanStack's
 * streamed accumulator, so a retry sends `since=<last accepted seq>` even while
 * the query is refetching. Append refetch mode preserves the rendered transcript
 * while only delta frames cross the wire; the reducer independently enforces its
 * item and byte ceilings. */
export function useRunRelay(
  runId: string | null,
): UseQueryResult<RelayTranscriptState, Error> {
  const resume = useRef<RelayResumeCursor>({ runId: null });
  if (resume.current.runId !== runId) {
    resume.current = advanceRelayResumeCursor(resume.current, runId);
  }
  return useQuery({
    queryKey: a2aKeys.runRelay(runId ?? ""),
    enabled: !!runId,
    queryFn: streamedQuery({
      streamFn: async (context) =>
        relayFrames(
          await a2aTeamClient.openRunStream(
            runId ?? "",
            resume.current.since,
            context.signal,
          ),
        ),
      reducer: (frames, frame) => {
        // Advance even when the presentation reducer drops an oversized frame;
        // otherwise a reconnect would request that rejected frame forever.
        resume.current = advanceRelayResumeCursor(resume.current, runId, frame);
        return relayTranscriptReducer(frames, frame);
      },
      initialValue: EMPTY_RELAY_TRANSCRIPT,
      refetchMode: "append",
    }),
    staleTime: Infinity,
    // Bounded (bounded-by-default): the retained transcript array is reclaimed
    // promptly once the run panel unmounts.
    gcTime: 30_000,
    retry: true,
    retryDelay: (attempt) =>
      attempt === 0 ? 250 : Math.min(30_000, 1_000 * 2 ** attempt),
  });
}

export interface RunReconciliationState {
  readonly runId: string | null;
  readonly required: boolean;
  readonly generation: number;
  readonly relayGeneration: number;
  readonly relayFailed: boolean;
}

const EMPTY_RECONCILIATION: RunReconciliationState = {
  runId: null,
  required: false,
  generation: 0,
  relayGeneration: 0,
  relayFailed: false,
};

/** The newest retained presentation frame that requires an authoritative
 * re-keyframe. Terminal is included: it may stop animation, but cannot itself
 * make lifecycle controls terminal. */
export function latestRelayReconciliationSignal(
  frames: readonly RelayTranscriptFrame[],
): RelayTranscriptFrame | undefined {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    if (frame !== undefined && relayFrameForcesReconcile(frame)) return frame;
  }
  return undefined;
}

/** Whether the browser must remain the sole degraded-status poll owner. A
 * heartbeat is connection plumbing, not proof the upstream producer recovered,
 * so it cannot clear an earlier degraded signal; a later real upstream activity
 * frame can. */
export function relayStreamNeedsStatusPolling(
  frames: readonly RelayTranscriptFrame[],
  relayFailed: boolean,
): boolean {
  if (relayFailed) return true;
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const kind = frames[index]?.kind;
    if (kind === "degraded") return true;
    if (
      kind === "thought" ||
      kind === "token" ||
      kind === "tool_call" ||
      kind === "status" ||
      kind === "progress" ||
      kind === "error" ||
      kind === "dropped"
    ) {
      return false;
    }
  }
  return false;
}

/** Observe relay state without clearing an outstanding requirement. A later
 * ordinary frame leaves `required` latched; only `resolveRunReconciliation`
 * clears the matching generation after a status request started post-signal. */
export function observeRunReconciliation(
  current: RunReconciliationState,
  runId: string | null,
  relayGeneration: number,
  relayFailed: boolean,
): RunReconciliationState {
  const sameRun = current.runId === runId;
  const prior = sameRun ? current : { ...EMPTY_RECONCILIATION, runId };
  const newSignal = relayGeneration > prior.relayGeneration;
  const newFailure = relayFailed && !prior.relayFailed;
  if (newSignal || newFailure) {
    return {
      runId,
      required: true,
      generation: prior.generation + 1,
      relayGeneration,
      relayFailed,
    };
  }
  if (prior.relayFailed !== relayFailed || prior.relayGeneration !== relayGeneration) {
    return { ...prior, relayFailed, relayGeneration };
  }
  return prior;
}

/** Resolve only the exact observed generation. A stale status response from an
 * earlier gap cannot clear a newer reconciliation requirement. */
export function resolveRunReconciliation(
  current: RunReconciliationState,
  runId: string | null,
  generation: number,
): RunReconciliationState {
  return current.runId === runId && current.generation === generation
    ? { ...current, required: false }
    : current;
}

/** The composed run progress a consumer renders: the live relay frames, the
 *  authoritative run-status, and the honest degraded flag. When the latest relay
 *  frame forces reconcile (a gap / a degradation) OR the relay stream is lost,
 *  run-status polls at the bounded cadence and `degraded` is true so the surface
 *  labels the state honestly rather than faking liveness (ADR D3 / D9). Derives
 *  OUTSIDE the query hooks in a memo. */
export interface RunProgress {
  readonly frames: RelayTranscriptFrame[];
  readonly status?: TeamRunStatus;
  readonly degraded: boolean;
  readonly terminal: boolean;
  readonly latestSeq?: number;
}

export function useRunProgress(runId: string | null): RunProgress {
  const queryClient = useQueryClient();
  const relay = useRunRelay(runId);
  const transcript = relay.data ?? EMPTY_RELAY_TRANSCRIPT;
  const frames = transcript.frames;
  const relayGeneration = useMemo(
    () => relayTranscriptReconciliationGeneration(transcript),
    [transcript],
  );
  const [reconciliation, setReconciliation] = useState<RunReconciliationState>({
    ...EMPTY_RECONCILIATION,
    runId,
  });
  useEffect(() => {
    setReconciliation((current) =>
      observeRunReconciliation(current, runId, relayGeneration, relay.isError),
    );
  }, [relay.isError, relayGeneration, runId]);

  const relayUnavailable = useMemo(
    () => relayStreamNeedsStatusPolling(frames, relay.isError),
    [frames, relay.isError],
  );
  const reconciliationRequired =
    reconciliation.runId === runId && reconciliation.required;
  // The immediate reconciliation loop owns polling until one request that starts
  // after the signal succeeds. Once reconciled, the normal query interval owns
  // continued degraded-stream polling (one browser owner, never two loops).
  const status = useTeamRunStatus(runId, {
    pollWhileDegraded: relayUnavailable && !reconciliationRequired,
  });
  const refetchStatus = status.refetch;
  useEffect(() => {
    if (!reconciliationRequired || runId === null) return;
    const generation = reconciliation.generation;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wake: (() => void) | undefined;
    const reconcile = async () => {
      // A pre-signal initial status request is not a valid re-keyframe. Cancel it
      // first so the next successful request is guaranteed to have started after
      // this reconciliation generation was observed.
      await queryClient.cancelQueries({
        queryKey: a2aKeys.runStatus(runId),
        exact: true,
      });
      if (cancelled) return;
      while (!cancelled) {
        const result = await refetchStatus();
        if (cancelled) return;
        if (result.isSuccess && result.data.run_id === runId) {
          setReconciliation((current) =>
            resolveRunReconciliation(current, runId, generation),
          );
          return;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
          timer = setTimeout(() => {
            wake = undefined;
            resolve();
          }, RUN_STATUS_POLL_MS);
        });
      }
    };
    void reconcile();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      wake?.();
    };
  }, [
    queryClient,
    reconciliation.generation,
    reconciliationRequired,
    refetchStatus,
    runId,
  ]);

  // `keepPreviousData` may transiently expose the prior query-key's snapshot on a
  // run switch. Scope-gate identity before it can affect controls or transcript.
  const authoritativeStatus = scopedTeamRunStatus(runId, status.data);
  const terminal = isTeamRunTerminalStatus(authoritativeStatus?.status);
  const degraded = !terminal && (reconciliationRequired || relayUnavailable);
  return useMemo(
    () => ({
      frames,
      status: authoritativeStatus,
      degraded,
      terminal,
      latestSeq: latestRelaySeq(frames),
    }),
    [authoritativeStatus, degraded, frames, terminal],
  );
}
