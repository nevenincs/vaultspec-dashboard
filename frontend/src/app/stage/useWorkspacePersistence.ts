// Dock workspace persistence (editor-dock-workspace P06). Persists and restores
// the open-document tab set + active tab per scope through engine dashboard-state
// (`panel_state.workspace_layout`), so reopening the dashboard restores which
// documents were open. The existing DockWorkspace reconcile rebuilds the dockview
// panels from the restored tab slice, so this hook needs no dockview api — it is
// pure stores plumbing (the sole wire client; reads no raw `tiers`).
//
// Layer law: session-defining state's durable home is the engine state API, not
// localStorage (dashboard-layer-ownership / views-are-projections-of-one-model).
// Bounded-by-default: the persist is COALESCED (debounced), never a write per
// keystroke/tab event, and the blob is the bounded tab list (cap MAX_OPEN_DOCS).
//
// NOTE: this v1 persists the open-tab SET + active tab, not the full dockview
// geometry (split sizes / float positions). Restoring the hand-docked arrangement
// via dockview `toJSON`/`fromJSON` is a follow-up; the open set is the load-
// bearing "which documents am I working on" persistence.

import { useEffect, useRef } from "react";

import { useDashboardStateMutations } from "../../stores/server/dashboardState";
import {
  useDashboardShellChromeView,
  useDashboardState,
} from "../../stores/server/queries";
import {
  restoreDocTabsIfEmpty,
  useDockWorkspaceTabsView,
} from "../../stores/view/tabs";
import type { OpenDoc } from "../../stores/view/viewStore";

const PERSIST_DEBOUNCE_MS = 800;
const PERSIST_VERSION = 1;

/** Serialize the open-tab set + active tab into the opaque persisted blob. */
export function serializeWorkspaceTabs(
  openDocs: readonly OpenDoc[],
  activeDocId: string | null,
): string {
  return JSON.stringify({
    v: PERSIST_VERSION,
    // Provisional (preview) tabs are NOT persisted — only the documents the user
    // committed to keeping survive a reload, matching VS Code.
    tabs: openDocs
      .filter((doc) => !doc.provisional)
      .map((doc) => ({ nodeId: doc.nodeId, surface: doc.surface })),
    active: activeDocId,
  });
}

/** Parse the persisted blob back into a tab set; null on absent/invalid input
 *  (degrade to the default empty workspace, never throw). */
export function parseWorkspaceTabs(
  blob: string | null,
): { openDocs: OpenDoc[]; activeDocId: string | null } | null {
  if (!blob) return null;
  try {
    const parsed = JSON.parse(blob) as {
      v?: number;
      tabs?: Array<{ nodeId?: unknown; surface?: unknown }>;
      active?: unknown;
    };
    if (parsed.v !== PERSIST_VERSION || !Array.isArray(parsed.tabs)) return null;
    const openDocs: OpenDoc[] = [];
    for (const entry of parsed.tabs) {
      if (typeof entry?.nodeId !== "string") continue;
      const surface = entry.surface === "code" ? "code" : "markdown";
      openDocs.push({ nodeId: entry.nodeId, surface, provisional: false });
    }
    const activeDocId =
      typeof parsed.active === "string" &&
      openDocs.some((doc) => doc.nodeId === parsed.active)
        ? parsed.active
        : (openDocs[0]?.nodeId ?? null);
    return { openDocs, activeDocId };
  } catch {
    return null;
  }
}

export function useWorkspacePersistence(scope: string | null): void {
  const shellChrome = useDashboardShellChromeView(scope);
  const persistedBlob = shellChrome.panelState.workspace_layout ?? null;
  // The dashboard-state query's SETTLED signal: the panel-state blob is only
  // meaningful once the query has resolved. Before that, `persistedBlob` is null
  // because the fallback panel-state carries no layout — restoring (or marking
  // restored) off that transient null would discard the saved layout (HIGH-1).
  const stateSettled = useDashboardState(scope).isSuccess;
  const mutations = useDashboardStateMutations(scope);
  const tabs = useDockWorkspaceTabsView();

  // Restore once per scope, when this scope's persisted layout is first available
  // — gated on the query being SETTLED so a late-arriving blob is never missed.
  // Only seeds when the tab slice is empty (a fresh load / post-scope-swap), so a
  // restore never clobbers documents the user already opened this session.
  const restoredScopeRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (restoredScopeRef.current === scope) return;
    if (!scope) return;
    if (!stateSettled) return;
    restoredScopeRef.current = scope;
    const restored = parseWorkspaceTabs(persistedBlob);
    if (!restored) return;
    restoreDocTabsIfEmpty(restored.openDocs, restored.activeDocId);
  }, [scope, stateSettled, persistedBlob]);

  // Persist the tab set + active tab, coalesced. Skipped until this scope has been
  // restored (so the initial empty state never overwrites a saved layout before
  // the restore runs), and when the serialized value is unchanged.
  const lastPersistedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!scope) return;
    if (restoredScopeRef.current !== scope) return;
    const next = serializeWorkspaceTabs(tabs.openDocs, tabs.activeDocId);
    if (next === lastPersistedRef.current) return;
    const handle = setTimeout(() => {
      lastPersistedRef.current = next;
      void mutations
        .updatePanelState({ workspace_layout: next })
        .catch(() => undefined);
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [scope, tabs.openDocs, tabs.activeDocId, mutations]);
}
