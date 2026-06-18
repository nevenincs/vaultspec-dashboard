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
  // Restore happens in `seedFromSession` (atomic with the scope seed); this hook
  // only needs the SETTLED signal to gate the persist.
  const { settled: stateSettled } = useDurableWorkspaceLayout(scope);
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

  // RESTORE is not done here: it happens ATOMICALLY in `seedFromSession` (the
  // one-shot session seed in the stores layer), so the tab restore cannot race the
  // scope settle. This hook only PERSISTS the open-tab set + active tab, coalesced.
  //
  // Guard (GUARANTEED no-clobber): the reactive persist NEVER writes an EMPTY
  // layout. That makes restore bulletproof — a transient empty store (the load
  // window before the session seed lands, or a scope/session settle) can never
  // overwrite the durable layout, with no reliance on the durable-blob read having
  // resolved yet (it returns null until the session query settles for the active
  // scope, which was the hole the earlier guard fell through). The durable layout
  // only ever updates with a NON-EMPTY tab set; a user "close all" leaves the last
  // non-empty set saved (the workspace remembers your last open documents) — an
  // explicit clear-on-close path can persist empty in the future if wanted.
  const lastPersistedRef = useRef<LastPersistedWorkspaceLayout | null>(null);
  useEffect(() => {
    if (!scope) return;
    if (!stateSettled) return;
    const next = serializeWorkspaceTabs(tabs.openDocs, tabs.activeDocId);
    if ((parseWorkspaceTabs(next)?.openDocs.length ?? 0) === 0) return;
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
  }, [scope, stateSettled, tabs.openDocs, tabs.activeDocId]);
}
