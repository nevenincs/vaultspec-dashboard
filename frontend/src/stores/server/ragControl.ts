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

import { useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { engineClient, readTierAvailability, type TiersBlock } from "./engine";
import { engineKeys } from "./queries";
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

export const ragControlKeys = {
  all: [...engineKeys.all, "ops-rag"] as const,
  serviceState: (scope: string) =>
    [...ragControlKeys.all, "service-state", scope] as const,
  jobs: (scope: string, jobId?: string) =>
    [...ragControlKeys.all, "jobs", scope, jobId ?? "all"] as const,
  watcher: (scope: string) => [...ragControlKeys.all, "watcher", scope] as const,
  projects: (scope: string) => [...ragControlKeys.all, "projects", scope] as const,
  readiness: (scope: string) => [...ragControlKeys.all, "readiness", scope] as const,
};

// --- pure interpreters (unit-tested without a render) --------------------------

/** rag's terminal job phases — anything that is not still in flight. A job in
 *  `queued`/`running` is live; everything else (done/ok/error/failed/cancelled)
 *  is terminal and stops the poll. */
const LIVE_PHASES = new Set(["queued", "running", "pending"]);

export function isJobTerminal(phase: string | undefined): boolean {
  if (!phase) return false;
  return !LIVE_PHASES.has(phase.toLowerCase());
}

/** Whether a job's terminal phase is a FAILURE (vs a clean completion). */
export function isJobFailed(phase: string | undefined): boolean {
  if (!phase) return false;
  return ["error", "failed", "cancelled", "canceled"].includes(phase.toLowerCase());
}

/** The first (newest-first) job in a brokered jobs envelope, or undefined. */
export function firstJob(
  envelope: RagJobsSnapshot | null | undefined,
): RagJob | undefined {
  return envelope?.jobs?.[0];
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
  const semanticOffline = readTierAvailability(data?.tiers, ["semantic"]).degraded;
  const job = firstJob(data?.envelope);
  const phase = job?.phase;
  const total = job?.progress?.total;
  const completed = job?.progress?.completed;
  const fraction =
    typeof total === "number" && total > 0 && typeof completed === "number"
      ? Math.max(0, Math.min(1, completed / total))
      : undefined;
  const terminal = isJobTerminal(phase);
  return {
    job,
    phase,
    fraction,
    step: job?.progress?.step,
    terminal,
    failed: isJobFailed(phase),
    polling: jobId !== null && !semanticOffline && !terminal,
    semanticOffline,
  };
}

// --- read hooks (tier-gated) ---------------------------------------------------
//
// Each read is enabled only when the active scope is present (the engine is
// reachable). The degraded truth is read by the consumer from `data.tiers` via
// `readTierAvailability`; these hooks never throw on a degraded read because the
// broker degrades to a tiers-bearing 200, not an error.

const READ_GC_MS = 30_000;

export function useRagServiceState(scope: string | null) {
  return useQuery({
    queryKey: ragControlKeys.serviceState(scope ?? ""),
    queryFn: () => engineClient.opsRagGet<RagServiceStateEnvelope>("service-state"),
    enabled: scope !== null,
    gcTime: READ_GC_MS,
  });
}

export function useRagWatcher(scope: string | null) {
  return useQuery({
    queryKey: ragControlKeys.watcher(scope ?? ""),
    queryFn: () => engineClient.opsRagGet<RagWatcherState>("watcher"),
    enabled: scope !== null,
    gcTime: READ_GC_MS,
  });
}

export function useRagProjects(scope: string | null) {
  return useQuery({
    queryKey: ragControlKeys.projects(scope ?? ""),
    queryFn: () => engineClient.opsRagGet<RagProjectsState>("projects"),
    enabled: scope !== null,
    gcTime: READ_GC_MS,
  });
}

export function useRagReadiness(scope: string | null) {
  return useQuery({
    queryKey: ragControlKeys.readiness(scope ?? ""),
    queryFn: () => engineClient.opsRagGet<Record<string, unknown>>("readiness"),
    enabled: scope !== null,
    gcTime: READ_GC_MS,
  });
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
export function useRagJobProgress(jobId: string | null): RagJobProgressView {
  const query = useQuery({
    queryKey: ragControlKeys.jobs(jobId ?? "", jobId ?? undefined),
    queryFn: () =>
      engineClient.opsRagGet<RagJobsSnapshot>("jobs", {
        job_id: jobId ?? undefined,
        limit: 1,
      }),
    enabled: jobId !== null,
    gcTime: READ_GC_MS,
    refetchInterval: (q) => {
      const data = q.state.data as BrokeredResult<RagJobsSnapshot> | undefined;
      // Stop when rag is down (tiers-gated) so a dead service is not polled.
      if (readTierAvailability(data?.tiers, ["semantic"]).degraded) return false;
      const phase = firstJob(data?.envelope)?.phase;
      if (isJobTerminal(phase)) return false;
      return pollBackoff(q.state.dataUpdateCount);
    },
    refetchIntervalInBackground: false,
  });
  return interpretJobProgress(
    query.data as BrokeredResult<RagJobsSnapshot> | undefined,
    jobId,
  );
}

/** A non-polling read of the recent jobs (for the activity list). */
export function useRagJobs(scope: string | null, limit = 10) {
  return useQuery({
    queryKey: ragControlKeys.jobs(scope ?? "", `recent-${limit}`),
    queryFn: () => engineClient.opsRagGet<RagJobsSnapshot>("jobs", { limit }),
    enabled: scope !== null,
    gcTime: READ_GC_MS,
  });
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

/** Trigger a reindex; resolves with rag's `{job_id, status}` envelope so the
 *  caller can hand the job id to `useRagJobProgress`. */
export function useRagReindex() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: ReindexArgs = {}) =>
      dispatchOps({ target: "rag", verb: "reindex", body: args }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...ragControlKeys.all, "jobs"] });
    },
  });
}

export interface WatcherReconfigureArgs {
  debounce_ms?: number;
  cooldown_s?: number;
}

export function useRagWatcherReconfigure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: WatcherReconfigureArgs) =>
      dispatchOps({ target: "rag", verb: "watcher-reconfigure", body: args }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...ragControlKeys.all, "watcher"],
      });
    },
  });
}

export function useRagWatcherStart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dispatchOps({ target: "rag", verb: "watcher-start" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...ragControlKeys.all, "watcher"],
      });
    },
  });
}

export function useRagWatcherStop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dispatchOps({ target: "rag", verb: "watcher-stop" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...ragControlKeys.all, "watcher"],
      });
    },
  });
}

/** Evict a resident project slot (frees its GPU/model lease). The target root is
 *  passed in the body; the broker validates it (no flag-injection). */
export function useRagProjectEvict() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (root: string) =>
      dispatchOps({ target: "rag", verb: "project-evict", body: { root } }),
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
export function useRagReindexWithProgress(): {
  trigger: (args?: ReindexArgs) => void;
  pending: boolean;
  jobId: string | null;
  progress: RagJobProgressView;
} {
  const reindex = useRagReindex();
  const [jobId, setJobId] = useState<string | null>(null);
  const progress = useRagJobProgress(jobId);

  // When the polled job reaches a terminal phase, stop tracking it so a later
  // re-read does not re-arm the poll on a finished job.
  const lastTerminal = useRef<string | null>(null);
  useEffect(() => {
    if (jobId && progress.terminal && lastTerminal.current !== jobId) {
      lastTerminal.current = jobId;
    }
  }, [jobId, progress.terminal]);

  const trigger = useMemo(
    () => (args?: ReindexArgs) => {
      reindex.mutate(args ?? {}, {
        onSuccess: (result) => {
          const envelope = (result as { envelope?: { job_id?: string } } | undefined)
            ?.envelope;
          if (envelope?.job_id) setJobId(envelope.job_id);
        },
      });
    },
    [reindex],
  );

  return { trigger, pending: reindex.isPending, jobId, progress };
}
