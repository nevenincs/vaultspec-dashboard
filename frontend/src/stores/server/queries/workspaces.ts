// Auto-split from queries.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the queries barrel; see ./index.ts.

import {
  deriveSessionIntentBootHealIntent,
  isSessionIntentStale,
  readSessionIntentTouch,
  stampSessionIntentTouch,
} from "../../view/sessionIntentFreshness";
import { movePlayhead } from "../../view/timelineIntent";
import { useViewStore } from "../../view/viewStore";
import type { AddProjectIssue } from "../../addProjectIssue";
import {
  dashboardSelectionId,
  patchDashboardState,
  selectionPatch,
} from "../dashboardState";
import {
  EngineError,
  engineClient,
  readTierAvailability,
  tiersFromQuery,
  type MapResponse,
  type MapWorktree,
  type RecentScope,
  type SessionState,
  type TierAvailability,
  type TiersBlock,
  type WorkspaceRoot,
  type WorkspacesState,
} from "../engine";
import { queryClient as defaultQueryClient } from "../queryClient";
import { errorRecoveryRefetchInterval } from "../queryCadence";
import { normalizeStoreScope } from "../scopeIdentity";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  createCountMessageDescriptor,
  type CountMessageDescriptor,
  type MessageDescriptor,
} from "../../../platform/localization/message";
import { useDashboardState } from "./dashboard";
import {
  engineKeys,
  refreshAfterAcceptedScopeSwitch,
  refreshAfterAcceptedWorkspaceSwitch,
  withManualRetry,
} from "./internal";
import { usePutSession, useSession } from "./settings";

export function useWorkspaceMap() {
  const query = useQuery({
    queryKey: engineKeys.map(),
    queryFn: () => engineClient.map(),
    refetchInterval: errorRecoveryRefetchInterval,
  });
  return withManualRetry(query);
}

/** The map's default corpus-bearing worktree for cold-start active-scope fallback. */
export function mapDefaultScope(
  map: ReturnType<typeof useWorkspaceMap>,
): string | null {
  for (const repo of map.data?.repositories ?? []) {
    const preferred =
      repo.worktrees.find((w) => w.is_default && w.has_vault) ??
      repo.worktrees.find((w) => w.has_vault);
    if (preferred) return preferred.id;
  }
  return null;
}

export function deriveActiveScope(
  picked: string | null,
  persisted: string | null | undefined,
  fallback: string | null,
): string | null {
  if (picked) return picked;
  if (persisted) return persisted;
  return fallback;
}

export function useActiveScope(): string | null {
  const picked = useViewStore((s) => s.scope);
  const map = useWorkspaceMap();
  const session = useSession();

  const persisted = session.data?.active_scope || null;
  const fallback = mapDefaultScope(map);

  return useMemo(
    () => deriveActiveScope(picked, persisted, fallback),
    [picked, persisted, fallback],
  );
}

export type WorkspaceMapAvailability = TierAvailability;

const WORKSPACE_MAP_TIERS = ["structural"] as const;
export type WorkspaceMapSurfaceState = "loading" | "error" | "ready";

export type WorkspaceIdentityText = string | MessageDescriptor;

export const WORKSPACE_IDENTITY_MESSAGES = {
  addProject: { key: "projects:workspaceIdentity.actions.addProject" },
  choose: { key: "projects:workspaceIdentity.accessibility.choose" },
  clearHistory: { key: "projects:workspaceIdentity.actions.clearHistory" },
  collapseNavigation: {
    key: "projects:workspaceIdentity.actions.collapseNavigation",
  },
  degraded: { key: "projects:workspaceIdentity.states.degraded" },
  default: { key: "projects:workspaceIdentity.labels.default" },
  list: { key: "projects:workspaceIdentity.accessibility.worktreeList" },
  loading: { key: "projects:workspaceIdentity.states.loading" },
  noProjectFiles: { key: "projects:workspaceIdentity.labels.noProjectFiles" },
  noProjectName: { key: "projects:workspaceIdentity.labels.noProjectName" },
  noRecent: { key: "projects:workspaceIdentity.states.noRecent" },
  noWorktreeName: { key: "projects:workspaceIdentity.labels.noWorktreeName" },
  noWorktrees: { key: "projects:workspaceIdentity.states.noWorktrees" },
  noWorktreesWithProjectFiles: {
    key: "projects:workspaceIdentity.states.noWorktreesWithProjectFiles",
  },
  onlyWorktree: { key: "projects:workspaceIdentity.states.onlyWorktree" },
  openProject: { key: "projects:workspaceIdentity.actions.openProject" },
  projects: { key: "projects:workspaceIdentity.sections.projects" },
  recent: { key: "projects:workspaceIdentity.sections.recent" },
  recentProjects: { key: "projects:workspaceIdentity.accessibility.recentProjects" },
  removeFromHistory: {
    key: "projects:workspaceIdentity.actions.removeFromHistory",
  },
  retry: { key: "projects:workspaceIdentity.actions.retry" },
  switchFailed: { key: "projects:workspaceIdentity.states.switchFailed" },
  switching: { key: "projects:workspaceIdentity.labels.switching" },
  uncommittedChanges: {
    key: "projects:workspaceIdentity.labels.uncommittedChanges",
  },
  switchProjectDescription: {
    key: "projects:workspaceIdentity.descriptions.switchProject",
  },
  switchProjectTitle: { key: "projects:workspaceIdentity.titles.switchProject" },
  switchWorkspaceTitle: {
    key: "projects:workspaceIdentity.titles.switchWorkspace",
  },
  thisProjectWorktrees: {
    key: "projects:workspaceIdentity.labels.thisProjectWorktrees",
  },
  worktrees: { key: "projects:workspaceIdentity.sections.worktrees" },
  worktreesFailed: { key: "projects:workspaceIdentity.states.worktreesFailed" },
} as const satisfies Record<string, MessageDescriptor>;

export function workspaceAheadMessage(count: number): CountMessageDescriptor | null {
  return createCountMessageDescriptor("projects:workspaceIdentity.counts.ahead", count);
}

export function workspaceBehindMessage(count: number): CountMessageDescriptor | null {
  return createCountMessageDescriptor(
    "projects:workspaceIdentity.counts.behind",
    count,
  );
}

export interface WorkspaceMapPickerRowView {
  worktreeId: string;
  branch: string;
  hasVault: boolean;
  selectable: boolean;
  isActive: boolean;
  isPending: boolean;
  isDegraded: boolean;
  rowClassName: string;
  activeCueClassName: string;
  nameLabel: WorkspaceIdentityText;
  branchLabel: string | null;
  branchClassName: string;
  badgeClassName: string;
  degradedIconClassName: string;
  pendingLabelClassName: string;
  title: MessageDescriptor;
  ariaLabel: MessageDescriptor;
  defaultLabel: MessageDescriptor | null;
  noVaultLabel: MessageDescriptor | null;
  degradedTitle: MessageDescriptor;
  pendingLabel: MessageDescriptor | null;
}

export interface WorkspaceMapPickerHeadlineView {
  branch: string;
  dirty: boolean;
  ahead: number;
  behind: number;
}

export interface WorkspaceMapPickerPresentationView {
  /** The FULL ordered worktree set of the ACTIVE project (the worktree
   *  disclosure). The cross-project "Recent" section is derived separately from
   *  the session recents, not from this `/map` projection. */
  rows: WorkspaceMapPickerRowView[];
  /** Label for the active project's worktree disclosure, naming the project so
   *  the count is never read machine-wide. */
  allLabel: MessageDescriptor;
  /** The active PROJECT's display name (threaded from the registry), or null
   *  before the registry resolves. */
  projectLabel: string | null;
  headline: WorkspaceMapPickerHeadlineView | null;
  pending: boolean;
  triggerLabel: WorkspaceIdentityText;
  triggerAriaLabel: MessageDescriptor;
  triggerClassName: string;
  triggerLabelClassName: string;
  triggerIconClassName: string;
  loadingLabel: MessageDescriptor;
  loadingClassName: string;
  errorLabel: MessageDescriptor;
  errorRootClassName: string;
  errorLabelClassName: string;
  retryLabel: MessageDescriptor;
  retryAriaLabel: MessageDescriptor;
  retryButtonClassName: string;
  degradedLabel: MessageDescriptor | null;
  degradedClassName: string;
  listAriaLabel: MessageDescriptor;
  emptyLabel: MessageDescriptor | null;
  emptyClassName: string;
  singleScopeLabel: MessageDescriptor | null;
  singleScopeClassName: string;
}

const WORKSPACE_MAP_PICKER_LOADING_CLASS =
  "px-fg-1 py-fg-0-5 text-label text-ink-faint";
const WORKSPACE_MAP_PICKER_ERROR_ROOT_CLASS = "space-y-fg-1 px-fg-1 py-fg-0-5";
const WORKSPACE_MAP_PICKER_ERROR_LABEL_CLASS = "text-label text-state-broken";
const WORKSPACE_MAP_PICKER_RETRY_BUTTON_CLASS =
  "rounded-fg-xs text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const WORKSPACE_MAP_PICKER_TRIGGER_CLASS =
  "flex w-full items-center rounded-fg-xs py-fg-1 text-left transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const WORKSPACE_MAP_PICKER_TRIGGER_LABEL_BASE_CLASS =
  "min-w-0 flex-1 truncate text-left text-body-strong";
const WORKSPACE_MAP_PICKER_TRIGGER_ICON_CLASS = "shrink-0 text-ink-faint";
const WORKSPACE_MAP_PICKER_DEGRADED_CLASS =
  "mt-fg-1 rounded-fg-xs bg-accent-subtle/40 px-fg-1 py-fg-0-5 text-caption text-ink-muted";
const WORKSPACE_MAP_PICKER_EMPTY_CLASS = "px-fg-2 py-fg-1 text-label text-ink-faint";
const WORKSPACE_MAP_PICKER_SINGLE_SCOPE_CLASS =
  "px-fg-2 py-fg-0-5 text-caption text-ink-faint";
const WORKSPACE_MAP_PICKER_ROW_BASE_CLASS =
  "flex w-full select-text items-center gap-fg-1 rounded-fg-xs px-fg-2 py-fg-0-5 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const WORKSPACE_MAP_PICKER_ACTIVE_CUE_BASE_CLASS =
  "-ml-fg-1 h-3 w-0.5 shrink-0 rounded-full";
const WORKSPACE_MAP_PICKER_BRANCH_CLASS = "min-w-0 truncate";
const WORKSPACE_MAP_PICKER_BADGE_CLASS = "shrink-0 text-ink-faint";
const WORKSPACE_MAP_PICKER_DEGRADED_ICON_CLASS =
  "flex shrink-0 items-center text-state-stale";
const WORKSPACE_MAP_PICKER_PENDING_LABEL_CLASS =
  "ml-auto shrink-0 text-caption text-ink-faint";

export function deriveWorkspaceMapAvailability(
  tiers: TiersBlock | undefined,
): WorkspaceMapAvailability {
  return readTierAvailability(tiers, WORKSPACE_MAP_TIERS);
}

export function deriveWorkspaceMapSurfaceState(
  query: Pick<UseQueryResult<MapResponse>, "isPending" | "isError">,
  availability: WorkspaceMapAvailability,
): WorkspaceMapSurfaceState {
  if (query.isPending) return "loading";
  if (query.isError && !availability.degraded) return "error";
  return "ready";
}

/** Sort corpus-bearing worktrees first, defaults leading, bare refs last. */
export function orderWorkspaceMapWorktrees(
  worktrees: readonly MapWorktree[],
): MapWorktree[] {
  return [...worktrees].sort(
    (a, b) =>
      Number(b.has_vault) - Number(a.has_vault) ||
      Number(b.is_default ?? false) - Number(a.is_default ?? false) ||
      (a.branch < b.branch ? -1 : a.branch > b.branch ? 1 : 0),
  );
}

export function workspaceMapPickerRowClassName(state: {
  isActive: boolean;
  selectable: boolean;
}): string {
  const stateClass = state.isActive
    ? "bg-accent-subtle font-medium text-ink"
    : state.selectable
      ? "text-ink-muted hover:bg-paper-sunken hover:text-ink"
      : "cursor-not-allowed text-ink-faint/60";
  return `${WORKSPACE_MAP_PICKER_ROW_BASE_CLASS} ${stateClass}`;
}

export function workspaceMapPickerActiveCueClassName(isActive: boolean): string {
  return `${WORKSPACE_MAP_PICKER_ACTIVE_CUE_BASE_CLASS} ${
    isActive ? "bg-accent" : "bg-transparent"
  }`;
}

export function workspaceMapPickerTriggerLabelClassName(pending: boolean): string {
  return `${WORKSPACE_MAP_PICKER_TRIGGER_LABEL_BASE_CLASS} ${
    pending ? "text-ink-muted" : "text-ink"
  }`;
}

export function deriveWorkspaceMapPickerPresentationView({
  map,
  activeScope,
  pendingId,
  availability,
  projectLabel = null,
}: {
  map: MapResponse | undefined;
  activeScope: string | null;
  pendingId: string | null;
  availability: WorkspaceMapAvailability;
  /** The active project's display name from the registry (identity line). */
  projectLabel?: string | null;
}): WorkspaceMapPickerPresentationView {
  const worktrees = orderWorkspaceMapWorktrees(
    map?.repositories.flatMap((repo) => repo.worktrees) ?? [],
  );
  const selectableCount = worktrees.filter((worktree) => worktree.has_vault).length;
  const current = worktrees.find((worktree) => worktree.id === activeScope);
  const pending = pendingId !== null && pendingId !== activeScope;
  const pendingWorktree = pending
    ? worktrees.find((worktree) => worktree.id === pendingId)
    : undefined;
  const headlineWorktree = pendingWorktree ?? current;
  const headlineName =
    headlineWorktree && headlineWorktree.branch.trim().length > 0
      ? headlineWorktree.branch
      : null;

  const rows = worktrees.map((worktree) => {
    const selectable = worktree.has_vault;
    const isActive = worktree.id === activeScope;
    const isPending = pending && worktree.id === pendingId;
    const isDegraded = (worktree.degraded?.length ?? 0) > 0;
    const branch = worktree.branch;
    const hasBranch = branch.trim().length > 0;
    const name: WorkspaceIdentityText = hasBranch
      ? branch
      : WORKSPACE_IDENTITY_MESSAGES.noWorktreeName;
    const switchLabel: MessageDescriptor = hasBranch
      ? {
          key: "projects:workspaceIdentity.accessibility.switchWorktree",
          values: { worktree: branch },
        }
      : WORKSPACE_IDENTITY_MESSAGES.choose;
    const unavailableLabel: MessageDescriptor = hasBranch
      ? {
          key: "projects:workspaceIdentity.accessibility.unavailableWorktree",
          values: { worktree: branch },
        }
      : WORKSPACE_IDENTITY_MESSAGES.noProjectFiles;
    return {
      worktreeId: worktree.id,
      branch,
      hasVault: worktree.has_vault,
      selectable,
      isActive,
      isPending,
      isDegraded,
      rowClassName: workspaceMapPickerRowClassName({ isActive, selectable }),
      activeCueClassName: workspaceMapPickerActiveCueClassName(isActive),
      nameLabel: name,
      branchLabel: null,
      branchClassName: WORKSPACE_MAP_PICKER_BRANCH_CLASS,
      badgeClassName: WORKSPACE_MAP_PICKER_BADGE_CLASS,
      degradedIconClassName: WORKSPACE_MAP_PICKER_DEGRADED_ICON_CLASS,
      pendingLabelClassName: WORKSPACE_MAP_PICKER_PENDING_LABEL_CLASS,
      title: worktree.has_vault ? switchLabel : unavailableLabel,
      ariaLabel: worktree.has_vault ? switchLabel : unavailableLabel,
      defaultLabel: worktree.is_default ? WORKSPACE_IDENTITY_MESSAGES.default : null,
      noVaultLabel: worktree.has_vault
        ? null
        : WORKSPACE_IDENTITY_MESSAGES.noProjectFiles,
      degradedTitle: unavailableLabel,
      pendingLabel: isPending ? WORKSPACE_IDENTITY_MESSAGES.switching : null,
    };
  });

  return {
    rows,
    allLabel: projectLabel
      ? {
          key: "projects:workspaceIdentity.labels.worktreesInProject",
          values: { project: projectLabel },
        }
      : WORKSPACE_IDENTITY_MESSAGES.thisProjectWorktrees,
    projectLabel,
    headline: headlineWorktree
      ? {
          branch: headlineWorktree.branch,
          dirty: headlineWorktree.dirty === true,
          ahead: headlineWorktree.ahead ?? 0,
          behind: headlineWorktree.behind ?? 0,
        }
      : null,
    pending,
    triggerLabel: headlineName ?? WORKSPACE_IDENTITY_MESSAGES.noWorktreeName,
    triggerAriaLabel: headlineName
      ? projectLabel
        ? {
            key: pending
              ? "projects:workspaceIdentity.accessibility.currentLocationSwitchingInProject"
              : "projects:workspaceIdentity.accessibility.currentLocationInProject",
            values: { project: projectLabel, worktree: headlineName },
          }
        : {
            key: pending
              ? "projects:workspaceIdentity.accessibility.currentLocationSwitching"
              : "projects:workspaceIdentity.accessibility.currentLocation",
            values: { worktree: headlineName },
          }
      : WORKSPACE_IDENTITY_MESSAGES.choose,
    triggerClassName: WORKSPACE_MAP_PICKER_TRIGGER_CLASS,
    triggerLabelClassName: workspaceMapPickerTriggerLabelClassName(pending),
    triggerIconClassName: WORKSPACE_MAP_PICKER_TRIGGER_ICON_CLASS,
    loadingLabel: WORKSPACE_IDENTITY_MESSAGES.loading,
    loadingClassName: WORKSPACE_MAP_PICKER_LOADING_CLASS,
    errorLabel: WORKSPACE_IDENTITY_MESSAGES.worktreesFailed,
    errorRootClassName: WORKSPACE_MAP_PICKER_ERROR_ROOT_CLASS,
    errorLabelClassName: WORKSPACE_MAP_PICKER_ERROR_LABEL_CLASS,
    retryLabel: WORKSPACE_IDENTITY_MESSAGES.retry,
    retryAriaLabel: WORKSPACE_IDENTITY_MESSAGES.retry,
    retryButtonClassName: WORKSPACE_MAP_PICKER_RETRY_BUTTON_CLASS,
    degradedLabel: availability.degraded ? WORKSPACE_IDENTITY_MESSAGES.degraded : null,
    degradedClassName: WORKSPACE_MAP_PICKER_DEGRADED_CLASS,
    listAriaLabel: WORKSPACE_IDENTITY_MESSAGES.list,
    emptyLabel:
      worktrees.length === 0
        ? WORKSPACE_IDENTITY_MESSAGES.noWorktrees
        : selectableCount === 0
          ? WORKSPACE_IDENTITY_MESSAGES.noWorktreesWithProjectFiles
          : null,
    emptyClassName: WORKSPACE_MAP_PICKER_EMPTY_CLASS,
    singleScopeLabel:
      selectableCount === 1 && worktrees.length === 1
        ? WORKSPACE_IDENTITY_MESSAGES.onlyWorktree
        : null,
    singleScopeClassName: WORKSPACE_MAP_PICKER_SINGLE_SCOPE_CLASS,
  };
}

/** Stores hook: the workspace map's degradation, read through the wire client so
 *  the worktree switcher consumes derived truth instead of the raw `tiers`
 *  block. Mirrors `useVaultTreeAvailability`. */
export function useWorkspaceMapAvailability(): WorkspaceMapAvailability {
  return deriveWorkspaceMapAvailability(tiersFromQuery(useWorkspaceMap()));
}

export interface WorkspaceMapSurfaceView {
  map: UseQueryResult<MapResponse> & { retry: () => void };
  availability: WorkspaceMapAvailability;
  state: WorkspaceMapSurfaceState;
}

/**
 * Stores selector for the worktree switcher surface: one subscription owns both
 * the map payload and the loading/error/degraded classification. Chrome renders
 * the returned state; it does not decide whether a failure is a tiers-reported
 * degradation or a bare transport error.
 */
export function useWorkspaceMapSurface(): WorkspaceMapSurfaceView {
  const map = useWorkspaceMap();
  const availability = deriveWorkspaceMapAvailability(tiersFromQuery(map));
  return {
    map,
    availability,
    state: deriveWorkspaceMapSurfaceState(map, availability),
  };
}

/** Read the workspace registry and active-workspace id.
 *  Polls every 8 s while in error state so the picker self-heals after engine
 *  startup without a page reload (mirrors `useWorkspaceMap`). */
export function useWorkspaces() {
  return useQuery({
    queryKey: engineKeys.workspaces(),
    queryFn: () => engineClient.workspaces(),
    refetchInterval: errorRecoveryRefetchInterval,
  });
}

/**
 * The workspace registry's degradation truth, derived inside the stores layer so
 * the picker (chrome) never reads the raw `tiers` block (dashboard-layer-
 * ownership). The `/workspaces` enumeration is resolved by the engine's
 * structural read of each registered repository, so the `structural` tier gates
 * the registry's availability. Contract §2: a tier marked `available:false` OR
 * absent from the served block is a designed degraded state.
 */
export type WorkspacesAvailability = TierAvailability;

const WORKSPACES_TIERS = ["structural"] as const;

export function deriveWorkspacesAvailability(
  tiers: TiersBlock | undefined,
): WorkspacesAvailability {
  return readTierAvailability(tiers, WORKSPACES_TIERS);
}

/** One registered-project row in the worktree picker's "Projects" section
 *  (multi-project identity): the registered root's name + path, current marker,
 *  and reachability. Selecting a non-active reachable root swaps the whole
 *  workspace. Reuses the worktree-row class helpers so projects and worktrees
 *  read identically (design-system-is-centralized). */
export interface WorktreePickerProjectRowView {
  id: string;
  label: WorkspaceIdentityText;
  isActive: boolean;
  selectable: boolean;
  title: MessageDescriptor;
  ariaLabel: MessageDescriptor;
  rowClassName: string;
  activeCueClassName: string;
}

export function workspaceRootName(root: Pick<WorkspaceRoot, "label" | "path">): string {
  return root.label.trim().length > 0 ? root.label : "";
}

export function deriveWorktreePickerProjectRows(
  roots: readonly WorkspaceRoot[],
  activeWorkspace: string | null,
): WorktreePickerProjectRowView[] {
  return roots.map((root) => {
    const isActive = root.id === activeWorkspace;
    const authoredName = workspaceRootName(root);
    const name: WorkspaceIdentityText =
      authoredName.length > 0
        ? authoredName
        : WORKSPACE_IDENTITY_MESSAGES.noProjectName;
    const accessibleName: MessageDescriptor =
      authoredName.length > 0
        ? {
            key: "projects:workspaceIdentity.accessibility.switchProject",
            values: { project: authoredName },
          }
        : WORKSPACE_IDENTITY_MESSAGES.choose;
    return {
      id: root.id,
      label: name,
      isActive,
      selectable: root.reachable,
      title: root.reachable
        ? accessibleName
        : WORKSPACE_IDENTITY_MESSAGES.noProjectFiles,
      ariaLabel: root.reachable
        ? accessibleName
        : WORKSPACE_IDENTITY_MESSAGES.noProjectFiles,
      rowClassName: workspaceMapPickerRowClassName({
        isActive,
        selectable: root.reachable,
      }),
      activeCueClassName: workspaceMapPickerActiveCueClassName(isActive),
    };
  });
}

/** One row of the dropdown's cross-project "Recent" section: a worktree the
 *  operator navigated to, attributed to its project. Unlike a
 *  `WorkspaceMapPickerRowView` (built from the active project's `/map`), a recent
 *  may belong to ANOTHER registered project, so it is derived from the session's
 *  machine-global `recent_scopes` joined with the registry roots. */
export interface WorktreePickerRecentRowView {
  /** Stable key: `${workspace} ${scope}`. */
  key: string;
  workspace: string;
  scope: string;
  worktreeName: WorkspaceIdentityText;
  projectLabel: WorkspaceIdentityText;
  label: WorkspaceIdentityText;
  /** This entry is the current active (workspace, scope). */
  isActive: boolean;
  /** This entry belongs to the currently-active project. */
  sameProject: boolean;
  /** Reachable + switchable (its project root is reachable). */
  selectable: boolean;
  title: MessageDescriptor;
  ariaLabel: MessageDescriptor;
  rowClassName: string;
  activeCueClassName: string;
}

/** How many cross-project recents the dropdown surfaces (a shortlist, not the
 *  full bounded history the engine retains). */
export const WORKTREE_PICKER_RECENT_LIMIT = 8;

/**
 * Derive the unified cross-project "Recent" rows from the session's machine-global
 * `recent_scopes` (MRU pairs) joined with the registry roots for project naming.
 * The CURRENT (active workspace, active scope) is always prepended and marked
 * current, so the section is never empty and shows where you are at a glance.
 * Deduped by the (workspace, scope) pair and bounded to a shortlist.
 */
export function deriveWorktreePickerRecentRows({
  recentScopes,
  roots,
  activeWorkspace,
  activeScope,
  limit = WORKTREE_PICKER_RECENT_LIMIT,
}: {
  recentScopes: readonly RecentScope[];
  roots: readonly WorkspaceRoot[];
  activeWorkspace: string | null;
  activeScope: string | null;
  limit?: number;
}): WorktreePickerRecentRowView[] {
  const rootById = new Map(roots.map((root) => [root.id, root] as const));
  const keyOf = (workspace: string, scope: string) => `${workspace} ${scope}`;
  const seen = new Set<string>();
  const ordered: Array<{ workspace: string; scope: string }> = [];
  const push = (workspace: unknown, scope: unknown) => {
    if (typeof workspace !== "string" || typeof scope !== "string") return;
    if (workspace.length === 0 || scope.length === 0) return;
    const key = keyOf(workspace, scope);
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push({ workspace, scope });
  };
  // The current location is always the first recent (marked current below).
  if (activeWorkspace && activeScope) push(activeWorkspace, activeScope);
  for (const entry of recentScopes) push(entry.workspace, entry.scope);

  return ordered.slice(0, Math.max(0, limit)).map(({ workspace, scope }) => {
    const root = rootById.get(workspace);
    const authoredProject = root ? workspaceRootName(root) : "";
    const projectLabel: WorkspaceIdentityText =
      authoredProject.length > 0
        ? authoredProject
        : WORKSPACE_IDENTITY_MESSAGES.noProjectName;
    const name: WorkspaceIdentityText = WORKSPACE_IDENTITY_MESSAGES.noWorktreeName;
    const isActive = workspace === activeWorkspace && scope === activeScope;
    const sameProject = workspace === activeWorkspace;
    const selectable = root?.reachable ?? true;
    return {
      key: keyOf(workspace, scope),
      workspace,
      scope,
      worktreeName: name,
      projectLabel,
      label: sameProject
        ? name
        : authoredProject.length > 0
          ? {
              key: "projects:workspaceIdentity.labels.unnamedWorktreeInProject",
              values: { project: authoredProject },
            }
          : WORKSPACE_IDENTITY_MESSAGES.noWorktreeName,
      isActive,
      sameProject,
      selectable,
      title:
        !sameProject && authoredProject.length > 0
          ? {
              key: "projects:workspaceIdentity.accessibility.switchUnnamedWorktreeInProject",
              values: { project: authoredProject },
            }
          : WORKSPACE_IDENTITY_MESSAGES.choose,
      ariaLabel:
        !sameProject && authoredProject.length > 0
          ? {
              key: "projects:workspaceIdentity.accessibility.switchUnnamedWorktreeInProject",
              values: { project: authoredProject },
            }
          : WORKSPACE_IDENTITY_MESSAGES.choose,
      rowClassName: workspaceMapPickerRowClassName({ isActive, selectable }),
      activeCueClassName: workspaceMapPickerActiveCueClassName(isActive),
    };
  });
}

/** Stores hook: the workspace registry's degradation, read through the wire
 *  client so the picker consumes derived truth instead of the raw `tiers`
 *  block. */
export function useWorkspacesAvailability(): WorkspacesAvailability {
  return deriveWorkspacesAvailability(tiersFromQuery(useWorkspaces()));
}

/** Stores selector: the active workspace's id (from the registry's
 *  `active_workspace`), or null when none is selected yet. The picker reads this
 *  to mark the current root. */
export function useActiveWorkspace(): string | null {
  return useWorkspaces().data?.active_workspace ?? null;
}

/** Stores selector: the registered roots, or an empty list while loading /
 *  errored. Pure projection over the registry query for the picker. */
export function useWorkspaceRoots(): WorkspaceRoot[] {
  return useWorkspaces().data?.workspaces ?? [];
}

export function useSwapWorkspace() {
  const queryClient = useQueryClient();
  const putSession = usePutSession();
  const swap = (workspace: unknown, scope: unknown = null) => {
    const intent = normalizeWorkspaceSwitchIntent(workspace, scope);
    requestedWorkspaceSwitch = intent;
    const run = activeWorkspaceSwitchTail
      .catch(() => undefined)
      .then(async () => {
        const supersededBeforeWrite = supersededWorkspaceSwitch(intent);
        if (supersededBeforeWrite) throw supersededBeforeWrite;
        // Durably persist the active-workspace selection AND the new active
        // scope (the new project's default worktree) in one config write. Persisting
        // the workspace alone left the served/persisted active_scope dangling on the
        // prior project's worktree, so the browser kept showing the old corpus after
        // a switch (live verification finding H4). Local state moves only from the
        // accepted session response.
        try {
          const res = await putSession.mutateAsync(
            intent.scope !== null
              ? { active_workspace: intent.workspace, active_scope: intent.scope }
              : { active_workspace: intent.workspace },
          );
          const supersededAfterWrite = supersededWorkspaceSwitch(intent);
          if (supersededAfterWrite) throw supersededAfterWrite;
          applyAcceptedWorkspaceSwitch(res, intent, queryClient);
          clearWorkspaceSwitchIntent(intent);
          return res;
        } catch (error) {
          const superseded = supersededWorkspaceSwitch(intent);
          if (superseded) throw superseded;
          clearWorkspaceSwitchIntent(intent);
          throw error;
        }
      });
    activeWorkspaceSwitchTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  return { swap, mutation: putSession };
}

export type AddWorkspaceOutcome =
  | { ok: true; workspace: WorkspaceRoot | null }
  | { ok: false; issue: AddProjectIssue };

export function classifyAddWorkspaceError(error: unknown): AddProjectIssue {
  if (
    !(error instanceof EngineError) ||
    error.path !== "/session" ||
    error.status !== 400
  ) {
    return "addFailed";
  }
  switch (error.errorKind) {
    case "not_a_directory":
    case "unreadable":
      return "folderUnavailable";
    case "not_a_git_workspace":
      return "notGitProject";
    case "already_registered":
      return "alreadyAdded";
    default:
      return "addFailed";
  }
}

export function useAddWorkspace() {
  const queryClient = useQueryClient();
  const putSession = usePutSession();
  const { swap } = useSwapWorkspace();
  const add = async (path: unknown): Promise<AddWorkspaceOutcome> => {
    const normalized = normalizeStoreScope(path);
    if (normalized === null) {
      return { ok: false, issue: "pathRequired" };
    }
    try {
      const before = new Set(
        (
          queryClient.getQueryData<WorkspacesState>(engineKeys.workspaces())
            ?.workspaces ?? []
        ).map((root) => root.id),
      );
      await putSession.mutateAsync({ add_workspace: normalized });
      const after = await queryClient.fetchQuery({
        queryKey: engineKeys.workspaces(),
        queryFn: () => engineClient.workspaces(),
      });
      const added = after.workspaces.find((root) => !before.has(root.id)) ?? null;
      if (added) await swap(added.id);
      return { ok: true, workspace: added };
    } catch (error: unknown) {
      return { ok: false, issue: classifyAddWorkspaceError(error) };
    }
  };
  return { add };
}

/**
 * Remove ONE entry from the machine-global cross-project recents (history CRUD):
 * the stores-layer seam the project navigator invokes to prune a single recent.
 * Rides the `PUT /session` config surface (`remove_recent_scope`), which
 * invalidates the session key so the history re-reads. Fire-and-forget by default
 * (a failed prune never blocks the UI), but returns the promise for callers that
 * want to await.
 */
export function useRemoveRecent(): (entry: RecentScope) => Promise<unknown> {
  const putSession = usePutSession();
  return (entry: RecentScope) => {
    const workspace = normalizeStoreScope(entry?.workspace);
    const scope = normalizeStoreScope(entry?.scope);
    if (workspace === null || scope === null) return Promise.resolve(undefined);
    return putSession
      .mutateAsync({ remove_recent_scope: { workspace, scope } })
      .catch(() => undefined);
  };
}

/** Clear the ENTIRE machine-global cross-project recents (history CRUD). Rides the
 *  `PUT /session` config surface (`clear_recent_scopes`). */
export function useClearRecents(): () => Promise<unknown> {
  const putSession = usePutSession();
  return () =>
    putSession.mutateAsync({ clear_recent_scopes: true }).catch(() => undefined);
}

export type WorkspaceSwitchIntent = {
  workspace: string;
  scope: string | null;
};

export function normalizeWorkspaceSwitchIntent(
  workspace: unknown,
  scope: unknown = null,
): WorkspaceSwitchIntent {
  const normalizedWorkspace = normalizeStoreScope(workspace);
  if (normalizedWorkspace === null) {
    throw new Error("workspace switch requires a non-empty workspace");
  }
  return {
    workspace: normalizedWorkspace,
    scope: normalizeStoreScope(scope),
  };
}

export function normalizeAcceptedWorkspaceSwitchState(
  session: Pick<SessionState, "active_workspace" | "active_scope">,
  intent: WorkspaceSwitchIntent,
): WorkspaceSwitchIntent {
  return {
    workspace: normalizeStoreScope(session.active_workspace) ?? intent.workspace,
    scope: normalizeStoreScope(session.active_scope) ?? intent.scope,
  };
}

export class SupersededWorkspaceSwitchError extends Error {
  readonly requestedWorkspace: string;
  readonly requestedScope: string | null;
  readonly supersededByWorkspace: string;
  readonly supersededByScope: string | null;

  constructor(requested: WorkspaceSwitchIntent, supersededBy: WorkspaceSwitchIntent) {
    super(
      `workspace switch to ${requested.workspace}/${requested.scope ?? ""} was superseded by ${supersededBy.workspace}/${supersededBy.scope ?? ""}`,
    );
    this.name = "SupersededWorkspaceSwitchError";
    this.requestedWorkspace = requested.workspace;
    this.requestedScope = requested.scope;
    this.supersededByWorkspace = supersededBy.workspace;
    this.supersededByScope = supersededBy.scope;
  }
}

export function isSupersededWorkspaceSwitch(
  error: unknown,
): error is SupersededWorkspaceSwitchError {
  return error instanceof SupersededWorkspaceSwitchError;
}

let requestedWorkspaceSwitch: WorkspaceSwitchIntent | null = null;
let activeWorkspaceSwitchTail: Promise<void> = Promise.resolve();

function sameWorkspaceSwitchIntent(
  left: WorkspaceSwitchIntent | null,
  right: WorkspaceSwitchIntent,
): boolean {
  return (
    left !== null && left.workspace === right.workspace && left.scope === right.scope
  );
}

function supersededWorkspaceSwitch(
  intent: WorkspaceSwitchIntent,
): SupersededWorkspaceSwitchError | null {
  return requestedWorkspaceSwitch !== null &&
    !sameWorkspaceSwitchIntent(requestedWorkspaceSwitch, intent)
    ? new SupersededWorkspaceSwitchError(intent, requestedWorkspaceSwitch)
    : null;
}

function clearWorkspaceSwitchIntent(intent: WorkspaceSwitchIntent): void {
  if (sameWorkspaceSwitchIntent(requestedWorkspaceSwitch, intent)) {
    requestedWorkspaceSwitch = null;
  }
}

function mirrorAcceptedSessionScopeContext(session: SessionState): void {
  useViewStore.getState().mirrorSessionScopeContext({
    folder: session.scope_context.folder,
    featureTags: session.scope_context.feature_tags,
  });
}

function applyAcceptedWorkspaceSwitch(
  session: SessionState,
  intent: WorkspaceSwitchIntent,
  queryClient: QueryClient,
): void {
  const accepted = normalizeAcceptedWorkspaceSwitchState(session, intent);
  useViewStore.getState().swapWorkspace(accepted.workspace, accepted.scope);
  mirrorAcceptedSessionScopeContext(session);
  // The PUT builds/warms the new scope server-side. Clear stale project reads
  // only after acceptance, then refetch now that the scope is warm so the
  // switch lands its corpus in-session (live verification finding H6).
  refreshAfterAcceptedWorkspaceSwitch(queryClient);
}

export function seedSessionCache(
  queryClient: QueryClient,
  session: SessionState,
): void {
  queryClient.setQueryData(engineKeys.session(), session);
  void queryClient.invalidateQueries({ queryKey: engineKeys.session() });
  void queryClient.invalidateQueries({ queryKey: engineKeys.workspaces() });
}

export class SupersededScopeSwitchError extends Error {
  readonly requestedScope: string;
  readonly supersededBy: string;

  constructor(requestedScope: string, supersededBy: string) {
    super(`scope switch to ${requestedScope} was superseded by ${supersededBy}`);
    this.name = "SupersededScopeSwitchError";
    this.requestedScope = requestedScope;
    this.supersededBy = supersededBy;
  }
}

export function isSupersededScopeSwitch(
  error: unknown,
): error is SupersededScopeSwitchError {
  return error instanceof SupersededScopeSwitchError;
}

let requestedActiveScope: string | null = null;
let activeScopeSwitchTail: Promise<void> = Promise.resolve();

export function normalizeActiveScopeSwitchScope(scope: unknown): string {
  const normalized = normalizeStoreScope(scope);
  if (normalized === null) {
    throw new Error("scope switch requires a non-empty scope");
  }
  return normalized;
}

function supersededScopeSwitch(scope: string): SupersededScopeSwitchError | null {
  return requestedActiveScope !== null && requestedActiveScope !== scope
    ? new SupersededScopeSwitchError(scope, requestedActiveScope)
    : null;
}

function applyAcceptedActiveScopeSwitch(
  session: SessionState,
  queryClient: QueryClient,
): void {
  seedSessionCache(queryClient, session);
  useViewStore.getState().setScope(session.active_scope);
  mirrorAcceptedSessionScopeContext(session);
  refreshAfterAcceptedScopeSwitch(queryClient);
}

/**
 * Stores-layer worktree scope switch: durable session persistence first, then the
 * local wholesale reset from the accepted active scope. Calls are serialized and
 * superseded requests are ignored at this seam, so a rapid A -> B click cannot
 * let A's later response re-apply stale graph/git/search scope after B became the
 * user's latest intent. Pure resolvers can call the imperative form; React
 * surfaces that need only the durable scope transition use `useSwitchActiveScope`
 * to bind their provider client. Worktree UI activation uses
 * `activateWorktreeScope`, which layers the accepted-scope live playhead reset on
 * top of this durable switch.
 */
export async function switchActiveScope(
  scope: unknown,
  queryClient: QueryClient = defaultQueryClient,
): Promise<SessionState> {
  const acceptedScope = normalizeActiveScopeSwitchScope(scope);
  requestedActiveScope = acceptedScope;
  const run = activeScopeSwitchTail
    .catch(() => undefined)
    .then(async () => {
      try {
        const session = await engineClient.putSession({ active_scope: acceptedScope });
        const superseded = supersededScopeSwitch(acceptedScope);
        if (superseded) throw superseded;
        applyAcceptedActiveScopeSwitch(session, queryClient);
        return session;
      } catch (error) {
        const superseded = supersededScopeSwitch(acceptedScope);
        if (superseded) throw superseded;
        throw error;
      }
    });
  activeScopeSwitchTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function useSwitchActiveScope(): (scope: unknown) => Promise<SessionState> {
  const queryClient = useQueryClient();
  return useCallback(
    (scope: unknown) => switchActiveScope(scope, queryClient),
    [queryClient],
  );
}

/**
 * Worktree activation intent: persist the accepted active scope first, then
 * dock dashboard time back to LIVE for that accepted scope. Row clicks and
 * context-menu actions use this single stores-layer transition so session and
 * timeline propagation cannot drift.
 */
export async function activateWorktreeScope(
  scope: unknown,
  queryClient: QueryClient = defaultQueryClient,
): Promise<SessionState> {
  const session = await switchActiveScope(scope, queryClient);
  movePlayhead("live", session.active_scope);
  return session;
}

export function useActivateWorktreeScope(): (scope: unknown) => Promise<SessionState> {
  const queryClient = useQueryClient();
  return useCallback(
    (scope: unknown) => activateWorktreeScope(scope, queryClient),
    [queryClient],
  );
}

export interface TimelineBootHealInput {
  scope: string | null;
  stateLoaded: boolean;
  isLive: boolean;
  alreadyHealed: boolean;
}

/**
 * Cold-start timeline healing (TTR-005): with time-travel ENTRY retired, the app
 * must always resolve to a LIVE playhead. A scope whose backend-persisted
 * `timeline_mode` is time-travel would otherwise load into a historical view with
 * no exit (the entry affordances are gone). This derives whether to force live:
 * the active scope's dashboard state has loaded, its persisted mode is NOT live,
 * and this scope has not already been healed this session. `activateWorktreeScope`
 * already heals on explicit worktree activation; this covers the cold-start
 * restore path, which persists a scope but never resets the playhead.
 */
export function deriveTimelineBootHealIntent({
  scope,
  stateLoaded,
  isLive,
  alreadyHealed,
}: TimelineBootHealInput): boolean {
  if (scope === null) return false;
  if (!stateLoaded) return false;
  if (isLive) return false;
  if (alreadyHealed) return false;
  return true;
}

/**
 * Force the dashboard playhead to LIVE once per scope on load (TTR-005). Mounted
 * once by the Stage: after time-travel entry was retired every scope must boot
 * live, so a persisted time-travel mode is healed to live exactly once. It is idempotent
 * with `activateWorktreeScope` (which also lands live: whichever fires first wins,
 * the other observes `live` and no-ops). One-shot per scope via a healed-set ref so
 * the heal cannot race the session seed or re-fire when its own write settles.
 */
export function useHealTimelineModeToLiveOnBoot(): void {
  const scope = useActiveScope();
  const dashboardState = useDashboardState(scope);
  const healedScopesRef = useRef<Set<string>>(new Set());

  const stateLoaded = dashboardState.data !== undefined;
  const isLive = (dashboardState.data?.timeline_mode?.kind ?? "live") === "live";

  useEffect(() => {
    const alreadyHealed = scope !== null && healedScopesRef.current.has(scope);
    if (
      scope === null ||
      !deriveTimelineBootHealIntent({ scope, stateLoaded, isLive, alreadyHealed })
    ) {
      return;
    }
    healedScopesRef.current.add(scope);
    movePlayhead("live", scope);
  }, [scope, stateLoaded, isLive]);
}

export function useHealStaleSessionIntentOnBoot(): void {
  const scope = useActiveScope();
  const dashboardState = useDashboardState(scope);
  const healedScopesRef = useRef<Set<string>>(new Set());

  const stateLoaded = dashboardState.data !== undefined;
  const hasSelection = (dashboardState.data?.selected_ids?.length ?? 0) > 0;
  const selectedId = dashboardSelectionId(dashboardState.data);

  useEffect(() => {
    if (scope === null || !stateLoaded) return;
    const alreadyHealed = healedScopesRef.current.has(scope);
    if (!alreadyHealed) {
      healedScopesRef.current.add(scope);
      const stale = isSessionIntentStale(readSessionIntentTouch(scope), Date.now());
      if (
        deriveSessionIntentBootHealIntent({
          scope,
          stateLoaded,
          hasSelection,
          stale,
          alreadyHealed,
        })
      ) {
        void patchDashboardState(scope, selectionPatch([])).catch(() => undefined);
      }
    }
    stampSessionIntentTouch(scope, Date.now());
  }, [scope, stateLoaded, hasSelection]);

  // Activity tracking: a selection CHANGE while mounted refreshes the scope's stamp,
  // so a long-open, actively-used tab never reads as absent on its next reload.
  useEffect(() => {
    if (scope === null || selectedId === null) return;
    stampSessionIntentTouch(scope, Date.now());
  }, [scope, selectedId]);
}
