// The rag job-dashboard FOOTER strip (rag-job-dashboard ADR D5; binding Figma
// RagJobDashboard footer 1102:4354). The storage rollup shown as stat cells
// (Entries / On disk / Projects with a live-vs-orphaned split), the surveyed-slice
// lower-bound note when the survey was truncated, the change-watcher state + toggle
// through the existing seams, and a Refresh that re-reads the dashboard.
//
// Glass over the stores plane (dashboard-layer-ownership): the zero-prop region
// reads the aggregated ops-state snapshot + the watcher seams, dispatches the
// toggle through the one ops seam, and derives offline truth from the tiers block
// (never a transport error). Internal vocabulary never reaches a label — "entries"
// and "on disk", never points/namespaces/collections (labels-are-user-facing).

import { useCallback } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { Button, StateBlock, Switch } from "../kit";
import { engineKeys, useActiveScope } from "../../stores/server/queries";
import {
  ragControlKeys,
  ragSemanticOffline,
  useRagOpsState,
  useRagWatcherStart,
  useRagWatcherStop,
  type RagStorageRollup,
} from "../../stores/server/ragControl";

/** Humanize a byte count to a compact unit (mirrors the retiring console idiom). */
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

function record(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null
    ? (v as Record<string, unknown>)
    : undefined;
}

/** One footer stat cell: a faint label over a tabular value. */
function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex shrink-0 flex-col">
      <span className="text-caption tracking-[0.025rem] text-ink-faint">{label}</span>
      <span className="text-meta tabular-nums text-ink">{value}</span>
    </div>
  );
}

/** The presentational footer body — pure over the storage rollup + watcher/offline
 *  state and the two action callbacks. Exported for the render test. */
export function RagDashboardFooterBody({
  storage,
  watching,
  offline,
  pending,
  watcherPending,
  onToggleWatcher,
  onRefresh,
}: {
  storage: RagStorageRollup | undefined;
  watching: boolean;
  offline: boolean;
  pending: boolean;
  watcherPending: boolean;
  onToggleWatcher: (next: boolean) => void;
  onRefresh: () => void;
}) {
  const available = storage?.available === true;
  const partial = available && storage.truncated === true;
  const entries = available ? storage.total_points.toLocaleString() : undefined;
  const disk = available ? humanBytes(storage.total_footprint_bytes) : undefined;

  return (
    <div
      data-rag-footer-region
      className="flex flex-wrap items-center gap-x-fg-4 gap-y-fg-2"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-fg-4 gap-y-fg-1">
        {offline ? (
          <StateBlock
            mode="degraded"
            layout="inline"
            message="Storage details are unavailable while the search service is down."
          />
        ) : available ? (
          <>
            {entries !== undefined && <StatCell label="Entries" value={entries} />}
            {disk !== undefined && <StatCell label="On disk" value={disk} />}
            <StatCell
              label="Projects"
              value={
                storage.orphaned_count > 0
                  ? `${partial ? "≥ " : ""}${storage.live_count} live · ${storage.orphaned_count} orphaned`
                  : `${partial ? "≥ " : ""}${storage.live_count} live`
              }
            />
            {partial && (
              <p className="text-caption text-ink-faint">
                Covering the first {storage.namespaces.length} of{" "}
                {storage.total_namespaces} projects — the totals are a lower bound.
              </p>
            )}
          </>
        ) : pending ? (
          <span className="text-caption text-ink-faint">Reading storage…</span>
        ) : (
          <span className="text-caption text-ink-faint">
            Storage details unavailable.
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-fg-3">
        <span
          className="inline-flex items-center gap-fg-1-5"
          title={offline ? "The search service is offline." : undefined}
        >
          <Switch
            checked={watching}
            onChange={onToggleWatcher}
            label="Watch for changes"
            disabled={offline || watcherPending}
          />
          <span className="text-meta text-ink-muted">
            {watching ? "Watching for changes" : "Not watching"}
          </span>
        </span>
        <Button variant="ghost" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
    </div>
  );
}

/**
 * The FOOTER strip, mounted in the dashboard Dialog's pinned footer slot. Reads
 * the aggregated storage rollup and the watcher state, toggles the watcher through
 * the existing seams, and re-reads the dashboard on Refresh.
 */
export function RagDashboardFooter() {
  const scope = useActiveScope();
  const opsState = useRagOpsState(scope);
  const watcherStart = useRagWatcherStart();
  const watcherStop = useRagWatcherStop();
  const queryClient = useQueryClient();

  const env = opsState.data?.envelope;
  const storage = env?.storage;
  const watching = record(env?.watcher)?.running === true;
  const offline = ragSemanticOffline(opsState.data);

  const onToggleWatcher = useCallback(
    (next: boolean) => {
      if (next) watcherStart.mutate();
      else watcherStop.mutate();
    },
    [watcherStart, watcherStop],
  );

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ragControlKeys.all });
    void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
  }, [queryClient]);

  return (
    <RagDashboardFooterBody
      storage={storage}
      watching={watching}
      offline={offline}
      pending={opsState.isPending}
      watcherPending={watcherStart.isPending || watcherStop.isPending}
      onToggleWatcher={onToggleWatcher}
      onRefresh={onRefresh}
    />
  );
}
