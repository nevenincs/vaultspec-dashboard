// The dock workspace host (editor-dock-workspace P04). Replaces the single-doc
// full-cover viewer overlay with a dockview workspace inside the stage column:
// the graph panel (default RIGHT, full width until a document opens) plus
// document panels tabbed/split/floated to the LEFT, all walkable, movable, and
// hot-dockable. The bounded tab slice (`stores/view`) is the SOURCE OF TRUTH for
// WHICH documents are open; dockview owns the GEOMETRY; this host reconciles the
// two by panel id (id === nodeId).
//
// The graph is a portal-pinned canvas: the dockview `graph` panel is an empty
// rect placeholder (`GraphPanel`) and the whole Stage (canvas + chrome) is
// rendered by `GraphCanvasHost` floating over that rect, so docking never
// re-parents the canvas (P02). Layer law: `app/` chrome over the preserved
// stores + SceneController contracts; no fetch, no raw tiers.

import { useCallback, useEffect, useRef } from "react";
import {
  DockviewDefaultTab,
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
} from "dockview";

import { useActiveScope } from "../../stores/server/queries";
import { pokeGraphRect, setWorkspaceContainer } from "./canvasPin";
import { DocPanel } from "./DocPanel";
import { vaultspecDockTheme } from "./dockTheme";
import { GraphCanvasHost } from "./GraphCanvasHost";
import { GraphPanel } from "./GraphPanel";
import { useWorkspacePersistence } from "./useWorkspacePersistence";
import {
  activateDocTab,
  closeDocTab,
  deriveDockWorkspaceSyncPlan,
  reorderDocTabs,
  useDockWorkspaceTabsView,
} from "../../stores/view/tabs";

/** The always-present graph panel id (never a node id, so it cannot collide). */
const GRAPH_PANEL_ID = "__graph__";

const components = { graph: GraphPanel, doc: DocPanel };

// The graph panel is structural, not a document: it is the portal-pinned canvas's
// rect source and must always exist (graph-canvas-is-portal-pinned). The default
// dockview tab renders a close (✕) action; closing the graph would drop the
// placeholder rect with no restore path. A `hideClose` tab makes the graph tab
// non-closable so the invariant holds — document tabs keep the default closable
// tab.
function GraphTab(props: IDockviewPanelHeaderProps) {
  return <DockviewDefaultTab {...props} hideClose />;
}

const tabComponents = { graphTab: GraphTab };

// The graph is structural, not a document. When it is alone in its group it must
// read as the bare canvas — NO tab row above it (a single "Graph" tab is visual
// noise with no purpose). The tab header appears only once the user explicitly
// tabs another panel into the graph's group. Hiding the header on the graph's own
// group leaves any separate document group's tabs untouched.
function syncGraphGroupHeader(api: DockviewApi): void {
  const group = api.getPanel(GRAPH_PANEL_ID)?.group;
  if (group) group.header.hidden = group.panels.length <= 1;
}

export function DockWorkspace() {
  const apiRef = useRef<DockviewApi | null>(null);
  // Guards the store<->dockview sync against feedback loops: while we mutate
  // dockview to match the store, its echo events (active/remove) are ignored.
  const syncingRef = useRef(false);
  const tabs = useDockWorkspaceTabsView();
  // P06: persist + restore the open-tab set per scope through dashboard-state.
  // The restore seeds the tab slice; the reconcile effect below rebuilds panels.
  useWorkspacePersistence(useActiveScope());

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    apiRef.current = api;
    // The graph panel is always present and seeds the layout (full width until a
    // document opens to its left).
    api.addPanel({
      id: GRAPH_PANEL_ID,
      component: "graph",
      tabComponent: "graphTab",
      title: "Graph",
    });
    syncGraphGroupHeader(api);
    // Any layout change re-measures the graph rect so the pinned canvas follows
    // (a split, a sash drag, a dock, a float), and syncs dockview's tab order
    // back into the slice after a user drag-reorder. Skipped during our own
    // programmatic sync. [P06 persists here too.]
    api.onDidLayoutChange(() => {
      pokeGraphRect();
      syncGraphGroupHeader(api);
      if (syncingRef.current) return;
      reorderDocTabs(
        api.panels.filter((p) => p.id !== GRAPH_PANEL_ID).map((p) => p.id),
      );
    });
    // User-driven activation -> store (ignore the graph panel and our own syncs).
    api.onDidActivePanelChange((panel) => {
      if (syncingRef.current || !panel || panel.id === GRAPH_PANEL_ID) return;
      activateDocTab(panel.id);
    });
    // User-driven tab close -> store (the graph panel is never closed this way).
    api.onDidRemovePanel((panel) => {
      if (syncingRef.current || panel.id === GRAPH_PANEL_ID) return;
      closeDocTab(panel.id);
    });
  }, []);

  // Reconcile dockview panels to the tab slice (the source of truth). Runs on any
  // openDocs/activeDocId change: add new doc panels (to the LEFT of the graph, or
  // within the existing doc group), remove closed ones, and activate the active
  // tab. The syncing guard suppresses the echo events this mutation triggers.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    syncingRef.current = true;
    try {
      const plan = deriveDockWorkspaceSyncPlan(
        tabs.openDocs,
        tabs.activeDocId,
        api.panels.map((panel) => panel.id),
        GRAPH_PANEL_ID,
      );
      // Remove doc panels no longer open.
      for (const panelId of plan.removeIds) {
        const panel = api.getPanel(panelId);
        if (panel) api.removePanel(panel);
      }
      // Add newly-open doc panels.
      for (const panel of plan.addPanels) {
        // First document splits LEFT of the graph; further documents tab into the
        // existing document group. The user can re-dock freely afterward.
        api.addPanel(panel);
      }
      // Activate the active document.
      if (plan.activeDocId) {
        const panel = api.getPanel(plan.activeDocId);
        panel?.api.setActive();
      }
      syncGraphGroupHeader(api);
    } finally {
      syncingRef.current = false;
    }
  }, [tabs]);

  const setRoot = useCallback((el: HTMLDivElement | null) => {
    setWorkspaceContainer(el);
  }, []);

  return (
    <div ref={setRoot} className="relative h-full w-full bg-paper">
      {/* The pinned graph (canvas + chrome) floats over the graph panel's rect,
          above the dockview container so it paints over the transparent graph
          placeholder; document groups sit in their own opaque panels. */}
      <GraphCanvasHost />
      <div className="absolute inset-0 z-10">
        <DockviewReact
          components={components}
          tabComponents={tabComponents}
          onReady={onReady}
          theme={vaultspecDockTheme}
        />
      </div>
    </div>
  );
}
