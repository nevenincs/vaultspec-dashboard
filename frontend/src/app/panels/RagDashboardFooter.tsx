import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button, StateBlock, Switch } from "../kit";
import {
  useActiveLocale,
  useLocalizedMessageResolver,
} from "../../platform/localization/LocalizationProvider";
import { formatBytes, formatNumber } from "../../platform/localization/formatters";
import { engineKeys, useActiveScope } from "../../stores/server/queries";
import {
  ragControlKeys,
  ragSemanticOffline,
  useRagOpsState,
  useRagWatcherStart,
  useRagWatcherStop,
  type RagStorageRollup,
} from "../../stores/server/ragControl";

const M = {
  entries: { key: "operations:searchMaintenance.labels.entries" },
  disk: { key: "operations:searchMaintenance.labels.onDisk" },
  projects: { key: "operations:searchMaintenance.labels.projects" },
  refresh: { key: "operations:searchMaintenance.actions.refresh" },
  loading: { key: "operations:searchMaintenance.storage.loading" },
  unavailable: { key: "operations:searchMaintenance.storage.unavailable" },
  watch: { key: "operations:searchMaintenance.watcher.label" },
  watching: { key: "operations:searchMaintenance.watcher.enabled" },
  notWatching: { key: "operations:searchMaintenance.watcher.disabled" },
  watchUnavailable: { key: "operations:searchMaintenance.watcher.unavailable" },
} as const;

function record(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null
    ? (v as Record<string, unknown>)
    : undefined;
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex shrink-0 flex-col">
      <span className="text-caption text-ink-faint">{label}</span>
      <span className="text-meta tabular-nums text-ink">{value}</span>
    </div>
  );
}

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
  const resolve = useLocalizedMessageResolver();
  const locale = useActiveLocale();
  const available = storage?.available === true;
  const partial = available && storage.truncated === true;
  const entries = available ? formatNumber(locale, storage.total_points) : null;
  const disk = available ? formatBytes(locale, storage.total_footprint_bytes) : null;
  const projectSummary = available
    ? resolve(
        storage.orphaned_count > 0
          ? {
              key: "operations:searchMaintenance.projects.summary",
              values: { count: storage.orphaned_count, live: storage.live_count },
            }
          : {
              key: "operations:searchMaintenance.projects.live",
              values: { count: storage.live_count },
            },
      ).message
    : null;
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
            message={resolve(M.unavailable).message}
          />
        ) : available ? (
          <>
            {entries !== null && (
              <StatCell label={resolve(M.entries).message} value={entries} />
            )}
            {disk !== null && <StatCell label={resolve(M.disk).message} value={disk} />}
            {projectSummary !== null && (
              <StatCell label={resolve(M.projects).message} value={projectSummary} />
            )}
            {partial && (
              <p className="text-caption text-ink-faint">
                {
                  resolve({
                    key: "operations:searchMaintenance.projects.partial",
                    values: {
                      count: storage.total_namespaces,
                      shown: storage.namespaces.length,
                    },
                  }).message
                }
              </p>
            )}
          </>
        ) : (
          <span className="text-caption text-ink-faint">
            {resolve(pending ? M.loading : M.unavailable).message}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-fg-3">
        <span
          className="inline-flex items-center gap-fg-1-5"
          title={offline ? resolve(M.watchUnavailable).message : undefined}
        >
          <Switch
            checked={watching}
            onChange={onToggleWatcher}
            label={resolve(M.watch).message}
            disabled={offline || watcherPending}
          />
          <span className="text-meta text-ink-muted">
            {resolve(watching ? M.watching : M.notWatching).message}
          </span>
        </span>
        <Button variant="ghost" onClick={onRefresh}>
          {resolve(M.refresh).message}
        </Button>
      </div>
    </div>
  );
}

export function RagDashboardFooter() {
  const scope = useActiveScope();
  const opsState = useRagOpsState(scope);
  const watcherStart = useRagWatcherStart();
  const watcherStop = useRagWatcherStop();
  const queryClient = useQueryClient();
  const env = opsState.data?.envelope;
  const onToggleWatcher = useCallback(
    (next: boolean) => (next ? watcherStart.mutate() : watcherStop.mutate()),
    [watcherStart, watcherStop],
  );
  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ragControlKeys.all });
    void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
  }, [queryClient]);
  return (
    <RagDashboardFooterBody
      storage={env?.storage}
      watching={record(env?.watcher)?.running === true}
      offline={ragSemanticOffline(opsState.data)}
      pending={opsState.isPending}
      watcherPending={watcherStart.isPending || watcherStop.isPending}
      onToggleWatcher={onToggleWatcher}
      onRefresh={onRefresh}
    />
  );
}
