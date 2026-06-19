import type { DashboardPanelState } from "./engine";
import {
  normalizeDashboardPanelStateUpdate,
  useDashboardStateMutations,
} from "./dashboardState";

export interface ShellPanelIntent {
  setLeftCollapsed: (leftCollapsed: boolean) => Promise<unknown>;
  setRightCollapsed: (rightCollapsed: boolean) => Promise<unknown>;
  setRightTab: (rightTab: DashboardPanelState["right_tab"]) => Promise<unknown>;
}

/**
 * Stores-owned panel-state write seam for AppShell chrome. AppShell renders the
 * shell frame view and emits intent; it does not compose dashboard panel patches.
 */
export function useShellPanelIntent(scope: string | null): ShellPanelIntent {
  const mutations = useDashboardStateMutations(scope);
  const inert = () => Promise.resolve(null);
  return {
    setLeftCollapsed: (leftCollapsed) =>
      scope === null
        ? inert()
        : mutations.updatePanelState(
            normalizeDashboardPanelStateUpdate({ left_collapsed: leftCollapsed }),
          ),
    setRightCollapsed: (rightCollapsed) =>
      scope === null
        ? inert()
        : mutations.updatePanelState(
            normalizeDashboardPanelStateUpdate({ right_collapsed: rightCollapsed }),
          ),
    setRightTab: (rightTab) =>
      scope === null
        ? inert()
        : mutations.updatePanelState(
            normalizeDashboardPanelStateUpdate({ right_tab: rightTab }),
          ),
  };
}
