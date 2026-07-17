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
  type UseQueryResult,
} from "@tanstack/react-query";
import { useMemo } from "react";

import { bearerToken, EngineError, type FetchLike, type TiersBlock } from "../engine";
import { tiersFromQuery } from "../engine/tiers";
import { unwrapEnvelope } from "../liveAdapters";
import {
  adaptRelayFrame,
  latestRelaySeq,
  relayFrameForcesReconcile,
  relayTranscriptReducer,
  type RelayTranscriptFrame,
} from "../liveAdapters/a2aRelay";
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
  team_preset: string;
  message: string;
  feature_tag?: string;
  profile_id?: string;
  title?: string;
  autonomous?: boolean;
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
    return adaptRunStart(await this.passThrough("run-start", payload));
  }

  async runStatus(runId: string, signal?: AbortSignal): Promise<TeamRunStatus> {
    return adaptRunStatus(
      await this.passThrough("run-status", { run_id: runId }, signal),
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
    refetchInterval: options.pollWhileDegraded ? RUN_STATUS_POLL_MS : false,
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
async function* relayFrames(
  response: Response,
): AsyncGenerator<RelayTranscriptFrame, void, unknown> {
  for await (const chunk of sseChunks(response)) {
    yield adaptRelayFrame({ channel: chunk.channel, data: chunk.data });
  }
}

/** The live relay transcript for a run (bounded, seq-deduped). A reconnect is
 *  handled by TanStack's `retry`; the engine ring replays from the last seq the
 *  reducer holds. Non-authoritative by contract — pair with `useRunProgress` for
 *  the authoritative fallback. */
export function useRunRelay(
  runId: string | null,
): UseQueryResult<RelayTranscriptFrame[], Error> {
  return useQuery({
    queryKey: a2aKeys.runRelay(runId ?? ""),
    enabled: !!runId,
    queryFn: streamedQuery({
      streamFn: async (context) =>
        relayFrames(
          await a2aTeamClient.openRunStream(runId ?? "", undefined, context.signal),
        ),
      reducer: relayTranscriptReducer,
      initialValue: [] as RelayTranscriptFrame[],
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
  readonly latestSeq?: number;
}

export function useRunProgress(runId: string | null): RunProgress {
  const relay = useRunRelay(runId);
  const frames = useMemo(() => relay.data ?? [], [relay.data]);
  const degraded = useMemo(() => {
    if (relay.isError) return true;
    const last = frames[frames.length - 1];
    return last !== undefined && relayFrameForcesReconcile(last);
  }, [frames, relay.isError]);
  const status = useTeamRunStatus(runId, { pollWhileDegraded: degraded });
  return useMemo(
    () => ({
      frames,
      status: status.data,
      degraded,
      latestSeq: latestRelaySeq(frames),
    }),
    [frames, status.data, degraded],
  );
}
