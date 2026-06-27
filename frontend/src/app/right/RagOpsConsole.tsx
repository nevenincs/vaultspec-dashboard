// @figma RagOpsConsole · SlhonORmySdoSMTQgDWw3w · 879:4125 · alias-of RagOpsConsoleBody
// The rag operations console (rag-service-management ADR D7): a machine-level
// host surface for the ONE resident rag service — lifecycle (machine-scoped,
// stop-is-global), per-tenant data management, and diagnostics. It is glass
// (dashboard-layer-ownership): it consumes the rag stores hooks and dispatches
// mutations through the one ops seam (unified-action-plane), never fetching the
// engine itself, and reads degraded/offline truth from the tiers block, never a
// transport error (degradation-is-read-from-tiers). Size/state come from the
// engine's Rust-aggregated `ops-state`; the Tier-2 collection health is the
// capability-gated "needs repair" signal.

import { useMemo } from "react";

import {
  Badge,
  Button,
  ProgressBar,
  PropertyRow,
  SectionLabel,
  StateBlock,
} from "../kit";
import { useActiveScope, useRagStatus } from "../../stores/server/queries";
import {
  interpretRagStartEnvelope,
  useRagCollectionHealth,
  useRagJobs,
  useRagOpsState,
  useRagProjectEvict,
  useRagReindexWithProgress,
  useRagServiceDoctor,
  useRagServiceInstall,
  useRagServiceStart,
  useRagServiceStop,
  useRagWatcherStart,
  useRagWatcherStop,
} from "../../stores/server/ragControl";

/** Humanize a byte count to a compact unit (B/KB/MB/GB/TB). */
function humanBytes(n: unknown): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** Locale-format an integer, or an em dash when absent. */
function num(n: unknown): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString() : "—";
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function record(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null
    ? (v as Record<string, unknown>)
    : undefined;
}

/**
 * The machine-service identity strip: the running-state dot + word, the resident
 * pid/port, and the machine-wide stop warning. The lifecycle word is
 * `running`/`crashed`/`absent` (sourced from the wire `state`); the dot is green
 * for running and warm-broken otherwise, the word disambiguating crashed vs
 * absent.
 */
function MachineServiceStrip({ scope }: { scope: unknown }) {
  const status = useRagStatus();
  const opsState = useRagOpsState(scope);
  const start = useRagServiceStart(scope);
  const stop = useRagServiceStop(scope);
  const doctor = useRagServiceDoctor(scope);
  const install = useRagServiceInstall(scope);

  const qdrant = record(opsState.data?.envelope?.qdrant);
  const word = status.running ? "running" : (status.service ?? "absent");
  const pid = qdrant?.pid;
  const port = qdrant?.port;
  const pidPort =
    typeof pid === "number" || typeof port === "number"
      ? [
          typeof pid === "number" ? `pid ${pid}` : null,
          typeof port === "number" ? `:${port}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : undefined;
  // Green running; amber crashed (discovered but not serving); broken-red absent —
  // the word disambiguates, the tone matches.
  const dotClass = status.running
    ? "bg-state-active"
    : word === "crashed"
      ? "bg-state-stale"
      : "bg-state-broken";
  // The engine never 502s an already-running start; the outcome (incl. a failed
  // start or the needs-install hint) is read from the returned envelope, not a
  // thrown transport error.
  const startOutcome = start.data ? interpretRagStartEnvelope(start.data) : undefined;
  const anyPending =
    start.isPending || stop.isPending || doctor.isPending || install.isPending;
  // Restart is machine-wide (stop then start); chained so the new service comes up
  // after the shared one is down.
  const restart = () =>
    stop.mutate(undefined, { onSuccess: () => start.mutate(undefined) });

  return (
    <div className="flex flex-col gap-fg-1">
      <div className="flex items-center gap-fg-1-5">
        <span
          className={`size-[0.5rem] shrink-0 rounded-full ${dotClass}`}
          aria-hidden
        />
        <span className="text-body font-medium text-ink">rag</span>
        <Badge>{word}</Badge>
        <span className="flex-1" />
        {pidPort !== undefined && (
          <span className="shrink-0 text-meta tabular-nums text-ink-faint">
            {pidPort}
          </span>
        )}
      </div>
      <p className="text-caption text-ink-faint">
        Machine service — stop affects every consumer (CLI, MCP, other dashboards).
      </p>
      <div className="flex flex-wrap items-center gap-fg-1">
        {status.running ? (
          <>
            <Button
              variant="danger"
              onClick={() => stop.mutate()}
              disabled={anyPending}
            >
              Stop
            </Button>
            <Button variant="secondary" onClick={restart} disabled={anyPending}>
              Restart
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            onClick={() => start.mutate(undefined)}
            disabled={anyPending}
          >
            Start service
          </Button>
        )}
        <Button variant="ghost" onClick={() => doctor.mutate()} disabled={anyPending}>
          Doctor
        </Button>
        <Button variant="ghost" onClick={() => install.mutate()} disabled={anyPending}>
          Install
        </Button>
      </div>
      {startOutcome !== undefined && !startOutcome.attached && (
        <div className="flex flex-col gap-fg-1">
          <p className="text-caption text-state-broken">
            {startOutcome.status === "needs_install"
              ? "Qdrant is not installed — install it, or retry with auto-provision."
              : `Start failed: ${startOutcome.reason ?? "unknown error"}`}
          </p>
          {startOutcome.status === "needs_install" && (
            <div className="flex flex-wrap gap-fg-1">
              <Button
                variant="secondary"
                onClick={() => start.mutate({ qdrant_auto_provision: true })}
                disabled={anyPending}
              >
                Retry with auto-provision
              </Button>
            </div>
          )}
        </div>
      )}
      {status.degraded && status.reason !== undefined && (
        <p className="text-caption text-ink-faint">{status.reason}</p>
      )}
    </div>
  );
}

/** INDEX & SIZE: the Rust-aggregated counts, disk footprint, GPU, and Qdrant
 *  identity, plus the live/orphaned namespace tally. */
function IndexAndSize({ scope }: { scope: unknown }) {
  const opsState = useRagOpsState(scope);
  const env = opsState.data?.envelope;
  const index = record(env?.index);
  const qdrant = record(env?.qdrant);
  const storage = env?.storage;

  const gpu =
    index?.cuda === true
      ? [
          str(index.gpu_name) ?? "cuda",
          typeof index.vram_gb === "number" ? `${index.vram_gb} GB` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "cpu";
  const qdrantLabel = [
    str(qdrant?.version),
    typeof qdrant?.port === "number" ? `:${qdrant.port}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-fg-0-5">
      <SectionLabel>Index &amp; size</SectionLabel>
      <PropertyRow label="vault documents" value={num(index?.vault_count)} />
      <PropertyRow label="code chunks" value={num(index?.code_count)} />
      <PropertyRow label="points" value={num(storage?.total_points)} />
      <PropertyRow
        label="disk footprint"
        value={humanBytes(storage?.total_footprint_bytes)}
      />
      <PropertyRow label="gpu" value={gpu} />
      <PropertyRow label="qdrant" value={qdrantLabel.length > 0 ? qdrantLabel : "—"} />
      {storage?.available && (
        <PropertyRow
          label="namespaces"
          value={
            <span
              className={storage.orphaned_count > 0 ? "text-state-broken" : undefined}
            >
              {storage.live_count} live
              {storage.orphaned_count > 0
                ? ` · ${storage.orphaned_count} orphaned`
                : ""}
            </span>
          }
        />
      )}
    </div>
  );
}

/** TENANTS: the resident project registry — leased slots, ref counts, idle, with
 *  a per-slot Evict. */
function Tenants({ scope }: { scope: unknown }) {
  const opsState = useRagOpsState(scope);
  const evict = useRagProjectEvict();
  const tenants = record(opsState.data?.envelope?.tenants);
  const slots = useMemo(() => {
    const list = Array.isArray(tenants?.projects)
      ? (tenants.projects as unknown[])
      : [];
    return list
      .map(record)
      .filter((s): s is Record<string, unknown> => s !== undefined);
  }, [tenants]);

  const max =
    typeof tenants?.max_projects === "number" ? tenants.max_projects : undefined;
  const idleTtl =
    typeof tenants?.idle_ttl_seconds === "number"
      ? tenants.idle_ttl_seconds
      : undefined;

  return (
    <div className="flex flex-col gap-fg-1">
      <SectionLabel count={slots.length}>Tenants</SectionLabel>
      <p className="text-caption text-ink-faint">
        {slots.length}
        {max !== undefined ? ` of ${max}` : ""} slots leased
        {idleTtl !== undefined ? ` · idle-TTL ${idleTtl}s` : ""}
      </p>
      {slots.map((slot, i) => {
        const root = str(slot.root) ?? "—";
        const base = root.split(/[\\/]/).filter(Boolean).pop() ?? root;
        const ref = typeof slot.ref_count === "number" ? slot.ref_count : undefined;
        const idle =
          typeof slot.idle_seconds === "number"
            ? Math.round(slot.idle_seconds)
            : undefined;
        return (
          <div key={`${root}-${i}`} className="flex items-center gap-fg-1">
            <span className="min-w-0 flex-1 truncate text-body text-ink" title={root}>
              {base}
            </span>
            <span className="shrink-0 text-meta tabular-nums text-ink-faint">
              {ref !== undefined ? `ref ${ref}` : ""}
              {idle !== undefined ? ` · idle ${idle}s` : ""}
            </span>
            <Button
              variant="ghost"
              onClick={() => evict.mutate(root)}
              disabled={evict.isPending || ref !== 0}
            >
              Evict
            </Button>
          </div>
        );
      })}
    </div>
  );
}

/** DATA: per-tenant data management — reindex (with progress), clean rebuild,
 *  and watcher on/off. */
function DataManagement({ scope }: { scope: unknown }) {
  const opsState = useRagOpsState(scope);
  const reindex = useRagReindexWithProgress(scope);
  const watcherStart = useRagWatcherStart();
  const watcherStop = useRagWatcherStop();
  const watcher = record(opsState.data?.envelope?.watcher);
  const watching = watcher?.running === true;

  return (
    <div className="flex flex-col gap-fg-1-5">
      <SectionLabel>Data</SectionLabel>
      <div className="flex flex-wrap gap-fg-1">
        <Button
          onClick={() => reindex.trigger({ type: "vault" })}
          disabled={reindex.pending}
        >
          Reindex vault
        </Button>
        <Button
          onClick={() => reindex.trigger({ type: "code" })}
          disabled={reindex.pending}
        >
          Reindex code
        </Button>
        <Button
          onClick={() => reindex.trigger({ type: "vault", clean: true })}
          disabled={reindex.pending}
        >
          Clean rebuild
        </Button>
        {watching ? (
          <Button
            variant="ghost"
            onClick={() => watcherStop.mutate()}
            disabled={watcherStop.isPending}
          >
            Watcher off
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={() => watcherStart.mutate()}
            disabled={watcherStart.isPending}
          >
            Watcher on
          </Button>
        )}
      </div>
      {!reindex.progress.terminal && reindex.jobId !== null && (
        <div className="flex items-center gap-fg-2">
          <ProgressBar
            value={
              reindex.progress.fraction !== undefined
                ? Math.round(reindex.progress.fraction * 100)
                : 0
            }
            max={100}
            label="Reindex progress"
            className="flex-1"
          />
          <span className="shrink-0 text-meta tabular-nums text-ink-faint">
            {reindex.progress.step ?? reindex.progress.phase ?? "working"}
          </span>
        </div>
      )}
    </div>
  );
}

/** JOBS: the recent reindex job activity with per-job phase. */
function Jobs({ scope }: { scope: unknown }) {
  const jobsQuery = useRagJobs(scope, 6);
  const jobs = useMemo(() => jobsQuery.data?.envelope?.jobs ?? [], [jobsQuery.data]);
  if (jobs.length === 0) return null;
  return (
    <div className="flex flex-col gap-fg-1">
      <SectionLabel count={jobs.length}>Jobs</SectionLabel>
      {jobs.map((job) => (
        <div key={job.id} className="flex items-center gap-fg-1">
          <span className="min-w-0 flex-1 truncate text-body text-ink">
            {job.source === "code" ? "reindex code" : "reindex vault"}
          </span>
          <span className="shrink-0 text-meta tabular-nums text-ink-faint">
            {str(job.result) ?? job.phase}
          </span>
          <Badge tone={job.phase === "running" ? "accent" : "neutral"}>
            {job.phase}
          </Badge>
        </div>
      ))}
    </div>
  );
}

/** DIAGNOSTICS: the Tier-2 Qdrant-native collection health (capability-gated on
 *  the Qdrant version) for the first live namespace — the "needs repair" signal —
 *  degrading honestly when the version is unsupported. */
function Diagnostics({ scope }: { scope: unknown }) {
  const opsState = useRagOpsState(scope);
  const storage = opsState.data?.envelope?.storage;
  const collection = useMemo(() => {
    const live = storage?.namespaces?.find((n) => n.status === "live");
    return (
      live?.collections?.find((c) => c.endsWith("_vault_docs")) ??
      live?.collections?.[0] ??
      ""
    );
  }, [storage]);
  const healthQuery = useRagCollectionHealth(scope, collection);
  const env = healthQuery.data?.envelope;
  if (collection.length === 0) return null;

  return (
    <div className="flex flex-col gap-fg-0-5">
      <SectionLabel>Diagnostics</SectionLabel>
      {env?.supported === false ? (
        <p className="text-caption text-ink-faint">
          {env.reason ?? "Tier-2 health unavailable for this Qdrant version."}
        </p>
      ) : env?.health !== undefined ? (
        <>
          <div className="flex items-center gap-fg-1">
            <span
              className="min-w-0 flex-1 truncate font-mono text-meta text-ink-muted"
              title={collection}
            >
              {collection}
            </span>
            {str(env.health.status) !== undefined && (
              <Badge>{env.health.status as string}</Badge>
            )}
          </div>
          <PropertyRow label="segments" value={num(env.health.segments_count)} />
          <PropertyRow
            label="indexed"
            value={`${num(env.health.indexed_vectors_count)} / ${num(env.health.points_count)}`}
          />
        </>
      ) : (
        <p className="text-caption text-ink-faint">Reading Qdrant collection health…</p>
      )}
    </div>
  );
}

/**
 * The rag operations console body, mounted as the "RAG OPS" section of the
 * activity rail. When the machine service is not running it shows the lifecycle
 * strip plus a degraded placeholder; when running it shows the full size/state,
 * data-management, jobs, and diagnostics surface.
 */
export function RagOpsConsoleBody() {
  const scope = useActiveScope();
  const status = useRagStatus();

  return (
    <div className="flex flex-col gap-fg-3">
      <MachineServiceStrip scope={scope} />
      {status.running ? (
        <>
          <IndexAndSize scope={scope} />
          <Tenants scope={scope} />
          <DataManagement scope={scope} />
          <Jobs scope={scope} />
          <Diagnostics scope={scope} />
        </>
      ) : (
        <StateBlock
          mode="empty"
          title="Semantic service not running"
          message="Start rag to view the index size, tenants, jobs, and diagnostics."
        />
      )}
    </div>
  );
}
