// @figma RagOpsConsole · SlhonORmySdoSMTQgDWw3w · 879:4125 · alias-of RagOpsConsoleBody
// The search-service console (rag-service-management ADR D7): the machine-level
// host surface for the ONE resident semantic-search service — lifecycle
// (machine-scoped, stop-is-global), per-tenant data management, and diagnostics.
// It is glass (dashboard-layer-ownership): it consumes the rag stores hooks and
// dispatches mutations through the one ops seam (unified-action-plane), never
// fetching the engine itself, and reads degraded/offline truth from the tiers
// block, never a transport error (degradation-is-read-from-tiers).
//
// Redesigned 2026-07-03 (user mandate; the earlier bound Figma node is stale):
// one streamlined card, glance-first. The top is a status row, ONE vitals line
// that renders only served truths (a skeleton while the aggregate read is in
// flight — never a wall of absent-value dashes), the latest activity with an
// inline progress bar, and the two lifecycle verbs. Everything operational —
// maintenance verbs, tenants, engine identity, diagnostics, job history — lives
// behind a single Details fold. No internal-mechanism vocabulary on any label.

import { useMemo, useState } from "react";

import {
  Badge,
  Button,
  Divider,
  FoldSection,
  ProgressBar,
  PropertyRow,
  SectionLabel,
  Skeleton,
  SkeletonBar,
  SkeletonRow,
  StateBlock,
} from "../kit";
import { useActiveScope, useRagStatus } from "../../stores/server/queries";
import {
  toggleStatusSection,
  useStatusSectionOpen,
} from "../../stores/view/statusTabChrome";
import {
  type RagJob,
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
function humanBytes(n: unknown): string | undefined {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return undefined;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function count(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function record(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null
    ? (v as Record<string, unknown>)
    : undefined;
}

/** The lifecycle word's ink: running is active, crashed is stale (discovered but
 *  not serving), absent is broken — word and tone agree. */
function lifecycleInk(running: boolean, word: string): string {
  return running
    ? "text-state-active"
    : word === "crashed"
      ? "text-state-stale"
      : "text-state-broken";
}

/** A job's plain-language title from its source discriminator. */
function jobTitle(source: string | undefined): string {
  return source === "code" || source === "codebase"
    ? "Indexing code"
    : "Indexing documents";
}

/**
 * The one glanceable vitals line: only the numbers the wire actually served,
 * joined with middots. While the aggregate read is in flight a skeleton holds
 * the line; when the service reports nothing usable, one honest sentence.
 */
function VitalsLine({ scope }: { scope: unknown }) {
  const opsState = useRagOpsState(scope);
  const env = opsState.data?.envelope;
  const index = record(env?.index);
  const storage = env?.storage;
  const tenants = record(env?.tenants);

  if (opsState.isPending) {
    return (
      <Skeleton label="Reading service details…">
        <SkeletonBar width="w-3/4" />
      </Skeleton>
    );
  }

  const docs = count(index?.vault_count);
  const chunks = count(index?.code_count);
  const projects = Array.isArray(tenants?.projects)
    ? (tenants.projects as unknown[]).length
    : undefined;
  const disk =
    storage?.available === true ? humanBytes(storage.total_footprint_bytes) : undefined;

  const parts = [
    docs !== undefined ? `${docs.toLocaleString()} documents` : null,
    chunks !== undefined ? `${chunks.toLocaleString()} code chunks` : null,
    projects !== undefined ? `${projects} project${projects === 1 ? "" : "s"}` : null,
    disk,
  ].filter(Boolean);

  if (parts.length === 0) {
    return <p className="text-caption text-ink-faint">Service details unavailable.</p>;
  }
  return <p className="text-meta tabular-nums text-ink-muted">{parts.join(" · ")}</p>;
}

/** The latest indexing activity, one line: a running job carries its progress
 *  bar; a settled one reads as a quiet receipt. Nothing renders when the
 *  history is empty. */
function ActivityLine({ jobs }: { jobs: RagJob[] }) {
  const latest = jobs[0];
  if (latest === undefined) return null;
  const running = latest.phase === "running";
  const total =
    typeof latest.progress?.total === "number" ? latest.progress.total : undefined;
  const completed =
    typeof latest.progress?.completed === "number"
      ? latest.progress.completed
      : undefined;
  return (
    <div className="flex flex-col gap-fg-1">
      <div className="flex items-center gap-fg-1-5">
        <span className="min-w-0 truncate text-meta text-ink">
          {jobTitle(latest.source)}
        </span>
        <span className="min-w-0 flex-1 truncate text-meta text-ink-faint">
          {str(latest.result) ?? (running ? "" : latest.phase)}
        </span>
        <Badge tone={running ? "accent" : "neutral"}>{latest.phase}</Badge>
      </div>
      {running && completed !== undefined && total !== undefined && total > 0 && (
        <ProgressBar
          value={Math.min(completed, total)}
          max={total}
          label={`${jobTitle(latest.source)} progress`}
        />
      )}
    </div>
  );
}

/** The lifecycle verbs: Stop/Restart when running, Start when not — plus the
 *  start-outcome and degraded-reason truths beneath. */
function LifecycleRow({ scope }: { scope: unknown }) {
  const status = useRagStatus();
  const start = useRagServiceStart(scope);
  const stop = useRagServiceStop(scope);
  const startOutcome = start.data ? interpretRagStartEnvelope(start.data) : undefined;
  const anyPending = start.isPending || stop.isPending;
  // Restart is machine-wide (stop then start); chained so the new service comes
  // up after the shared one is down.
  const restart = () =>
    stop.mutate(undefined, { onSuccess: () => start.mutate(undefined) });

  return (
    <div className="flex flex-col gap-fg-1">
      <div
        className={`grid gap-fg-1 ${status.running ? "grid-cols-2" : "grid-cols-1"}`}
      >
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
      </div>
      {startOutcome !== undefined && !startOutcome.attached && (
        <div className="flex flex-col gap-fg-1">
          <p className="text-caption text-state-broken">
            {startOutcome.status === "needs_install"
              ? "The search backend is not installed — install it, or retry with auto-provision."
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

/** Engine identity + namespace rows inside Details — only served truths. */
function IdentityRows({ scope }: { scope: unknown }) {
  const opsState = useRagOpsState(scope);
  const env = opsState.data?.envelope;
  const index = record(env?.index);
  const qdrant = record(env?.qdrant);
  const storage = env?.storage;
  const partial = storage?.available === true && storage.truncated === true;

  const pid = qdrant?.pid;
  const port = qdrant?.port;
  const pidPort = [
    typeof pid === "number" ? `pid ${pid}` : null,
    typeof port === "number" ? `:${port}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const gpu =
    index?.cuda === true
      ? [
          str(index.gpu_name) ?? "GPU",
          typeof index.vram_gb === "number" ? `${index.vram_gb} GB` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : index !== undefined
        ? "CPU"
        : undefined;
  const backendLabel = [
    str(qdrant?.version),
    typeof qdrant?.port === "number" ? `:${qdrant.port}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-fg-0-5">
      {pidPort.length > 0 && <PropertyRow label="Process" value={pidPort} />}
      {gpu !== undefined && <PropertyRow label="Compute" value={gpu} />}
      {backendLabel.length > 0 && (
        <PropertyRow label="Storage backend" value={backendLabel} />
      )}
      {storage?.available === true && (
        <PropertyRow
          label="Collections"
          value={
            <span
              className={storage.orphaned_count > 0 ? "text-state-broken" : undefined}
            >
              {partial ? "≥ " : ""}
              {storage.live_count} live
              {storage.orphaned_count > 0
                ? ` · ${storage.orphaned_count} orphaned`
                : ""}
            </span>
          }
        />
      )}
      {/* RCR-002: a survey bounded below the machine's namespace count makes the
          totals a LOWER BOUND — say so instead of showing a silent undercount. */}
      {partial && storage && (
        <p className="text-meta text-ink-faint">
          Totals cover the first {storage.namespaces.length} of{" "}
          {storage.total_namespaces} collections — the real values are higher.
        </p>
      )}
    </div>
  );
}

/** Tenants: the resident project registry — leased slots, ref counts, idle,
 *  with a per-slot Evict. */
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
  if (slots.length === 0) return null;

  const max =
    typeof tenants?.max_projects === "number" ? tenants.max_projects : undefined;

  return (
    <div className="flex flex-col gap-fg-1">
      <SectionLabel count={slots.length}>Projects</SectionLabel>
      <p className="text-caption text-ink-faint">
        {slots.length}
        {max !== undefined ? ` of ${max}` : ""} slots in use
      </p>
      {slots.map((slot, i) => {
        const root = str(slot.root) ?? "—";
        const base = root.split(/[\\/]/).filter(Boolean).pop() ?? root;
        const ref = typeof slot.ref_count === "number" ? slot.ref_count : undefined;
        const idle =
          typeof slot.idle_seconds === "number"
            ? Math.round(slot.idle_seconds)
            : undefined;
        // RCR-005: Evict is disabled ONLY with a stated reason (never the
        // permanently-disabled lie) — an unknown ref count or a live lease. The
        // reason rides the wrapper's tooltip.
        const evictBlockReason =
          ref === undefined
            ? "reference count unavailable — cannot confirm the project is idle"
            : ref > 0
              ? `in use by ${ref} consumer${ref === 1 ? "" : "s"}`
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
            <span title={evictBlockReason} className="shrink-0">
              <Button
                variant="ghost"
                onClick={() => evict.mutate(root)}
                disabled={evict.isPending || evictBlockReason !== undefined}
              >
                Evict
              </Button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Maintenance: reindex verbs (with live progress), watcher toggle, and the
 *  install/doctor lifecycle utilities — all in one quiet wrap row. */
function Maintenance({ scope }: { scope: unknown }) {
  const opsState = useRagOpsState(scope);
  const reindex = useRagReindexWithProgress(scope);
  const watcherStart = useRagWatcherStart();
  const watcherStop = useRagWatcherStop();
  const doctor = useRagServiceDoctor(scope);
  const install = useRagServiceInstall(scope);
  const watcher = record(opsState.data?.envelope?.watcher);
  const watching = watcher?.running === true;

  return (
    <div className="flex flex-col gap-fg-1-5">
      <SectionLabel>Maintenance</SectionLabel>
      <div className="flex flex-wrap gap-fg-1">
        <Button
          onClick={() => reindex.trigger({ type: "vault" })}
          disabled={reindex.pending}
        >
          Reindex documents
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
        <Button
          variant="ghost"
          onClick={() => doctor.mutate()}
          disabled={doctor.isPending}
        >
          Doctor
        </Button>
        <Button
          variant="ghost"
          onClick={() => install.mutate()}
          disabled={install.isPending}
        >
          Install
        </Button>
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

/** Diagnostics: the Tier-2 storage-native collection health (capability-gated)
 *  for the first live namespace — the "needs repair" signal — degrading
 *  honestly when unsupported. */
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
          {env.reason ?? "Deep health checks are unavailable for this backend version."}
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
          <PropertyRow label="Segments" value={`${env.health.segments_count ?? "—"}`} />
          <PropertyRow
            label="Indexed"
            value={`${env.health.indexed_vectors_count ?? "—"} / ${env.health.points_count ?? "—"}`}
          />
        </>
      ) : healthQuery.isPending ? (
        <Skeleton label="Reading collection health…" className="gap-fg-0-5">
          <SkeletonRow width="w-2/3" />
          <SkeletonBar width="w-1/2" />
        </Skeleton>
      ) : (
        <p className="text-caption text-ink-faint">Collection health unavailable.</p>
      )}
    </div>
  );
}

/** The full recent job history inside Details, with the bounded view-all widen. */
function JobHistory({
  jobs,
  showAll,
  onShowAll,
}: {
  jobs: RagJob[];
  showAll: boolean;
  onShowAll: () => void;
}) {
  if (jobs.length === 0) return null;
  return (
    <div className="flex flex-col gap-fg-1">
      <SectionLabel count={jobs.length}>Activity</SectionLabel>
      {jobs.map((job) => (
        <div key={job.id} className="flex items-center gap-fg-1-5">
          <span className="min-w-0 truncate text-meta text-ink">
            {jobTitle(job.source)}
          </span>
          <span className="min-w-0 flex-1 truncate text-meta text-ink-faint">
            {str(job.result) ?? job.phase}
          </span>
          <Badge tone={job.phase === "running" ? "accent" : "neutral"}>
            {job.phase}
          </Badge>
        </div>
      ))}
      {!showAll && (
        <div className="flex justify-center">
          <Button variant="ghost" onClick={onShowAll}>
            View all activity →
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The search-service console body, mounted as the "Search service" section of
 * the activity rail. Glance-first: status, one vitals line of served truths,
 * the latest activity, and the lifecycle verbs; everything operational lives
 * behind the single Details fold.
 */
export function RagOpsConsoleBody() {
  const scope = useActiveScope();
  const status = useRagStatus();
  // One bounded activity read for the glance line AND the Details history:
  // 6 recent by default, the engine's 50-clamp when widened. View-local
  // presentation state only.
  const [showAllJobs, setShowAllJobs] = useState(false);
  const jobsQuery = useRagJobs(scope, showAllJobs ? 50 : 6);
  const jobs = useMemo(() => jobsQuery.data?.envelope?.jobs ?? [], [jobsQuery.data]);
  const detailsOpen = useStatusSectionOpen("rag-ops:details", false);
  const word = status.running ? "running" : (status.service ?? "absent");

  return (
    <div className="flex flex-col gap-fg-2">
      <div className="flex items-center gap-fg-1">
        <span
          className={`size-[0.5rem] shrink-0 rounded-full ${
            status.running
              ? "bg-state-active"
              : word === "crashed"
                ? "bg-state-stale"
                : "bg-state-broken"
          }`}
          aria-hidden
        />
        <span className="text-body font-medium text-ink">Search service</span>
        <span className={`text-meta ${lifecycleInk(status.running, word)}`}>
          {word}
        </span>
        <span className="flex-1" />
        <span className="shrink-0 text-caption text-ink-faint">machine-wide</span>
      </div>
      {status.running ? (
        <>
          <VitalsLine scope={scope} />
          <ActivityLine jobs={jobs} />
          <LifecycleRow scope={scope} />
          <Divider />
          <FoldSection
            open={detailsOpen}
            onToggle={() => toggleStatusSection("rag-ops:details", false)}
            label={<SectionLabel>Details</SectionLabel>}
            bodyId="rag-ops-details"
            bodyClassName="flex flex-col gap-fg-3 pt-fg-1-5"
          >
            <IdentityRows scope={scope} />
            <Tenants scope={scope} />
            <Maintenance scope={scope} />
            <JobHistory
              jobs={jobs}
              showAll={showAllJobs}
              onShowAll={() => setShowAllJobs(true)}
            />
            <Diagnostics scope={scope} />
          </FoldSection>
        </>
      ) : (
        <>
          <LifecycleRow scope={scope} />
          <StateBlock
            mode="empty"
            title="Search service not running"
            message="Start the service to see index size, projects, and activity."
          />
        </>
      )}
    </div>
  );
}
