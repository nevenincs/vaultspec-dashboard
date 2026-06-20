// The worktree switcher (W03.P09.S37, re-skinned W02.P14.S30 onto the OKLCH
// token layer and the Lucide chrome plane per the worktree-switcher surface
// ADR): the engine's repository → branch → worktree mapping as a compact
// two-level switcher at the top of the left scope rail. It answers "where am I
// pointed?" and sets the coarsest filter on everything the stage, timeline, and
// inspector render. Worktrees that contain a vault corpus are primary, full-ink,
// selectable; bare refs and remote feature refs the map marks `degraded:
// ["structural"]` render dimmed as context (no working tree to resolve a corpus
// against). Selecting a corpus-bearing worktree persists the active scope through
// the stores-layer switch; the accepted session response then drives the
// wholesale local reset. This control is only the invoker. It reads `/map` and
// `tiers` ONLY through stores hooks, defines no worktree shape, never fetches the
// engine, and emits the scope-selection intent through the durable session
// transition — chrome over the one projection.

import { TriangleAlert } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useId, useRef } from "react";

import { IconButton, PanelLeft } from "../kit";
import type { WorktreeEntity } from "../../platform/actions/entity";
import type { MapWorktree } from "../../stores/server/engine";
import { type WorkspaceMapPickerRowView } from "../../stores/server/queries";
import { openContextMenu } from "../../stores/view/contextMenu";
import {
  setWorktreePickerExpanded,
  toggleWorktreePickerExpanded,
  worktreePickerFirstRowFocusTarget,
  worktreePickerRowKeyboardTarget,
  useWorktreePickerView,
} from "../../stores/view/worktreePickerChrome";
import { handleKeyboardContextMenu } from "../chrome/keyboardContextMenu";
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

// --- icon sizing (token-aligned, not arbitrary px) -------------------------------
// Warning marks read one density step smaller than identity icons.
const WARN_PX = 12;

export interface WorktreePickerProps {
  /** Test seam: force the open state so the expanded list renders without a
   *  pointer/keyboard round-trip; runtime chrome lives in the view store seam. */
  defaultExpanded?: boolean;
}

export function WorktreePicker({ defaultExpanded = false }: WorktreePickerProps = {}) {
  const {
    state,
    pickerView,
    retry,
    activateRow,
    expanded,
    listClassName,
    switchError,
    switchErrorClassName,
    collapseLeftRail,
  } = useWorktreePickerView();

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

  useEffect(() => {
    if (defaultExpanded) setWorktreePickerExpanded(true, true);
  }, [defaultExpanded]);

  if (state === "loading") {
    // Loading: a quiet copy-toned pending line — no spinner theatre.
    return (
      <p className={pickerView.loadingClassName} role="status" aria-live="polite">
        {pickerView.loadingLabel}
      </p>
    );
  }

  if (state === "error") {
    // Error: a genuine /map failure — contained and non-alarming, scoped to the
    // control, distinct from a tiers-reported degradation. A tiers-bearing failure
    // (a backend tier reported down) is degradation, so it falls through to the
    // designed degraded banner below; only a tiers-less transport fault renders
    // this error state (degradation-is-read-from-tiers). The 8s error-state
    // refetch (useWorkspaceMap) self-heals the picker after engine startup
    // without a page reload, so the retry is a manual nudge, not the only path.
    return (
      <div
        className={pickerView.errorRootClassName}
        role="status"
        aria-live="polite"
        data-worktree-error
      >
        <p className={pickerView.errorLabelClassName}>{pickerView.errorLabel}</p>
        <button
          type="button"
          onClick={retry}
          aria-label={pickerView.retryAriaLabel}
          className={pickerView.retryButtonClassName}
        >
          {pickerView.retryLabel}
        </button>
      </div>
    );
  }

  const { rows } = pickerView;

  const collapse = (viaKeyboard: boolean) => {
    setWorktreePickerExpanded(false, viaKeyboard);
  };

  const toggle = (viaKeyboard: boolean) => {
    toggleWorktreePickerExpanded(viaKeyboard);
  };

  const selectWorktree = (row: WorkspaceMapPickerRowView) => {
    activateRow(row, () => triggerRef.current?.focus());
  };

  const onRowKeyDown =
    (row: WorkspaceMapPickerRowView, index: number) =>
    (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const target = worktreePickerRowKeyboardTarget(rows, index, e.key);
        if (target !== null) rowEls.current.get(target)?.focus();
      } else if (e.key === "Enter" || e.key === " ") {
        // Enter/Space activates a corpus-bearing row; a no-op (with the conveyed
        // disabled reason) on a bare/degraded row — never a stage scope.
        e.preventDefault();
        selectWorktree(row);
      } else if (e.key === "Escape") {
        e.preventDefault();
        collapse(true);
        triggerRef.current?.focus();
      }
    };

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
      {/* The header row (binding `LeftRail` 238:600 / 686:2519): the project/worktree
          name as a PLAIN Inter-Medium title (no pill, no leading glyph) that opens the
          chooser, then the SINGLE rail-collapse toggle. The folder-add button is
          deliberately omitted (per user direction): the title already opens the
          chooser, so a second control opening the same popup is redundant. The title
          holds the dropdown a11y wiring; the dropdown list below is unchanged. */}
      <div
        className="flex items-center justify-between gap-fg-1 py-fg-1"
        data-worktree-picker-header
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
              setWorktreePickerExpanded(true, true);
              requestAnimationFrame(() =>
                rowEls.current
                  .get(worktreePickerFirstRowFocusTarget(rows) ?? "")
                  ?.focus(),
              );
            }
          }}
          aria-expanded={expanded}
          aria-controls={listId}
          aria-label={pickerView.triggerAriaLabel}
          className="min-w-0 flex-1 truncate rounded-fg-xs text-left text-title font-medium text-ink transition-colors duration-ui-fast hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          {pickerView.triggerLabel}
        </button>
        <IconButton
          label="collapse left rail"
          title="collapse left rail"
          onClick={collapseLeftRail}
        >
          <PanelLeft size={16} aria-hidden />
        </IconButton>
      </div>

      {/* Degraded: a tier the engine reports unavailable renders as a designed
          degraded banner with the reason in copy tone — the control still lists
          what it can. Read through the stores selector, never the raw tiers. */}
      {pickerView.degradedLabel && (
        <p
          className={pickerView.degradedClassName}
          role="status"
          aria-live="polite"
          data-worktree-degraded
        >
          {pickerView.degradedLabel}
        </p>
      )}

      {expanded && (
        <ul id={listId} className={listClassName} aria-label={pickerView.listAriaLabel}>
          {pickerView.emptyLabel ? (
            // Empty: an approachable empty state — a workspace resolving to no
            // selectable corpus-bearing worktree is a real condition, not a fault.
            <li className={pickerView.emptyClassName} data-worktree-empty>
              {pickerView.emptyLabel}
            </li>
          ) : null}
          {rows.map((row, index) => {
            const { worktree } = row;
            return (
              <li key={worktree.id}>
                <button
                  ref={registerRow(worktree.id)}
                  type="button"
                  aria-disabled={!row.selectable}
                  aria-current={row.isActive ? "true" : undefined}
                  title={row.title}
                  aria-label={row.ariaLabel}
                  onClick={() => selectWorktree(row)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openContextMenu(worktreeEntity(worktree), {
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }}
                  onKeyDown={(e) => {
                    if (
                      handleKeyboardContextMenu(e, (anchor) =>
                        openContextMenu(worktreeEntity(worktree), anchor),
                      )
                    ) {
                      return;
                    }
                    onRowKeyDown(row, index)(e);
                  }}
                  className={row.rowClassName}
                >
                  {/* Grayscale-safe active cue: a leading accent bar plus fill +
                      weight, so the active worktree reads without relying on hue
                      (the base-language grayscale-safe gate). */}
                  <span aria-hidden className={row.activeCueClassName} />
                  <span className={row.branchClassName}>{row.nameLabel}</span>
                  {row.defaultLabel && (
                    <span className={row.badgeClassName}>{row.defaultLabel}</span>
                  )}
                  {row.bareLabel && (
                    <span className={row.badgeClassName}>{row.bareLabel}</span>
                  )}
                  {row.isDegraded && (
                    <span
                      className={row.degradedIconClassName}
                      title={row.degradedTitle}
                      aria-hidden
                    >
                      <TriangleAlert size={WARN_PX} />
                    </span>
                  )}
                  {row.pendingLabel && (
                    <span className={row.pendingLabelClassName}>
                      {row.pendingLabel}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {pickerView.singleScopeLabel && (
            <li className={pickerView.singleScopeClassName} data-worktree-single>
              {pickerView.singleScopeLabel}
            </li>
          )}
        </ul>
      )}

      {/* Rejected durable switch: a fifth, transient honest state — the UI moved
          but the selection did not persist. role=status so it is announced. */}
      {switchError && (
        <p
          className={switchErrorClassName}
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
