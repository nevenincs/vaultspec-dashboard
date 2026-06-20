import { useCallback, useMemo, useRef } from "react";

import {
  normalizeDashboardPanelStateUpdate,
  normalizeDashboardPanelTab,
  useDashboardStateMutations,
} from "./dashboardState";
import type { DashboardPanelTab } from "./engine";
import { normalizeStoreScope } from "./scopeIdentity";

export interface ShellPanelIntent {
  setLeftCollapsed: (leftCollapsed: unknown) => Promise<unknown>;
  setRightCollapsed: (rightCollapsed: unknown) => Promise<unknown>;
  setRightTab: (rightTab: unknown) => Promise<unknown>;
}

export const normalizeShellPanelIntentScope = normalizeStoreScope;

export function normalizeShellPanelCollapsed(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function normalizeShellPanelRightTab(value: unknown): DashboardPanelTab | null {
  return normalizeDashboardPanelTab(value);
}

/**
 * Stores-owned panel-state write seam for AppShell chrome. AppShell renders the
 * shell frame view and emits intent; it does not compose dashboard panel patches.
 */
export function useShellPanelIntent(scope: unknown): ShellPanelIntent {
  const normalizedScope = normalizeShellPanelIntentScope(scope);
  const mutations = useDashboardStateMutations(normalizedScope);
  const updatePanelStateRef = useRef(mutations.updatePanelState);
  updatePanelStateRef.current = mutations.updatePanelState;
  const inert = useCallback(() => Promise.resolve(null), []);
  const setLeftCollapsed = useCallback(
    (leftCollapsed: unknown) => {
      const normalizedLeftCollapsed = normalizeShellPanelCollapsed(leftCollapsed);
      return normalizedScope === null || normalizedLeftCollapsed === null
        ? inert()
        : updatePanelStateRef.current(
            normalizeDashboardPanelStateUpdate({
              left_collapsed: normalizedLeftCollapsed,
            }),
          );
    },
    [inert, normalizedScope],
  );
  const setRightCollapsed = useCallback(
    (rightCollapsed: unknown) => {
      const normalizedRightCollapsed = normalizeShellPanelCollapsed(rightCollapsed);
      return normalizedScope === null || normalizedRightCollapsed === null
        ? inert()
        : updatePanelStateRef.current(
            normalizeDashboardPanelStateUpdate({
              right_collapsed: normalizedRightCollapsed,
            }),
          );
    },
    [inert, normalizedScope],
  );
  const setRightTab = useCallback(
    (rightTab: unknown) => {
      const normalizedRightTab = normalizeShellPanelRightTab(rightTab);
      return normalizedScope === null || normalizedRightTab === null
        ? inert()
        : updatePanelStateRef.current(
            normalizeDashboardPanelStateUpdate({ right_tab: normalizedRightTab }),
          );
    },
    [inert, normalizedScope],
  );
  return useMemo(
    () => ({ setLeftCollapsed, setRightCollapsed, setRightTab }),
    [setLeftCollapsed, setRightCollapsed, setRightTab],
  );
}
