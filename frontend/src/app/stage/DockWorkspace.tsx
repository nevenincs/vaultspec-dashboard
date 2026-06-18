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
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
} from "dockview";

import { pokeGraphRect, setWorkspaceContainer } from "./canvasPin";
import { DocPanel } from "./DocPanel";
import { vaultspecDockTheme } from "./dockTheme";
import { GraphCanvasHost } from "./GraphCanvasHost";
import { GraphPanel } from "./GraphPanel";
import {
  activateDocTab,
  closeDocTab,
  reorderDocTabs,
  useActiveDocId,
  useOpenDocs,
} from "../../stores/view/tabs";

/** The always-present graph panel id (never a node id, so it cannot collide). */
const GRAPH_PANEL_ID = "__graph__";

const components = { graph: GraphPanel, doc: DocPanel };

/** A short display title for a tab from its node id. */
function titleFor(nodeId: string): string {
  if (nodeId.startsWith("doc:")) return nodeId.slice(4);
  if (nodeId.startsWith("code:")) {
    const path = nodeId.slice(5);
    return path.slice(path.lastIndexOf("/") + 1);
  }
  return nodeId;
}

export function DockWorkspace() {
  const apiRef = useRef<DockviewApi | null>(null);
  // Guards the store<->dockview sync against feedback loops: while we mutate
  // dockview to match the store, its echo events (active/remove) are ignored.
  const syncingRef = useRef(false);
  const openDocs = useOpenDocs();
  const activeDocId = useActiveDocId();

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    apiRef.current = api;
    // The graph panel is always present and seeds the layout (full width until a
    // document opens to its left).
    api.addPanel({ id: GRAPH_PANEL_ID, component: "graph", title: "Graph" });
    // Any layout change re-measures the graph rect so the pinned canvas follows
    // (a split, a sash drag, a dock, a float), and syncs dockview's tab order
    // back into the slice after a user drag-reorder. Skipped during our own
    // programmatic sync. [P06 persists here too.]
    api.onDidLayoutChange(() => {
      pokeGraphRect();
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
      const wanted = new Set(openDocs.map((d) => d.nodeId));
      const docPanels = api.panels.filter((p) => p.id !== GRAPH_PANEL_ID);
      // Remove doc panels no longer open.
      for (const panel of docPanels) {
        if (!wanted.has(panel.id)) api.removePanel(panel);
      }
      // Add newly-open doc panels.
      const present = new Set(api.panels.map((p) => p.id));
      for (const doc of openDocs) {
        if (present.has(doc.nodeId)) continue;
        const existingDoc = api.panels.find(
          (p) => p.id !== GRAPH_PANEL_ID && p.id !== doc.nodeId,
        );
        api.addPanel({
          id: doc.nodeId,
          component: "doc",
          title: titleFor(doc.nodeId),
          params: { nodeId: doc.nodeId, surface: doc.surface },
          // First document splits LEFT of the graph; further documents tab into
          // the existing document group. The user can re-dock freely afterward.
          position: existingDoc
            ? { referencePanel: existingDoc.id, direction: "within" }
            : { referencePanel: GRAPH_PANEL_ID, direction: "left" },
        });
      }
      // Activate the active document.
      if (activeDocId) {
        const panel = api.getPanel(activeDocId);
        panel?.api.setActive();
      }
    } finally {
      syncingRef.current = false;
    }
  }, [openDocs, activeDocId]);

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
          onReady={onReady}
          theme={vaultspecDockTheme}
        />
      </div>
    </div>
  );
}
