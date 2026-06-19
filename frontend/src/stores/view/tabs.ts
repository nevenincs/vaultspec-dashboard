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
import { useShallow } from "zustand/react/shallow";

import {
  deriveMarkdownHeaderView,
  useActiveScope,
  useContentView,
  type ContentView,
  type MarkdownHeaderView,
} from "../server/queries";
import { selectNode } from "./selection";
import {
  MAX_OPEN_DOCS,
  useViewStore,
  type OpenDoc,
  type ViewerSurface,
} from "./viewStore";

const WORKSPACE_PERSIST_VERSION = 1;

export interface DockWorkspacePanelSpec {
  id: string;
  component: "doc";
  title: string;
  params: { nodeId: string; surface: ViewerSurface };
  position: { referencePanel: string; direction: "left" | "within" };
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
  const wanted = new Set(openDocs.map((doc) => doc.nodeId));
  const docPanelIds = panelIds.filter((id) => id !== graphPanelId);
  const removeIds = docPanelIds.filter((id) => !wanted.has(id));
  const removed = new Set(removeIds);
  const present = new Set(panelIds.filter((id) => !removed.has(id)));
  const availableDocPanels = docPanelIds.filter((id) => !removed.has(id));
  const addPanels: DockWorkspacePanelSpec[] = [];

  for (const doc of openDocs) {
    if (present.has(doc.nodeId)) continue;
    const referencePanel = availableDocPanels[0] ?? graphPanelId;
    const direction = referencePanel === graphPanelId ? "left" : "within";
    addPanels.push({
      id: doc.nodeId,
      component: "doc",
      title: dockTabTitle(doc.nodeId),
      params: { nodeId: doc.nodeId, surface: doc.surface },
      position: { referencePanel, direction },
    });
    present.add(doc.nodeId);
    availableDocPanels.push(doc.nodeId);
  }

  return { removeIds, addPanels, activeDocId };
}

const DOCK_TAB_ROOT_BASE_CLASS =
  "group flex h-full items-center gap-fg-1-5 px-fg-3 text-label font-medium transition-colors duration-ui-fast ease-settle";
const DOCK_TAB_ACTIVE_CLASS = "text-ink";
const DOCK_TAB_INACTIVE_CLASS = "text-ink-faint";
const DOCK_TAB_TITLE_CLASS = "max-w-[18ch] truncate";
const DOCK_TAB_CLOSE_BUTTON_CLASS =
  "-mr-fg-0-5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-fg-xs text-ink-faint opacity-0 transition-[opacity,background-color,color] duration-ui-fast ease-settle hover:bg-paper-sunken hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus group-hover:opacity-100";

export function deriveDockTabHeaderView(
  active: boolean,
  title: string,
): DockTabHeaderView {
  return {
    active,
    title,
    rootClassName: `${DOCK_TAB_ROOT_BASE_CLASS} ${
      active ? DOCK_TAB_ACTIVE_CLASS : DOCK_TAB_INACTIVE_CLASS
    }`,
    titleClassName: DOCK_TAB_TITLE_CLASS,
    closeButtonClassName: DOCK_TAB_CLOSE_BUTTON_CLASS,
    closeAriaLabel: `Close ${title}`,
  };
}

function dockTabHeaderSnapshot(api: DockTabHeaderApi): string {
  return `${api.isActive ? "1" : "0"}\u0000${api.title ?? ""}`;
}

export function useDockTabHeaderView(api: DockTabHeaderApi): DockTabHeaderView {
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
    return deriveDockTabHeaderView(active === "1", title ?? "");
  }, [snapshot]);
}

export function deriveDockDocPanelView(
  nodeId: string,
  surface: ViewerSurface,
  scope: string | null,
  content: ContentView,
): DockDocPanelView {
  if (surface === "code") {
    return {
      state: "code",
      nodeId,
      scope,
      content,
      header: null,
    };
  }
  return {
    state: "markdown",
    nodeId,
    scope,
    content,
    header: deriveMarkdownHeaderView(nodeId, content),
  };
}

export function useDockDocPanelView(
  nodeId: string,
  surface: ViewerSurface,
): DockDocPanelView {
  const scope = useActiveScope();
  const content = useContentView(nodeId, scope);
  return useMemo(
    () => deriveDockDocPanelView(nodeId, surface, scope, content),
    [nodeId, surface, scope, content],
  );
}

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

/** Serialize the open-tab set + active tab into the dashboard panel-state blob. */
export function serializeWorkspaceTabs(
  openDocs: readonly OpenDoc[],
  activeDocId: string | null,
): string {
  return JSON.stringify({
    v: WORKSPACE_PERSIST_VERSION,
    tabs: openDocs
      .filter((doc) => !doc.provisional)
      .map((doc) => ({ nodeId: doc.nodeId, surface: doc.surface })),
    active: activeDocId,
  });
}

/**
 * Parse the dashboard panel-state workspace blob back into the tab store shape.
 * Malformed, duplicate, and over-cap entries degrade into the same bounded
 * one-tab-per-node invariant enforced by the live tab operations.
 */
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
    if (parsed.v !== WORKSPACE_PERSIST_VERSION || !Array.isArray(parsed.tabs)) {
      return null;
    }
    const openDocs: OpenDoc[] = [];
    const seen = new Set<string>();
    for (const entry of parsed.tabs) {
      if (openDocs.length >= MAX_OPEN_DOCS) break;
      if (typeof entry?.nodeId !== "string" || seen.has(entry.nodeId)) continue;
      seen.add(entry.nodeId);
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

export function restoreDocTabsIfEmpty(
  openDocs: readonly OpenDoc[],
  activeDocId: string | null,
): boolean {
  const store = useViewStore.getState();
  if (store.openDocs.length > 0) return false;
  useViewStore.setState({
    openDocs: [...openDocs],
    activeDocId,
  });
  return true;
}

/** The ordered open document tabs. */
export function useOpenDocs(): OpenDoc[] {
  return useViewStore((state) => state.openDocs);
}

/** The active tab's node id, or null when no document is open. */
export function useActiveDocId(): string | null {
  return useViewStore((state) => state.activeDocId);
}

export function useDockWorkspaceTabsView(): {
  openDocs: OpenDoc[];
  activeDocId: string | null;
} {
  return useViewStore(
    useShallow((state) => ({
      openDocs: state.openDocs,
      activeDocId: state.activeDocId,
    })),
  );
}

/** Whether any document tab is open (drives the split-vs-full-graph layout). */
export function useWorkspaceHasDocs(): boolean {
  return useViewStore((state) => state.openDocs.length > 0);
}
