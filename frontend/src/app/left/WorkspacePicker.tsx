// The workspace switcher (dashboard-workspace-registry ADR): the registered
// project-root picker hosted ABOVE the worktree switcher in the left scope rail.
// It answers "which PROJECT am I in?" — the coarsest scope the dashboard offers.
// Each root shows its label, its path as monospace identity on hover, the
// launch-default marker, and a Lucide warning mark with a reason when
// unreachable. An "add a project" affordance takes an absolute path and surfaces
// the validation refusal as a non-silent status line.
//
// Selecting a workspace fires the WORKSPACE-LEVEL wholesale reset through the
// stores' `useSwapWorkspace` — the full 022 cross-store reset PLUS clearing the
// cached worktree set — exactly as the worktree switcher invokes `setScope`.
// This control owns NO reset logic; it invokes the stores action. It reads
// `/workspaces` and `tiers` ONLY through stores hooks, defines no workspace shape
// of its own, and never fetches the engine — chrome over the one projection.
//
// When only one root is registered the switcher renders as a QUIET HEADER, not a
// control, keeping the common single-project case uncluttered (the ADR's empty
// state).

import { ChevronDown, ChevronUp, FolderPlus, Star, TriangleAlert } from "lucide-react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useId, useRef, useState } from "react";

import type { WorkspaceEntity } from "../../platform/actions/entity";
import type { WorkspaceRoot } from "../../stores/server/engine";
import { EngineError } from "../../stores/server/engine";
import {
  useActiveWorkspace,
  useSwapWorkspace,
  useWorkspaceRoots,
  useWorkspaces,
  useWorkspacesAvailability,
} from "../../stores/server/queries";
import { openContextMenu } from "../../stores/view/contextMenu";
// Self-registering left-rail context-menu resolver (W03.P07): importing the
// module runs its `registerResolver("workspace", …)` side effect once.
import "./menus/workspaceMenu";

/** Build the workspace context-menu entity from a registered-root row's data. */
function workspaceEntity(root: WorkspaceRoot): WorkspaceEntity {
  return {
    kind: "workspace",
    id: root.id,
    path: root.path,
    isLaunchDefault: root.is_launch,
  };
}

// Icon sizing aligned to the iconography ADR's grayscale-by-shape gate (14px),
// with the disclosure caret one density step smaller so the structural chrome
// stays attenuated relative to the project identity (matches WorktreePicker).
const CARET_PX = 12;
const WARN_PX = 12;
const MARK_PX = 12;

export interface WorkspacePickerProps {
  /** Test seam: force the open state so the expanded list renders without a
   *  pointer/keyboard round-trip; the real control owns its own state. */
  defaultExpanded?: boolean;
  /** Test seam: force the add-a-project form open. */
  defaultAdding?: boolean;
}

export function WorkspacePicker({
  defaultExpanded = false,
  defaultAdding = false,
}: WorkspacePickerProps = {}) {
  const workspaces = useWorkspaces();
  const roots = useWorkspaceRoots();
  const activeWorkspace = useActiveWorkspace();
  const availability = useWorkspacesAvailability();
  const { swap, mutation } = useSwapWorkspace();

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [adding, setAdding] = useState(defaultAdding);
  const [addPath, setAddPath] = useState("");
  // A rejected switch/add (the engine 400s an unknown workspace or an invalid
  // path) surfaces here rather than failing silently — a fifth, transient honest
  // state (the ADR's add-refusal).
  const [statusError, setStatusError] = useState<string | null>(null);
  // Honest pending transition: the id the user is switching to, held until the
  // active workspace actually becomes it.
  const [pendingId, setPendingId] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const rowEls = useRef(new Map<string, HTMLButtonElement>());
  const registerRow = useCallback(
    (id: string) => (el: HTMLButtonElement | null) => {
      if (el) rowEls.current.set(id, el);
      else rowEls.current.delete(id);
    },
    [],
  );
  const listId = useId();

  if (workspaces.isPending) {
    // Loading: a quiet copy-toned pending line — no spinner theatre.
    return (
      <p
        className="px-fg-1 py-fg-0-5 text-label text-ink-faint"
        role="status"
        aria-live="polite"
        data-workspace-loading
      >
        loading projects…
      </p>
    );
  }

  if (workspaces.isError && !availability.degraded) {
    // Error: a genuine /workspaces failure — contained and non-alarming, scoped
    // to the control, distinct from a tiers-reported degradation. A tiers-bearing
    // failure (a backend tier reported down) is degradation, so it falls through
    // to the designed degraded banner below; only a tiers-less transport fault
    // renders this error state (degradation-is-read-from-tiers). The 8s error-
    // state refetch (useWorkspaces) self-heals after engine startup; the retry is
    // a manual nudge, not the only path.
    return (
      <div
        className="space-y-fg-1 px-fg-1 py-fg-0-5"
        role="status"
        aria-live="polite"
        data-workspace-error
      >
        <p className="text-label text-state-broken">projects unavailable</p>
        <button
          type="button"
          onClick={() => void workspaces.refetch()}
          aria-label="retry loading the project list"
          className="rounded-fg-xs text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          retry
        </button>
      </div>
    );
  }

  const current = roots.find((r) => r.id === activeWorkspace) ?? roots[0];
  const pending = pendingId !== null && pendingId !== activeWorkspace;
  const pendingRoot = pending ? roots.find((r) => r.id === pendingId) : undefined;
  const headlineLabel = pendingRoot?.label ?? current?.label ?? null;
  // The common single-project case renders as a quiet header, not a control —
  // unless the operator opens the add-a-project affordance, which a single-root
  // workspace must still reach.
  const singleRoot = roots.length <= 1;

  const collapse = () => setExpanded(false);

  const selectWorkspace = (root: WorkspaceRoot) => {
    if (root.id === activeWorkspace) {
      collapse();
      return;
    }
    setStatusError(null);
    setPendingId(root.id);
    collapse();
    triggerRef.current?.focus();
    // Optimistic + durable: the stores hook runs the widened 022 reset and
    // clears the cached worktree set synchronously, then persists the selection.
    // A rejected switch surfaces as a non-silent status line.
    //
    // The new project's scope is its registered root worktree (`root.path`), not
    // null: a workspace swap must re-point the active SCOPE to a worktree of the
    // new workspace (dashboard-workspace-registry ADR), or the browser keeps
    // showing the prior project's corpus while the workspace pointer moved (live
    // verification finding H4). `root.path` is the operator-registered,
    // vault-bearing root worktree — the correct default landing scope.
    swap(root.id, root.path).then(
      () => setPendingId(null),
      (err: unknown) => {
        setPendingId(null);
        setStatusError(
          err instanceof EngineError && err.status === 400
            ? `could not switch to ${root.label} — selection not saved`
            : "could not switch project",
        );
      },
    );
  };

  const submitAdd = (e: FormEvent) => {
    e.preventDefault();
    const path = addPath.trim();
    if (path.length === 0) return;
    setStatusError(null);
    // Register through the same config mutation. A rejected add (an invalid path
    // → tiered 400) surfaces the engine's honest refusal as the status line.
    mutation.mutate(
      { add_workspace: path },
      {
        onSuccess: () => {
          setAddPath("");
          setAdding(false);
        },
        onError: (err) => {
          setStatusError(
            err instanceof EngineError && err.status === 400
              ? `could not register ${path} — not a readable git project`
              : "could not register the project",
          );
        },
      },
    );
  };

  const onRowKeyDown =
    (root: WorkspaceRoot, index: number) =>
    (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        const next = Math.min(roots.length - 1, Math.max(0, index + delta));
        rowEls.current.get(roots[next]!.id)?.focus();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectWorkspace(root);
      } else if (e.key === "Escape") {
        e.preventDefault();
        collapse();
        triggerRef.current?.focus();
      }
    };

  // Degraded: a tier the engine reports unavailable renders as a designed
  // degraded banner with the reason in copy tone — read through the stores
  // selector, never the raw tiers. Shared by the single-root header and the
  // multi-root control so a tiers-bearing failure (which falls through the error
  // guard above) is never silently dropped (degradation-is-read-from-tiers).
  const degradedBanner = availability.degraded ? (
    <p
      className="mt-fg-1 rounded-fg-xs bg-accent-subtle/40 px-fg-1 py-fg-0-5 text-caption text-ink-muted"
      role="status"
      aria-live="polite"
      data-workspace-degraded
    >
      the project list is partly unavailable right now
      {availability.degradedTiers.map((t) => availability.reasons[t]).find(Boolean)
        ? ` — ${availability.degradedTiers.map((t) => availability.reasons[t]).find(Boolean)}`
        : ""}
      . showing what loaded.
    </p>
  ) : null;

  // The add-a-project affordance + the transient status line, shared by the
  // header (single root) and the expanded control forms.
  const addAffordance = (
    <>
      {adding ? (
        <form
          className="mt-fg-1 space-y-fg-1"
          onSubmit={submitAdd}
          data-workspace-add-form
        >
          <input
            type="text"
            value={addPath}
            onChange={(e) => setAddPath(e.target.value)}
            placeholder="absolute path to a git project…"
            aria-label="absolute path to a git project to register"
            autoFocus
            className="w-full rounded-fg-xs border border-rule bg-paper px-fg-2 py-fg-0-5 font-mono text-caption text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          />
          <div className="flex gap-fg-1">
            <button
              type="submit"
              disabled={mutation.isPending || addPath.trim().length === 0}
              className="rounded-fg-xs bg-accent-subtle px-fg-2 py-fg-0-5 text-caption font-medium text-ink transition-colors hover:bg-accent-subtle/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50"
            >
              {mutation.isPending ? "adding…" : "add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setAddPath("");
                setStatusError(null);
              }}
              className="rounded-fg-xs px-fg-2 py-fg-0-5 text-caption text-ink-faint transition-colors hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            >
              cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setStatusError(null);
          }}
          aria-label="add a project to the workspace"
          className="mt-fg-1 flex w-full items-center gap-fg-1 rounded-fg-xs px-fg-2 py-fg-0-5 text-left text-caption text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          data-workspace-add
        >
          <FolderPlus size={MARK_PX} aria-hidden />
          add a project
        </button>
      )}
      {/* Rejected switch / invalid add: a transient honest state — the action
          did not take. role=status so it is announced. */}
      {statusError && (
        <p
          className="mt-fg-1 px-fg-1 text-caption text-state-broken"
          role="status"
          aria-live="polite"
          data-workspace-status-error
        >
          {statusError}
        </p>
      )}
    </>
  );

  // Empty / single-root: render a QUIET HEADER (the project name), not a control,
  // plus the add-a-project affordance so a single-project operator can still
  // register a second root.
  if (singleRoot) {
    return (
      <div className="text-label" data-workspace-picker data-workspace-header>
        <div className="flex items-center gap-fg-1 px-fg-2 py-fg-0-5">
          <span
            className="min-w-0 flex-1 truncate font-medium text-ink"
            title={current?.path}
          >
            {headlineLabel ?? "no project"}
          </span>
          {current?.is_launch && (
            <span
              className="shrink-0 text-ink-faint"
              title="launch project"
              aria-hidden
            >
              <Star size={MARK_PX} />
            </span>
          )}
        </div>
        {degradedBanner}
        {addAffordance}
      </div>
    );
  }

  return (
    <div
      className="text-label"
      data-workspace-picker
      onKeyDown={(e) => {
        if (e.key === "Escape" && expanded) {
          collapse();
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={listId}
        aria-label={
          headlineLabel
            ? `project: ${headlineLabel}${pending ? ", switching" : ""}`
            : "choose a project"
        }
        className="flex w-full items-center gap-fg-1 rounded-fg-xs border border-rule bg-paper-raised px-fg-2 py-fg-1 shadow-fg-raised transition-colors duration-ui-fast hover:border-rule-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        <span
          className={`min-w-0 flex-1 truncate text-left font-medium ${
            pending ? "text-ink-muted" : "text-ink"
          }`}
        >
          {headlineLabel ?? "pick a project…"}
        </span>
        {pending && (
          <span className="shrink-0 text-caption text-ink-faint" role="status">
            switching…
          </span>
        )}
        <span className="shrink-0 text-ink-faint" aria-hidden>
          {expanded ? <ChevronUp size={CARET_PX} /> : <ChevronDown size={CARET_PX} />}
        </span>
      </button>

      {/* Degraded: a tier the engine reports unavailable renders as a designed
          degraded banner — read through the stores selector, never the raw
          tiers. Shared with the single-root header path. */}
      {degradedBanner}

      {expanded && (
        <ul
          id={listId}
          className="mt-fg-1 space-y-fg-0-5"
          aria-label="registered projects"
        >
          {roots.map((root, index) => {
            const isActive = root.id === activeWorkspace;
            const isPendingRow = pending && root.id === pendingId;
            return (
              <li key={root.id}>
                <button
                  ref={registerRow(root.id)}
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  title={
                    root.reachable
                      ? root.path
                      : `${root.path} — unreachable${root.unreachable_reason ? `: ${root.unreachable_reason}` : ""}`
                  }
                  aria-label={
                    `switch to ${root.label}` +
                    (root.is_launch ? ", the launch project" : "") +
                    (isActive ? ", current project" : "") +
                    (root.reachable ? "" : ", unreachable")
                  }
                  onClick={() => selectWorkspace(root)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openContextMenu(workspaceEntity(root), {
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }}
                  onKeyDown={(e) => {
                    // Keyboard menu entry (ContextMenu key / Shift+F10): anchor
                    // at the row's bottom-left, then fall through to the roving
                    // arrow/Enter/Escape contract for everything else.
                    if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                      e.preventDefault();
                      const r = e.currentTarget.getBoundingClientRect();
                      openContextMenu(workspaceEntity(root), {
                        x: r.left,
                        y: r.bottom,
                      });
                      return;
                    }
                    onRowKeyDown(root, index)(e);
                  }}
                  className={`flex w-full items-center gap-fg-1 rounded-fg-xs px-fg-2 py-fg-0-5 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                    isActive
                      ? "bg-accent-subtle font-medium text-ink"
                      : "text-ink-muted hover:bg-paper-sunken hover:text-ink"
                  }`}
                >
                  {/* Grayscale-safe active cue: a leading accent bar plus fill +
                      weight, so the active project reads without relying on hue. */}
                  <span
                    aria-hidden
                    className={`-ml-fg-1 h-3 w-0.5 shrink-0 rounded-full ${
                      isActive ? "bg-accent" : "bg-transparent"
                    }`}
                  />
                  <span
                    className={`min-w-0 truncate ${root.reachable ? "" : "text-ink-faint/70"}`}
                  >
                    {root.label}
                  </span>
                  {root.is_launch && (
                    <span
                      className="shrink-0 text-ink-faint"
                      title="launch project"
                      aria-hidden
                    >
                      <Star size={MARK_PX} />
                    </span>
                  )}
                  {!root.reachable && (
                    <span
                      className="flex shrink-0 items-center text-state-stale"
                      title={root.unreachable_reason ?? "unreachable"}
                      aria-hidden
                      data-workspace-unreachable
                    >
                      <TriangleAlert size={WARN_PX} />
                    </span>
                  )}
                  {isPendingRow && (
                    <span className="ml-auto shrink-0 text-caption text-ink-faint">
                      switching…
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {addAffordance}
    </div>
  );
}
