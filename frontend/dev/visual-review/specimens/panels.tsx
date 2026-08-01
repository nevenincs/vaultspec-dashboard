// Specimens: `panels` area — the console bodies Settings > Advanced now hosts
// (advanced-service-console ADR D1). These surfaces used to open as modal control
// panels from the rail-footer status chips; the chips and the modal host are gone,
// and every one of them is reached from the Advanced section instead. What they
// LOOK like is unchanged, which is exactly what these cells prove.
//
// Each prefers its exported wire-free BODY component, authoring the four states
// directly as props (no seed, no QueryClient involvement). The retired
// `panels-ragjobdashboard` container cell went with `RagJobDashboard` itself: its
// header is now `IndexConsoleHeader`, reviewed here from authored identity props
// rather than from a seeded engine status. The `panels-a2alifecyclepanel` cell went
// the same way, with the agent lifecycle console itself — a development metastate
// the owner ruled off the product surface entirely.

import {
  type RagJob,
  type RagJobsSnapshot,
  type RagLogsHookView,
  type RagStorageNamespace,
  type RagStorageRollup,
} from "@app/stores/server/ragControl";
import { RagDashboardFooterBody } from "@app/app/panels/RagDashboardFooter";
import {
  deriveRagJobsTable,
  type RagJobsTableViewState,
} from "@app/stores/server/ragDashboardView";
import { RagJobsTableBody } from "@app/app/panels/RagJobsTable";
import { IndexConsoleHeader } from "@app/app/panels/IndexConsole";
import { IndexLogTailBody } from "@app/app/panels/IndexLogTail";
import type { RagServiceIdentityView } from "@app/stores/server/ragServiceIdentity";
import { BackendHealthPanelBody } from "@app/app/panels/BackendHealthPanel";
import {
  VaultHealthPanelBody,
  deriveVaultHealthView,
} from "@app/app/panels/VaultHealthPanel";
import { type CoreStatusView } from "@app/stores/server/queries";
import {
  deriveSystemPrograms,
  type SystemProgramsInput,
} from "@app/stores/server/systemPrograms";

import type { SpecimenDef } from "../registry";

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

// --- panels-indexconsole / panels-indexlogtail ---------------------------------
//
// Authored identity + log props. Every field mirrors a SERVED one
// (`deriveRagServiceIdentity` over the component handshake, the brokered ops-state
// blocks, and the provisioning projection); the empty view is the honest
// "reachable but nothing served" case the header renders as an empty state.

const INDEX_IDENTITY_NORMAL: RagServiceIdentityView = {
  version: null,
  installedVersion: "0.2.25",
  requiredVersion: "0.2.20",
  storageMode: "server",
  storageEndpoint: "127.0.0.1:6333",
  storageProcessId: 48213,
  storageVersion: "1.18.2",
  storagePath: "~/.vaultspec-rag/qdrant-server",
  documents: 1284,
  code: 21903,
  empty: false,
};

const INDEX_IDENTITY_EMPTY: RagServiceIdentityView = {
  version: null,
  installedVersion: null,
  requiredVersion: null,
  storageMode: null,
  storageEndpoint: null,
  storageProcessId: null,
  storageVersion: null,
  storagePath: null,
  documents: null,
  code: null,
  empty: true,
};

const INDEX_LOG_LINES = [
  {
    text: "2026-08-01 18:02:11,004 INFO  reindex started (vault)",
    level: "info" as const,
  },
  {
    text: "2026-08-01 18:02:14,338 DEBUG embedded 128 chunks",
    level: "debug" as const,
  },
  {
    text: "2026-08-01 18:02:19,771 WARNING slow batch: 3.4s",
    level: "warning" as const,
  },
  { text: "2026-08-01 18:02:22,105 INFO  reindex complete", level: "info" as const },
];

function logsView(over: Partial<RagLogsHookView>): RagLogsHookView {
  return {
    lines: [],
    total: 0,
    jobFilter: null,
    semanticOffline: false,
    pending: false,
    ...over,
  };
}

// --- panels-backendhealthpanel / panels-vaulthealthpanel -----------------------
//
// Authored inputs fed to the REAL projections, so the cells prove what the shipped
// code emits rather than restating it. The system-status cells exercise
// `deriveSystemPrograms`, whose whole point is that a program row states the
// identity facts the wire carried and NAMES the ones it did not — so the normal
// cell authors a fully-reporting machine (a port, a process, versions, a
// discovered agent gateway) and the empty cell authors the opposite: everything
// reachable, nothing identifying reported. Both are states the real wire produces.

/** The slice `deriveVaultHealthView` actually reads, authored per cell. */
const coreStatus = (over: Partial<CoreStatusView> = {}): CoreStatusView => ({
  loading: false,
  errored: false,
  reachable: true,
  ...over,
});

/** A fully-reporting machine: every fact the status envelope can carry is
 *  present, which is what a healthy installed setup actually serves. */
const programsInput = (
  over: Partial<SystemProgramsInput> = {},
): SystemProgramsInput => ({
  engineUnreachable: false,
  observedRoundTripMs: 7.4,
  degradations: [],
  coreLoading: false,
  coreErrored: false,
  coreReachable: true,
  ragLoading: false,
  ragDegraded: false,
  ragErrored: false,
  ragPort: 8766,
  ragPid: 75828,
  ragInstalledVersion: "vaultspec-rag v0.4.1",
  declaredComponent: {
    name: "core",
    floor: "0.1.36",
    version: "0.1.55",
    meets_floor: true,
  },
  agentComponent: {
    name: "agent",
    floor: "v1",
    version: null,
    ...{
      installed: true,
      gateway: {
        endpoint: "127.0.0.1:8823",
        pid: 41288,
        ownership: "owned",
      },
      release_set: { version: "0.3.2", active_generation: "generation-042" },
    },
  } as SystemProgramsInput["declaredComponent"],
  agentAvailable: true,
  ...over,
});

const PROGRAMS_NORMAL = deriveSystemPrograms(programsInput());

const PROGRAMS_LOADING = deriveSystemPrograms(
  programsInput({
    observedRoundTripMs: null,
    coreLoading: true,
    ragLoading: true,
    ragPort: undefined,
    ragPid: undefined,
    ragInstalledVersion: null,
    declaredComponent: undefined,
    agentComponent: undefined,
    agentAvailable: false,
  }),
);

// The app's own server is unreachable, so every dependent row falls to `down` —
// the honest cascade the projection already encodes. There is also no snapshot to
// read identity from when the read itself failed, so NO facts survive: authoring
// a port beside "Unavailable" would review a state the app cannot reach.
const PROGRAMS_DEGRADED = deriveSystemPrograms(
  programsInput({
    engineUnreachable: true,
    observedRoundTripMs: null,
    ragPort: undefined,
    ragPid: undefined,
    ragInstalledVersion: null,
    declaredComponent: undefined,
    agentComponent: undefined,
    agentAvailable: false,
  }),
);

// Everything reachable, nothing identifying reported: no port, no process, no
// versions, no agent install. This is the state the gap lines exist for.
const PROGRAMS_EMPTY = deriveSystemPrograms(
  programsInput({
    observedRoundTripMs: null,
    ragPort: undefined,
    ragPid: undefined,
    ragInstalledVersion: null,
    declaredComponent: undefined,
    agentComponent: {
      name: "agent",
      floor: "v1",
      version: null,
      ...{ installed: false },
    } as SystemProgramsInput["declaredComponent"],
    agentAvailable: false,
  }),
);

export const panelsSpecimens: Readonly<Record<string, SpecimenDef>> = {
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

  "panels-indexconsole": {
    note: "Mounts the exported wire-free IndexConsoleHeader directly — the redesigned identity line the owner asked for: the SERVED tool name (never the word Search), the running/installed/required versions, the store's address, process, version and location, and normal-weight lifecycle actions instead of a row of large buttons. States are authored props: loading is the identity read in flight, degraded is the semantic tier reporting unavailable, empty is a reachable tool that served no identity fact at all.",
    render: (state) => {
      if (state === "loading") {
        return (
          <IndexConsoleHeader
            identity={INDEX_IDENTITY_EMPTY}
            identityLoading
            identityOffline={false}
            running={false}
            healthWord="Checking…"
            healthTone="stale"
            actionsPending={false}
            doctorPending={false}
            reindexActive={false}
            onStart={() => {}}
            onStop={() => {}}
            onRestart={() => {}}
            onDoctor={() => {}}
            onReindex={() => {}}
          />
        );
      }
      if (state === "degraded") {
        return (
          <IndexConsoleHeader
            identity={INDEX_IDENTITY_EMPTY}
            identityLoading={false}
            identityOffline
            running={false}
            healthWord="Unavailable"
            healthTone="broken"
            errored
            actionsPending={false}
            doctorPending={false}
            reindexActive={false}
            onStart={() => {}}
            onStop={() => {}}
            onRestart={() => {}}
            onDoctor={() => {}}
            onReindex={() => {}}
          />
        );
      }
      if (state === "empty") {
        return (
          <IndexConsoleHeader
            identity={INDEX_IDENTITY_EMPTY}
            identityLoading={false}
            identityOffline={false}
            running
            healthWord="Running"
            healthTone="active"
            actionsPending={false}
            doctorPending={false}
            reindexActive={false}
            onStart={() => {}}
            onStop={() => {}}
            onRestart={() => {}}
            onDoctor={() => {}}
            onReindex={() => {}}
          />
        );
      }
      return (
        <IndexConsoleHeader
          identity={INDEX_IDENTITY_NORMAL}
          identityLoading={false}
          identityOffline={false}
          running
          healthWord="Running"
          healthTone="active"
          actionsPending={false}
          doctorPending={false}
          reindexActive
          reindexFraction={0.42}
          onStart={() => {}}
          onStop={() => {}}
          onRestart={() => {}}
          onDoctor={() => {}}
          onReindex={() => {}}
        />
      );
    },
  },

  "panels-indexlogtail": {
    note: "Mounts the exported wire-free IndexLogTailBody directly — the log half of the owner's log/updates ask, which now lives inside the ONE index console instead of nowhere. The four states are authored RagLogsHookView props (pending is loading, semanticOffline is degraded, no lines is empty); the normal cell also shows the narrowed-to-selection note.",
    render: (state) => {
      if (state === "loading") {
        return (
          <IndexLogTailBody
            view={logsView({ pending: true })}
            scopedToSelection={false}
          />
        );
      }
      if (state === "degraded") {
        return (
          <IndexLogTailBody
            view={logsView({ semanticOffline: true })}
            scopedToSelection={false}
          />
        );
      }
      if (state === "empty") {
        return <IndexLogTailBody view={logsView({})} scopedToSelection={false} />;
      }
      return (
        <IndexLogTailBody
          view={logsView({ lines: INDEX_LOG_LINES })}
          scopedToSelection
        />
      );
    },
  },

  "panels-backendhealthpanel": {
    note: "Mounts the exported wire-free BackendHealthPanelBody directly — the system-status console (advanced-service-console ADR D6) as rebuilt for the owner's \"cryptic / unrelatable\" note. States are authored SystemProgramsInput run through the real deriveSystemPrograms: normal is a fully-reporting machine (port, process, versions, a discovered agent gateway), loading is the pre-resolution unknown tone, degraded is the app's own server unreachable cascading to every dependent, and empty is everything reachable but nothing identifying reported — the state the gap lines exist for.",
    render: (state) => {
      if (state === "loading")
        return <BackendHealthPanelBody view={PROGRAMS_LOADING} />;
      if (state === "degraded")
        return <BackendHealthPanelBody view={PROGRAMS_DEGRADED} />;
      if (state === "empty") return <BackendHealthPanelBody view={PROGRAMS_EMPTY} />;
      return <BackendHealthPanelBody view={PROGRAMS_NORMAL} />;
    },
  },

  "panels-vaulthealthpanel": {
    note: "Mounts the exported wire-free VaultHealthPanelBody directly — the project-health fold, moved out of the retired modal host. States are authored props over the real deriveVaultHealthView: loading is the checking tone, degraded is the engine unreachable, empty is healthy with no receipt yet, and the normal cell shows the needs-attention tone beside the receipt its own check produced.",
    render: (state) => {
      if (state === "loading") {
        return (
          <VaultHealthPanelBody
            view={deriveVaultHealthView(coreStatus({ loading: true }))}
            checking
            receipt={null}
            onCheck={() => {}}
          />
        );
      }
      if (state === "degraded") {
        return (
          <VaultHealthPanelBody
            view={deriveVaultHealthView(coreStatus({ errored: true }))}
            checking={false}
            receipt={{
              verb: "vault-check",
              tone: "down",
              text: "Project is unreachable.",
            }}
            onCheck={() => {}}
          />
        );
      }
      if (state === "empty") {
        return (
          <VaultHealthPanelBody
            view={deriveVaultHealthView(coreStatus({}))}
            checking={false}
            receipt={null}
            onCheck={() => {}}
          />
        );
      }
      return (
        <VaultHealthPanelBody
          view={deriveVaultHealthView(coreStatus({ vaultHealth: "warnings" }))}
          checking={false}
          receipt={{ verb: "vault-check", tone: "ok", text: "Checked 128 documents." }}
          onCheck={() => {}}
        />
      );
    },
  },
};
