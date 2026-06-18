// Dock workspace persistence (editor-dock-workspace P06). Persists and restores
// the open-document tab set + active tab per scope through the DURABLE session
// API (`vaultspec-session`'s per-scope `scope_context.workspace_layout`, SQLite-
// backed), so reopening the dashboard restores which documents were open across
// reloads AND engine restarts — unlike the prior in-memory dashboard-state, which
// was lost on restart. The DockWorkspace reconcile rebuilds the dockview panels
// from the restored tab slice, so this hook needs no dockview api — it is pure
// stores plumbing (the sole wire client; reads no raw `tiers`).
//
// Layer law: session-defining state's durable home is the engine SESSION API, not
// localStorage and not the volatile dashboard-state (dashboard-layer-ownership /
// views-are-projections-of-one-model). The workspace layout is per-scope user
// state, so it rides the same durable per-scope session context as the active
// folder / feature-tags — merged engine-side so the two writers never clobber.
// Bounded-by-default: the persist is COALESCED (debounced), never a write per
// keystroke/tab event, and the blob is the bounded tab list (cap MAX_OPEN_DOCS).
//
// NOTE: this v1 persists the open-tab SET + active tab, not the full dockview
// geometry (split sizes / float positions). Restoring the hand-docked arrangement
// via dockview `toJSON`/`fromJSON` is a follow-up; the open set is the load-
// bearing "which documents am I working on" persistence.

import { useEffect, useRef } from "react";

import {
  useDurableWorkspaceLayout,
  usePersistWorkspaceLayout,
} from "../../stores/server/sessionContext";
import {
  parseWorkspaceTabs,
  restoreDocTabsIfEmpty,
  serializeWorkspaceTabs,
  useDockWorkspaceTabsView,
} from "../../stores/view/tabs";

const PERSIST_DEBOUNCE_MS = 800;

export { parseWorkspaceTabs, serializeWorkspaceTabs };

interface LastPersistedWorkspaceLayout {
  scope: string;
  blob: string;
}

export function isSamePersistedWorkspaceLayout(
  previous: LastPersistedWorkspaceLayout | null,
  scope: string,
  blob: string,
): boolean {
  return previous?.scope === scope && previous.blob === blob;
}

export function useWorkspacePersistence(scope: string | null): void {
  // The DURABLE per-scope workspace layout lives in the session's scope_context
  // (SQLite-backed), read through the stores session seam (the app layer never
  // touches `useSession`/`usePutSession` raw — dashboard-layer-ownership). The
  // seam returns the blob only for the active scope, with a settled signal.
  const { blob: persistedBlob, settled: stateSettled } =
    useDurableWorkspaceLayout(scope);
  // Hold the persist callback in a ref so it is NOT a persist-effect dependency:
  // it changes identity every render, so depending on it would re-run the
  // debounced persist effect every render — and under the app's live-streaming
  // re-renders (faster than the debounce) the timeout would be cleared+rescheduled
  // every render and NEVER fire, so the open tabs would never persist (found in
  // live verification: the blob stayed `tabs:[]`).
  const persistLayout = usePersistWorkspaceLayout();
  const persistLayoutRef = useRef(persistLayout);
  persistLayoutRef.current = persistLayout;
  const tabs = useDockWorkspaceTabsView();

  // Restore: re-attempt whenever the SETTLED blob value changes, keyed on the blob
  // itself rather than once-per-scope. The dashboard-state query can first resolve
  // with the fallback panel-state (no layout) and update to the real blob a render
  // later; a once-per-scope gate marks the scope restored on that empty first pass
  // and then misses the real blob (the live-verified restore miss). `restoreDoc
  // TabsIfEmpty` only seeds when the slice is empty, so a blob change AFTER the
  // user has opened tabs (the persist echo) or after they closed them all is a
  // safe no-op. `initializedScopeRef` records that restore has had a settled pass
  // for the scope, which gates the persist below.
  const initializedScopeRef = useRef<string | null | undefined>(undefined);
  const lastRestoredBlobRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!scope) return;
    if (!stateSettled) return;
    initializedScopeRef.current = scope;
    if (persistedBlob === lastRestoredBlobRef.current) return;
    lastRestoredBlobRef.current = persistedBlob;
    const restored = parseWorkspaceTabs(persistedBlob);
    if (restored && restored.openDocs.length > 0) {
      restoreDocTabsIfEmpty(restored.openDocs, restored.activeDocId);
    }
  }, [scope, stateSettled, persistedBlob]);

  // Persist the tab set + active tab, coalesced. Skipped until this scope's restore
  // has had a settled pass (so the initial empty state never overwrites a saved
  // layout before the restore runs), and when the serialized value is unchanged
  // for the same scope.
  const lastPersistedRef = useRef<LastPersistedWorkspaceLayout | null>(null);
  useEffect(() => {
    if (!scope) return;
    if (initializedScopeRef.current !== scope) return;
    const next = serializeWorkspaceTabs(tabs.openDocs, tabs.activeDocId);
    if (isSamePersistedWorkspaceLayout(lastPersistedRef.current, scope, next)) {
      return;
    }
    const handle = setTimeout(() => {
      lastPersistedRef.current = { scope, blob: next };
      // Persist to the DURABLE per-scope session context through the stores seam
      // (merged engine-side so it preserves the folder/feature-tag context).
      persistLayoutRef.current(scope, next);
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [scope, tabs.openDocs, tabs.activeDocId]);
}
