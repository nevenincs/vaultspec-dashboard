// The rag control plane — the stores-layer SOLE wire
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
// Job lifecycle is trigger-then-poll: a reindex mutation returns rag's
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

import { engineClient, type OpsResult, type RagLogsEnvelope } from "./engine";

import {
  RAG_CONTROL_READ_GC_MS,
  normalizeRagControlScope,
  normalizeRagControlKeyPart,
  normalizeRagJobNumber,
  normalizeRagJobText,
  ragControlKeys,
  ragControlSemanticOffline,
  ragSemanticOffline,
  type BrokeredResult,
} from "./ragControlBase";

// One import path for the whole rag control plane: the base, log-tail, and
// served-search submodules (split under the module-size gate) surface here.
export * from "./ragControlBase";
export * from "./ragLogs";
export * from "./ragSearchActivity";

// The rag logs wire shape lives with the ops wire family (`statusTypes`) so the
// low-level client method stays typed without a client↔stores cycle; re-exported
// here beside the other rag envelopes for the panel's consumers.
export type { RagLogsEnvelope };
import { engineKeys, invalidateScopedSemanticReads } from "./queries";
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
  /** The service-quiesce (pause) block rag stamps on every jobs snapshot. */
  quiesce?: RagQuiesceBlock;
}

/** rag's service-quiesce block, forwarded verbatim on the `/jobs` snapshot: the
 *  pause lifecycle (`running` | `pausing` | `quiesced` | `warming`) plus its
 *  transition timestamps. Tolerant — every field optional. */
export interface RagQuiesceBlock {
  state?: string;
  admissions_open?: boolean;
  pause_requested_at?: number | null;
  quiesced_at?: number | null;
  warming_started_at?: number | null;
  failure_reason?: string | null;
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

// --- rag-ops aggregated size/state ---------------------------------------------
//
// The engine computes the storage size rollup in Rust and serves it (plus the
// verbatim index/qdrant/watcher/tenant blocks) as ONE `ops-state` snapshot, with
// the Tier-2 Qdrant-native collection health as a separate gated drill-in. These
// mirror that wire shape, deliberately tolerant (every field optional).

/** One namespace in the storage rollup. */
export interface RagStorageNamespace {
  prefix: string;
  /** Resolved project root, or null for an orphaned/unknown namespace. */
  root: string | null;
  /** `live` | `orphaned` | `unknown` | `unverifiable`. */
  status: string;
  points: number;
  footprint_bytes: number;
  collections: string[];
}

/** The Rust-computed storage size rollup over rag's storage survey. */
export interface RagStorageRollup {
  /** false in local-only mode (survey 409) or on a survey fault. */
  available: boolean;
  total_points: number;
  total_footprint_bytes: number;
  total_namespaces: number;
  /** true when the survey returned fewer namespaces than `total_namespaces`
   *  (bounded at the survey limit): the totals/counts are then a LOWER BOUND over
   *  the returned slice, not exact machine totals. */
  truncated: boolean;
  live_count: number;
  orphaned_count: number;
  namespaces: RagStorageNamespace[];
}

/** The aggregated rag-ops snapshot (`GET /ops/rag/ops-state`). */
export interface RagOpsStateEnvelope {
  index?: Record<string, unknown> | null;
  qdrant?: Record<string, unknown> | null;
  watcher?: Record<string, unknown> | null;
  storage?: RagStorageRollup;
  tenants?: Record<string, unknown> | null;
}

/** Tier-2 Qdrant-native collection health (`GET /ops/rag/collection-health`),
 *  capability-gated on the Qdrant version: `supported:false` degrades honestly. */
export interface RagCollectionHealthEnvelope {
  supported: boolean;
  qdrant_version?: string | null;
  collection?: string;
  reason?: string;
  health?: {
    status?: string | null;
    points_count?: number | null;
    indexed_vectors_count?: number | null;
    segments_count?: number | null;
    optimizer_status?: unknown;
  };
}

export const RAG_PROJECT_SLOTS_MAX_ITEMS = 64;

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
  const projects: RagProjectSlot[] = [];
  for (const slot of slots) {
    const normalized = normalizeRagProjectSlot(slot);
    if (normalized !== null) projects.push(normalized);
    if (projects.length >= RAG_PROJECT_SLOTS_MAX_ITEMS) break;
  }
  return projects;
}

function skippedRagProjectEvictResult(): OpsResult {
  return {
    ok: false,
    envelope: { skipped: true, reason: "missing-project-root" },
    tiers: {},
  };
}

// --- pure interpreters (unit-tested without a render) --------------------------

/** rag's terminal job phases — anything that is not still in flight. A job in
 *  `queued`/`running` is live; everything else (done/ok/error/failed/cancelled)
 *  is terminal and stops the poll. */
const LIVE_PHASES = new Set(["queued", "running", "pending"]);

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

// --- service lifecycle (machine-global; attach-never-own) ----------------------
//
// `server-start`/`server-stop` are MACHINE-GLOBAL: the dashboard manages
// whatever rag service is running on the machine
// and starts its own only when one is genuinely absent. The engine's start path
// gates on the running-predicate and ATTACHES to an already-running / machine-
// owned service instead of erroring, so the lifecycle envelope carries a `status`
// (`already_running` | `started` | `machine_owned` | `failed`) plus `attached`.
// `stop` affects EVERY consumer (CLI, MCP, other dashboards).

/** The interpreted outcome of a `server-start`: every status but `failed`/`unknown`
 *  is a success — the dashboard is attached to the one machine service (whether it
 *  started it, found it already running, or lost a start race to another consumer). */
export type RagStartStatus =
  | "already_running"
  | "started"
  | "machine_owned"
  | "needs_install"
  | "failed"
  | "unknown";

export interface RagStartOutcome {
  status: RagStartStatus;
  attached: boolean;
}

function readLifecycleString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Interpret a `server-start` envelope into the typed attach outcome. The engine
 *  never 502s an already-running start, so the control UI reads success vs failure
 *  from this `status`, not from a thrown transport error. */
export function interpretRagStartEnvelope(
  result: OpsResult | undefined,
): RagStartOutcome {
  const envelope =
    result !== undefined &&
    typeof result.envelope === "object" &&
    result.envelope !== null
      ? (result.envelope as Record<string, unknown>)
      : undefined;
  const statusRaw = readLifecycleString(envelope?.status);
  const status: RagStartStatus =
    statusRaw === "already_running" ||
    statusRaw === "started" ||
    statusRaw === "machine_owned" ||
    statusRaw === "needs_install" ||
    statusRaw === "failed"
      ? statusRaw
      : "unknown";
  const isFailure =
    status === "failed" || status === "needs_install" || status === "unknown";
  return {
    status,
    attached: envelope?.attached === true || !isFailure,
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

// --- service quiesce (pause / resume) ------------------------------------------
//
// rag's pause is a QUIESCE HOLD, never a stop: admissions close and in-flight
// work drains to a safe checkpoint while the daemon stays alive and reachable;
// resume releases the hold. The hold's lifecycle rides the `/jobs` snapshot's
// `quiesce` block, so the pause STATE costs no dedicated read. Both verbs are
// idempotent on the service side and MACHINE-GLOBAL — a hold affects every
// consumer of the one machine service, which the control's copy must say.

/** The interpreted hold state. rag's `quiesced` renders as paused and its
 *  `warming` as resuming; an absent/unrecognized block yields `unknown`. */
export type RagQuiesceWord = "running" | "pausing" | "paused" | "resuming" | "unknown";

export interface RagQuiesceView {
  word: RagQuiesceWord;
  paused: boolean;
  /** A hold transition is in flight (pausing or resuming) — poll stays warm. */
  transitional: boolean;
  /** rag reported the transition failed (verbatim reason withheld from screen). */
  failed: boolean;
  semanticOffline: boolean;
}

const QUIESCE_WORDS: Record<string, RagQuiesceWord> = {
  running: "running",
  pausing: "pausing",
  quiesced: "paused",
  warming: "resuming",
};

export function interpretRagQuiesce(
  data: BrokeredResult<RagJobsSnapshot> | undefined,
): RagQuiesceView {
  const semanticOffline = ragSemanticOffline(data);
  const block = semanticOffline ? undefined : data?.envelope?.quiesce;
  const raw = typeof block?.state === "string" ? block.state.toLowerCase() : "";
  const word = QUIESCE_WORDS[raw] ?? "unknown";
  return {
    word,
    paused: word === "paused",
    transitional: word === "pausing" || word === "resuming",
    failed:
      typeof block?.failure_reason === "string" && block.failure_reason.length > 0,
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
  // Select the RAW stable slices (jobId + the two stable action fns); assemble the
  // identity in useMemo (stable-selectors) — never build the object inside the
  // selector, even under useShallow.
  const jobId = useRagReindexJobStore((state) => state.jobId);
  const beginRequest = useRagReindexJobStore((state) => state.beginRequest);
  const acceptReceipt = useRagReindexJobStore((state) => state.acceptReceipt);
  const identity = useMemo(
    () => ({ jobId, beginRequest, acceptReceipt }),
    [jobId, beginRequest, acceptReceipt],
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
    "search-activity",
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
  if (verb !== "server-start" && verb !== "server-stop") return;

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
    gcTime: RAG_CONTROL_READ_GC_MS,
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
    gcTime: RAG_CONTROL_READ_GC_MS,
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
    gcTime: RAG_CONTROL_READ_GC_MS,
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
    gcTime: RAG_CONTROL_READ_GC_MS,
  });
  return enabled ? query : { ...query, data: undefined };
}

/** The aggregated rag-ops size/state snapshot (W02): one bounded brokered read,
 *  degrading via the tiers block. The console's overview consumes this. */
export function useRagOpsState(scope: unknown) {
  const normalizedScope = normalizeRagControlScope(scope);
  const enabled = normalizedScope !== null;
  const query = useQuery({
    queryKey: ragControlKeys.opsState(normalizedScope ?? ""),
    queryFn: ({ signal }) =>
      engineClient.opsRagGet<RagOpsStateEnvelope>("ops-state", undefined, signal),
    enabled,
    gcTime: RAG_CONTROL_READ_GC_MS,
  });
  return enabled ? query : { ...query, data: undefined };
}

/** Tier-2 Qdrant-native health for ONE collection (W02): the gated "needs repair"
 *  drill-in. Enabled only when a non-empty collection name is supplied. */
export function useRagCollectionHealth(scope: unknown, collection: unknown) {
  const normalizedScope = normalizeRagControlScope(scope);
  const normalizedCollection = normalizeRagControlKeyPart(collection);
  const enabled = normalizedScope !== null && normalizedCollection.length > 0;
  const query = useQuery({
    queryKey: ragControlKeys.collectionHealth(
      normalizedScope ?? "",
      normalizedCollection,
    ),
    queryFn: ({ signal }) =>
      engineClient.opsRagGet<RagCollectionHealthEnvelope>(
        "collection-health",
        { collection: normalizedCollection },
        signal,
      ),
    enabled,
    gcTime: RAG_CONTROL_READ_GC_MS,
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
 * The jobs-progress poll hook: poll `/ops/rag/jobs?job_id=` with backoff
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
    gcTime: RAG_CONTROL_READ_GC_MS,
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

/** The quiesce poll cadences: fast while a hold transition (pausing/resuming)
 *  is in flight — the drain settles in seconds — and a steady bounded monitor
 *  cadence otherwise. A settled-word-only poll was tried first and proved
 *  blind live: a pause requested while the last read said `running` stopped
 *  the poll, so the console never saw the hold it had just asked for. */
export const RAG_QUIESCE_TRANSITION_POLL_MS = 2000;
export const RAG_QUIESCE_POLL_MS = 5000;

/**
 * The service-hold state hook: a bounded `jobs` read (limit 1 — the quiesce
 * block rides every jobs snapshot) interpreted into the pause lifecycle.
 * Mount-gated with the console that consumes it, polling on the steady monitor
 * cadence (fast during transitions) while rag is up; a degraded read stops the
 * poll and the view holds honestly (tiers-gated, never a transport guess).
 */
export function useRagQuiesce(scope: unknown): RagQuiesceView {
  const normalizedScope = normalizeRagControlScope(scope);
  const enabled = normalizedScope !== null;
  const query = useQuery({
    queryKey: ragControlKeys.jobs(normalizedScope ?? "", "quiesce"),
    queryFn: ({ signal }) =>
      engineClient.opsRagGet<RagJobsSnapshot>("jobs", { limit: 1 }, signal),
    enabled,
    gcTime: RAG_CONTROL_READ_GC_MS,
    refetchInterval: (q) => {
      const data = q.state.data as BrokeredResult<RagJobsSnapshot> | undefined;
      if (ragSemanticOffline(data)) return false;
      return interpretRagQuiesce(data).transitional
        ? RAG_QUIESCE_TRANSITION_POLL_MS
        : RAG_QUIESCE_POLL_MS;
    },
    refetchIntervalInBackground: false,
  });
  return interpretRagQuiesce(
    enabled ? (query.data as BrokeredResult<RagJobsSnapshot> | undefined) : undefined,
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
    gcTime: RAG_CONTROL_READ_GC_MS,
  });
  return enabled ? query : { ...query, data: undefined };
}

// --- control mutations (dispatched through the platform seam) ------------------
//
// Every control flows through `dispatchOps` → the platform `appDispatcher` → the
// engine's brokered `/ops/rag/{verb}` POST: logged, traced, centrally
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

// The watcher-reconfigure client seam (normalizer + hook) retired with the
// console-era ops panel — its only consumers. The brokered
// `watcher-reconfigure` verb remains on the wire; a future surface rebuilds
// the seam rather than keeping a dead one (no-deprecation-bridges).

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

/**
 * Start the machine rag service with attach-never-own semantics: dispatch
 * `server-start` (the engine gates on the running-predicate and attaches to an
 * already-running / machine-owned service rather than erroring), then re-read the
 * authoritative state so the UI reflects the now-attached service. Resolves with
 * the raw `OpsResult`; the caller interprets it with `interpretRagStartEnvelope`.
 * Offer this conditionally — only when rag is not already running (the running
 * state is exposed by `deriveRagStatusView`).
 */
/** The bounded `server-start` flags the engine forwards: local-only backend,
 *  an explicit port, and auto-provisioning the managed Qdrant binary. */
export interface RagStartArgs {
  local_only?: boolean;
  port?: number;
  qdrant_auto_provision?: boolean;
}

export function useRagServiceStart(scope: unknown) {
  const invalidate = useInvalidateAfterRagOpsRun(scope);
  return useMutation({
    mutationFn: (args?: RagStartArgs) =>
      dispatchOps({
        target: "rag",
        verb: "server-start",
        body: args && Object.keys(args).length > 0 ? args : undefined,
      }),
    onSuccess: () => invalidate("server-start"),
  });
}

/**
 * Stop the ONE machine rag service. This stops it for EVERY consumer on the
 * machine (this dashboard, the CLI, MCP, other dashboards) — the UI copy must say
 * so. Re-reads the authoritative state on completion.
 */
export function useRagServiceStop(scope: unknown) {
  const invalidate = useInvalidateAfterRagOpsRun(scope);
  return useMutation({
    mutationFn: () => dispatchOps({ target: "rag", verb: "server-stop" }),
    onSuccess: () => invalidate("server-stop"),
  });
}

/**
 * Hold the ONE machine service at safe checkpoints (rag's quiesce). A hold,
 * never a stop: the daemon stays alive and reachable, but admissions close for
 * EVERY consumer on the machine until resume — the UI copy must say so. The
 * settled state is read back through `useRagQuiesce` (the jobs snapshot's
 * quiesce block), which the invalidation refreshes.
 */
export function useRagServicePause(scope: unknown) {
  const invalidate = useInvalidateAfterRagOpsRun(scope);
  return useMutation({
    mutationFn: () => dispatchOps({ target: "rag", verb: "pause" }),
    onSuccess: () => invalidate("pause"),
  });
}

/** Release a held (paused) machine service. Idempotent like the hold. */
export function useRagServiceResume(scope: unknown) {
  const invalidate = useInvalidateAfterRagOpsRun(scope);
  return useMutation({
    mutationFn: () => dispatchOps({ target: "rag", verb: "resume" }),
    onSuccess: () => invalidate("resume"),
  });
}

/** Run rag's `server doctor` readiness probe (diagnostics). Re-reads state. */
export function useRagServiceDoctor(scope: unknown) {
  const invalidate = useInvalidateAfterRagOpsRun(scope);
  return useMutation({
    mutationFn: () => dispatchOps({ target: "rag", verb: "server-doctor" }),
    onSuccess: () => invalidate("server-doctor"),
  });
}

/** Provision rag's managed dependencies (`install`) — the needs-install chain. */
export function useRagServiceInstall(scope: unknown) {
  const invalidate = useInvalidateAfterRagOpsRun(scope);
  return useMutation({
    mutationFn: () => dispatchOps({ target: "rag", verb: "server-install" }),
    onSuccess: () => invalidate("server-install"),
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
