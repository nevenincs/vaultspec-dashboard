// The dock-workspace tab seam (editor-dock-workspace P03). The open-document tab
// collection is view-local chrome state on the view store, but app surfaces
// (left rail, overview, inspector, palette, the dock host) drive it through
// these named operations so "select the node + open/preview the tab" composition
// is not duplicated across row handlers. Mirrors the `viewer.ts` seam it
// supersedes.
//
// VS Code tab semantics: `previewDocTab` is the single-click PROVISIONAL open
// (one preview tab, replaced in place by the next preview); `openDocTab` is the
// double-click / explicit PERMANENT open (or a promotion of the provisional).

import { selectNode } from "./selection";
import { useViewStore, type OpenDoc, type ViewerSurface } from "./viewStore";

/**
 * Preview a document in the single provisional tab (single-click). Replaces the
 * existing provisional tab in place and focuses the node on the graph. The
 * surface is chosen by the caller from node kind (`doc:` -> markdown, `code:` ->
 * code).
 */
export function previewDocTab(
  nodeId: string,
  surface: ViewerSurface,
  scope: string | null = useViewStore.getState().scope,
): Promise<boolean> {
  const selected = selectNode(nodeId, scope).catch(() => false);
  useViewStore.getState().openDoc(nodeId, surface, false);
  return selected;
}

/**
 * Open a document in a PERMANENT tab (double-click / explicit open). If the doc
 * is already the provisional tab it is promoted; otherwise a permanent tab is
 * added. Focuses the node on the graph.
 */
export function openDocTab(
  nodeId: string,
  surface: ViewerSurface,
  scope: string | null = useViewStore.getState().scope,
): Promise<boolean> {
  const selected = selectNode(nodeId, scope).catch(() => false);
  useViewStore.getState().openDoc(nodeId, surface, true);
  return selected;
}

/** Promote the provisional tab to permanent (on first edit, or a tab drag). */
export function promoteDocTab(nodeId: string): void {
  useViewStore.getState().promoteDoc(nodeId);
}

/** Activate a tab (a tab click or a dockview activation echo). */
export function activateDocTab(nodeId: string): void {
  useViewStore.getState().activateDoc(nodeId);
}

/** Close a tab (a tab-close gesture or a dockview panel removal). */
export function closeDocTab(nodeId: string): void {
  useViewStore.getState().closeDoc(nodeId);
}

/** Reorder the open docs to match dockview's geometry after a tab drag. */
export function reorderDocTabs(orderedIds: string[]): void {
  useViewStore.getState().reorderDocs(orderedIds);
}

/** The ordered open document tabs. */
export function useOpenDocs(): OpenDoc[] {
  return useViewStore((state) => state.openDocs);
}

/** The active tab's node id, or null when no document is open. */
export function useActiveDocId(): string | null {
  return useViewStore((state) => state.activeDocId);
}

/** Whether any document tab is open (drives the split-vs-full-graph layout). */
export function useWorkspaceHasDocs(): boolean {
  return useViewStore((state) => state.openDocs.length > 0);
}
