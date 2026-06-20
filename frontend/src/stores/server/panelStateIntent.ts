import {
  normalizeDashboardPanelStateUpdate,
  normalizeDashboardStateWriteScope,
  useDashboardStateMutations,
} from "./dashboardState";

export interface ShellPanelIntent {
  setLeftCollapsed: (leftCollapsed: unknown) => Promise<unknown>;
  setRightCollapsed: (rightCollapsed: unknown) => Promise<unknown>;
  setRightTab: (rightTab: unknown) => Promise<unknown>;
}

export const normalizeShellPanelIntentScope = normalizeDashboardStateWriteScope;

/**
 * Stores-owned panel-state write seam for AppShell chrome. AppShell renders the
 * shell frame view and emits intent; it does not compose dashboard panel patches.
 */
export function useShellPanelIntent(scope: unknown): ShellPanelIntent {
  const normalizedScope = normalizeShellPanelIntentScope(scope);
  const mutations = useDashboardStateMutations(normalizedScope);
  const inert = () => Promise.resolve(null);
  return {
    setLeftCollapsed: (leftCollapsed) =>
      normalizedScope === null
        ? inert()
        : mutations.updatePanelState(
            normalizeDashboardPanelStateUpdate({ left_collapsed: leftCollapsed }),
          ),
    setRightCollapsed: (rightCollapsed) =>
      normalizedScope === null
        ? inert()
        : mutations.updatePanelState(
            normalizeDashboardPanelStateUpdate({ right_collapsed: rightCollapsed }),
          ),
    setRightTab: (rightTab) =>
      normalizedScope === null
        ? inert()
        : mutations.updatePanelState(
            normalizeDashboardPanelStateUpdate({ right_tab: rightTab }),
          ),
  };
}
