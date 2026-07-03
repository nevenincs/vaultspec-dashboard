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
//
// Structure mirrors the binding Figma component: an always-visible control
// surface (identity row, machine-wide notice, the four-across lifecycle button
// row), then divider-separated foldable STATUS (open), ADVANCED (closed), and
// JOBS (open) sections. ADVANCED carries everything the design leaves behind the
// collapsed twisty: engine/GPU identity, namespaces, tenants with per-slot evict,
// data management, and the Tier-2 diagnostics.

import { useMemo, useState } from "react";

import {
  Badge,
  Button,
  Card,
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

/** The lifecycle word's ink: running is the active state, crashed is stale
 *  (discovered but not serving), absent is broken — word and tone agree. */
function lifecycleInk(running: boolean, word: string): string {
  return running
    ? "text-state-active"
    : word === "crashed"
      ? "text-state-stale"
      : "text-state-broken";
}

/**
 * The always-visible control surface (Figma ControlSurface 901:4148): the
 * identity row — service name, state dot, lifecycle word, resident pid/port —
 * the machine-wide notice, and the four-across lifecycle button row.
 */
function ControlSurface({ scope }: { scope: unknown }) {
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
      <div className="flex items-center gap-fg-1">
        <span className="text-body font-medium text-ink">rag</span>
        <span
          className={`size-[0.5rem] shrink-0 rounded-full ${dotClass}`}
          aria-hidden
        />
        <span className={`text-meta ${lifecycleInk(status.running, word)}`}>
          {word}
        </span>
        <span className="flex-1" />
        {pidPort !== undefined && (
          <span className="shrink-0 text-meta tabular-nums text-ink-faint">
            {pidPort}
          </span>
        )}
      </div>
      <p className="text-caption text-ink-faint">
        Machine service — changes affect all consumers.
      </p>
      {/* The four-across lifecycle row (Figma buttons 901:4156): a grid so every
          verb stretches to an equal column — the kit Button owns its own chrome
          and takes no className. */}
      <div
        className={`grid gap-fg-1 ${status.running ? "grid-cols-4" : "grid-cols-3"}`}
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

/** STATUS (Figma StatusSection 901:4166): the at-a-glance rollup — service word,
 *  index counts, footprint, tenant occupancy, watcher — as plain property rows. */
function StatusRows({ scope }: { scope: unknown }) {
  const status = useRagStatus();
  const opsState = useRagOpsState(scope);
  const env = opsState.data?.envelope;
  const index = record(env?.index);
  const storage = env?.storage;
  const tenants = record(env?.tenants);
  const watcher = record(env?.watcher);
  // RCR-002: the summed storage totals cover only the returned (bounded) survey
  // slice when rag reports more namespaces than it returned — render them as a
  // lower bound rather than a silent undercount.
  const partial = storage?.available === true && storage.truncated === true;
  const word = status.running ? "running" : (status.service ?? "absent");

  const slotCount = Array.isArray(tenants?.projects)
    ? (tenants.projects as unknown[]).length
    : undefined;
  const maxSlots =
    typeof tenants?.max_projects === "number" ? tenants.max_projects : undefined;

  return (
    <div className="flex flex-col">
      <PropertyRow
        label="Service"
        value={
          <span className={`font-medium ${lifecycleInk(status.running, word)}`}>
            {word}
          </span>
        }
      />
      <PropertyRow label="Vault documents" value={num(index?.vault_count)} />
      <PropertyRow label="Code chunks" value={num(index?.code_count)} />
      <PropertyRow
        label="Points"
        value={partial ? `≥ ${num(storage?.total_points)}` : num(storage?.total_points)}
      />
      <PropertyRow
        label="Disk footprint"
        value={
          partial
            ? `≥ ${humanBytes(storage?.total_footprint_bytes)}`
            : humanBytes(storage?.total_footprint_bytes)
        }
      />
      <PropertyRow
        label="Tenants"
        value={
          slotCount !== undefined
            ? `${slotCount}${maxSlots !== undefined ? ` / ${maxSlots} slots` : ""}`
            : "—"
        }
      />
      <PropertyRow
        label="Watcher"
        value={
          watcher?.running === true ? (
            <span className="font-medium text-state-active">on</span>
          ) : (
            "off"
          )
        }
      />
    </div>
  );
}

/** ADVANCED: engine/GPU identity, namespaces (with the RCR-002 lower-bound
 *  honesty), tenants with per-slot evict, data management, and the Tier-2
 *  diagnostics — everything behind the design's collapsed twisty. */
function AdvancedBody({ scope }: { scope: unknown }) {
  return (
    <div className="flex flex-col gap-fg-3">
      <EngineIdentity scope={scope} />
      <Tenants scope={scope} />
      <DataManagement scope={scope} />
      <Diagnostics scope={scope} />
    </div>
  );
}

/** The engine/GPU/Qdrant identity and namespace tally rows. */
function EngineIdentity({ scope }: { scope: unknown }) {
  const opsState = useRagOpsState(scope);
  const env = opsState.data?.envelope;
  const index = record(env?.index);
  const qdrant = record(env?.qdrant);
  const storage = env?.storage;
  const partial = storage?.available === true && storage.truncated === true;

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
      <PropertyRow label="GPU" value={gpu} />
      <PropertyRow label="Qdrant" value={qdrantLabel.length > 0 ? qdrantLabel : "—"} />
      {storage?.available && (
        <PropertyRow
          label="Namespaces"
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
      {/* RCR-002: a survey bounded below the machine's namespace count makes every
          total above a LOWER BOUND (summed over the returned slice) — say so
          instead of showing a silent undercount. */}
      {partial && storage && (
        <p className="text-meta text-ink-faint">
          Totals cover the first {storage.namespaces.length} of{" "}
          {storage.total_namespaces} namespaces — the real values are higher.
        </p>
      )}
    </div>
  );
}

/** Tenants: the resident project registry — leased slots, ref counts, idle, with
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
        // RCR-005: Evict is disabled ONLY with a stated reason (never the
        // permanently-disabled lie the unified-action-plane rule forbids) — an
        // UNKNOWN ref count (rag omitted the field) or a LIVE lease. A
        // confirmed-idle slot (ref 0) stays evictable. The reason rides the
        // wrapper's tooltip so a disabled button still explains itself.
        const evictBlockReason =
          ref === undefined
            ? "reference count unavailable — cannot confirm the tenant is idle"
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

/** Data: per-tenant data management — reindex (with progress), clean rebuild,
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

/** Diagnostics: the Tier-2 Qdrant-native collection health (capability-gated on
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
      ) : healthQuery.isPending ? (
        // Loading is UI-ONLY (state-mode-uniformity ADR D2): a text-free skeleton
        // mimicking the collection row + property rows, the human label only in the
        // kit `Skeleton`'s sr-only — never on-screen "Reading…" text.
        <Skeleton label="Reading Qdrant collection health…" className="gap-fg-0-5">
          <SkeletonRow width="w-2/3" />
          <SkeletonBar width="w-1/2" />
          <SkeletonBar width="w-1/2" />
        </Skeleton>
      ) : (
        <p className="text-caption text-ink-faint">
          Qdrant collection health unavailable.
        </p>
      )}
    </div>
  );
}

/** A job's human title from its source discriminator. */
function jobTitle(source: string | undefined): string {
  return source === "code" || source === "codebase" ? "reindex code" : "reindex vault";
}

/** JOBS (Figma JobsSection 901:4206): recent reindex activity as raised job
 *  cards — title, phase chip, detail line, and a progress bar when rag reports
 *  progress — with a view-all affordance that widens the bounded read. */
function JobsBody({ scope }: { scope: unknown }) {
  // Bounded read either way: 6 recent by default, the engine's 50-clamp when
  // widened. View-local presentation state only — not a corpus filter.
  const [showAll, setShowAll] = useState(false);
  const jobsQuery = useRagJobs(scope, showAll ? 50 : 6);
  const jobs = useMemo(() => jobsQuery.data?.envelope?.jobs ?? [], [jobsQuery.data]);

  if (jobs.length === 0) {
    return <p className="py-fg-1 text-caption text-ink-faint">No recent jobs.</p>;
  }

  return (
    <div className="flex flex-col gap-fg-1 py-fg-1">
      {jobs.map((job) => {
        const total =
          typeof job.progress?.total === "number" ? job.progress.total : undefined;
        const completed =
          typeof job.progress?.completed === "number"
            ? job.progress.completed
            : undefined;
        const detail = [
          str(job.result) ?? (job.phase !== "running" ? job.phase : null),
          completed !== undefined && total !== undefined
            ? `${completed.toLocaleString()} / ${total.toLocaleString()}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <Card
            key={job.id}
            elevation="flat"
            padded={false}
            className="flex flex-col gap-fg-1 p-fg-1-5"
          >
            <div className="flex items-center justify-between gap-fg-1">
              <span className="min-w-0 truncate text-body font-medium text-ink">
                {jobTitle(job.source)}
              </span>
              <Badge tone={job.phase === "running" ? "accent" : "neutral"}>
                {job.phase}
              </Badge>
            </div>
            {detail.length > 0 && <p className="text-meta text-ink-muted">{detail}</p>}
            {completed !== undefined && total !== undefined && total > 0 && (
              <ProgressBar
                value={Math.min(completed, total)}
                max={total}
                label={`${jobTitle(job.source)} progress`}
              />
            )}
          </Card>
        );
      })}
      {!showAll && (
        <div className="flex justify-center">
          <Button variant="ghost" onClick={() => setShowAll(true)}>
            View all jobs →
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The rag operations console body, mounted as the "RAG OPS" section of the
 * activity rail. The control surface is always visible; when the machine service
 * is not running the folds give way to a degraded placeholder; when running the
 * STATUS and JOBS folds open by default and ADVANCED stays behind its twisty,
 * mirroring the binding Figma component.
 */
export function RagOpsConsoleBody() {
  const scope = useActiveScope();
  const status = useRagStatus();
  const jobsQuery = useRagJobs(scope, 6);
  const jobCount = jobsQuery.data?.envelope?.jobs?.length ?? 0;
  const [statusOpen, setStatusOpen] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(true);

  return (
    <div className="flex flex-col gap-fg-1-5">
      <ControlSurface scope={scope} />
      {status.running ? (
        <>
          <Divider />
          <FoldSection
            open={statusOpen}
            onToggle={() => setStatusOpen((v) => !v)}
            label={<SectionLabel>Status</SectionLabel>}
            bodyId="rag-ops-status"
          >
            <StatusRows scope={scope} />
          </FoldSection>
          <Divider />
          <FoldSection
            open={advancedOpen}
            onToggle={() => setAdvancedOpen((v) => !v)}
            label={<SectionLabel>Advanced</SectionLabel>}
            bodyId="rag-ops-advanced"
            bodyClassName="pt-fg-1"
          >
            <AdvancedBody scope={scope} />
          </FoldSection>
          <Divider />
          <FoldSection
            open={jobsOpen}
            onToggle={() => setJobsOpen((v) => !v)}
            label={<SectionLabel>Jobs</SectionLabel>}
            trailing={
              jobCount > 0 ? (
                <span className="shrink-0 text-meta tabular-nums text-ink-faint">
                  {jobCount}
                </span>
              ) : undefined
            }
            bodyId="rag-ops-jobs"
          >
            <JobsBody scope={scope} />
          </FoldSection>
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
