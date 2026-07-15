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

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Folder,
  GitBranch,
  TriangleAlert,
} from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { useFocusZone } from "../chrome/useFocusZone";

import { FolderPlus, IconButton, PanelLeft, Popover } from "../kit";
import type { WorktreeEntity } from "../../platform/actions/entity";
import type { MapWorktree } from "../../stores/server/engine";
import {
  type WorkspaceMapPickerRowView,
  type WorktreePickerProjectRowView,
  type WorktreePickerRecentRowView,
} from "../../stores/server/queries";
import { openAddProjectDialog } from "../../stores/view/addProjectChrome";
import { openContextMenu } from "../../stores/view/contextMenu";
import { guardUnsavedDiscard } from "../../stores/view/unsavedEditGuard";
import { guardedContextMenu } from "../menus/guardedContextMenu";
import {
  setWorktreePickerExpanded,
  toggleWorktreePickerExpanded,
  useWorktreePickerView,
} from "../../stores/view/worktreePickerChrome";
import { handleKeyboardContextMenu } from "../chrome/keyboardContextMenu";
import { RowMenuDisclosure } from "../chrome/RowMenuDisclosure";
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

// FocusZone roving keys for the non-worktree command rows (the worktree rows rove
// under section-prefixed keys derived from their id, so every key in the dropdown
// is unique even when a worktree appears in both the Recent and All sections).
const ADD_PROJECT_KEY = "add-project";
const ALL_TOGGLE_KEY = "all-toggle";

// --- icon sizing (token-aligned, not arbitrary px) -------------------------------
// Warning marks read one density step smaller than identity icons.
const WARN_PX = 12;
// Git-status glyphs (branch, ahead/behind) read one step below the name.
const GIT_GLYPH_PX = 12;
// The trigger chevron reads with the display-size title, one step larger than
// the row glyphs, so the "this title opens a chooser" affordance is well defined.
const TRIGGER_CHEVRON_PX = 14;

// The worktree trigger: a typographical element, NOT a button — the ONE location
// identity block of the app (worktree-switcher-identity ADR): the project name
// as a faint identity line, the worktree name as a prominent title (chevron
// hugging the text — the title is NOT flex-1, so the affordance never floats
// away from a short name), a git-status line (branch + dirty + ahead/behind)
// driven by the pending-aware headline, and the absolute folder path as a faint
// mono line. Token-driven, no raw px (no-hardcoded-px), composed from the shared
// type/ink/state tiers (design-system-is-centralized). The focus-visible ring
// stays for keyboard a11y (it is not a hover affordance).
const PILL_CLASS =
  "group flex min-w-0 flex-1 select-text flex-col gap-fg-0-5 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
// The first two identity lines keep clear of the absolutely-pinned collapse
// toggle riding the header's right edge (the window-top chrome band below).
const PILL_PROJECT_CLASS = "min-w-0 truncate pr-fg-8 text-caption text-ink-muted";
const PILL_NAME_ROW_CLASS = "flex min-w-0 items-center gap-fg-1 pr-fg-8";
const PILL_NAME_CLASS = "min-w-0 truncate text-display text-ink";
const PILL_CHEVRON_CLASS =
  "shrink-0 text-ink-faint transition-transform duration-ui-fast";
const PILL_STATUS_ROW_CLASS =
  "flex items-center gap-fg-1-5 text-caption text-ink-muted";
const PILL_BRANCH_CLASS = "flex min-w-0 items-center gap-fg-0-5";
const PILL_BRANCH_NAME_CLASS = "min-w-0 truncate font-mono";
const PILL_DIRTY_DOT_CLASS = "size-1.5 shrink-0 rounded-full bg-state-stale";
const PILL_COUNT_CLASS = "flex shrink-0 items-center gap-fg-0-5 tabular-nums";
const PILL_PATH_CLASS = "min-w-0 truncate font-mono text-caption text-ink-muted";
// Dropdown row secondary ink: the branch a worktree row is checked out on.
const ROW_BRANCH_CLASS =
  "min-w-0 shrink truncate font-mono text-caption text-ink-muted";

// The switcher dropdown: the shared floating-card idiom (the command palette /
// filter flyout elevation), so the picker stops hand-rolling an inline list.
const DROPDOWN_CARD_CLASS =
  "absolute left-0 right-0 top-full z-30 mt-fg-1 max-h-[18rem] overflow-y-auto rounded-fg-lg border border-rule bg-paper-raised p-fg-1 shadow-fg-popover animate-slide-in-down";

// Section eyebrow inside the dropdown (Recent / the worktree disclosure / Projects).
const DROPDOWN_SECTION_LABEL_CLASS =
  "px-fg-2 pt-fg-1-5 pb-fg-0-5 text-caption tracking-wide text-ink-faint";
// The pinned "Add a project…" command row and the worktree disclosure share
// the worktree-row affordance idiom (selectable, hover, focus ring) so the dropdown
// reads as one surface (design-system-is-centralized).
const DROPDOWN_COMMAND_ROW_CLASS =
  "flex w-full items-center gap-fg-1 rounded-fg-xs px-fg-2 py-fg-0-5 text-left text-ink-muted transition-colors duration-ui-fast hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";

export interface WorktreePickerProps {
  /** Test seam: force the open state so the expanded list renders without a
   *  pointer/keyboard round-trip; runtime chrome lives in the view store seam. */
  defaultExpanded?: boolean;
}

export function WorktreePicker({ defaultExpanded = false }: WorktreePickerProps = {}) {
  const {
    state,
    pickerView,
    recentRows,
    projectRows,
    retry,
    activateRow,
    activateRecent,
    swapProject,
    expanded,
    switchError,
    switchErrorClassName,
    collapseLeftRail,
  } = useWorktreePickerView();

  // The project's worktree disclosure. Tri-state: null = the data-driven default
  // (open when there are no real recents beyond the active worktree, so a fresh
  // session shows the full list; collapsed once recents accrue), a boolean once
  // the user toggles it.
  const [allOpenOverride, setAllOpenOverride] = useState<boolean | null>(null);

  // Roving focus across the expanded list (ADR keyboard contract): arrow keys
  // move between rows following the corpus-first order, Enter/Space activates the
  // focused corpus-bearing row, Escape collapses returning focus to the trigger.
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The worktree rows rove through the one shared FocusZone (keyboard-navigation
  // W02.P05.S11): the dropdown is ONE tab stop, arrows move between rows, and the
  // FocusZone stops consumed arrows from reaching the global keymap dispatcher
  // (the prior bespoke roving leaked them — a double-fire on the graph nav).
  const [activeRow, setActiveRow] = useState<string | null>(null);
  const zone = useFocusZone({
    orientation: "vertical",
    wrap: false,
    activeKey: activeRow,
    onActiveKeyChange: setActiveRow,
  });
  const listId = useId();

  useEffect(() => {
    if (defaultExpanded) setWorktreePickerExpanded(true, true);
  }, [defaultExpanded]);

  // CRITICAL "always able to pick a folder" invariant: the picker NEVER early-returns
  // a loading/error block that hides the whole control. A `/map` failure (e.g. a
  // registered project whose worktree moved — a tiers-less 400) only makes THIS
  // project's worktree LIST unavailable; the dropdown's project switcher (Projects,
  // from the independent `/workspaces` query) and "Add a project" stay reachable so
  // the operator can always escape a broken project. Only the worktree section
  // reflects the map's loading/error sub-state, with a friendly note (never the raw
  // engine/git message).
  const mapLoading = state === "loading";
  const mapError = state === "error";

  const { rows, headline } = pickerView;
  // The PENDING-AWARE headline worktree feeds the pill's git line and path line
  // (the switch target while switching, else the active worktree) so the header
  // never shows the target's name over the outgoing worktree's branch. Read from
  // the projected view — no fetch, no raw tiers (layer ownership).
  const ahead = headline?.ahead ?? 0;
  const behind = headline?.behind ?? 0;
  const showStatusLine = headline !== null && headline.branch.trim().length > 0;

  const collapse = (viaKeyboard: boolean) => {
    setWorktreePickerExpanded(false, viaKeyboard);
  };

  const toggle = (viaKeyboard: boolean) => {
    toggleWorktreePickerExpanded(viaKeyboard);
  };

  const selectWorktree = (row: WorkspaceMapPickerRowView) => {
    // Selecting collapses the picker (beginSwitch sets expanded=false), unmounting
    // the Popover and firing its returnFocusRef restore to the trigger — so no
    // manual focus restore is needed here. Guard a dirty editor draft: a worktree
    // switch wholesale-resets the view store (clearing `draftText`), so confirm
    // before the unsaved changes are discarded.
    guardUnsavedDiscard(() => activateRow(row));
  };

  const onRowKeyDown =
    (
      row: WorkspaceMapPickerRowView,
      zoneKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => void,
    ) =>
    (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        // Enter/Space activates a corpus-bearing row; a no-op (with the conveyed
        // disabled reason) on a bare/degraded row — never a stage scope.
        e.preventDefault();
        e.stopPropagation();
        selectWorktree(row);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        collapse(true);
      } else {
        // Arrows / Home / End rove through the shared FocusZone (which stops them
        // from reaching the global dispatcher).
        zoneKeyDown(e);
      }
    };

  // A worktree row, rendered for both the Recent and the All-worktrees sections
  // under a section-prefixed FocusZone key (the same worktree can appear in both).
  const renderWorktreeRow = (row: WorkspaceMapPickerRowView, rowKey: string) => {
    const { worktree } = row;
    const item = zone.rove(rowKey);
    return (
      <li key={rowKey} className="flex items-center">
        <button
          ref={item.ref}
          tabIndex={item.tabIndex}
          type="button"
          aria-disabled={!row.selectable}
          aria-current={row.isActive ? "true" : undefined}
          title={row.title}
          aria-label={row.ariaLabel}
          onFocus={() => setActiveRow(rowKey)}
          onClick={() => selectWorktree(row)}
          onContextMenu={guardedContextMenu((e) => {
            e.preventDefault();
            openContextMenu(worktreeEntity(worktree), { x: e.clientX, y: e.clientY });
          })}
          onKeyDown={(e) => {
            if (
              handleKeyboardContextMenu(e, (anchor) =>
                openContextMenu(worktreeEntity(worktree), anchor),
              )
            ) {
              return;
            }
            onRowKeyDown(row, item.onKeyDown)(e);
          }}
          className={row.rowClassName}
        >
          {/* Grayscale-safe active cue: a leading accent bar plus fill + weight,
              so the active worktree reads without relying on hue. */}
          <span aria-hidden className={row.activeCueClassName} />
          {/* Every dropdown row leads with one glyph so text starts on ONE column
              across sections (command rows carry their own icons). */}
          <GitBranch
            size={GIT_GLYPH_PX}
            aria-hidden
            className="shrink-0 text-ink-faint"
          />
          <span className={row.branchClassName}>{row.nameLabel}</span>
          {row.branchLabel && (
            <span className={ROW_BRANCH_CLASS}>{row.branchLabel}</span>
          )}
          {row.defaultLabel && (
            <span className={row.badgeClassName}>{row.defaultLabel}</span>
          )}
          {row.noVaultLabel && (
            <span className={row.badgeClassName}>{row.noVaultLabel}</span>
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
            <span className={row.pendingLabelClassName}>{row.pendingLabel}</span>
          )}
        </button>
        {/* The worktree row's coarse-pointer menu entry (touch-selectability ADR
            D3): the SAME `worktree` entity its right-click path opens, sibling of
            the row button; renders nothing on fine-pointer devices. Project and
            recent rows carry no resolver, so they get no disclosure. */}
        <RowMenuDisclosure
          entity={worktreeEntity(worktree)}
          label={`${row.nameLabel} actions`}
        />
      </li>
    );
  };

  // A registered-project row (multi-project identity): selecting a non-active,
  // reachable project swaps the whole workspace. The unsaved-edit guard mirrors a
  // worktree switch (both wholesale-reset the view store).
  const renderProjectRow = (project: WorktreePickerProjectRowView) => {
    const rowKey = `project:${project.id}`;
    const item = zone.rove(rowKey);
    const choose = () => guardUnsavedDiscard(() => swapProject(project.id));
    return (
      <li key={rowKey}>
        <button
          ref={item.ref}
          tabIndex={item.tabIndex}
          type="button"
          aria-disabled={!project.selectable}
          aria-current={project.isActive ? "true" : undefined}
          title={project.title}
          aria-label={project.ariaLabel}
          onFocus={() => setActiveRow(rowKey)}
          onClick={choose}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              choose();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              collapse(true);
            } else {
              item.onKeyDown(e);
            }
          }}
          className={project.rowClassName}
        >
          <span aria-hidden className={project.activeCueClassName} />
          <Folder size={GIT_GLYPH_PX} aria-hidden className="shrink-0 text-ink-faint" />
          <span className="min-w-0 flex-1 truncate">{project.label}</span>
        </button>
      </li>
    );
  };

  // A cross-project "Recent" row: a worktree the user navigated to, possibly in
  // ANOTHER project (so it carries a project label and switches via activateRecent,
  // not the /map row path).
  const renderRecentRow = (recent: WorktreePickerRecentRowView) => {
    const rowKey = `recent:${recent.key}`;
    const item = zone.rove(rowKey);
    const choose = () => guardUnsavedDiscard(() => activateRecent(recent));
    return (
      <li key={rowKey}>
        <button
          ref={item.ref}
          tabIndex={item.tabIndex}
          type="button"
          aria-disabled={!recent.selectable}
          aria-current={recent.isActive ? "true" : undefined}
          title={recent.title}
          aria-label={recent.ariaLabel}
          onFocus={() => setActiveRow(rowKey)}
          onClick={choose}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              choose();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              collapse(true);
            } else {
              item.onKeyDown(e);
            }
          }}
          className={recent.rowClassName}
        >
          <span aria-hidden className={recent.activeCueClassName} />
          <GitBranch
            size={GIT_GLYPH_PX}
            aria-hidden
            className="shrink-0 text-ink-faint"
          />
          {/* The shared row label LEADS with the project on a cross-project entry
              ("project / worktree"), so the distinguishing token carries the ink
              when worktree basenames collide. */}
          <span className="min-w-0 truncate">{recent.label}</span>
        </button>
      </li>
    );
  };

  const hasWorktrees = pickerView.rows.length > 0;
  const showProjects = projectRows.length > 1;
  // The "this project's worktrees" area is shown whenever it has content OR the map
  // is loading/errored (so we can render a friendly sub-state note in its place).
  const showWorktreeArea = hasWorktrees || mapLoading || mapError;
  // Section eyebrows read only when there is more than one section to separate.
  const showSectionLabels = (recentRows.length > 0 && showWorktreeArea) || showProjects;
  // Default the active project's worktree disclosure open when there are no real
  // recents beyond the current location, so a fresh session shows the full list.
  const allOpen = allOpenOverride ?? recentRows.length <= 1;
  const openAddProject = (viaKeyboard: boolean) => {
    collapse(viaKeyboard);
    openAddProjectDialog();
  };

  // The pinned "Add a project…" command row — always the first focusable item.
  const renderAddProjectRow = () => {
    const item = zone.rove(ADD_PROJECT_KEY);
    return (
      <li>
        <button
          ref={item.ref}
          tabIndex={item.tabIndex}
          type="button"
          data-worktree-add-project
          onFocus={() => setActiveRow(ADD_PROJECT_KEY)}
          onClick={() => openAddProject(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              openAddProject(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              collapse(true);
            } else {
              item.onKeyDown(e);
            }
          }}
          className={DROPDOWN_COMMAND_ROW_CLASS}
        >
          <FolderPlus size={GIT_GLYPH_PX} aria-hidden className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">Add a project…</span>
        </button>
      </li>
    );
  };

  // The worktree disclosure toggle (only rendered when there are worktrees
  // beyond the Recent section).
  const renderAllToggleRow = () => {
    const item = zone.rove(ALL_TOGGLE_KEY);
    return (
      <li>
        <button
          ref={item.ref}
          tabIndex={item.tabIndex}
          type="button"
          aria-expanded={allOpen}
          data-worktree-all-toggle
          onFocus={() => setActiveRow(ALL_TOGGLE_KEY)}
          onClick={() => setAllOpenOverride(!allOpen)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              setAllOpenOverride(!allOpen);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              collapse(true);
            } else {
              item.onKeyDown(e);
            }
          }}
          className={DROPDOWN_COMMAND_ROW_CLASS}
        >
          <ChevronDown
            size={GIT_GLYPH_PX}
            aria-hidden
            className={`shrink-0 transition-transform duration-ui-fast ${
              allOpen ? "" : "-rotate-90"
            }`}
          />
          <span className="min-w-0 flex-1 truncate">{pickerView.allLabel}</span>
          <span className="shrink-0 tabular-nums text-ink-muted">{rows.length}</span>
        </button>
      </li>
    );
  };

  return (
    <div
      className="text-label"
      data-worktree-picker
      onKeyDown={(e) => {
        // Escape anywhere in the control collapses; the Popover's returnFocusRef
        // restore returns focus to the trigger on unmount.
        if (e.key === "Escape" && expanded) {
          collapse(true);
        }
      }}
    >
      {/* The header row (binding `LeftRail` 238:600 / 686:2519): the project/worktree
          name as a prominent, decorative title (no border, no background, no hover
          change — a typographical element, not a button) that opens the chooser via
          its trailing chevron, then the single rail-collapse toggle. The dead
          folder-add IconButton was retired: "Add a project" now lives as the pinned
          first item of the dropdown (and a Cmd+K command), not a header glyph. */}
      <div
        className="relative flex items-start justify-between gap-fg-1 py-fg-1"
        data-worktree-picker-header
      >
        <button
          ref={triggerRef}
          type="button"
          data-worktree-trigger
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
              requestAnimationFrame(() => {
                // Dive onto the pinned "Add a project…" row — the first focusable
                // item in the dropdown — then arrows rove down through the rest.
                setActiveRow(ADD_PROJECT_KEY);
                zone.focusItem(ADD_PROJECT_KEY);
              });
            }
          }}
          aria-expanded={expanded}
          aria-controls={listId}
          aria-label={pickerView.triggerAriaLabel}
          className={PILL_CLASS}
        >
          {/* Project identity line: WHICH project this "main" belongs to. Shown
              whenever the registry resolves it — identity, not a control. */}
          {pickerView.projectLabel && (
            <span className={PILL_PROJECT_CLASS} data-trigger-project>
              {pickerView.projectLabel}
            </span>
          )}
          <span className={PILL_NAME_ROW_CLASS}>
            <span className={PILL_NAME_CLASS}>{pickerView.triggerLabel}</span>
            <ChevronDown
              size={TRIGGER_CHEVRON_PX}
              aria-hidden
              className={`${PILL_CHEVRON_CLASS} ${expanded ? "rotate-180" : ""}`}
            />
          </span>
          {/* Git-status line: branch + a dirty dot + ahead/behind counts for the
              headline worktree, so "where am I + git state" reads at a glance. */}
          {showStatusLine && (
            <span className={PILL_STATUS_ROW_CLASS} data-git-status-pill>
              <span className={PILL_BRANCH_CLASS}>
                <GitBranch size={GIT_GLYPH_PX} aria-hidden className="shrink-0" />
                <span className={PILL_BRANCH_NAME_CLASS}>{headline.branch}</span>
              </span>
              {headline.dirty && (
                <span
                  className={PILL_DIRTY_DOT_CLASS}
                  title="uncommitted changes"
                  aria-label="uncommitted changes"
                  role="img"
                />
              )}
              {ahead > 0 && (
                <span
                  className={PILL_COUNT_CLASS}
                  title={`${ahead} ahead of upstream`}
                  aria-label={`${ahead} commits ahead of upstream`}
                >
                  <ArrowUp size={GIT_GLYPH_PX} aria-hidden />
                  {ahead}
                </span>
              )}
              {behind > 0 && (
                <span
                  className={PILL_COUNT_CLASS}
                  title={`${behind} behind upstream`}
                  aria-label={`${behind} commits behind upstream`}
                >
                  <ArrowDown size={GIT_GLYPH_PX} aria-hidden />
                  {behind}
                </span>
              )}
            </span>
          )}
          {/* The folder being read: the absolute worktree path, faint mono, full
              path on hover — the one place location-on-disk is stated. */}
          {headline && (
            <span className={PILL_PATH_CLASS} title={headline.path} data-trigger-path>
              {headline.path}
            </span>
          )}
        </button>
        {/* The rail-collapse toggle rides the SAME window-top chrome band as the
            dock header's right-rail toggle (the shared --chrome-topband-height
            token also driving the dockview tab bar), so the two panel toggles
            align vertically instead of this one centering against the multi-line
            identity block. `-top-fg-3` cancels the rail's `pt-fg-3` so the band
            starts at the window top edge (LeftRail owns that padding; keep the
            two in step). */}
        <div
          className="absolute right-0 -top-fg-3 flex h-[var(--chrome-topband-height)] items-center"
          data-worktree-collapse-band
        >
          <IconButton
            label="collapse left rail"
            title="collapse left rail"
            onClick={collapseLeftRail}
          >
            <PanelLeft size={16} aria-hidden />
          </IconButton>
        </div>

        {/* The switcher dropdown: the shared kit Popover owns the light-dismiss
            wiring (Escape + outside pointer); `ignoreSelector` excludes the pill
            trigger so its own toggle is not dismiss-then-reopened. Floats below the
            pill as the shared elevated card, never an inline list that shoves the
            rail down. */}
        {expanded && (
          <Popover
            open={expanded}
            onDismiss={() => collapse(false)}
            ignoreSelector="[data-worktree-trigger]"
            // This picker opens via paths where the open-time activeElement is NOT
            // the trigger (the ArrowDown-dive into the first row, the default-open
            // test seam), so it DECLARES its trigger as the Popover's focus-return
            // target. Every close path collapses (Escape, dismiss, and select via
            // beginSwitch all set expanded=false), which unmounts the Popover and
            // fires its returnFocusRef restore — so the picker keeps no manual
            // focus restore of its own.
            returnFocusRef={triggerRef}
            className={DROPDOWN_CARD_CLASS}
            data-worktree-dropdown
          >
            <ul
              id={listId}
              className="space-y-fg-0-5"
              aria-label={pickerView.listAriaLabel}
            >
              {/* Pinned: register a new project root (path-input dialog). Always
                  the first focusable item — the relocated folder-add affordance. */}
              {renderAddProjectRow()}

              {pickerView.emptyLabel && !mapError && !mapLoading ? (
                // Empty: an approachable empty state — a workspace resolving to no
                // selectable corpus-bearing worktree is a real condition, not a fault.
                // Suppressed while the map is loading/errored (the worktree-area note
                // below speaks for that state instead).
                <li className={pickerView.emptyClassName} data-worktree-empty>
                  {pickerView.emptyLabel}
                </li>
              ) : null}

              {/* Recent — the unified cross-project list (the active location
                  first), spanning every registered project the way every editor
                  does; where the user has actually been, not the whole map. */}
              {recentRows.length > 0 && (
                <>
                  {showSectionLabels && (
                    <li className={DROPDOWN_SECTION_LABEL_CLASS} aria-hidden>
                      Recent
                    </li>
                  )}
                  {recentRows.map((recent) => renderRecentRow(recent))}
                </>
              )}

              {/* This project's worktrees — a disclosure over the full set. When the
                  active project's /map is loading or failed (e.g. a moved worktree),
                  the LIST is unavailable but the project switcher below stays usable;
                  we show a friendly sub-state here, never the raw engine message. */}
              {showWorktreeArea &&
                (hasWorktrees ? (
                  <>
                    {renderAllToggleRow()}
                    {allOpen &&
                      rows.map((row) =>
                        renderWorktreeRow(row, `all:${row.worktree.id}`),
                      )}
                  </>
                ) : mapLoading ? (
                  <li
                    className="px-fg-2 py-fg-0-5 text-caption text-ink-muted"
                    data-worktree-loading
                  >
                    Loading worktrees…
                  </li>
                ) : (
                  <li
                    className="flex items-center justify-between gap-fg-1 px-fg-2 py-fg-0-5 text-caption text-ink-muted"
                    data-worktree-error
                  >
                    <span className="min-w-0 truncate">
                      This project’s worktrees couldn’t be loaded.
                    </span>
                    <button
                      type="button"
                      onClick={retry}
                      className="shrink-0 rounded-fg-xs underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                    >
                      Retry
                    </button>
                  </li>
                ))}

              {/* Projects — switch between registered project roots, so multiple
                  "main" folders are identifiable and the add-project flow is
                  reversible (only shown when more than one project is registered). */}
              {showProjects && (
                <>
                  <li className={DROPDOWN_SECTION_LABEL_CLASS} aria-hidden>
                    Projects
                  </li>
                  {projectRows.map((project) => renderProjectRow(project))}
                </>
              )}

              {pickerView.singleScopeLabel && (
                <li className={pickerView.singleScopeClassName} data-worktree-single>
                  {pickerView.singleScopeLabel}
                </li>
              )}
            </ul>
          </Popover>
        )}
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
