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

import { useMemo, useSyncExternalStore } from "react";

import {
  deriveMarkdownHeaderView,
  engineKeys,
  useActiveScope,
  useContentView,
  type ContentView,
  type MarkdownHeaderView,
} from "../server/queries";
import { queryClient } from "../server/queryClient";
import { normalizeNodeId } from "../nodeIds";
import { normalizeSelectionScope, selectNode } from "./selection";
import {
  normalizeActiveDocId,
  normalizeOpenDocs,
  normalizeViewStoreSessionString,
  normalizeViewerSurface,
  useViewStore,
  type OpenDoc,
  type ViewerSurface,
} from "./viewStore";
import { normalizeWorkspaceLayoutBlob } from "../workspaceLayout";

const WORKSPACE_PERSIST_VERSION = 1;
export {
  WORKSPACE_LAYOUT_BLOB_MAX_CHARS,
  normalizeWorkspaceLayoutBlob,
} from "../workspaceLayout";

export interface DockWorkspacePanelSpec {
  id: string;
  component: "doc";
  title: string;
  params: { nodeId: string; surface: ViewerSurface };
  /** Where to dock the new panel. Absent when nothing is present to reference
   *  (the graph is hidden and no document is open yet) — the panel then seeds the
   *  empty workspace at the root, taking the full center width. */
  position?: { referencePanel: string; direction: "left" | "within" };
}

export interface DockWorkspaceSyncPlan {
  removeIds: string[];
  addPanels: DockWorkspacePanelSpec[];
  activeDocId: string | null;
}

interface DockTabHeaderApi {
  isActive: boolean;
  title?: string;
  onDidActiveChange: (listener: (event: { isActive: boolean }) => void) => {
    dispose: () => void;
  };
  onDidTitleChange: (listener: () => void) => { dispose: () => void };
}

export interface DockTabHeaderView {
  active: boolean;
  title: string;
  rootClassName: string;
  titleClassName: string;
  closeButtonClassName: string;
  closeAriaLabel: string;
  activateAriaLabel: string;
}

export type DockDocPanelView =
  | {
      state: "code";
      nodeId: string;
      scope: string | null;
      content: ContentView;
      header: null;
    }
  | {
      state: "markdown";
      nodeId: string;
      scope: string | null;
      content: ContentView;
      header: MarkdownHeaderView;
    };

export interface RenamedMarkdownDocWorkspaceResult {
  oldNodeId: string;
  newNodeId: string;
  newBlobHash: string;
}

/** A short display title for a dock tab from its stable node id. */
export function dockTabTitle(nodeId: string): string {
  if (nodeId.startsWith("doc:")) return nodeId.slice(4);
  if (nodeId.startsWith("code:")) {
    const path = nodeId.slice(5);
    return path.slice(path.lastIndexOf("/") + 1);
  }
  return nodeId;
}

export function deriveDockWorkspaceSyncPlan(
  openDocs: readonly OpenDoc[],
  activeDocId: string | null,
  panelIds: readonly string[],
  graphPanelId: string,
): DockWorkspaceSyncPlan {
  const normalizedOpenDocs = normalizeOpenDocs(openDocs);
  const normalizedActiveDocId = normalizeActiveDocId(normalizedOpenDocs, activeDocId);
  const wanted = new Set(normalizedOpenDocs.map((doc) => doc.nodeId));
  const docPanelIds = panelIds.filter((id) => id !== graphPanelId);
  const removeIds = docPanelIds.filter((id) => !wanted.has(id));
  const removed = new Set(removeIds);
  const present = new Set(panelIds.filter((id) => !removed.has(id)));
  const availableDocPanels = docPanelIds.filter((id) => !removed.has(id));
  const addPanels: DockWorkspacePanelSpec[] = [];

  for (const doc of normalizedOpenDocs) {
    if (present.has(doc.nodeId)) continue;
    // Dock the first document to the LEFT of the graph; further documents tab into
    // the existing document group. When the graph is hidden and no document is open
    // yet, there is nothing to reference — the panel seeds the empty workspace at
    // the root and takes the full center width (graph-hidden ⇒ docs full spread).
    const referencePanel =
      availableDocPanels[0] ?? (present.has(graphPanelId) ? graphPanelId : null);
    addPanels.push({
      id: doc.nodeId,
      component: "doc",
      title: dockTabTitle(doc.nodeId),
      params: { nodeId: doc.nodeId, surface: doc.surface },
      ...(referencePanel === null
        ? {}
        : {
            position: {
              referencePanel,
              direction: referencePanel === graphPanelId ? "left" : "within",
            },
          }),
    });
    present.add(doc.nodeId);
    availableDocPanels.push(doc.nodeId);
  }

  return { removeIds, addPanels, activeDocId: normalizedActiveDocId };
}

const DOCK_TAB_ROOT_BASE_CLASS =
  "group flex h-full items-center gap-fg-1-5 px-fg-3 text-label font-medium transition-colors duration-ui-fast ease-settle";
const DOCK_TAB_ACTIVE_CLASS = "text-ink";
const DOCK_TAB_INACTIVE_CLASS = "text-ink-faint";
const DOCK_TAB_TITLE_CLASS = "max-w-[18ch] truncate";
// A provisional (preview) tab renders its title in ITALIC (VS Code preview cue,
// #15) — the one visual signal that the tab is not yet pegged.
const DOCK_TAB_PROVISIONAL_TITLE_CLASS = "italic";
const DOCK_TAB_CLOSE_BUTTON_CLASS =
  "-mr-fg-0-5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-fg-xs text-ink-faint opacity-0 transition-[opacity,background-color,color] duration-ui-fast ease-settle hover:bg-paper-sunken hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus group-hover:opacity-100";

export function deriveDockTabHeaderView(
  active: boolean,
  title: string,
  provisional = false,
): DockTabHeaderView {
  return {
    active,
    title,
    rootClassName: `${DOCK_TAB_ROOT_BASE_CLASS} ${
      active ? DOCK_TAB_ACTIVE_CLASS : DOCK_TAB_INACTIVE_CLASS
    }`,
    titleClassName: provisional
      ? `${DOCK_TAB_TITLE_CLASS} ${DOCK_TAB_PROVISIONAL_TITLE_CLASS}`
      : DOCK_TAB_TITLE_CLASS,
    closeButtonClassName: DOCK_TAB_CLOSE_BUTTON_CLASS,
    closeAriaLabel: `Close ${title}`,
    activateAriaLabel: `Switch to ${title}`,
  };
}

function dockTabHeaderSnapshot(api: DockTabHeaderApi): string {
  return `${api.isActive ? "1" : "0"}\u0000${api.title ?? ""}`;
}

export function useDockTabHeaderView(
  api: DockTabHeaderApi,
  provisional = false,
): DockTabHeaderView {
  const snapshot = useSyncExternalStore(
    (onStoreChange) => {
      const active = api.onDidActiveChange(onStoreChange);
      const title = api.onDidTitleChange(onStoreChange);
      return () => {
        active.dispose();
        title.dispose();
      };
    },
    () => dockTabHeaderSnapshot(api),
    () => dockTabHeaderSnapshot(api),
  );
  return useMemo(() => {
    const [active, title] = snapshot.split("\u0000");
    return deriveDockTabHeaderView(active === "1", title ?? "", provisional);
  }, [snapshot, provisional]);
}

/** Whether a given doc tab is the single provisional (preview) tab — drives the
 *  italic title. Selects the RAW openDocs slice and derives in useMemo so the
 *  selector never returns a fresh ref (stable-selectors). */
export function useIsProvisionalDoc(nodeId: unknown): boolean {
  const normalized = normalizeNodeId(nodeId);
  const openDocs = useViewStore((state) => state.openDocs);
  return useMemo(
    () =>
      normalized !== null &&
      openDocs.some((doc) => doc.nodeId === normalized && doc.provisional === true),
    [openDocs, normalized],
  );
}

/** Close ALL open document tabs (#15 "Close all documents"). Composes the store's
 *  bulk-close op so the active id and workspace-cleared latch stay consistent. */
export function closeAllDocTabs(): void {
  useViewStore.getState().closeAllDocs();
}

/** Reload a document tab's content from the engine (#15 "Reload"): invalidate the
 *  read-only content query for (scope, nodeId) so the viewer refetches the on-disk
 *  body. The stores layer is the sole wire client (dashboard-layer-ownership). */
export function reloadDocTab(
  nodeId: unknown,
  scope: unknown = useViewStore.getState().scope,
): void {
  const docNodeId = normalizeNodeId(nodeId);
  const normalizedScope = normalizeViewStoreSessionString(scope);
  if (docNodeId === null || normalizedScope === null) return;
  void queryClient.invalidateQueries({
    queryKey: engineKeys.content(normalizedScope, docNodeId),
  });
}

export function deriveDockDocPanelView(
  nodeId: unknown,
  surface: unknown,
  scope: unknown,
  content: ContentView,
): DockDocPanelView {
  const normalizedNodeId = normalizeNodeId(nodeId) ?? "";
  const normalizedSurface = normalizeViewerSurface(surface);
  const normalizedScope = normalizeViewStoreSessionString(scope);
  if (normalizedSurface === "code") {
    return {
      state: "code",
      nodeId: normalizedNodeId,
      scope: normalizedScope,
      content,
      header: null,
    };
  }
  return {
    state: "markdown",
    nodeId: normalizedNodeId,
    scope: normalizedScope,
    content,
    header: deriveMarkdownHeaderView(normalizedNodeId, content),
  };
}

export function useDockDocPanelView(
  nodeId: unknown,
  surface: unknown,
): DockDocPanelView {
  const scope = useActiveScope();
  const normalizedNodeId = normalizeNodeId(nodeId);
  const normalizedSurface = normalizeViewerSurface(surface);
  const content = useContentView(normalizedNodeId, scope);
  return useMemo(
    () => deriveDockDocPanelView(normalizedNodeId, normalizedSurface, scope, content),
    [normalizedNodeId, normalizedSurface, scope, content],
  );
}

/** The viewer surface for an addressable graph/document node id, or null for a node
 *  that has NO document (a synthesized `feature:` convergence node descends the slice
 *  instead of opening a tab). `doc:` -> markdown reader, `code:` -> code viewer.
 *  Shared by the graph select/open bridges so the surface rule lives in one place. */
export function docSurfaceForNodeId(id: unknown): ViewerSurface | null {
  if (typeof id !== "string") return null;
  if (id.startsWith("doc:")) return "markdown";
  if (id.startsWith("code:")) return "code";
  return null;
}

/**
 * Preview a document in the single provisional tab (single-click). Replaces the
 * existing provisional tab in place and focuses the node on the graph. The
 * surface is chosen by the caller from node kind (`doc:` -> markdown, `code:` ->
 * code).
 */
export function previewDocTab(
  nodeId: unknown,
  surface: unknown,
  scope: unknown = useViewStore.getState().scope,
): Promise<boolean> {
  const docNodeId = normalizeNodeId(nodeId);
  if (docNodeId === null) return Promise.resolve(false);
  const selected = selectNode(docNodeId, normalizeSelectionScope(scope)).catch(
    () => false,
  );
  useViewStore.getState().openDoc(docNodeId, normalizeViewerSurface(surface), false);
  return selected;
}

/**
 * Open a document in a PERMANENT tab (double-click / explicit open). If the doc
 * is already the provisional tab it is promoted; otherwise a permanent tab is
 * added. Focuses the node on the graph.
 */
export function openDocTab(
  nodeId: unknown,
  surface: unknown,
  scope: unknown = useViewStore.getState().scope,
): Promise<boolean> {
  const docNodeId = normalizeNodeId(nodeId);
  if (docNodeId === null) return Promise.resolve(false);
  const selected = selectNode(docNodeId, normalizeSelectionScope(scope)).catch(
    () => false,
  );
  useViewStore.getState().openDoc(docNodeId, normalizeViewerSurface(surface), true);
  return selected;
}

/** Promote the provisional tab to permanent (on first edit, or a tab drag). */
export function promoteDocTab(nodeId: unknown): void {
  useViewStore.getState().promoteDoc(nodeId);
}

/** Activate a tab (a tab click or a dockview activation echo). */
export function activateDocTab(nodeId: unknown): void {
  useViewStore.getState().activateDoc(nodeId);
}

/** Close a tab (a tab-close gesture or a dockview panel removal). */
export function closeDocTab(nodeId: unknown): void {
  useViewStore.getState().closeDoc(nodeId);
}

/** Close the ACTIVE document tab (#15 keyboard "close tab"). No-op when none open. */
export function closeActiveDocTab(): void {
  const activeId = useViewStore.getState().activeDocId;
  if (activeId !== null) closeDocTab(activeId);
}

/** Close every document tab EXCEPT the given one (#15 context menu "Close Others"). */
export function closeOtherDocTabs(keepNodeId: unknown): void {
  const keep = normalizeNodeId(keepNodeId);
  if (keep === null) return;
  const others = useViewStore
    .getState()
    .openDocs.filter((doc) => doc.nodeId !== keep)
    .map((doc) => doc.nodeId);
  for (const id of others) closeDocTab(id);
}

/** Activate the tab `direction` steps from the active one (#15 keyboard tab nav:
 *  +1 next, -1 previous), WRAPPING around the strip. Reads the canonical
 *  open-docs order so it honours the provisional-last invariant. No-op with <2 tabs. */
export function activateAdjacentDocTab(direction: 1 | -1): void {
  const state = useViewStore.getState();
  const openDocs = normalizeOpenDocs(state.openDocs);
  if (openDocs.length < 2) return;
  const activeId = normalizeActiveDocId(openDocs, state.activeDocId);
  const currentIndex = openDocs.findIndex((doc) => doc.nodeId === activeId);
  if (currentIndex < 0) return;
  const nextIndex = (currentIndex + direction + openDocs.length) % openDocs.length;
  activateDocTab(openDocs[nextIndex].nodeId);
}

/**
 * Re-key the dock tab and editor after a core rename changes the identity-bearing
 * document id. Dockview panel ids are node ids, so a rename must route through
 * close/open instead of mutating an id in place.
 */
export function applyRenamedMarkdownDocWorkspace(
  result: RenamedMarkdownDocWorkspaceResult,
  draftText: string,
  scope: unknown = useViewStore.getState().scope,
  hadUnsavedDraft = false,
): Promise<boolean> {
  // Preserve the unsaved-work flag across the re-key. The engine rename operates on
  // the on-disk body, NOT the draft — so the renamed file's blob is the OLD (pre-edit)
  // body, and a draft that was dirty before the rename still diverges from it. But
  // `openEditor` re-seeds at `idle`, which would show the edits as "Saved" against a
  // base lacking them and drop the dirty flag (the unsaved-edit guard then no longer
  // protects the draft — silent loss on the next nav).
  //
  // `hadUnsavedDraft` MUST be captured by the caller BEFORE it flips the editor status
  // away from "dirty": the real rename path (`renameNow`) calls `markEditorSaving()`
  // (status -> "saving") BEFORE the mutation resolves, so reading the live status here
  // would always observe "saving" and never restore the dirty flag (the defect the
  // S19 adversarial review caught). The flag is threaded in, not re-derived here.
  closeDocTab(result.oldNodeId);
  const selected = openDocTab(result.newNodeId, "markdown", scope);
  useViewStore.getState().openEditor(result.newNodeId, draftText, result.newBlobHash);
  if (hadUnsavedDraft) {
    useViewStore.setState({ editorStatus: "dirty" });
  }
  return selected;
}

/** True when an editor status carries an unsaved draft (dirty, or a retained-draft
 *  failure/conflict). Exported so the rename caller can capture it BEFORE
 *  `markEditorSaving()` flips the status to "saving". */
export function editorStatusHasUnsavedDraft(status: unknown): boolean {
  return status === "dirty" || status === "save-failed" || status === "conflict";
}

/** Reorder the open docs to match dockview's geometry after a tab drag. */
export function reorderDocTabs(orderedIds: unknown): void {
  useViewStore.getState().reorderDocs(orderedIds);
}

/** Serialize the open-tab set + active tab into the durable session layout blob. */
export function serializeWorkspaceTabs(
  openDocs: readonly OpenDoc[],
  activeDocId: string | null,
): string {
  const normalizedOpenDocs = normalizeOpenDocs(openDocs).filter(
    (doc) => !doc.provisional,
  );
  return JSON.stringify({
    v: WORKSPACE_PERSIST_VERSION,
    tabs: normalizedOpenDocs.map((doc) => ({
      nodeId: doc.nodeId,
      surface: doc.surface,
    })),
    active: normalizeActiveDocId(normalizedOpenDocs, activeDocId),
  });
}

/**
 * Parse the durable session workspace-layout blob back into the tab store shape.
 * Malformed, duplicate, and over-cap entries degrade into the same bounded
 * one-tab-per-node invariant enforced by the live tab operations.
 */
export function parseWorkspaceTabs(
  blob: unknown,
): { openDocs: OpenDoc[]; activeDocId: string | null } | null {
  const normalizedBlob = normalizeWorkspaceLayoutBlob(blob);
  if (normalizedBlob === null) return null;
  try {
    const parsed = JSON.parse(normalizedBlob) as {
      v?: number;
      tabs?: Array<{ nodeId?: unknown; surface?: unknown }>;
      active?: unknown;
    };
    if (parsed.v !== WORKSPACE_PERSIST_VERSION || !Array.isArray(parsed.tabs)) {
      return null;
    }
    const openDocs: OpenDoc[] = [];
    for (const entry of parsed.tabs) {
      if (typeof entry?.nodeId !== "string") continue;
      const surface = entry.surface === "code" ? "code" : "markdown";
      openDocs.push({ nodeId: entry.nodeId, surface, provisional: false });
    }
    const normalizedOpenDocs = normalizeOpenDocs(openDocs);
    return {
      openDocs: normalizedOpenDocs,
      activeDocId: normalizeActiveDocId(
        normalizedOpenDocs,
        typeof parsed.active === "string" ? parsed.active : null,
      ),
    };
  } catch {
    return null;
  }
}

export interface PersistedWorkspaceTabsLayout {
  scope: string;
  blob: string;
}

export function isSamePersistedWorkspaceLayout(
  previous: PersistedWorkspaceTabsLayout | null,
  scope: unknown,
  blob: string,
): boolean {
  const normalizedScope = normalizeViewStoreSessionString(scope);
  return (
    normalizedScope !== null &&
    previous?.scope === normalizedScope &&
    previous.blob === blob
  );
}

export function shouldPersistWorkspaceTabsLayout(
  previous: PersistedWorkspaceTabsLayout | null,
  scope: unknown,
  blob: string,
): boolean {
  const normalizedScope = normalizeViewStoreSessionString(scope);
  if (normalizedScope === null) return false;
  const parsed = parseWorkspaceTabs(blob);
  if ((parsed?.openDocs.length ?? 0) === 0) return false;
  return !isSamePersistedWorkspaceLayout(previous, normalizedScope, blob);
}

export function restoreDocTabsIfEmpty(
  openDocs: unknown,
  activeDocId: unknown,
): boolean {
  const store = useViewStore.getState();
  if (normalizeOpenDocs(store.openDocs).length > 0) return false;
  const normalizedOpenDocs = normalizeOpenDocs(openDocs);
  if (normalizedOpenDocs.length === 0) return false;
  useViewStore.setState({
    openDocs: normalizedOpenDocs,
    activeDocId: normalizeActiveDocId(normalizedOpenDocs, activeDocId),
  });
  return true;
}

export function normalizeDockWorkspaceTabsView(
  openDocs: unknown,
  activeDocId: unknown,
): { openDocs: OpenDoc[]; activeDocId: string | null } {
  const normalizedOpenDocs = normalizeOpenDocs(openDocs);
  return {
    openDocs: normalizedOpenDocs,
    activeDocId: normalizeActiveDocId(normalizedOpenDocs, activeDocId),
  };
}

/** The ordered open document tabs. */
export function useOpenDocs(): OpenDoc[] {
  // Select the RAW, referentially-stable slice and memoize the normalization —
  // normalizing INSIDE the zustand selector returns a fresh array on every
  // getSnapshot whenever `openDocs` is not byte-canonical (a duplicate, an over-cap
  // set, a surface to coerce), which trips React's "getSnapshot should be cached"
  // infinite loop (stable-selectors). The store writes canonical docs, so the raw
  // ref is stable between mutations.
  const raw = useViewStore((state) => state.openDocs);
  return useMemo(() => normalizeOpenDocs(raw), [raw]);
}

/** The active tab's node id, or null when no document is open. */
export function useActiveDocId(): string | null {
  const openDocs = useViewStore((state) => state.openDocs);
  const activeDocId = useViewStore((state) => state.activeDocId);
  // A string|null result is value-stable, so a useMemo is for cheapness, not safety.
  return useMemo(
    () => normalizeActiveDocId(openDocs, activeDocId),
    [openDocs, activeDocId],
  );
}

export function useDockWorkspaceTabsView(): {
  openDocs: OpenDoc[];
  activeDocId: string | null;
} {
  // Select raw stable fields and memoize the derivation. useShallow does NOT save
  // this hook: normalizeDockWorkspaceTabsView nests a freshly-normalized `openDocs`
  // array, and useShallow's one-level compare sees that nested fresh ref as changed
  // every getSnapshot -> "getSnapshot should be cached" loop (stable-selectors).
  const openDocs = useViewStore((state) => state.openDocs);
  const activeDocId = useViewStore((state) => state.activeDocId);
  return useMemo(
    () => normalizeDockWorkspaceTabsView(openDocs, activeDocId),
    [openDocs, activeDocId],
  );
}

/** Whether any document tab is open (drives the split-vs-full-graph layout). */
export function useWorkspaceHasDocs(): boolean {
  // A boolean result is value-stable inside the selector, so this one is safe as-is.
  return useViewStore((state) => normalizeOpenDocs(state.openDocs).length > 0);
}
