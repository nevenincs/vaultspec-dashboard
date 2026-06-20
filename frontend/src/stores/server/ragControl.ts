// The rag control plane (rag-control-plane ADR D6) — the stores-layer SOLE wire
// client for vaultspec-rag's brokered `/ops/rag/*` management surface. This is
// where the reads (service-state, jobs, watcher, projects, readiness) are
// fetched, where the controls (reindex trigger, watcher start/stop/reconfigure,
// project evict) are DISPATCHED through the one platform seam, and where the
// jobs-progress poll lives. Chrome consumes these hooks and never fetches rag
// directly (dashboard-layer-ownership).
//
// Degradation is TIERS-GATED truth, never guessed (degradation-is-read-from-
// tiers): "rag is down / building" is read from the `tiers.semantic` block the
// brokered envelope carries — success OR a fresh error envelope — never from a
// bare transport error. The engine forwards rag's envelope VERBATIM under
// `data.envelope`; these hooks read that shape and interpret it for the view.
//
// Job lifecycle is trigger-then-poll (ADR D3): a reindex mutation returns rag's
// `{job_id, status:"queued"}` immediately; `useRagJobProgress` polls `/ops/rag/
// jobs?job_id=` with backoff to a terminal phase, holding no connection open.

import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

import {
  engineClient,
  readTierAvailability,
  type OpsResult,
  type TiersBlock,
} from "./engine";
import {
  engineKeys,
  invalidateScopedSemanticReads,
  normalizeGraphSliceScope,
} from "./queries";
import { dispatchOps } from "./opsActions";

// --- brokered wire shapes (forwarded verbatim from rag) ------------------------
//
// The engine forwards rag's envelope verbatim, so these mirror rag's shapes and
// stay deliberately tolerant (every field optional): a rag-side shape change is a
// cross-repo contract event, and a tolerant reader degrades gracefully rather
// than throwing on an added/renamed field (engine-read-and-infer corollary).

/** One reindex job record from rag's `/jobs` snapshot. */
export interface RagJob {
  id: string;
  /** `queued` | `running` | `done` | `ok` | `error` | `failed` | ... */
  phase: string;
  source?: string;
  trigger?: string;
  finished_at?: number;
  started_at?: number;
  runtime_seconds?: number;
  result?: string;
  progress?: {
    step?: string;
    completed?: number;
    total?: number;
    last_updated?: number;
  };
  resources?: Record<string, unknown>;
  initiator?: { kind?: string; command?: string; project_root?: string };
}

export interface RagJobsSnapshot {
  jobs: RagJob[];
  total?: number;
  returned?: number;
  summary?: { running?: number; phases?: Record<string, number> };
}

export interface RagWatcherState {
  watch_enabled: boolean;
  debounce_ms: number;
  cooldown_s: number;
  watching: string[];
  running?: boolean;
}

export interface RagProjectSlot {
  root: string;
  ref_count?: number;
  idle_seconds?: number;
  last_access?: number;
}

export interface RagProjectsState {
  projects: RagProjectSlot[];
  max_projects?: number;
  idle_ttl_seconds?: number;
}

/** rag's service/GPU/index state — loosely typed (forwarded verbatim). */
export interface RagServiceStateEnvelope {
  index?: {
    cuda?: boolean;
    gpu_name?: string;
    vram_mb?: number;
    vram_gb?: number;
    vault_count?: number;
    code_count?: number;
    target_dir?: string;
    storage_path?: string;
  };
  [key: string]: unknown;
}

export type RagServiceIndex = NonNullable<RagServiceStateEnvelope["index"]>;

export interface RagReadinessEnvelope {
  ready?: boolean;
  [key: string]: unknown;
}

/** The unwrapped brokered result: rag's value (or null when degraded) + tiers. */
export interface BrokeredResult<T> {
  envelope: T | null;
  tiers: TiersBlock;
}

// --- cache keys ----------------------------------------------------------------
//
// One sub-namespace under the shared engine keys. The reads operate on the
// engine's ACTIVE scope (the `/ops/rag/*` surface carries no scope param), so the
// active scope folds into each key — a scope swap re-reads, mirroring the other
// per-scope read families.

export const normalizeRagControlScope = normalizeGraphSliceScope;

export function normalizeRagControlKeyPart(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

export function normalizeRagProjectRoot(root: unknown): string | null {
  return normalizeRagControlScope(root);
}

function normalizeRagProjectNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeRagProjectSlot(slot: unknown): RagProjectSlot | null {
  if (slot === null || typeof slot !== "object") return null;
  const candidate = slot as Record<string, unknown>;
  const root = normalizeRagProjectRoot(candidate.root);
  if (root === null) return null;

  const ref_count = normalizeRagProjectNumber(candidate.ref_count);
  const idle_seconds = normalizeRagProjectNumber(candidate.idle_seconds);
  const last_access = normalizeRagProjectNumber(candidate.last_access);
  return {
    root,
    ...(ref_count !== undefined ? { ref_count } : {}),
    ...(idle_seconds !== undefined ? { idle_seconds } : {}),
    ...(last_access !== undefined ? { last_access } : {}),
  };
}

export function normalizeRagProjectSlots(slots: unknown): RagProjectSlot[] {
  if (!Array.isArray(slots)) return [];
  return slots.flatMap((slot) => {
    const normalized = normalizeRagProjectSlot(slot);
    return normalized === null ? [] : [normalized];
  });
}

function skippedRagProjectEvictResult(): OpsResult {
  return {
    ok: false,
    envelope: { skipped: true, reason: "missing-project-root" },
    tiers: {},
  };
}

export const ragControlKeys = {
  all: [...engineKeys.all, "ops-rag"] as const,
  serviceState: (scope: unknown) =>
    [
      ...ragControlKeys.all,
      "service-state",
      normalizeRagControlKeyPart(scope),
    ] as const,
  jobs: (scope: unknown, jobId?: unknown) =>
    [
      ...ragControlKeys.all,
      "jobs",
      normalizeRagControlKeyPart(scope),
      normalizeRagControlKeyPart(jobId, "all"),
    ] as const,
  watcher: (scope: unknown) =>
    [...ragControlKeys.all, "watcher", normalizeRagControlKeyPart(scope)] as const,
  projects: (scope: unknown) =>
    [...ragControlKeys.all, "projects", normalizeRagControlKeyPart(scope)] as const,
  readiness: (scope: unknown) =>
    [...ragControlKeys.all, "readiness", normalizeRagControlKeyPart(scope)] as const,
};

// --- pure interpreters (unit-tested without a render) --------------------------

/** rag's terminal job phases — anything that is not still in flight. A job in
 *  `queued`/`running` is live; everything else (done/ok/error/failed/cancelled)
 *  is terminal and stops the poll. */
const LIVE_PHASES = new Set(["queued", "running", "pending"]);

function normalizeRagJobText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeRagJobNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeRagJobId(value: unknown): string | null {
  return normalizeRagJobText(value) ?? null;
}

function normalizeRagJobPhase(value: unknown): string | undefined {
  return normalizeRagJobText(value);
}

export function normalizeRagRequestSeq(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

export function isJobTerminal(phase: string | undefined): boolean {
  const normalized = normalizeRagJobPhase(phase);
  if (!normalized) return false;
  return !LIVE_PHASES.has(normalized.toLowerCase());
}

/** Whether a job's terminal phase is a FAILURE (vs a clean completion). */
export function isJobFailed(phase: string | undefined): boolean {
  const normalized = normalizeRagJobPhase(phase);
  if (!normalized) return false;
  return ["error", "failed", "cancelled", "canceled"].includes(
    normalized.toLowerCase(),
  );
}

/** The first (newest-first) job in a brokered jobs envelope, or undefined. */
export function firstJob(
  envelope: RagJobsSnapshot | null | undefined,
): RagJob | undefined {
  return envelope?.jobs?.[0];
}

/** The requested job in a brokered jobs envelope, or undefined when absent. */
export function requestedJob(
  envelope: RagJobsSnapshot | null | undefined,
  jobId: string | null,
): RagJob | undefined {
  const requestedId = normalizeRagJobId(jobId);
  if (requestedId === null) return undefined;
  return envelope?.jobs?.find((job) => normalizeRagJobId(job.id) === requestedId);
}

/** The semantic tier is unavailable in a brokered rag response. */
export function ragSemanticOffline(data: BrokeredResult<unknown> | undefined): boolean {
  return data !== undefined && readTierAvailability(data.tiers, ["semantic"]).degraded;
}

/** Whether any brokered rag control read reports the semantic tier unavailable. */
export function ragControlSemanticOffline(
  ...reads: Array<BrokeredResult<unknown> | undefined>
): boolean {
  return reads.some(ragSemanticOffline);
}

export interface RagControlView {
  semanticOffline: boolean;
  disabled: boolean;
  index: RagServiceIndex | undefined;
  watch: RagWatcherState | null;
  hasWatcherConfig: boolean;
  ready: boolean | undefined;
  projects: RagProjectSlot[];
  hasProjects: boolean;
}

/**
 * Interpret the brokered rag control reads for the ops chrome. Envelope drilling
 * stays here: the panel consumes service/index, watcher, readiness, and resident
 * projects as one view instead of reading raw brokered query payloads.
 */
export function deriveRagControlView(
  scope: unknown,
  serviceState: BrokeredResult<RagServiceStateEnvelope> | undefined,
  watcher: BrokeredResult<RagWatcherState> | undefined,
  readiness: BrokeredResult<RagReadinessEnvelope> | undefined,
  projects: BrokeredResult<RagProjectsState> | undefined,
): RagControlView {
  const normalizedScope = normalizeRagControlScope(scope);
  const semanticOffline = ragControlSemanticOffline(
    serviceState,
    watcher,
    readiness,
    projects,
  );
  const watch = watcher?.envelope ?? null;
  const projectSlots = normalizeRagProjectSlots(projects?.envelope?.projects);
  return {
    semanticOffline,
    disabled: normalizedScope === null || semanticOffline,
    index: serviceState?.envelope?.index,
    watch,
    hasWatcherConfig: watch !== null,
    ready: readiness?.envelope?.ready,
    projects: projectSlots,
    hasProjects: projectSlots.length > 0,
  };
}

/**
 * The interpreted progress view for a polled job — what the control UI renders.
 * `semanticOffline` is read from the tiers block (NOT a transport error), so a
 * rag-down mid-poll is the honest held state, not a failure.
 */
export interface RagJobProgressView {
  job: RagJob | undefined;
  phase: string | undefined;
  /** 0..1 when rag reports a completed/total, else undefined (indeterminate). */
  fraction: number | undefined;
  step: string | undefined;
  terminal: boolean;
  failed: boolean;
  /** Polling is active (a live job is being tracked and rag is reachable). */
  polling: boolean;
  /** rag reported unavailable in the tiers block while polling. */
  semanticOffline: boolean;
}

export function interpretJobProgress(
  data: BrokeredResult<RagJobsSnapshot> | undefined,
  jobId: string | null,
): RagJobProgressView {
  const semanticOffline = ragSemanticOffline(data);
  const requestedId = normalizeRagJobId(jobId);
  const job = requestedJob(data?.envelope, requestedId);
  const phase = normalizeRagJobPhase(job?.phase);
  const total = normalizeRagJobNumber(job?.progress?.total);
  const completed = normalizeRagJobNumber(job?.progress?.completed);
  const fraction =
    total !== undefined && total > 0 && completed !== undefined
      ? Math.max(0, Math.min(1, completed / total))
      : undefined;
  const terminal = isJobTerminal(phase);
  return {
    job,
    phase,
    fraction,
    step: normalizeRagJobText(job?.progress?.step),
    terminal,
    failed: isJobFailed(phase),
    polling: requestedId !== null && !semanticOffline && !terminal,
    semanticOffline,
  };
}

export function shouldAcceptRagJobReceipt({
  currentScope,
  requestScope,
  currentSeq,
  requestSeq,
}: {
  currentScope: unknown;
  requestScope: unknown;
  currentSeq: unknown;
  requestSeq: unknown;
}): boolean {
  const normalizedCurrentScope = normalizeRagControlScope(currentScope);
  const normalizedRequestScope = normalizeRagControlScope(requestScope);
  const normalizedCurrentSeq = normalizeRagRequestSeq(currentSeq);
  const normalizedRequestSeq = normalizeRagRequestSeq(requestSeq);
  return (
    normalizedCurrentScope !== null &&
    normalizedCurrentScope === normalizedRequestScope &&
    normalizedCurrentSeq !== null &&
    normalizedCurrentSeq === normalizedRequestSeq
  );
}

export interface RagReindexJobState {
  scope: string | null;
  jobId: string | null;
  requestSeq: number;
  setScope: (scope: unknown) => void;
  beginRequest: (scope: unknown) => number;
  acceptReceipt: (requestScope: unknown, requestSeq: unknown, jobId: unknown) => void;
}

export const useRagReindexJobStore = create<RagReindexJobState>((set, get) => ({
  scope: null,
  jobId: null,
  requestSeq: 0,
  setScope: (scope) => {
    const normalizedScope = normalizeRagControlScope(scope);
    set((state) =>
      state.scope === normalizedScope
        ? state
        : {
            scope: normalizedScope,
            jobId: null,
            requestSeq: state.requestSeq + 1,
          },
    );
  },
  beginRequest: (scope) => {
    const normalizedScope = normalizeRagControlScope(scope);
    const requestSeq = get().requestSeq + 1;
    set({ scope: normalizedScope, jobId: null, requestSeq });
    return requestSeq;
  },
  acceptReceipt: (requestScope, requestSeq, jobId) => {
    const normalizedJobId = normalizeRagJobId(jobId);
    if (normalizedJobId === null) return;
    set((state) => {
      const accepted = shouldAcceptRagJobReceipt({
        currentScope: state.scope,
        requestScope,
        currentSeq: state.requestSeq,
        requestSeq,
      });
      return accepted ? { jobId: normalizedJobId } : state;
    });
  },
}));

export function useRagReindexJobIdentity(scope: unknown): {
  jobId: string | null;
  beginRequest: (scope: unknown) => number;
  acceptReceipt: (requestScope: unknown, requestSeq: unknown, jobId: unknown) => void;
} {
  const normalizedScope = normalizeRagControlScope(scope);
  const identity = useRagReindexJobStore(
    useShallow((state) => ({
      jobId: state.jobId,
      beginRequest: state.beginRequest,
      acceptReceipt: state.acceptReceipt,
    })),
  );
  const setScope = useRagReindexJobStore((state) => state.setScope);
  useEffect(() => {
    setScope(normalizedScope);
  }, [normalizedScope, setScope]);
  return identity;
}

// --- read hooks (tier-gated) ---------------------------------------------------
//
// Each read is enabled only when the active scope is present (the engine is
// reachable). The degraded truth is read by the consumer from `data.tiers` via
// `readTierAvailability`; these hooks never throw on a degraded read because the
// broker degrades to a tiers-bearing 200, not an error.

const READ_GC_MS = 30_000;
export const RAG_JOBS_LIMIT_CAP = 50;

export interface RagJobsRequestIdentity {
  scope: string | null;
  limit: number;
}

export function boundedRagJobsLimit(limit: unknown): number {
  if (typeof limit === "string" && limit.trim() === "") return 1;
  if (typeof limit !== "number" && typeof limit !== "string") return 1;
  const parsed = typeof limit === "number" ? limit : Number(limit);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(RAG_JOBS_LIMIT_CAP, Math.floor(parsed)));
}

export function normalizeRagJobsRequestIdentity(
  scope: unknown,
  limit: unknown = 10,
): RagJobsRequestIdentity {
  return {
    scope: normalizeRagControlScope(scope),
    limit: boundedRagJobsLimit(limit),
  };
}

export function invalidateRagWatcherControlQueries(queryClient: QueryClient): void {
  for (const family of ["watcher", "readiness"] as const) {
    void queryClient.invalidateQueries({
      queryKey: [...ragControlKeys.all, family],
    });
  }
}

export function invalidateRagControlQueries(queryClient: QueryClient): void {
  for (const family of [
    "service-state",
    "readiness",
    "jobs",
    "projects",
    "watcher",
  ] as const) {
    void queryClient.invalidateQueries({
      queryKey: [...ragControlKeys.all, family],
    });
  }
}

export function invalidateAfterRagOpsRun(
  queryClient: QueryClient,
  scope: unknown,
  verb: string,
): void {
  const normalizedScope = normalizeRagControlScope(scope);
  void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
  invalidateRagControlQueries(queryClient);

  if (normalizedScope === null) return;
  if (verb !== "service-start" && verb !== "service-stop") return;

  invalidateScopedSemanticReads(queryClient, normalizedScope);
}

export function useInvalidateAfterRagOpsRun(scope: unknown): (verb: string) => void {
  const normalizedScope = normalizeRagControlScope(scope);
  const queryClient = useQueryClient();
  return useCallback(
    (verb: string) => invalidateAfterRagOpsRun(queryClient, normalizedScope, verb),
    [queryClient, normalizedScope],
  );
}

export function invalidateRagReindexSettlementQueries(
  queryClient: QueryClient,
  scope: unknown,
  semanticIndexChanged: boolean,
): void {
  const normalizedScope = normalizeRagControlScope(scope);
  void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
  invalidateRagControlQueries(queryClient);
  if (normalizedScope === null || !semanticIndexChanged) return;
  invalidateScopedSemanticReads(queryClient, normalizedScope);
}

export function useRagServiceState(scope: unknown) {
  const normalizedScope = normalizeRagControlScope(scope);
  const enabled = normalizedScope !== null;
  const query = useQuery({
    queryKey: ragControlKeys.serviceState(normalizedScope ?? ""),
    queryFn: ({ signal }) =>
      engineClient.opsRagGet<RagServiceStateEnvelope>(
        "service-state",
        undefined,
        signal,
      ),
    enabled,
    gcTime: READ_GC_MS,
  });
  return enabled ? query : { ...query, data: undefined };
}

export function useRagWatcher(scope: unknown) {
  const normalizedScope = normalizeRagControlScope(scope);
  const enabled = normalizedScope !== null;
  const query = useQuery({
    queryKey: ragControlKeys.watcher(normalizedScope ?? ""),
    queryFn: ({ signal }) =>
      engineClient.opsRagGet<RagWatcherState>("watcher", undefined, signal),
    enabled,
    gcTime: READ_GC_MS,
  });
  return enabled ? query : { ...query, data: undefined };
}

export function useRagProjects(scope: unknown) {
  const normalizedScope = normalizeRagControlScope(scope);
  const enabled = normalizedScope !== null;
  const query = useQuery({
    queryKey: ragControlKeys.projects(normalizedScope ?? ""),
    queryFn: ({ signal }) =>
      engineClient.opsRagGet<RagProjectsState>("projects", undefined, signal),
    enabled,
    gcTime: READ_GC_MS,
  });
  return enabled ? query : { ...query, data: undefined };
}

export function useRagReadiness(scope: unknown) {
  const normalizedScope = normalizeRagControlScope(scope);
  const enabled = normalizedScope !== null;
  const query = useQuery({
    queryKey: ragControlKeys.readiness(normalizedScope ?? ""),
    queryFn: ({ signal }) =>
      engineClient.opsRagGet<RagReadinessEnvelope>("readiness", undefined, signal),
    enabled,
    gcTime: READ_GC_MS,
  });
  return enabled ? query : { ...query, data: undefined };
}

export function useRagControlView(scope: unknown): RagControlView {
  const normalizedScope = normalizeRagControlScope(scope);
  const serviceState = useRagServiceState(normalizedScope);
  const readiness = useRagReadiness(normalizedScope);
  const watcher = useRagWatcher(normalizedScope);
  const projects = useRagProjects(normalizedScope);
  return useMemo(
    () =>
      deriveRagControlView(
        normalizedScope,
        serviceState.data,
        watcher.data,
        readiness.data,
        projects.data,
      ),
    [projects.data, readiness.data, normalizedScope, serviceState.data, watcher.data],
  );
}

/** Poll backoff: 1s, 2s, 4s, capped at 8s — bounded so a long build does not
 *  hammer the engine, while staying responsive early (bounded-by-default). */
function pollBackoff(updateCount: number): number {
  return Math.min(1000 * 2 ** Math.min(updateCount, 3), 8000);
}

/**
 * The jobs-progress poll hook (ADR D3): poll `/ops/rag/jobs?job_id=` with backoff
 * until the job reaches a terminal phase, then stop. Polling also stops when the
 * semantic tier reports unavailable (rag went down mid-build) — read from the
 * tiers block, never a transport error. `jobId === null` disables the poll
 * entirely (no job in flight).
 */
export function useRagJobProgress(scope: unknown, jobId: unknown): RagJobProgressView {
  const normalizedScope = normalizeRagControlScope(scope);
  const normalizedJobId = normalizeRagJobId(jobId);
  const enabled = normalizedScope !== null && normalizedJobId !== null;
  const query = useQuery({
    queryKey: ragControlKeys.jobs(normalizedScope ?? "", normalizedJobId ?? undefined),
    queryFn: ({ signal }) =>
      engineClient.opsRagGet<RagJobsSnapshot>(
        "jobs",
        {
          job_id: normalizedJobId ?? undefined,
          limit: 1,
        },
        signal,
      ),
    enabled,
    gcTime: READ_GC_MS,
    refetchInterval: (q) => {
      const data = q.state.data as BrokeredResult<RagJobsSnapshot> | undefined;
      // Stop when rag is down (tiers-gated) so a dead service is not polled.
      if (ragSemanticOffline(data)) return false;
      const phase = requestedJob(data?.envelope, normalizedJobId)?.phase;
      if (isJobTerminal(phase)) return false;
      return pollBackoff(q.state.dataUpdateCount);
    },
    refetchIntervalInBackground: false,
  });
  return interpretJobProgress(
    enabled ? (query.data as BrokeredResult<RagJobsSnapshot> | undefined) : undefined,
    enabled ? normalizedJobId : null,
  );
}

/** A non-polling read of the recent jobs (for the activity list). */
export function useRagJobs(scope: unknown, limit: unknown = 10) {
  const request = normalizeRagJobsRequestIdentity(scope, limit);
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: ragControlKeys.jobs(request.scope ?? "", `recent-${request.limit}`),
    queryFn: ({ signal }) =>
      engineClient.opsRagGet<RagJobsSnapshot>("jobs", { limit: request.limit }, signal),
    enabled,
    gcTime: READ_GC_MS,
  });
  return enabled ? query : { ...query, data: undefined };
}

// --- control mutations (dispatched through the platform seam) ------------------
//
// Every control flows through `dispatchOps` → the platform `appDispatcher` → the
// engine's brokered `/ops/rag/{verb}` POST (S22): logged, traced, centrally
// guardable, never a direct fetch. On success the relevant read keys are
// invalidated so the UI re-reads the authoritative state.

/** Validated reindex args the UI supplies (the broker validates server-side). */
export interface ReindexArgs {
  type?: "vault" | "code";
  clean?: boolean;
}

function normalizeRagReindexType(value: unknown): ReindexArgs["type"] | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized === "vault" || normalized === "code" ? normalized : undefined;
}

export function normalizeRagReindexArgs(input: unknown): ReindexArgs {
  const value: Record<string, unknown> =
    input !== null && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const args: ReindexArgs = {};
  const type = normalizeRagReindexType(value.type);
  if (type !== undefined) args.type = type;
  if (typeof value.clean === "boolean") args.clean = value.clean;
  return args;
}

/** Trigger a reindex; resolves with rag's `{job_id, status}` envelope so the
 *  caller can hand the job id to `useRagJobProgress`. */
export function useRagReindex() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: unknown = {}) =>
      dispatchOps({
        target: "rag",
        verb: "reindex",
        body: normalizeRagReindexArgs(args),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...ragControlKeys.all, "jobs"] });
    },
  });
}

export interface WatcherReconfigureArgs {
  debounce_ms?: number;
  cooldown_s?: number;
}

export const WATCHER_DEBOUNCE_MS_MAX = 600_000;
export const WATCHER_COOLDOWN_S_MAX = 3_600;

function boundedRagWatcherIntegerArg(value: unknown, max: number): number | undefined {
  if (typeof value === "string" && value.trim() === "") return undefined;
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    parsed > max ||
    !Number.isInteger(parsed)
  ) {
    return undefined;
  }
  return parsed;
}

function boundedRagWatcherNumberArg(value: unknown, max: number): number | undefined {
  if (typeof value === "string" && value.trim() === "") return undefined;
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) return undefined;
  return parsed;
}

export function normalizeWatcherReconfigureArgs(
  input: unknown,
): WatcherReconfigureArgs {
  const value: Record<string, unknown> =
    input !== null && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const args: WatcherReconfigureArgs = {};
  const debounceMs = boundedRagWatcherIntegerArg(
    value.debounce_ms,
    WATCHER_DEBOUNCE_MS_MAX,
  );
  const cooldownS = boundedRagWatcherNumberArg(
    value.cooldown_s,
    WATCHER_COOLDOWN_S_MAX,
  );
  if (debounceMs !== undefined) args.debounce_ms = debounceMs;
  if (cooldownS !== undefined) args.cooldown_s = cooldownS;
  return args;
}

export function useRagWatcherReconfigure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: unknown) =>
      dispatchOps({
        target: "rag",
        verb: "watcher-reconfigure",
        body: normalizeWatcherReconfigureArgs(args),
      }),
    onSuccess: () => {
      invalidateRagWatcherControlQueries(queryClient);
    },
  });
}

export function useRagWatcherStart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dispatchOps({ target: "rag", verb: "watcher-start" }),
    onSuccess: () => {
      invalidateRagWatcherControlQueries(queryClient);
    },
  });
}

export function useRagWatcherStop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dispatchOps({ target: "rag", verb: "watcher-stop" }),
    onSuccess: () => {
      invalidateRagWatcherControlQueries(queryClient);
    },
  });
}

/** Evict a resident project slot (frees its GPU/model lease). The target root is
 *  passed in the body; the broker validates it (no flag-injection). */
export function useRagProjectEvict() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (root: unknown) => {
      const normalizedRoot = normalizeRagProjectRoot(root);
      return normalizedRoot === null
        ? Promise.resolve(skippedRagProjectEvictResult())
        : dispatchOps({
            target: "rag",
            verb: "project-evict",
            body: { root: normalizedRoot },
          });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...ragControlKeys.all, "projects"],
      });
    },
  });
}

// --- a small convenience: track the in-flight reindex job id -------------------

/**
 * Couple a reindex trigger to its progress poll: returns a `trigger` that fires
 * the reindex and remembers the returned `job_id`, plus the live `progress` view
 * polled from it. This is the one-call shape the control UI consumes.
 */
export function useRagReindexWithProgress(scope: unknown): {
  trigger: (args?: unknown) => void;
  pending: boolean;
  jobId: string | null;
  progress: RagJobProgressView;
} {
  const normalizedScope = normalizeRagControlScope(scope);
  const queryClient = useQueryClient();
  const reindex = useRagReindex();
  const { jobId, beginRequest, acceptReceipt } =
    useRagReindexJobIdentity(normalizedScope);
  const progress = useRagJobProgress(normalizedScope, jobId);
  const settledJobRef = useRef<string | null>(null);

  useEffect(() => {
    if (jobId === null || !progress.terminal) return;
    if (settledJobRef.current === jobId) return;
    settledJobRef.current = jobId;
    invalidateRagReindexSettlementQueries(
      queryClient,
      normalizedScope,
      !progress.failed,
    );
  }, [jobId, normalizedScope, progress.failed, progress.terminal, queryClient]);

  const trigger = useMemo(
    () => (args?: unknown) => {
      if (normalizedScope === null) return;
      const triggerScope = normalizedScope;
      const triggerSeq = beginRequest(triggerScope);
      reindex.mutate(args ?? {}, {
        onSuccess: (result) => {
          const envelope = (result as { envelope?: { job_id?: unknown } } | undefined)
            ?.envelope;
          if (envelope?.job_id !== undefined) {
            acceptReceipt(triggerScope, triggerSeq, envelope.job_id);
          }
        },
      });
    },
    [acceptReceipt, beginRequest, reindex, normalizedScope],
  );

  return { trigger, pending: reindex.isPending, jobId, progress };
}
