import { useCallback, useMemo } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

import {
  deriveWorkspaceMapPickerPresentationView,
  deriveWorktreePickerProjectRows,
  deriveWorktreePickerRecentRows,
  isSessionMutationRejected,
  isSupersededScopeSwitch,
  type WorkspaceMapPickerRowView,
  type WorkspaceMapPickerPresentationView,
  type WorkspaceMapSurfaceState,
  type WorktreePickerProjectRowView,
  type WorktreePickerRecentRowView,
  useActivateWorktreeScope,
  useActiveScope,
  useActiveWorkspace,
  useClearRecents,
  useRemoveRecent,
  useSession,
  useSwapWorkspace,
  useWorkspaceMapSurface,
  useWorkspaceRoots,
} from "../server/queries";
import type { RecentScope } from "../server/engine";
import { useShellPanelIntent } from "../server/panelStateIntent";

// Worktree picker chrome state. The accepted scope/workspace is still session
// state, applied through stores/server queries + viewStore wholesale resets; this
// store only owns the visual disclosure and transient switch feedback.
export interface WorktreePickerChromeState {
  expanded: boolean;
  keyboardToggle: boolean;
  pendingId: string | null;
  switchError: string | null;
  setExpanded: (expanded: unknown, viaKeyboard: unknown) => void;
  toggleExpanded: (viaKeyboard: unknown) => void;
  beginSwitch: (id: unknown) => void;
  completeSwitch: (id: unknown) => void;
  cancelSwitch: (id: unknown) => void;
  failSwitch: (id: unknown, message: unknown) => void;
  reset: () => void;
}

export type WorktreeSwitchFailureKind = "selection-rejected" | "persist-failed";
export const WORKTREE_SWITCH_ID_CAP = 512;
export const WORKTREE_SWITCH_ERROR_CAP = 240;
export const WORKTREE_SWITCH_LABEL_CAP = 96;

const RESET_STATE = {
  expanded: false,
  keyboardToggle: false,
  pendingId: null,
  switchError: null,
};

export function normalizeWorktreePickerBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function normalizeWorktreePickerSwitchId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const normalized = id.trim();
  return normalized.length > 0 && normalized.length <= WORKTREE_SWITCH_ID_CAP
    ? normalized
    : null;
}

export function normalizeWorktreePickerSwitchError(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  return normalized.length > WORKTREE_SWITCH_ERROR_CAP
    ? `${normalized.slice(0, WORKTREE_SWITCH_ERROR_CAP - 1)}…`
    : normalized;
}

export function normalizeWorktreePickerSwitchLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  return normalized.length > WORKTREE_SWITCH_LABEL_CAP
    ? `${normalized.slice(0, WORKTREE_SWITCH_LABEL_CAP - 1)}…`
    : normalized;
}

function isWorktreePickerRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export interface WorktreePickerActivationIntent {
  id: string;
  branch: unknown;
}

export function normalizeWorktreePickerActivationIntent(
  row: unknown,
): WorktreePickerActivationIntent | null {
  if (!isWorktreePickerRecord(row) || row.selectable !== true) return null;
  const worktree = row.worktree;
  if (!isWorktreePickerRecord(worktree)) return null;
  const id = normalizeWorktreePickerSwitchId(worktree.id);
  return id === null ? null : { id, branch: worktree.branch };
}

export const useWorktreePickerChromeStore = create<WorktreePickerChromeState>(
  (set) => ({
    ...RESET_STATE,
    setExpanded: (expanded, viaKeyboard) =>
      set((state) => {
        const nextExpanded = normalizeWorktreePickerBoolean(expanded);
        const keyboardToggle = normalizeWorktreePickerBoolean(viaKeyboard);
        if (nextExpanded === null || keyboardToggle === null) return state;
        const current = normalizeWorktreePickerChromeView(state);
        return current.expanded === nextExpanded &&
          current.keyboardToggle === keyboardToggle
          ? state
          : { expanded: nextExpanded, keyboardToggle };
      }),
    toggleExpanded: (viaKeyboard) =>
      set((state) => {
        const keyboardToggle = normalizeWorktreePickerBoolean(viaKeyboard) ?? false;
        const current = normalizeWorktreePickerChromeView(state);
        return {
          expanded: !current.expanded,
          keyboardToggle,
        };
      }),
    beginSwitch: (pendingId) => {
      const id = normalizeWorktreePickerSwitchId(pendingId);
      if (id === null) return;
      set({
        pendingId: id,
        switchError: null,
        expanded: false,
        keyboardToggle: true,
      });
    },
    completeSwitch: (id) => {
      const normalized = normalizeWorktreePickerSwitchId(id);
      if (normalized === null) return;
      set((state) =>
        normalizeWorktreePickerSwitchId(state.pendingId) === normalized
          ? { pendingId: null }
          : state,
      );
    },
    cancelSwitch: (id) => {
      const normalized = normalizeWorktreePickerSwitchId(id);
      if (normalized === null) return;
      set((state) =>
        normalizeWorktreePickerSwitchId(state.pendingId) === normalized
          ? { pendingId: null }
          : state,
      );
    },
    failSwitch: (id, switchError) => {
      const normalized = normalizeWorktreePickerSwitchId(id);
      const message = normalizeWorktreePickerSwitchError(switchError);
      if (normalized === null || message === null) return;
      set((state) =>
        normalizeWorktreePickerSwitchId(state.pendingId) === normalized
          ? { pendingId: null, switchError: message }
          : state,
      );
    },
    reset: () => set(RESET_STATE),
  }),
);

export interface WorktreePickerChromeView {
  expanded: boolean;
  keyboardToggle: boolean;
  pendingId: string | null;
  switchError: string | null;
  listClassName: string;
  switchErrorClassName: string;
}

const WORKTREE_PICKER_LIST_BASE_CLASS = "mt-fg-1 space-y-fg-0-5";
const WORKTREE_PICKER_LIST_ANIMATION_CLASS = "animate-slide-in-down";
const WORKTREE_PICKER_SWITCH_ERROR_CLASS =
  "mt-fg-1 px-fg-1 text-caption text-state-broken";

export function normalizeWorktreePickerChromeView(
  value: unknown,
): WorktreePickerChromeView {
  const state = isWorktreePickerRecord(value) ? value : {};
  return {
    expanded: normalizeWorktreePickerBoolean(state.expanded) ?? false,
    keyboardToggle: normalizeWorktreePickerBoolean(state.keyboardToggle) ?? false,
    pendingId: normalizeWorktreePickerSwitchId(state.pendingId),
    switchError: normalizeWorktreePickerSwitchError(state.switchError),
    listClassName: worktreePickerListClassName(state.keyboardToggle),
    switchErrorClassName: WORKTREE_PICKER_SWITCH_ERROR_CLASS,
  };
}

export function worktreePickerListClassName(keyboardToggle: unknown): string {
  return normalizeWorktreePickerBoolean(keyboardToggle) === true
    ? WORKTREE_PICKER_LIST_BASE_CLASS
    : `${WORKTREE_PICKER_LIST_BASE_CLASS} ${WORKTREE_PICKER_LIST_ANIMATION_CLASS}`;
}

export function worktreePickerFirstRowFocusTarget(
  rows: readonly WorkspaceMapPickerRowView[],
): string | null {
  return normalizeWorktreePickerSwitchId(rows[0]?.worktree.id);
}

export function worktreePickerRowKeyboardTarget(
  rows: readonly WorkspaceMapPickerRowView[],
  index: unknown,
  key: unknown,
): string | null {
  if (key !== "ArrowDown" && key !== "ArrowUp") return null;
  if (typeof index !== "number" || !Number.isInteger(index) || rows.length === 0) {
    return null;
  }
  const delta = key === "ArrowDown" ? 1 : -1;
  const next = Math.min(rows.length - 1, Math.max(0, index + delta));
  return normalizeWorktreePickerSwitchId(rows[next]?.worktree.id);
}

export function useWorktreePickerChrome(): WorktreePickerChromeView {
  return useWorktreePickerChromeStore(
    useShallow((state) => normalizeWorktreePickerChromeView(state)),
  );
}

const EMPTY_RECENT_SCOPES: readonly RecentScope[] = [];

/** The cross-project history model + actions, shared by the worktree picker's
 *  Recent section AND the standalone project navigator popup. One seam owns the
 *  history derivation, the switch lifecycle, and the CRUD mutations so both
 *  surfaces behave identically (and the same switch chrome drives pending/error). */
export interface ProjectHistoryView {
  recentRows: WorktreePickerRecentRowView[];
  /** Activate a recent: same-project → worktree switch; cross-project → workspace
   *  swap to that (project, scope). */
  activateRecent: (
    recent: WorktreePickerRecentRowView,
    onAccepted?: () => void,
  ) => void;
  /** Remove ONE entry from the history (CRUD). */
  removeRecent: (recent: WorktreePickerRecentRowView) => void;
  /** Clear the WHOLE history (CRUD). */
  clearRecents: () => void;
  /** The durable worktree-switch lifecycle (also used by the picker's /map rows). */
  runScopeSwitch: (id: string, branch: unknown) => void;
}

export function useProjectHistory(): ProjectHistoryView {
  const session = useSession();
  const recentScopes = session.data?.recent_scopes ?? EMPTY_RECENT_SCOPES;
  const roots = useWorkspaceRoots();
  const activeWorkspace = useActiveWorkspace();
  const activeScope = useActiveScope();
  const { swap } = useSwapWorkspace();
  const activateWorktreeScope = useActivateWorktreeScope();
  const removeRecentMut = useRemoveRecent();
  const clearRecentsMut = useClearRecents();

  const recentRows = useMemo(
    () =>
      deriveWorktreePickerRecentRows({
        recentScopes,
        roots,
        activeWorkspace,
        activeScope,
      }),
    [recentScopes, roots, activeWorkspace, activeScope],
  );

  // The durable worktree-switch lifecycle, shared by a /map row click and a
  // same-project recent: the engine records the global recent on the active_scope
  // PUT, so the picker fires no recents write of its own.
  const runScopeSwitch = useCallback(
    (id: string, branch: unknown) => {
      const switchPromise = activateWorktreeScope(id);
      beginWorktreeSwitch(id);
      void switchPromise
        .then(() => {
          completeWorktreeSwitch(id);
        })
        .catch((err: unknown) => {
          if (isSupersededScopeSwitch(err)) {
            cancelWorktreeSwitch(id);
            return;
          }
          failWorktreeSwitch(
            id,
            branch,
            isSessionMutationRejected(err) ? "selection-rejected" : "persist-failed",
          );
        });
    },
    [activateWorktreeScope],
  );

  const activateRecent = useCallback(
    (recent: WorktreePickerRecentRowView, onAccepted?: () => void) => {
      if (!recent.selectable) return;
      onAccepted?.();
      if (recent.sameProject) {
        runScopeSwitch(recent.scope, recent.worktreeName);
      } else {
        // A cross-project recent: swap the workspace AND land on the recent's scope.
        void swap(recent.workspace, recent.scope).catch(() => undefined);
      }
    },
    [runScopeSwitch, swap],
  );

  const removeRecent = useCallback(
    (recent: WorktreePickerRecentRowView) => {
      void removeRecentMut({ workspace: recent.workspace, scope: recent.scope });
    },
    [removeRecentMut],
  );
  const clearRecents = useCallback(() => {
    void clearRecentsMut();
  }, [clearRecentsMut]);

  return { recentRows, activateRecent, removeRecent, clearRecents, runScopeSwitch };
}

export interface WorktreePickerView extends WorktreePickerChromeView {
  state: WorkspaceMapSurfaceState;
  pickerView: WorkspaceMapPickerPresentationView;
  /** The unified cross-project "Recent" rows (machine-global, attributed per
   *  project), the active location first. */
  recentRows: WorktreePickerRecentRowView[];
  /** The registered project roots (multi-project identity), or empty when a
   *  single project is registered (the section then hides). */
  projectRows: WorktreePickerProjectRowView[];
  retry: () => void;
  activateRow: (row: unknown, onAccepted?: () => void) => void;
  /** Activate a cross-project recent: a same-project entry is a worktree switch,
   *  a different-project entry is a workspace swap to that (project, scope). */
  activateRecent: (
    recent: WorktreePickerRecentRowView,
    onAccepted?: () => void,
  ) => void;
  /** Switch to a different registered PROJECT (workspace-level wholesale reset). */
  swapProject: (id: unknown, onAccepted?: () => void) => void;
  collapseLeftRail: () => void;
}

/**
 * Stores/view seam for the worktree picker. It composes the workspace-map read,
 * active scope, switch chrome, and durable activation lifecycle so the app
 * component stays a DOM keyboard/focus consumer of one picker model.
 */
export function useWorktreePickerView(): WorktreePickerView {
  const { map, availability, state } = useWorkspaceMapSurface();
  const activeScope = useActiveScope();
  const panelIntent = useShellPanelIntent(activeScope);
  const chrome = useWorktreePickerChrome();
  // The cross-project history (Recent section) + the durable switch lifecycle are
  // owned by the shared `useProjectHistory` seam (also used by the navigator). The
  // registry roots drive the "Projects" section (multi-project identity).
  const { recentRows, activateRecent, runScopeSwitch } = useProjectHistory();
  const roots = useWorkspaceRoots();
  const activeWorkspace = useActiveWorkspace();
  const { swap } = useSwapWorkspace();
  const pickerView = useMemo(
    () =>
      deriveWorkspaceMapPickerPresentationView({
        map: map.data,
        activeScope,
        pendingId: chrome.pendingId,
        availability,
      }),
    [activeScope, availability, chrome.pendingId, map.data],
  );
  const projectRows = useMemo(
    () => deriveWorktreePickerProjectRows(roots, activeWorkspace),
    [roots, activeWorkspace],
  );

  const activateRow = useCallback(
    (row: unknown, onAccepted?: () => void) => {
      const intent = normalizeWorktreePickerActivationIntent(row);
      if (intent === null) return;
      onAccepted?.();
      runScopeSwitch(intent.id, intent.branch);
    },
    [runScopeSwitch],
  );
  const swapProject = useCallback(
    (id: unknown, onAccepted?: () => void) => {
      const normalized = normalizeWorktreePickerSwitchId(id);
      if (normalized === null || normalized === activeWorkspace) return;
      onAccepted?.();
      void swap(normalized).catch(() => undefined);
    },
    [swap, activeWorkspace],
  );
  const collapseLeftRail = useCallback(() => {
    void panelIntent.setLeftCollapsed(true).catch(() => undefined);
  }, [panelIntent]);

  return {
    ...chrome,
    state,
    pickerView,
    recentRows,
    projectRows,
    retry: map.retry,
    activateRow,
    activateRecent,
    swapProject,
    collapseLeftRail,
  };
}

export function setWorktreePickerExpanded(
  expanded: unknown,
  viaKeyboard: unknown,
): void {
  useWorktreePickerChromeStore.getState().setExpanded(expanded, viaKeyboard);
}

export function toggleWorktreePickerExpanded(viaKeyboard: unknown): void {
  useWorktreePickerChromeStore.getState().toggleExpanded(viaKeyboard);
}

export function beginWorktreeSwitch(id: unknown): void {
  useWorktreePickerChromeStore.getState().beginSwitch(id);
}

export function completeWorktreeSwitch(id: unknown): void {
  useWorktreePickerChromeStore.getState().completeSwitch(id);
}

export function cancelWorktreeSwitch(id: unknown): void {
  useWorktreePickerChromeStore.getState().cancelSwitch(id);
}

export function worktreeSwitchFailureMessage(
  branch: unknown,
  kind: WorktreeSwitchFailureKind,
): string {
  const label = normalizeWorktreePickerSwitchLabel(branch) ?? "worktree";
  return kind === "selection-rejected"
    ? `could not switch to ${label} - selection not saved`
    : "could not persist the worktree switch";
}

export function failWorktreeSwitch(
  id: unknown,
  branch: unknown,
  kind: WorktreeSwitchFailureKind,
): void {
  useWorktreePickerChromeStore
    .getState()
    .failSwitch(id, worktreeSwitchFailureMessage(branch, kind));
}

export function resetWorktreePickerChrome(): void {
  useWorktreePickerChromeStore.getState().reset();
}
