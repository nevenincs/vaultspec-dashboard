// Auto-split from queries.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the queries barrel; see ./index.ts.

import {
  EngineError,
  readTierAvailability,
  tiersFromQuery,
  type EngineStatus,
  type TiersBlock,
} from "../engine";
import { isRagRunning } from "../liveAdapters";
import { useEngineStatus } from "./internal";

// --- git working-tree state (git-diff-browser ADR) -----------------------------------
//
// The git diff browser is app chrome; it consumes git state through these stores
// selectors and NEVER reads the raw `tiers` block (dashboard-layer-ownership). The
// LIVE `/status` snapshot carries `git: { branch (from head_ref), ahead?, behind?,
// dirty: boolean }` — a clean/dirty BOOLEAN, NOT a per-file list, and ahead/behind
// that are absent when no upstream is configured. `git` is NOT one of the canonical
// tiers (`declared`/`structural`/`temporal`/`semantic`), so git availability is
// derived from the PRESENCE of the `git` payload, never from a (non-existent) git
// tier. When the engine responds but carries no `git` object, that is the designed
// "no repository state" degraded state; a tiers-less transport fault is the error.
//
// RICHER CAPABILITIES (now SERVED by the read-only `/ops/git/{verb}` pass-through —
// the engine forwards porcelain `status`, `numstat`, and unified `diff` for a path
// VERBATIM, with NO diff algorithm and NO mutating verb, by construction
// `engine-read-and-infer`): the per-file CHANGED-FILES LIST (from porcelain status
// + numstat) and the per-file DIFF BODY (from unified diff). The selectors below
// fetch them through the stores layer's `client.opsGit` seam and parse git's
// verbatim text (`parseGitStatus` / `parseGitNumstat` / `parseUnifiedDiff`) into the
// status-grouped list and hunk-by-hunk shapes the chrome renders.

/** The per-file changed-files list IS served (porcelain status + numstat). */
export const CHANGED_FILES_LIST_SERVED = true;
/** The read-only per-file diff body IS served (unified diff for a path). */
export const GIT_DIFF_CAPABILITY_SERVED = true;

export interface GitStatusView {
  /** The status snapshot is in flight with no held git data. */
  loading: boolean;
  /** A genuine transport failure (no tiers-bearing envelope) — distinct from degraded. */
  errored: boolean;
  /** Designed degradation: the engine responded but carries no git payload. */
  degraded: boolean;
  /** The git rollup when available; undefined while loading/degraded/errored. */
  git?: NonNullable<EngineStatus["git"]>;
  /**
   * The working tree is dirty (live `dirty: boolean`). True iff git is available
   * AND dirty. The per-file changed list is served separately by `useChangedFiles`
   * (porcelain status + numstat); this boolean is the header's clean/dirty pill.
   */
  dirty: boolean;
}

/** The git view plus a retry bound to the STATUS query (not some other query). */
export interface GitStatusHookView extends GitStatusView {
  /** Refetch the status snapshot — the source of git state (LOW: not events). */
  retry: () => void;
}

/**
 * Derive the git working-tree view (loading / degraded / errored / available)
 * from a status query's data + error + pending flags, reading the `git` payload
 * ONLY here in the stores layer so the surface consumes interpreted truth, never
 * `status.data.tiers`. `git` is not a tier: availability tracks the PRESENCE of
 * the `git` object. An engine response with no git payload is designed
 * degradation; a tiers-less transport fault is the errored branch.
 */
export function deriveGitStatusView(
  data: EngineStatus | undefined,
  error: unknown,
  pending: boolean,
): GitStatusView {
  if (data?.git) {
    return {
      loading: false,
      errored: false,
      degraded: false,
      git: data.git,
      dirty: data.git.dirty,
    };
  }
  // No git payload. A served response (success data OR a tiers-bearing error
  // envelope, i.e. the engine answered) is designed degradation; a tiers-less
  // fault is the errored branch; otherwise still in flight.
  const answered =
    data !== undefined || (error instanceof EngineError && error.tiers !== undefined);
  if (answered) {
    return { loading: false, errored: false, degraded: true, dirty: false };
  }
  if (error) return { loading: false, errored: true, degraded: false, dirty: false };
  return { loading: pending, errored: false, degraded: false, dirty: false };
}

/**
 * Stores hook: the active worktree's git working-tree view, read through the
 * status query so the git diff browser consumes interpreted state instead of the
 * raw `tiers` block. The surface renders loading / degraded / errored / available
 * directly from this, never inspecting `status.data.tiers`.
 */
export function useGitStatus(): GitStatusHookView {
  const status = useEngineStatus();
  const view = deriveGitStatusView(status.data, status.error, status.isPending);
  return { ...view, retry: () => void status.refetch() };
}

// --- vaultspec-core status (status rollup) ------------------------------------------
//
// The core rollup is app chrome; it consumes interpreted status through this stores
// selector and never inspects `status.core` directly (dashboard-layer-ownership).
// The `/status` snapshot carries `core: { reachable, vault_health? }` when the
// engine can report core health. Missing/unreachable core is a designed down state;
// a tiers-less transport fault is the errored branch.

export interface CoreStatusView {
  /** The status snapshot is in flight with no held core data. */
  loading: boolean;
  /** A genuine transport failure (no tiers-bearing envelope). */
  errored: boolean;
  /** Whether vaultspec-core is reachable according to the served status rollup. */
  reachable: boolean;
  /** The forwarded core vault health word, when present. */
  vaultHealth?: string;
}

export function deriveCoreStatusView(
  data: EngineStatus | undefined,
  error: unknown,
  pending: boolean,
): CoreStatusView {
  if (data?.core) {
    return {
      loading: false,
      errored: false,
      reachable: data.core.reachable,
      vaultHealth: data.core.vault_health,
    };
  }
  if (error) {
    return { loading: false, errored: true, reachable: false };
  }
  return { loading: pending, errored: false, reachable: false };
}

export function useCoreStatus(): CoreStatusView {
  const status = useEngineStatus();
  return deriveCoreStatusView(status.data, status.error, status.isPending);
}

// --- rag service status (dashboard-rag-manager ADR) ----------------------------------
//
// The rag rollup is app chrome; it reads rag readiness through this stores
// selector and NEVER inspects `status.rag` or the raw `tiers` block directly
// (dashboard-layer-ownership / rag-manager ADR "Reads status truth via stores").
// The `/status` snapshot carries `rag: { service, watcher?, index?, jobs? }` plus
// the wire `tiers` block. Per the rag-manager ADR, rag-down, rag-absent, and a
// `semantic` tier reporting unavailable are all DESIGNED degraded states sourced
// from that truth — never failures. "Readiness" is the COMPOSITE the ADR names
// (running + index present + watcher live), derived ONLY from fields the snapshot
// actually carries; no rag semantics are reconstructed here.

const RAG_TIER = "semantic";

/** The interpreted rag service view consumed by the rollup and the ops cluster. */
export interface RagStatusView {
  /** The status snapshot is in flight with no held rag data. */
  loading: boolean;
  /** A genuine transport failure (no tiers-bearing envelope) — engine unreachable. */
  errored: boolean;
  /**
   * Designed degradation: the `semantic` tier reports unavailable (or is absent
   * from a served block). Distinct from a plain stopped/absent service — this is
   * the engine telling us the capability is down.
   */
  degraded: boolean;
  /** The engine's per-tier reason when degraded, for copy-tone rendering. */
  reason?: string;
  /**
   * The service lifecycle word verbatim from the snapshot ("running" / "stopped"
   * / "absent" / …) when a rag payload is present; undefined while loading or on
   * a tiers-less transport fault. Never synthesized.
   */
  service?: string;
  /** True only when the service word is exactly "running". */
  running: boolean;
  /** The watcher state word when present (e.g. "watching"); undefined otherwise. */
  watcher?: string;
  /** The index-present word when present (e.g. "fresh"); undefined otherwise. */
  index?: string;
  /** In-flight job count when present; undefined otherwise. */
  jobs?: number;
  /**
   * The composite readiness the ADR names: rag is "ready" only when the service
   * is running, the index is present, and the watcher is live. Derived strictly
   * from the carried fields; false whenever any is missing or the tier degrades.
   */
  ready: boolean;
}

/**
 * Derive the rag service view (loading / errored / degraded / lifecycle / composite
 * readiness) from a status query's data + error + pending flags, reading the `rag`
 * payload and the `semantic` tier ONLY here in the stores layer so the rollup and
 * the ops cluster consume interpreted truth, never `status.data.tiers` or the raw
 * `status.rag`. A served tiers block that marks `semantic` unavailable (or omits it)
 * is degradation (contract §2: absence ≠ available); a tiers-less transport fault is
 * the errored branch. The composite `ready` is true only when running + index +
 * watcher all hold — the ADR's "states the composite plainly rather than making the
 * operator infer it".
 */
export function deriveRagStatusView(
  data: EngineStatus | undefined,
  error: unknown,
  pending: boolean,
): RagStatusView {
  const tiers = tiersFromQuery({ data, error });
  const availability = readTierAvailability(tiers, [RAG_TIER]);
  const degraded = tiers !== undefined && availability.degraded;
  // Prefer the per-tier semantic-degradation reason; fall back to the lifecycle
  // reason the `/status` machine `state` carries (crashed/absent explanation) when
  // the tier block names none.
  const reason = availability.reasons[RAG_TIER] ?? data?.rag?.reason;

  if (data?.rag) {
    const rag = data.rag;
    const running = isRagRunning(rag.service);
    const ready =
      running && !degraded && rag.index !== undefined && rag.watcher !== undefined;
    return {
      loading: false,
      errored: false,
      degraded,
      reason,
      service: rag.service,
      running,
      watcher: rag.watcher,
      index: rag.index,
      jobs: rag.jobs,
      ready,
    };
  }
  // No rag payload. A tiers-bearing envelope (served snapshot OR a backend-down
  // error envelope) is designed degradation; a tiers-less fault is the errored
  // branch; otherwise the snapshot is still in flight.
  if (tiers) {
    return {
      loading: false,
      errored: false,
      degraded,
      reason,
      running: false,
      ready: false,
    };
  }
  if (error) {
    return {
      loading: false,
      errored: true,
      degraded: false,
      running: false,
      ready: false,
    };
  }
  return {
    loading: pending,
    errored: false,
    degraded: false,
    running: false,
    ready: false,
  };
}

/**
 * Stores hook: the rag service view, read through the status query so the rag
 * manager surface consumes interpreted state instead of the raw `tiers` block or
 * the raw `status.rag`. The rollup and the ops cluster render
 * loading / errored / degraded / lifecycle / readiness directly from this.
 */
export function useRagStatus(): RagStatusView {
  const status = useEngineStatus();
  return deriveRagStatusView(status.data, status.error, status.isPending);
}

export interface StatusRollupView {
  engineUnreachable: boolean;
  degradations: string[];
  git: GitStatusHookView;
  core: CoreStatusView;
  rag: RagStatusView;
}

/**
 * Stores selector for the NowStrip status rollup. The chrome reads one
 * interpreted view instead of mixing raw `/status` query state with derived
 * git/core/rag selectors, so engine-unreachable and degraded-backend copy are
 * decided in the stores layer with the rest of the status truth.
 */
export function useStatusRollup(): StatusRollupView {
  const status = useEngineStatus();
  return {
    engineUnreachable: status.isError,
    degradations: status.data?.degradations ?? [],
    git: {
      ...deriveGitStatusView(status.data, status.error, status.isPending),
      retry: () => void status.refetch(),
    },
    core: deriveCoreStatusView(status.data, status.error, status.isPending),
    rag: deriveRagStatusView(status.data, status.error, status.isPending),
  };
}

// --- work pillar availability (dashboard-activity-rail ADR) ---------------------------
//
// The right-rail `work` tab is the in-flight pipeline pillar: the active ADRs and
// plans in scope, with their wave/phase/step progress. That CONTENT and its wire are
// specified by the sibling `dashboard-pipeline-status` ADR and are out of scope for
// the activity-rail plan; what lands now is the tab FRAME with its own designed
// degraded and empty states. The frame is app chrome under dashboard-layer-ownership:
// it reads availability through this stores selector ONLY, never fetching the engine
// and never inspecting the raw `tiers` block.
//
// The pillar's documents (ADRs, plans) and their lifecycle/progress are resolved by
// the engine's STRUCTURAL read of the vault corpus, so the `structural` tier gates the
// pillar's availability (contract §2: a tier marked `available:false` OR absent from a
// served block is a designed degraded state — absence is degradation, not
// availability). Degradation is derived from the tiers truth the wire carries (the
// success envelope's `tiers`, or the FRESH error envelope's `tiers` winning over a
// stale held block), per degradation-is-read-from-tiers-not-guessed-from-errors —
// never inferred from a bare transport error. The `items` array is the seam the
// pipeline-status plan extends with the real in-flight ADR/plan list; today it is
// always empty, so a non-degraded pillar renders the designed empty state.

export const WORK_PILLAR_TIER = "structural";

/**
 * The interpreted work-pillar view the `WorkTab` frame renders. `degraded` is the
 * designed-down state (the `structural` tier reports unavailable or is absent from a
 * served block); `items` carries the in-flight pipeline work once the pipeline-status
 * wire lands (empty today, so the available case is the designed empty state).
 */
export interface WorkPillarAvailability {
  /** A served tiers block reports the structural tier unavailable (or absent). */
  degraded: boolean;
  /** The structural tier's human reason when degraded, for copy-tone rendering. */
  reason?: string;
  /**
   * The in-flight pipeline work (active ADRs/plans). Empty today — this is the seam
   * the sibling dashboard-pipeline-status plan extends with the real list; the frame
   * renders the designed empty state whenever it is empty and the pillar is available.
   */
  items: readonly never[];
}

/**
 * Derive the work-pillar view from the status snapshot's served tiers block, reading
 * the `structural` tier ONLY here in the stores layer so the `WorkTab` frame consumes
 * interpreted truth, never `status.data.tiers`. A served block (success data OR a
 * tiers-bearing error envelope) that marks `structural` unavailable — or omits it — is
 * designed degradation (contract §2: absence ≠ available). A wholly absent block (a
 * tiers-less transport fault with no envelope) is NOT treated as degraded: it is the
 * query's error state, and the frame must not guess "down" from a bare transport error
 * (degradation-is-read-from-tiers-not-guessed-from-errors).
 */
export function deriveWorkPillarAvailability(
  tiers: TiersBlock | undefined,
): WorkPillarAvailability {
  const { degraded, reasons } = readTierAvailability(tiers, [WORK_PILLAR_TIER]);
  return {
    degraded,
    reason: reasons[WORK_PILLAR_TIER],
    items: [],
  };
}

/**
 * Stores hook: the work pillar's availability, read through the status query so the
 * `WorkTab` frame consumes derived truth instead of the raw `tiers` block. The FRESH
 * error envelope's tiers win over a stale held-success block so a backend-down
 * condition surfaces as designed degradation rather than a bare error. Mirrors
 * `useVaultTreeAvailability` / `useGraphSliceAvailability`.
 */
export function useWorkPillarAvailability(): WorkPillarAvailability {
  return deriveWorkPillarAvailability(tiersFromQuery(useEngineStatus()));
}
