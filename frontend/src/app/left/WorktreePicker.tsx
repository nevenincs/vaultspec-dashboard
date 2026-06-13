// The worktree picker (W03.P09.S37, ADR G2.a): the engine's repository →
// branch → worktree mapping as a compact switcher. Worktrees that contain
// a vault corpus are primary; bare refs render dimmed, as context (a
// remote feature ref without a checkout has no working tree to resolve
// against — the map marks it degraded). Switching swaps the stage's scope
// wholesale — it is the coarsest filter.

import { useState } from "react";

import type { MapWorktree } from "../../stores/server/engine";
import { useWorkspaceMap } from "../../stores/server/queries";
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
  const [expanded, setExpanded] = useState(false);

  if (map.isPending) {
    return <p className="text-xs text-stone-400">mapping worktrees…</p>;
  }
  if (map.isError) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-amber-700">workspace map unavailable</p>
        <button
          type="button"
          onClick={() => void map.refetch()}
          className="text-xs text-stone-400 underline"
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
    <div className="text-xs" data-worktree-picker>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between rounded border border-stone-200 px-2 py-1 hover:border-stone-400"
      >
        <span className="truncate font-medium">
          {current ? current.branch : "pick a worktree…"}
        </span>
        <span className="text-stone-400">{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && (
        <ul className="mt-1 space-y-0.5">
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
                }}
                className={`flex w-full items-center gap-1 rounded px-2 py-0.5 text-left ${
                  worktree.id === active
                    ? "bg-stone-100 font-medium text-stone-900"
                    : worktree.has_vault
                      ? "text-stone-700 hover:bg-stone-50"
                      : "cursor-not-allowed text-stone-300"
                }`}
              >
                <span className="truncate">{worktree.branch}</span>
                {worktree.is_default && (
                  <span className="text-stone-400">·default</span>
                )}
                {!worktree.has_vault && <span>·bare</span>}
                {worktree.degraded?.length ? (
                  <span className="text-amber-600" title={worktree.degraded.join(", ")}>
                    ⚠
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
