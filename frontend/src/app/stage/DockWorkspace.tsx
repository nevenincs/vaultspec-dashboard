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
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
} from "dockview";
import { X } from "lucide-react";

import { useActiveScope } from "../../stores/server/queries";
import { openContextMenu } from "../../stores/view/contextMenu";
import { useShellGraphVisible } from "../../stores/view/shellLayout";
import { toggleGraphAction } from "../../stores/view/chromeActions";
import { IconButton } from "../kit";
import { Hierarchy } from "../kit/glyphs";
import { pokeGraphRect, setWorkspaceContainer } from "./canvasPin";
import { DocPanel } from "./DocPanel";
import { vaultspecDockTheme } from "./dockTheme";
import { GraphCanvasHost } from "./GraphCanvasHost";
import { GraphPanel } from "./GraphPanel";
import { WorkspaceGhost } from "./WorkspaceGhost";
import { useWorkspacePersistence } from "./useWorkspacePersistence";
import {
  activateDocTab,
  closeDocTab,
  deriveDockWorkspaceSyncPlan,
  promoteDocTab,
  reorderDocTabs,
  useDockTabHeaderView,
  useDockWorkspaceTabsView,
  useIsProvisionalDoc,
} from "../../stores/view/tabs";
import { guardUnsavedDiscardForDoc } from "../../stores/view/unsavedEditGuard";

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

// Document tab content. dockview's default tab renders at its own hardcoded 13px
// in a font untied to the app's type ramp — the source of the "wrong font/size"
// drift. This composes the SAME type/colour tokens as the centralized kit `Tab`
// (`text-label font-medium`, active = ink, inactive = ink-faint) so a dock tab
// reads identically to every other tab strip (design-system-is-centralized). The
// close (✕) is a Lucide glyph that reveals on hover/focus and stops propagation so
// it never activates or drags the tab. dockview's `.dv-tab` wrapper still owns
// click-to-activate, drag-to-dock, and the tokenized active/inactive background.
function DocTab({ api }: IDockviewPanelHeaderProps) {
  // The panel id IS the document node id (deriveDockWorkspaceSyncPlan), so the
  // provisional lookup keys straight off it — drives the italic preview title (#15).
  const provisional = useIsProvisionalDoc(api.id);
  const view = useDockTabHeaderView(api, provisional);
  const scope = useActiveScope();
  return (
    <div
      className={view.rootClassName}
      onContextMenu={(e) => {
        // Right-click the tab → the layered "doc-tab" context menu (#15:
        // Keep Open / Reload / Close / Close Others / Close All Documents).
        e.preventDefault();
        e.stopPropagation();
        openContextMenu(
          { kind: "doc-tab", id: api.id, nodeId: api.id, scope },
          { x: e.clientX, y: e.clientY },
        );
      }}
    >
      {/* The title is keyboard-activatable so a keyboard user can SWITCH to a tab,
          not only close it (dockview's `.dv-tab` owns pointer click-to-activate but
          exposes no keyboard path — keyboard-navigation W03.P06.S18). Enter/Space
          activates the panel; the keys are stopped so they never reach the global
          keymap dispatcher. Pointer activation stays dockview's (no onClick here,
          so a click still falls through to `.dv-tab`). A DOUBLE-CLICK on the title
          PEGS a provisional (preview) tab to permanent (VS Code, #15) — openDocTab
          promotes the provisional in place. */}
      <span
        className={view.titleClassName}
        role="button"
        tabIndex={0}
        aria-label={view.activateAriaLabel}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          promoteDocTab(api.id);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            api.setActive();
          }
        }}
      >
        {view.title}
      </span>
      <span
        role="button"
        tabIndex={0}
        aria-label={view.closeAriaLabel}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          // Arm-to-confirm when THIS tab's doc has an unsaved draft — closing the tab
          // tears the editor down (draft discarded). Target-scoped so closing a clean
          // tab while another doc is dirty does not prompt.
          guardUnsavedDiscardForDoc(api.id, () => api.close());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            guardUnsavedDiscardForDoc(api.id, () => api.close());
          }
        }}
        className={view.closeButtonClassName}
      >
        <X size={11} aria-hidden />
      </span>
    </div>
  );
}

const tabComponents = { graphTab: GraphTab, docTab: DocTab };

// The graph-visibility toggle, rendered in every group header's RIGHT action slot
// (dockview `rightHeaderActionsComponent`). This is the persistent REOPEN affordance:
// the bare graph-alone view hides its group header (clean canvas), so hiding there is
// the canvas overlay's job — but once documents are open, this tab-bar toggle both
// hides and re-shows the graph. It COMPOSES the one shared `toggleGraphAction()`
// builder (the same authoring Cmd+K's window:graph, the keymap, and the canvas
// overlay use) so the label ("Graph: Hide" / "Graph: Show") and run come from one
// source — no drift. Active = graph shown.
function GraphHeaderAction(_props: IDockviewHeaderActionsProps) {
  const graphVisible = useShellGraphVisible();
  const action = toggleGraphAction();
  return (
    <div className="flex h-full items-center px-fg-1">
      <IconButton
        label={action.label}
        title={action.label}
        active={graphVisible}
        onClick={action.run}
      >
        <Hierarchy size={16} aria-hidden />
      </IconButton>
    </div>
  );
}

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
  // The graph (with its tethered timeline) is a TOGGLEABLE panel (appshell-reframe
  // #11): when hidden, its dockview panel is removed so the documents reflow to the
  // full center width, and the app-lifetime canvas host hides (display:none — GL
  // context preserved). A ref lets `onReady` seed the graph at the CURRENT
  // visibility without re-binding the once-only ready callback.
  const graphVisible = useShellGraphVisible();
  const graphVisibleRef = useRef(graphVisible);
  graphVisibleRef.current = graphVisible;
  // P06: persist + restore the open-tab set per scope through the durable session.
  // The restore seeds the tab slice; the reconcile effect below rebuilds panels.
  useWorkspacePersistence(useActiveScope());

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    apiRef.current = api;
    // The graph panel seeds the layout (full width until a document opens to its
    // left) — but only when the graph is visible; the graph-visibility effect
    // below reconciles add/remove on later toggles.
    if (graphVisibleRef.current) {
      api.addPanel({
        id: GRAPH_PANEL_ID,
        component: "graph",
        tabComponent: "graphTab",
        title: "Graph",
      });
      syncGraphGroupHeader(api);
    }
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

  // Reconcile the GRAPH panel to `graphVisible` (the toggle). Adding/removing the
  // placeholder panel is safe for the canvas: `GraphCanvasHost` (the real `<Stage/>`
  // + WebGL context) is an app-lifetime SIBLING that never unmounts, so the panel
  // is only the rect source — removing it hides the canvas (display:none via
  // `setGraphVisible(false)` from `GraphPanel`'s cleanup), it is never destroyed
  // (graph-canvas-is-portal-pinned-never-reparented). On re-show the graph re-docks
  // to the RIGHT of the documents (or seeds the empty workspace at the root).
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const hasGraph = api.getPanel(GRAPH_PANEL_ID) != null;
    if (graphVisible === hasGraph) return;
    syncingRef.current = true;
    try {
      if (graphVisible) {
        const firstDoc = api.panels.find((panel) => panel.id !== GRAPH_PANEL_ID);
        api.addPanel({
          id: GRAPH_PANEL_ID,
          component: "graph",
          tabComponent: "graphTab",
          title: "Graph",
          ...(firstDoc
            ? { position: { referencePanel: firstDoc.id, direction: "right" } }
            : {}),
        });
      } else {
        const panel = api.getPanel(GRAPH_PANEL_ID);
        if (panel) api.removePanel(panel);
      }
      syncGraphGroupHeader(api);
    } finally {
      syncingRef.current = false;
    }
  }, [graphVisible]);

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
        // existing document group. The user can re-dock freely afterward. The doc
        // tab uses the centralized `DocTab` content so its font/colour matches the
        // app type ramp, not dockview's default.
        api.addPanel({ ...panel, tabComponent: "docTab" });
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

  // Ghost / empty mode: the graph is toggled off AND no document is open, so the
  // center has nothing to render (appshell-reframe #11). Show the honest empty
  // state rather than a blank panel.
  const showGhost = !graphVisible && tabs.openDocs.length === 0;

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
          rightHeaderActionsComponent={GraphHeaderAction}
          onReady={onReady}
          theme={vaultspecDockTheme}
        />
      </div>
      {showGhost && (
        <div className="absolute inset-0 z-30">
          <WorkspaceGhost />
        </div>
      )}
    </div>
  );
}
