// Specimens: `panels` area (the control-panel dialog bodies).
//
// Three of the four prefer their exported wire-free BODY component, authoring
// the four states directly as props (no seed, no QueryClient involvement).
// `panels-ragjobdashboard` is the one real container: it mounts the production
// `RagJobDashboard` (which itself mounts the `RagJobsTable` container) and seeds
// the cell's QueryClient at the real query keys the two hooks it composes read.

import {
  deriveA2aLifecycleView,
  type A2aLifecycleJob,
  type A2aLifecycleStatus,
} from "@app/stores/server/a2aLifecycle";
import { A2aLifecyclePanelBody } from "@app/app/panels/A2aLifecyclePanel";

import {
  ragControlKeys,
  type RagJob,
  type RagJobsSnapshot,
  type RagStorageNamespace,
  type RagStorageRollup,
} from "@app/stores/server/ragControl";
import { RagDashboardFooterBody } from "@app/app/panels/RagDashboardFooter";
import {
  deriveRagJobsTable,
  type RagJobsTableViewState,
} from "@app/stores/server/ragDashboardView";
import { RagJobsTableBody } from "@app/app/panels/RagJobsTable";
import { RagJobDashboard } from "@app/app/panels/RagJobDashboard";
import { engineKeys } from "@app/stores/server/queries";
import type { EngineStatus } from "@app/stores/server/engine";

import type { SpecimenDef } from "../registry";
import { REVIEW_SCOPE, tiersDown, tiersHealthy } from "./support";

// --- panels-a2alifecyclepanel --------------------------------------------------

const A2A_STATUS_NORMAL: A2aLifecycleStatus = {
  installed: true,
  installed_known: true,
  install_state: "settled",
  recovery_required: false,
  degraded: false,
  readiness: { state: "gateway-ready", worker: "ready" },
  ownership: { owner: "review-workspace", retained: true },
  active_generation: "generation-042",
  tiers: {},
};

const A2A_STATUS_EMPTY: A2aLifecycleStatus = {
  installed: false,
  installed_known: true,
  install_state: "absent",
  recovery_required: false,
  degraded: false,
  readiness: null,
  ownership: { owner: "", retained: false },
  active_generation: null,
  tiers: {},
};

const A2A_JOB_NORMAL: A2aLifecycleJob = {
  id: "job-771",
  op: "restart",
  state: "succeeded",
  outcome: {},
};

// --- panels-ragdashboardfooter --------------------------------------------------

const RAG_STORAGE_NAMESPACES: RagStorageNamespace[] = [
  {
    prefix: "proj-review-harness",
    root: "Y:/code/vaultspec-dashboard-worktrees/main",
    status: "live",
    points: 84_210,
    footprint_bytes: 41_943_040,
    collections: ["vault", "code"],
  },
  {
    prefix: "proj-orphaned-old-clone",
    root: null,
    status: "orphaned",
    points: 512,
    footprint_bytes: 262_144,
    collections: ["vault"],
  },
];

const RAG_STORAGE_NORMAL: RagStorageRollup = {
  available: true,
  total_points: 84_722,
  total_footprint_bytes: 42_205_184,
  total_namespaces: 2,
  truncated: false,
  live_count: 1,
  orphaned_count: 1,
  namespaces: RAG_STORAGE_NAMESPACES,
};

// --- panels-ragjobstable / panels-ragjobdashboard -------------------------------

const RAG_JOBS_NORMAL: RagJob[] = [
  {
    id: "job-c19f2",
    phase: "running",
    source: "watcher",
    trigger: "file-change",
    started_at: 1_753_800_000,
    progress: {
      step: "embedding batch 4/9",
      completed: 4,
      total: 9,
      last_updated: 1_753_800_120,
    },
  },
  {
    id: "job-a02e7",
    phase: "done",
    source: "manual",
    trigger: "reindex",
    started_at: 1_753_796_000,
    finished_at: 1_753_796_180,
    runtime_seconds: 180,
    result: "ok",
  },
  {
    id: "job-9c441",
    phase: "failed",
    source: "manual",
    trigger: "reindex",
    started_at: 1_753_792_000,
    finished_at: 1_753_792_042,
    runtime_seconds: 42,
    result: "qdrant unreachable",
  },
];

const RAG_JOBS_SNAPSHOT_NORMAL: RagJobsSnapshot = {
  jobs: RAG_JOBS_NORMAL,
  total: 3,
  returned: 3,
  summary: { running: 1, phases: { running: 1, done: 1, failed: 1 } },
};

const RAG_JOBS_SNAPSHOT_EMPTY: RagJobsSnapshot = {
  jobs: [],
  total: 0,
  returned: 0,
  summary: { running: 0, phases: {} },
};

const RAG_JOBS_VIEW_STATE: RagJobsTableViewState = {
  sort: "recency",
  facets: [],
  filterText: "",
};

// --- panels-ragjobdashboard: the status read the header + table both compose ---

// `useRagStatus` reads the `semantic` tier via `readTierAvailability`, where
// an ABSENT tier is unavailable (contract §2, absence ≠ available) — an empty
// `{}` block here reads as degraded and the header would show "Unavailable"
// text under a green (running) dot. Mark it healthy explicitly.
const RAG_DASHBOARD_STATUS_NORMAL: EngineStatus = {
  ok: true,
  nodes: 120,
  edges: 340,
  degradations: [],
  tiers: tiersHealthy("semantic"),
  rag: { service: "running", watcher: "watching", index: "fresh", jobs: 1 },
};

const RAG_DASHBOARD_STATUS_EMPTY: EngineStatus = {
  ok: true,
  nodes: 120,
  edges: 340,
  degradations: [],
  tiers: tiersHealthy("semantic"),
  rag: { service: "running", watcher: "idle", index: "fresh", jobs: 0 },
};

const RAG_DASHBOARD_STATUS_DEGRADED: EngineStatus = {
  ok: false,
  nodes: 0,
  edges: 0,
  degradations: ["semantic"],
  tiers: tiersDown(["semantic"]),
};

const RAG_JOBS_KEY = ragControlKeys.jobs(REVIEW_SCOPE, "recent-50");

export const panelsSpecimens: Readonly<Record<string, SpecimenDef>> = {
  "panels-a2alifecyclepanel": {
    note: "Mounts the exported wire-free A2aLifecyclePanelBody directly; the four states are authored props (loading→loading, degraded→statusUnavailable, empty→an absent install), not a seeded query.",
    render: (state) => {
      if (state === "loading") {
        return (
          <A2aLifecyclePanelBody
            view={deriveA2aLifecycleView(undefined)}
            job={undefined}
            busy={false}
            runError={false}
            loading
            onRun={() => {}}
          />
        );
      }
      if (state === "degraded") {
        return (
          <A2aLifecyclePanelBody
            view={deriveA2aLifecycleView(undefined)}
            job={undefined}
            busy={false}
            runError={false}
            statusUnavailable
            onRun={() => {}}
          />
        );
      }
      if (state === "empty") {
        return (
          <A2aLifecyclePanelBody
            view={deriveA2aLifecycleView(A2A_STATUS_EMPTY)}
            job={undefined}
            busy={false}
            runError={false}
            onRun={() => {}}
          />
        );
      }
      return (
        <A2aLifecyclePanelBody
          view={deriveA2aLifecycleView(A2A_STATUS_NORMAL)}
          job={A2A_JOB_NORMAL}
          busy={false}
          runError={false}
          onRun={() => {}}
        />
      );
    },
  },

  "panels-ragdashboardfooter": {
    note: "Mounts the exported wire-free RagDashboardFooterBody directly; the four states are authored props (pending→loading, offline→degraded, storage undefined→the honest 'never surveyed' empty caption), not a seeded query.",
    render: (state) => {
      if (state === "loading") {
        return (
          <RagDashboardFooterBody
            storage={undefined}
            watching={false}
            offline={false}
            pending
            watcherPending={false}
            onToggleWatcher={() => {}}
            onRefresh={() => {}}
          />
        );
      }
      if (state === "degraded") {
        return (
          <RagDashboardFooterBody
            storage={undefined}
            watching={false}
            offline
            pending={false}
            watcherPending={false}
            onToggleWatcher={() => {}}
            onRefresh={() => {}}
          />
        );
      }
      if (state === "empty") {
        return (
          <RagDashboardFooterBody
            storage={undefined}
            watching={false}
            offline={false}
            pending={false}
            watcherPending={false}
            onToggleWatcher={() => {}}
            onRefresh={() => {}}
          />
        );
      }
      return (
        <RagDashboardFooterBody
          storage={RAG_STORAGE_NORMAL}
          watching
          offline={false}
          pending={false}
          watcherPending={false}
          onToggleWatcher={() => {}}
          onRefresh={() => {}}
        />
      );
    },
  },

  "panels-ragjobstable": {
    note: "Mounts the exported wire-free RagJobsTableBody directly, with `table` built by the real deriveRagJobsTable over a few authored indexing-job rows; loading/degraded are the `pending`/`offline` props deriveRagJobsTable itself never sees.",
    render: (state) => {
      if (state === "loading") {
        return (
          <RagJobsTableBody
            table={deriveRagJobsTable(undefined, RAG_JOBS_VIEW_STATE)}
            selectedJobId={null}
            offline={false}
            pending
          />
        );
      }
      if (state === "degraded") {
        return (
          <RagJobsTableBody
            table={deriveRagJobsTable(undefined, RAG_JOBS_VIEW_STATE)}
            selectedJobId={null}
            offline
            pending={false}
          />
        );
      }
      if (state === "empty") {
        return (
          <RagJobsTableBody
            table={deriveRagJobsTable(RAG_JOBS_SNAPSHOT_EMPTY, RAG_JOBS_VIEW_STATE)}
            selectedJobId={null}
            offline={false}
            pending={false}
          />
        );
      }
      return (
        <RagJobsTableBody
          table={deriveRagJobsTable(RAG_JOBS_SNAPSHOT_NORMAL, RAG_JOBS_VIEW_STATE)}
          selectedJobId="job-a02e7"
          offline={false}
          pending={false}
        />
      );
    },
  },

  "panels-ragjobdashboard": {
    note: 'Container: mounts the real RagJobDashboard (which itself mounts RagJobsTable). Seeds engineKeys.status() (useRagStatus, the header) and ragControlKeys.jobs(scope,"recent-50") (useRagJobs(scope, RAG_JOBS_LIMIT_CAP), the table) — the exact keys and BrokeredResult<T> envelope shape those two hooks read. Loading seeds neither, so both queries pend and the header/table render their own loading treatments together.',
    seed: (client, state) => {
      if (state === "normal") {
        client.setQueryData(engineKeys.status(), RAG_DASHBOARD_STATUS_NORMAL);
        // `ragQuerySemanticOffline` reads this envelope's own `tiers` (same
        // absence-is-unavailable rule) to drive the table's `offline` prop.
        client.setQueryData(RAG_JOBS_KEY, {
          envelope: RAG_JOBS_SNAPSHOT_NORMAL,
          tiers: tiersHealthy("semantic"),
        });
        return;
      }
      if (state === "empty") {
        client.setQueryData(engineKeys.status(), RAG_DASHBOARD_STATUS_EMPTY);
        client.setQueryData(RAG_JOBS_KEY, {
          envelope: RAG_JOBS_SNAPSHOT_EMPTY,
          tiers: tiersHealthy("semantic"),
        });
        return;
      }
      if (state === "degraded") {
        client.setQueryData(engineKeys.status(), RAG_DASHBOARD_STATUS_DEGRADED);
        client.setQueryData(RAG_JOBS_KEY, {
          envelope: null,
          tiers: tiersDown(["semantic"]),
        });
      }
      // loading: leave both engineKeys.status() and the jobs key unseeded.
    },
    render: () => <RagJobDashboard />,
  },
};
