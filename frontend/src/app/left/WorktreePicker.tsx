// The worktree switcher (W03.P09.S37, re-skinned W02.P14.S30 onto the OKLCH
// token layer and the Lucide chrome plane per the worktree-switcher surface
// ADR): the engine's repository → branch → worktree mapping as a compact
// two-level switcher at the top of the left scope rail. It answers "where am I
// pointed?" and sets the coarsest filter on everything the stage, timeline, and
// inspector render. Worktrees that contain a vault corpus are primary, full-ink,
// selectable; bare refs and remote feature refs the map marks `degraded:
// ["structural"]` render dimmed as context (no working tree to resolve a corpus
// against). Selecting a corpus-bearing worktree swaps the stage scope WHOLESALE
// and statelessly — the HIGH 022 isolation invariant — by invoking the stores'
// `setScope`, which owns the cross-store reset; this control is only the
// invoker. It reads `/map` and `tiers` ONLY through stores hooks, defines no
// worktree shape, never fetches the engine, and emits the scope-selection intent
// back through `setScope` plus the durable session write — chrome over the one
// projection.

import { ChevronDown, ChevronUp, TriangleAlert } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useId, useRef, useState } from "react";

import type { WorktreeEntity } from "../../platform/actions/entity";
import type { MapWorktree } from "../../stores/server/engine";
import { EngineError } from "../../stores/server/engine";
import {
  usePutSession,
  useWorkspaceMap,
  useWorkspaceMapAvailability,
} from "../../stores/server/queries";
import { openContextMenu } from "../../stores/view/contextMenu";
import { useViewStore } from "../../stores/view/viewStore";
import { useActiveScope } from "../stage/Stage";
import { movePlayhead } from "../timeline/Playhead";
// Self-registering left-rail context-menu resolver (W03.P07): importing the
// module runs its `registerResolver("worktree", …)` side effect once.
import "./menus/worktreeMenu";

/** Build the worktree context-menu entity from a map worktree row's data. */
function worktreeEntity(worktree: MapWorktree): WorktreeEntity {
  return {
    kind: "worktree",
    id: worktree.id,
    branch: worktree.branch,
    path: worktree.path,
    hasVault: worktree.has_vault,
  };
}

// --- pure helpers (unit-tested) ---------------------------------------------------

/** Sort corpus-bearing worktrees first, defaults leading, bare refs last. */
export function orderWorktrees(worktrees: readonly MapWorktree[]): MapWorktree[] {
  return [...worktrees].sort(
    (a, b) =>
      Number(b.has_vault) - Number(a.has_vault) ||
      Number(b.is_default ?? false) - Number(a.is_default ?? false) ||
      a.branch.localeCompare(b.branch),
  );
}

// --- icon sizing (token-aligned, not arbitrary px) -------------------------------
// 14px is the iconography ADR's grayscale-by-shape gate size; the disclosure
// caret reads one density step smaller so the structural chrome stays attenuated
// relative to the worktree identity, matching the sidebar's CHEVRON_PX.
const CARET_PX = 12;
const WARN_PX = 12;

export interface WorktreePickerProps {
  /** Test seam: force the open state so the expanded list renders without a
   *  pointer/keyboard round-trip; the real control owns its own state. */
  defaultExpanded?: boolean;
}

export function WorktreePicker({ defaultExpanded = false }: WorktreePickerProps = {}) {
  const map = useWorkspaceMap();
  const availability = useWorkspaceMapAvailability();
  const active = useActiveScope();
  const setScope = useViewStore((s) => s.setScope);
  const putSession = usePutSession();
  const [expanded, setExpanded] = useState(defaultExpanded);
  // A rejected durable switch (the engine 400s an unknown/non-vault scope)
  // surfaces here rather than failing silently; the immediate `setScope` already
  // moved the UI, so this reports that the selection did not PERSIST.
  const [switchError, setSwitchError] = useState<string | null>(null);
  // Honest pending transition (ADR "switching/pending"): the id the user is
  // switching to, held until the active scope actually becomes it. The
  // optimistic `setScope` is synchronous, so this clears on the same tick for a
  // healthy swap; it stays set only across the rare async gap, keeping the
  // control honest about the transition rather than claiming instant arrival.
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Git sync indicator — ahead/behind/dirty from the live status hook
  // (TanStack deduplicates this query with NowStrip and ChangesOverview). This
  // is a glanceable affordance on the active worktree, never ambient decoration.

  // Keyboard-initiated actions never animate (ADR / base-language layer 6): when
  // the disclosure is toggled from the keyboard, mark the next list render
  // instant. Pointer toggles keep the short token-bounded transition; the global
  // prefers-reduced-motion floor in the token layer collapses both regardless.
  const [keyboardToggle, setKeyboardToggle] = useState(false);

  // Roving focus across the expanded list (ADR keyboard contract): arrow keys
  // move between rows following the corpus-first order, Enter/Space activates the
  // focused corpus-bearing row, Escape collapses returning focus to the trigger.
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

  if (map.isPending) {
    // Loading: a quiet copy-toned pending line — no spinner theatre.
    return (
      <p
        className="px-fg-1 py-fg-0-5 text-label text-ink-faint"
        role="status"
        aria-live="polite"
      >
        mapping worktrees…
      </p>
    );
  }

  if (map.isError && !availability.degraded) {
    // Error: a genuine /map failure — contained and non-alarming, scoped to the
    // control, distinct from a tiers-reported degradation. A tiers-bearing failure
    // (a backend tier reported down) is degradation, so it falls through to the
    // designed degraded banner below; only a tiers-less transport fault renders
    // this error state (degradation-is-read-from-tiers). The 8s error-state
    // refetch (useWorkspaceMap) self-heals the picker after engine startup
    // without a page reload, so the retry is a manual nudge, not the only path.
    return (
      <div
        className="space-y-fg-1 px-fg-1 py-fg-0-5"
        role="status"
        aria-live="polite"
        data-worktree-error
      >
        <p className="text-label text-state-broken">workspace map unavailable</p>
        <button
          type="button"
          onClick={() => void map.refetch()}
          aria-label="retry loading the workspace map"
          className="rounded-fg-xs text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          retry
        </button>
      </div>
    );
  }

  const worktrees = orderWorktrees(
    map.data?.repositories.flatMap((r) => r.worktrees) ?? [],
  );
  const selectable = worktrees.filter((w) => w.has_vault);
  const current = worktrees.find((w) => w.id === active);
  // The transition is honest: the trigger headline shows the pending branch
  // while a switch is in flight, and the active row carries a pending cue until
  // the active scope catches up.
  const pending = pendingId !== null && pendingId !== active;
  const pendingWorktree = pending
    ? worktrees.find((w) => w.id === pendingId)
    : undefined;
  const headlineBranch = pendingWorktree?.branch ?? current?.branch ?? null;

  const collapse = (viaKeyboard: boolean) => {
    setKeyboardToggle(viaKeyboard);
    setExpanded(false);
  };

  const toggle = (viaKeyboard: boolean) => {
    setKeyboardToggle(viaKeyboard);
    setExpanded((v) => !v);
  };

  const selectWorktree = (worktree: MapWorktree) => {
    if (!worktree.has_vault) return; // bare/degraded rows are not stage scopes
    // Optimistic, immediate (022): the stores' setScope performs the single
    // cross-store reset — filter, pin, lens, live-status, selection, working
    // set, opened islands, pinned discoveries, timeline mode, granularity — so
    // nothing from the prior corpus survives. This control only invokes it.
    setScope(worktree.id);
    // The store resets the MODE to live (022); the playhead widget docks back.
    movePlayhead("live");
    setSwitchError(null);
    setPendingId(worktree.id);
    collapse(true);
    triggerRef.current?.focus();
    // Durable session write so the selection survives a reload — the immediate
    // setScope above is for responsiveness, this is the durable record. A
    // rejected switch (unknown/non-vault scope → tiered 400) surfaces as a
    // non-silent status line instead of failing quietly.
    putSession.mutate(
      { active_scope: worktree.id },
      {
        onError: (err) => {
          setPendingId(null);
          setSwitchError(
            err instanceof EngineError && err.status === 400
              ? `could not switch to ${worktree.branch} — selection not saved`
              : "could not persist the worktree switch",
          );
        },
        onSuccess: () => setPendingId(null),
      },
    );
  };

  const onRowKeyDown =
    (worktree: MapWorktree, index: number) =>
    (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        const next = Math.min(worktrees.length - 1, Math.max(0, index + delta));
        rowEls.current.get(worktrees[next]!.id)?.focus();
      } else if (e.key === "Enter" || e.key === " ") {
        // Enter/Space activates a corpus-bearing row; a no-op (with the conveyed
        // disabled reason) on a bare/degraded row — never a stage scope.
        e.preventDefault();
        selectWorktree(worktree);
      } else if (e.key === "Escape") {
        e.preventDefault();
        collapse(true);
        triggerRef.current?.focus();
      }
    };

  const noWorktrees = worktrees.length === 0;
  const singleScope = selectable.length === 1 && worktrees.length === 1;

  return (
    <div
      className="text-label"
      data-worktree-picker
      onKeyDown={(e) => {
        // Escape anywhere in the control collapses to the trigger.
        if (e.key === "Escape" && expanded) {
          collapse(true);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => toggle(false)}
        onKeyDown={(e) => {
          // Keyboard open is instant (never animates). Enter/Space toggle from
          // the keyboard; ArrowDown opens and dives into the first row.
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle(true);
          } else if (e.key === "ArrowDown" && !expanded) {
            e.preventDefault();
            setKeyboardToggle(true);
            setExpanded(true);
            requestAnimationFrame(() =>
              rowEls.current.get(worktrees[0]?.id ?? "")?.focus(),
            );
          }
        }}
        aria-expanded={expanded}
        aria-controls={listId}
        aria-label={
          headlineBranch
            ? `worktree scope: ${headlineBranch}${pending ? ", switching" : ""}`
            : "choose a worktree scope"
        }
        className="flex w-full items-center gap-fg-1-5 rounded-fg-md bg-paper-sunken px-[10px] py-[6px] transition-colors duration-ui-fast hover:bg-paper-sunken/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        {/* The board dropdown shows JUST the worktree name (no ahead/behind/dirty
            badges) on the paper-sunken ground, with a trailing chevron. */}
        <span
          className={`min-w-0 flex-1 truncate text-left text-[12.5px] font-medium ${
            pending ? "text-ink-muted" : "text-ink"
          }`}
        >
          {headlineBranch ?? "pick a worktree…"}
        </span>
        <span className="shrink-0 text-ink-faint" aria-hidden>
          {expanded ? <ChevronUp size={CARET_PX} /> : <ChevronDown size={CARET_PX} />}
        </span>
      </button>

      {/* Degraded: a tier the engine reports unavailable renders as a designed
          degraded banner with the reason in copy tone — the control still lists
          what it can. Read through the stores selector, never the raw tiers. */}
      {availability.degraded && (
        <p
          className="mt-fg-1 rounded-fg-xs bg-accent-subtle/40 px-fg-1 py-fg-0-5 text-caption text-ink-muted"
          role="status"
          aria-live="polite"
          data-worktree-degraded
        >
          the worktree map is partly unavailable right now
          {availability.degradedTiers.map((t) => availability.reasons[t]).find(Boolean)
            ? ` — ${availability.degradedTiers.map((t) => availability.reasons[t]).find(Boolean)}`
            : ""}
          . showing what loaded.
        </p>
      )}

      {expanded && (
        <ul
          id={listId}
          className={`mt-fg-1 space-y-fg-0-5 ${
            keyboardToggle ? "" : "animate-slide-in-down"
          }`}
          aria-label="worktree scopes"
        >
          {noWorktrees ? (
            // Empty: an approachable empty state — a workspace resolving to no
            // selectable corpus-bearing worktree is a real condition, not a fault.
            <li
              className="px-fg-2 py-fg-1 text-label text-ink-faint"
              data-worktree-empty
            >
              no worktrees mapped yet — point the engine at a repository to begin.
            </li>
          ) : selectable.length === 0 ? (
            <li
              className="px-fg-2 py-fg-1 text-label text-ink-faint"
              data-worktree-empty
            >
              no vault-bearing worktree to switch to here. listed refs are context only.
            </li>
          ) : null}
          {worktrees.map((worktree, index) => {
            const isActive = worktree.id === active;
            const isPendingRow = pending && worktree.id === pendingId;
            const isDegraded = (worktree.degraded?.length ?? 0) > 0;
            return (
              <li key={worktree.id}>
                <button
                  ref={registerRow(worktree.id)}
                  type="button"
                  aria-disabled={!worktree.has_vault}
                  aria-current={isActive ? "true" : undefined}
                  title={
                    worktree.has_vault
                      ? worktree.path
                      : `${worktree.path} — no vault corpus, context only`
                  }
                  aria-label={
                    worktree.has_vault
                      ? `switch to ${worktree.branch}${worktree.is_default ? ", the default" : ""}${
                          isActive ? ", current scope" : ""
                        }`
                      : `${worktree.branch} — context only, no vault corpus to switch to`
                  }
                  onClick={() => selectWorktree(worktree)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openContextMenu(worktreeEntity(worktree), {
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
                      openContextMenu(worktreeEntity(worktree), {
                        x: r.left,
                        y: r.bottom,
                      });
                      return;
                    }
                    onRowKeyDown(worktree, index)(e);
                  }}
                  className={`flex w-full items-center gap-fg-1 rounded-fg-xs px-fg-2 py-fg-0-5 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                    isActive
                      ? "bg-accent-subtle font-medium text-ink"
                      : worktree.has_vault
                        ? "text-ink-muted hover:bg-paper-sunken hover:text-ink"
                        : "cursor-not-allowed text-ink-faint/60"
                  }`}
                >
                  {/* Grayscale-safe active cue: a leading accent bar plus fill +
                      weight, so the active worktree reads without relying on hue
                      (the base-language grayscale-safe gate). */}
                  <span
                    aria-hidden
                    className={`-ml-fg-1 h-3 w-0.5 shrink-0 rounded-full ${
                      isActive ? "bg-accent" : "bg-transparent"
                    }`}
                  />
                  <span className="min-w-0 truncate">{worktree.branch}</span>
                  {worktree.is_default && (
                    <span className="shrink-0 text-ink-faint">·default</span>
                  )}
                  {!worktree.has_vault && (
                    <span className="shrink-0 text-ink-faint">·bare</span>
                  )}
                  {isDegraded && (
                    <span
                      className="flex shrink-0 items-center text-state-stale"
                      title={worktree.degraded!.join(", ")}
                      aria-hidden
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
          {singleScope && (
            <li
              className="px-fg-2 py-fg-0-5 text-caption text-ink-faint"
              data-worktree-single
            >
              this is the only vault-bearing worktree.
            </li>
          )}
        </ul>
      )}

      {/* Rejected durable switch: a fifth, transient honest state — the UI moved
          but the selection did not persist. role=status so it is announced. */}
      {switchError && (
        <p
          className="mt-fg-1 px-fg-1 text-caption text-state-broken"
          role="status"
          aria-live="polite"
          data-worktree-switch-error
        >
          {switchError}
        </p>
      )}
    </div>
  );
}
