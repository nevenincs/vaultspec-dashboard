// The worktree picker (W03.P09.S37, ADR G2.a): the engine's repository →
// branch → worktree mapping as a compact switcher. Worktrees that contain
// a vault corpus are primary; bare refs render dimmed, as context (a
// remote feature ref without a checkout has no working tree to resolve
// against — the map marks it degraded). Switching swaps the stage's scope
// wholesale — it is the coarsest filter.

import { useState } from "react";

import type { MapWorktree } from "../../stores/server/engine";
import { EngineError, useEngineStatus } from "../../stores/server/engine";
import { usePutSession, useWorkspaceMap } from "../../stores/server/queries";
import { useViewStore } from "../../stores/view/viewStore";
import { useActiveScope } from "../stage/Stage";
import { movePlayhead } from "../timeline/Playhead";

/** Sort corpus-bearing worktrees first, defaults leading, bare refs last. */
export function orderWorktrees(worktrees: readonly MapWorktree[]): MapWorktree[] {
  return [...worktrees].sort(
    (a, b) =>
      Number(b.has_vault) - Number(a.has_vault) ||
      Number(b.is_default ?? false) - Number(a.is_default ?? false) ||
      a.branch.localeCompare(b.branch),
  );
}

export function WorktreePicker() {
  const map = useWorkspaceMap();
  const active = useActiveScope();
  const setScope = useViewStore((s) => s.setScope);
  const putSession = usePutSession();
  const [expanded, setExpanded] = useState(false);
  // A rejected durable switch (the engine 400s an unknown/non-vault scope)
  // surfaces here rather than failing silently; the immediate `setScope` already
  // moved the UI, so this reports that the selection did not PERSIST.
  const [switchError, setSwitchError] = useState<string | null>(null);
  // Git sync indicator — ahead/behind/dirty from the live status hook
  // (TanStack deduplicates this query with NowStrip and ChangesOverview).
  const git = useEngineStatus().data?.git;

  if (map.isPending) {
    return <p className="text-label text-ink-faint">mapping worktrees…</p>;
  }
  if (map.isError) {
    return (
      <div className="space-y-vs-1">
        <p className="text-label text-state-broken">workspace map unavailable</p>
        <button
          type="button"
          onClick={() => void map.refetch()}
          className="text-label text-ink-faint underline"
        >
          retry
        </button>
      </div>
    );
  }

  const worktrees = orderWorktrees(
    map.data?.repositories.flatMap((r) => r.worktrees) ?? [],
  );
  const current = worktrees.find((w) => w.id === active);

  return (
    <div className="text-label" data-worktree-picker>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1 rounded-vs-sm border border-rule bg-paper-raised px-vs-2 py-vs-1 shadow-card hover:border-rule-strong"
      >
        <span className="min-w-0 flex-1 truncate font-medium text-ink">
          {current ? current.branch : "pick a worktree…"}
        </span>
        {/* Git sync badge: ahead/behind commits + dirty-file count */}
        {git && (git.ahead > 0 || git.behind > 0 || git.dirty.length > 0) && (
          <span
            className="shrink-0 text-2xs text-ink-faint"
            title={[
              git.ahead > 0 ? `${git.ahead} ahead` : "",
              git.behind > 0 ? `${git.behind} behind` : "",
              git.dirty.length > 0 ? `${git.dirty.length} changed` : "",
            ]
              .filter(Boolean)
              .join(", ")}
          >
            {git.ahead > 0 && `↑${git.ahead}`}
            {git.behind > 0 && `↓${git.behind}`}
            {git.dirty.length > 0 && (
              <span className="ml-vs-0-5 text-state-stale">●</span>
            )}
          </span>
        )}
        <span className="shrink-0 text-ink-faint">{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && (
        <ul className="mt-vs-1 space-y-vs-0-5">
          {worktrees.map((worktree) => (
            <li key={worktree.id}>
              <button
                type="button"
                disabled={!worktree.has_vault}
                title={
                  worktree.has_vault ? worktree.path : "no vault corpus — context only"
                }
                onClick={() => {
                  setScope(worktree.id);
                  // The store resets the MODE to live (022); the playhead
                  // widget docks alongside it.
                  movePlayhead("live");
                  setExpanded(false);
                  // Persist the selection durably through the session API (S31)
                  // so it survives a reload — the immediate `setScope` above is
                  // for responsiveness, this is the durable write. A rejected
                  // switch (unknown/non-vault scope → tiered 400) surfaces
                  // gracefully instead of failing silently.
                  setSwitchError(null);
                  putSession.mutate(
                    { active_scope: worktree.id },
                    {
                      onError: (err) =>
                        setSwitchError(
                          err instanceof EngineError && err.status === 400
                            ? `could not switch to ${worktree.branch}`
                            : "could not persist the worktree switch",
                        ),
                    },
                  );
                }}
                className={`flex w-full items-center gap-vs-1 rounded-vs-sm px-vs-2 py-vs-0-5 text-left ${
                  worktree.id === active
                    ? "bg-accent-subtle font-medium text-ink"
                    : worktree.has_vault
                      ? "text-ink-muted hover:bg-paper-sunken"
                      : "cursor-not-allowed text-ink-faint/50"
                }`}
              >
                <span className="truncate">{worktree.branch}</span>
                {worktree.is_default && (
                  <span className="text-ink-faint">·default</span>
                )}
                {!worktree.has_vault && <span className="text-ink-faint">·bare</span>}
                {worktree.degraded?.length ? (
                  <span
                    className="text-state-stale"
                    title={worktree.degraded.join(", ")}
                  >
                    ⚠
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {switchError && (
        <p className="mt-vs-1 text-2xs text-state-broken" role="status">
          {switchError}
        </p>
      )}
    </div>
  );
}
