// The dock workspace host (editor-dock-workspace P04). Replaces the single-doc
// full-cover viewer overlay with a dockview workspace inside the stage column:
// the reserved center-slot panel (default RIGHT, full width until a document
// opens) plus document panels tabbed/split/floated to the LEFT, all walkable,
// movable, and hot-dockable. The bounded tab slice (`stores/view`) is the SOURCE
// OF TRUTH for WHICH documents are open; dockview owns the GEOMETRY; this host
// reconciles the two by panel id (id === nodeId).
//
// The center holds ONE reserved slot with two possible occupants — the graph or
// the Agent panel — reconciled against the `centerSlot` shell verb
// (agent-panel-shell-integration D1). They are mutually exclusive by construction:
// the reconcile removes the other occupant before adding the wanted one, so no
// arrangement (including a restore race) can leave both docked.
//
// The graph is a portal-pinned canvas: the dockview `graph` panel is an empty
// rect placeholder (`GraphPanel`) and the whole Stage (canvas + chrome) is
// rendered by `GraphCanvasHost` floating over that rect, so docking never
// re-parents the canvas (P02). The Agent panel is the opposite kind of occupant —
// plain React whose state lives in external stores — so its body mounts INSIDE
// the dockview panel with no portal, and flipping the slot never touches the
// canvas host at all. Layer law: `app/` chrome over the preserved stores +
// SceneController contracts; no fetch, no raw tiers.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DockviewReact,
  type DockviewApi,
  type DockviewGroupPanel,
  type DockviewReadyEvent,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
} from "dockview";
import { X } from "lucide-react";

import { useActiveScope } from "../../stores/server/queries";
import { resolveActionPresentation } from "../../platform/actions/action";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import { openContextMenu } from "../../stores/view/contextMenu";
import {
  useShellCenterSlot,
  useShellFrameView,
  useShellWindowActions,
} from "../../stores/view/shellLayout";
import { toggleGraphAction } from "../../stores/view/chromeActions";
import { agentTogglePanelAction } from "../../stores/view/agentActions";
import { guardedContextMenu } from "../menus/guardedContextMenu";
import { RowMenuDisclosure } from "../chrome/RowMenuDisclosure";
import { IconButton, Segment, SegmentedToggle } from "../kit";
import { PanelRight } from "../kit/glyphs";
import { AgentPanel } from "../agent/AgentPanel";
import { pokeGraphRect, setWorkspaceContainer } from "./canvasPin";
import {
  AGENT_PANEL_ID,
  GRAPH_PANEL_ID,
  RESERVED_PANEL_IDS,
  deriveCenterSlotPlan,
  isCenterSlotSettled,
  isReservedPanel,
  reservedPanelIdFor,
} from "./centerSlotPlan";
import { CategoryLegend } from "./CategoryLegend";
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
  useDocTabScope,
  useDocTabScopeBadge,
  useDockWorkspaceTabsView,
  useIsProvisionalDoc,
} from "../../stores/view/tabs";
import { guardUnsavedDiscardForDoc } from "../../stores/view/unsavedEditGuard";

/** The Agent panel's dockview body. Plain React with no portal: the panel's state
 *  lives in external stores, so dockview may mount, move, and unmount it freely —
 *  the constraint that forces the graph's portal pin does not apply here. */
function AgentDockPanel() {
  return <AgentPanel />;
}

const components = { graph: GraphPanel, doc: DocPanel, agent: AgentDockPanel };

// A reserved panel is structural, not a document, and carries no label or close in
// its tab: it is never closed from a tab (for the graph, dropping the placeholder
// would strand the portal-pinned canvas; for both, occupancy is the shell
// `centerSlot` verb). Its tab renders empty so the slot group's header reads as a
// thin toolbar that hosts the top-right action cluster, rather than a noisy lone
// "Graph"/"Agent" tab.
function ReservedSlotTab(_props: IDockviewPanelHeaderProps) {
  // `data-reserved-tab` lets the stylesheet collapse the wrapping `.dv-tab` to
  // nothing (transparent, zero width/padding) so the slot group's header reads as a
  // clean toolbar — the legend on the left, the switch on the right — with no stray
  // lighter tab rectangle between them.
  return <span aria-hidden data-reserved-tab className="block h-full w-0" />;
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
  const resolveMessage = useLocalizedMessageResolver();
  // The panel id IS the document node id (deriveDockWorkspaceSyncPlan), so the
  // provisional lookup keys straight off it — drives the italic preview title (#15).
  const provisional = useIsProvisionalDoc(api.id);
  const view = useDockTabHeaderView(api, provisional);
  // The tab's OWN scope (per-tab-scope-binding), falling back to the active scope for
  // a legacy tab — so Reload and the other doc-tab actions run against the workspace
  // the tab belongs to, not whatever is active now.
  const tabScope = useDocTabScope(api.id);
  const activeScope = useActiveScope();
  const scope = tabScope ?? activeScope;
  // A small attenuated label when the tab belongs to a DIFFERENT workspace than the
  // active one, so its foreign origin is legible (null → same-scope, no badge).
  const scopeBadge = useDocTabScopeBadge(api.id);
  const docTabEntity = { kind: "doc-tab" as const, id: api.id, nodeId: api.id, scope };
  return (
    <div
      className={view.rootClassName}
      onContextMenu={guardedContextMenu((e) => {
        // Right-click the tab → the layered "doc-tab" context menu (#15:
        // Keep Open / Reload / Close / Close Others / Close All Documents).
        e.preventDefault();
        e.stopPropagation();
        openContextMenu(docTabEntity, { x: e.clientX, y: e.clientY });
      })}
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
        className={`${view.titleClassName} select-text`}
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
      {scopeBadge && (
        <span
          className="shrink-0 rounded-fg-xs bg-paper-sunken px-fg-1 text-caption text-ink-muted"
          title={scopeBadge.title}
          aria-label={
            resolveMessage({
              key: "documents:workspace.accessibility.inWorkspace",
              values: { workspace: scopeBadge.label },
            }).message
          }
        >
          {scopeBadge.label}
        </span>
      )}
      <RowMenuDisclosure
        entity={docTabEntity}
        label={
          resolveMessage({
            key: "common:accessibility.actionsForItem",
            values: { item: view.title },
          }).message
        }
      />
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

const tabComponents = { reservedTab: ReservedSlotTab, docTab: DocTab };

// Which group occupies the dock's TOP-RIGHT corner right now — the rightmost group
// (greatest right edge), breaking a stacked-column tie by the topmost. Measured from
// live DOM rects so it is correct for any split/stack/float arrangement.
function isTopRightGroup(
  group: DockviewGroupPanel,
  containerApi: DockviewApi,
): boolean {
  const groups = containerApi.groups;
  if (groups.length <= 1) return true;
  let host = groups[0]!;
  let hostRect = host.element.getBoundingClientRect();
  for (const candidate of groups) {
    const rect = candidate.element.getBoundingClientRect();
    if (
      rect.right > hostRect.right + 1 ||
      (Math.abs(rect.right - hostRect.right) <= 1 && rect.top < hostRect.top - 1)
    ) {
      host = candidate;
      hostRect = rect;
    }
  }
  return host.id === group.id;
}

// The ONE window-visibility action cluster (center slot + activity rail), rendered
// through dockview's `rightHeaderActionsComponent`. dockview renders this in EVERY
// group's header, so to avoid a duplicated/multiplied toggle the cluster paints ONLY in
// the dock's top-right-most group (every other group's instance returns null). The host
// is re-derived on every layout change (`onDidLayoutChange`, which the TanStack-state-
// driven panel reconcile and any user dock/split/move all fire), so the cluster always
// rides the top-right corner of whatever panel is rightmost — stable, but aware of
// what is open in the canvas. Every verb composes a SHARED descriptor (one authoring
// with Cmd+K / keymap): the slot segments fire `toggleGraphAction()` /
// `agentTogglePanelAction()`, the collapse affordance fires whichever of the two owns
// the slot, and the rail verb composes the shared shell window action. No
// free-floating absolutely-positioned chrome, no second copy.
export function DockActivityPanelToggle({
  label,
  active,
  onToggle,
}: {
  label: MessageDescriptor;
  active: boolean;
  onToggle: () => void;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const presentation = resolveMessage(label);
  if (presentation.usedFallback) return null;
  return (
    <IconButton
      label={presentation.message}
      title={presentation.message}
      active={active}
      onClick={onToggle}
    >
      <PanelRight size={16} aria-hidden />
    </IconButton>
  );
}

/** The segmented {graph | agent} switch plus the affordance that empties the slot.
 *  Selecting an occupant fires that occupant's SHARED toggle descriptor, which lands
 *  on the picked slot from any other state — so the switch, the chords, the palette,
 *  and the background menu are one seam. Re-selecting the already-selected segment is
 *  ignored: a radiogroup must not un-select itself into the empty slot (the collapse
 *  affordance beside it is the verb for that). The collapse button stays rendered in
 *  every state — it is the keyboard path back into an emptied slot, since a
 *  radiogroup with no checked option carries no roving tab stop. */
export function DockCenterSlotSwitch() {
  const resolveMessage = useLocalizedMessageResolver();
  const centerSlot = useShellCenterSlot();
  const switcher = resolveMessage({ key: "common:shell.centerSlot.switcher" });
  const graph = resolveMessage({ key: "common:shell.centerSlot.graph" });
  const agent = resolveMessage({ key: "common:shell.centerSlot.agent" });
  // The occupant the collapse affordance acts on: whichever holds the slot, or the
  // graph when it is empty (so the button reads "Show graph" and restores it).
  const occupantAction =
    centerSlot === "agent" ? agentTogglePanelAction() : toggleGraphAction();
  const occupantLabel = resolveActionPresentation(occupantAction.label, resolveMessage);
  const OccupantIcon = occupantAction.icon;
  const select = (next: string) => {
    if (next === centerSlot) return;
    if (next === "graph") toggleGraphAction().run?.();
    if (next === "agent") agentTogglePanelAction().run?.();
  };
  return (
    <>
      {!switcher.usedFallback && !graph.usedFallback && !agent.usedFallback && (
        <SegmentedToggle
          value={centerSlot}
          ariaLabel={switcher.message}
          onChange={select}
        >
          <Segment value="graph">{graph.message}</Segment>
          <Segment value="agent">{agent.message}</Segment>
        </SegmentedToggle>
      )}
      <IconButton
        label={occupantLabel.message}
        title={occupantLabel.message}
        active={centerSlot !== "none"}
        disabled={occupantLabel.usedFallback}
        onClick={occupantLabel.usedFallback ? undefined : occupantAction.run}
      >
        {OccupantIcon ? <OccupantIcon size={16} aria-hidden /> : null}
      </IconButton>
    </>
  );
}

function DockHeaderActions(props: IDockviewHeaderActionsProps) {
  const scope = useActiveScope();
  const shellFrame = useShellFrameView(scope);
  const shellActions = useShellWindowActions(scope, shellFrame);
  // Re-derive the host group whenever the dock layout changes (panels added/removed
  // by the TanStack reconcile, or a user move/split/dock).
  const [, bumpLayout] = useState(0);
  useEffect(() => {
    const disposable = props.containerApi.onDidLayoutChange(() =>
      bumpLayout((tick) => tick + 1),
    );
    return () => disposable.dispose();
  }, [props.containerApi]);

  if (!isTopRightGroup(props.group, props.containerApi)) return null;

  return (
    <div className="flex h-full items-center gap-fg-1 px-fg-1">
      <DockCenterSlotSwitch />
      <DockActivityPanelToggle
        label={shellFrame.rightRailToggleLabel}
        active={shellFrame.showRightRail}
        onToggle={shellActions.toggleRightRail}
      />
    </div>
  );
}

// The graph category-filter legend, hosted in the LEFT of the graph group's header
// row (dockview's `prefixHeaderActionsComponent` — the free space left of the empty
// graph tab, sharing the header with the right-side visibility toggles). dockview
// renders this in EVERY group's header, so it paints ONLY in the group that owns the
// graph panel (every other group's instance returns null); the host group is
// re-derived on each layout change so the legend always rides the graph's header
// wherever the graph is docked. When the graph is hidden there is no graph panel, so
// nothing renders. The legend authors the canonical `doc_types` filter facet
// (unified-filter-plane) — it is not re-implemented here, only placed.
function DockGraphLegend(props: IDockviewHeaderActionsProps) {
  const [, bumpLayout] = useState(0);
  useEffect(() => {
    const disposable = props.containerApi.onDidLayoutChange(() =>
      bumpLayout((tick) => tick + 1),
    );
    return () => disposable.dispose();
  }, [props.containerApi]);

  const graphGroupId = props.containerApi.getPanel(GRAPH_PANEL_ID)?.group?.id;
  if (!graphGroupId || graphGroupId !== props.group.id) return null;

  return <CategoryLegend />;
}

// Keep the reserved slot group's header VISIBLE so it can host the top-right action
// cluster even when the slot's occupant is alone (the cluster is the stable home of
// the slot switch + rail toggle). The occupant's own tab renders empty (see
// ReservedSlotTab), so a lone graph/agent panel still reads as a thin toolbar over
// its content rather than a noisy one-tab row.
function syncReservedGroupHeader(api: DockviewApi): void {
  for (const panelId of RESERVED_PANEL_IDS) {
    const group = api.getPanel(panelId)?.group;
    if (group) group.header.hidden = false;
  }
}

export function DockWorkspace() {
  const resolveMessage = useLocalizedMessageResolver();
  const graphTitle = resolveMessage({ key: "graph:labels.graph" }).message;
  const agentTitle = resolveMessage({ key: "common:agent.panel.region" }).message;
  const apiRef = useRef<DockviewApi | null>(null);
  // Guards the store<->dockview sync against feedback loops: while we mutate
  // dockview to match the store, its echo events (active/remove) are ignored.
  const syncingRef = useRef(false);
  const tabs = useDockWorkspaceTabsView();
  // The center slot's occupant is a TOGGLEABLE reserved panel: when the slot empties
  // its dockview panel is removed so the documents reflow to the full center width,
  // and (for the graph) the app-lifetime canvas host hides — display:none, GL context
  // preserved. A ref lets `onReady` seed the CURRENT occupant without re-binding the
  // once-only ready callback.
  const centerSlot = useShellCenterSlot();
  const centerSlotRef = useRef(centerSlot);
  centerSlotRef.current = centerSlot;
  // P06: persist + restore the open-tab set per scope through the durable session.
  // The restore seeds the tab slice; the reconcile effect below rebuilds panels.
  useWorkspacePersistence(useActiveScope());

  // The dockview spec for a reserved occupant. Both share the empty `reservedTab`,
  // so whichever holds the slot presents its group header as a plain toolbar.
  const reservedPanelSpec = useCallback(
    (panelId: string) => ({
      id: panelId,
      component: panelId === AGENT_PANEL_ID ? "agent" : "graph",
      tabComponent: "reservedTab",
      title: panelId === AGENT_PANEL_ID ? agentTitle : graphTitle,
    }),
    [agentTitle, graphTitle],
  );

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const api = event.api;
      apiRef.current = api;
      // The reserved panel seeds the layout (full width until a document opens to
      // its left) — but only when the slot has an occupant; the reconcile effect
      // below handles add/remove on later flips.
      const seedId = reservedPanelIdFor(centerSlotRef.current);
      if (seedId !== null) {
        api.addPanel(reservedPanelSpec(seedId));
        syncReservedGroupHeader(api);
      }
      // Any layout change re-measures the graph rect so the pinned canvas follows
      // (a split, a sash drag, a dock, a float), and syncs dockview's tab order
      // back into the slice after a user drag-reorder. Skipped during our own
      // programmatic sync. [P06 persists here too.]
      api.onDidLayoutChange(() => {
        pokeGraphRect();
        syncReservedGroupHeader(api);
        if (syncingRef.current) return;
        reorderDocTabs(
          api.panels.filter((p) => !isReservedPanel(p.id)).map((p) => p.id),
        );
      });
      // User-driven activation -> store (ignore reserved panels and our own syncs).
      api.onDidActivePanelChange((panel) => {
        if (syncingRef.current || !panel || isReservedPanel(panel.id)) return;
        activateDocTab(panel.id);
      });
      // User-driven tab close -> store (a reserved panel is never closed this way).
      api.onDidRemovePanel((panel) => {
        if (syncingRef.current || isReservedPanel(panel.id)) return;
        closeDocTab(panel.id);
      });
    },
    [reservedPanelSpec],
  );

  // Reconcile the RESERVED panels to `centerSlot` (the exclusive slot verb). Adding
  // and removing a placeholder panel is safe for the canvas: `GraphCanvasHost` (the
  // real `<Stage/>` + WebGL context) is an app-lifetime SIBLING of the whole dockview
  // container that never unmounts, so the graph panel is only the rect source —
  // removing it HIDES the canvas (display:none via `setGraphVisible(false)` from
  // `GraphPanel`'s cleanup) and never destroys or re-parents it
  // (graph-canvas-is-portal-pinned-never-reparented). Flipping the slot to the agent
  // panel therefore does exactly what hiding the graph already did; the agent body
  // mounts inside its own panel and never touches the canvas host. On re-show the
  // occupant re-docks to the RIGHT of the documents (or seeds the empty workspace at
  // the root). Removals are applied BEFORE the add so the slot is never doubly
  // occupied, even if a restore raced both panels in.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const plan = deriveCenterSlotPlan(
      api.panels.map((panel) => panel.id),
      centerSlot,
    );
    if (isCenterSlotSettled(plan)) return;
    syncingRef.current = true;
    try {
      for (const panelId of plan.removeIds) {
        const panel = api.getPanel(panelId);
        if (panel) api.removePanel(panel);
      }
      if (plan.addId !== null) {
        const firstDoc = api.panels.find((panel) => !isReservedPanel(panel.id));
        api.addPanel({
          ...reservedPanelSpec(plan.addId),
          ...(firstDoc
            ? { position: { referencePanel: firstDoc.id, direction: "right" } }
            : {}),
        });
      }
      syncReservedGroupHeader(api);
    } finally {
      syncingRef.current = false;
    }
  }, [centerSlot, reservedPanelSpec]);

  // Reconcile dockview panels to the tab slice (the source of truth). Runs on any
  // openDocs/activeDocId change: add new doc panels (to the LEFT of the reserved
  // slot, or within the existing doc group), remove closed ones, and activate the
  // active tab. The syncing guard suppresses the echo events this mutation triggers.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    syncingRef.current = true;
    try {
      const plan = deriveDockWorkspaceSyncPlan(
        tabs.openDocs,
        tabs.activeDocId,
        api.panels.map((panel) => panel.id),
        RESERVED_PANEL_IDS,
      );
      // Remove doc panels no longer open.
      for (const panelId of plan.removeIds) {
        const panel = api.getPanel(panelId);
        if (panel) api.removePanel(panel);
      }
      // Add newly-open doc panels.
      for (const panel of plan.addPanels) {
        // First document splits LEFT of the slot; further documents tab into the
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
      syncReservedGroupHeader(api);
    } finally {
      syncingRef.current = false;
    }
  }, [tabs]);

  const setRoot = useCallback((el: HTMLDivElement | null) => {
    setWorkspaceContainer(el);
  }, []);

  // Ghost / empty mode: the center slot is empty AND no document is open, so the
  // center has nothing to render (appshell-reframe #11). Show the honest empty
  // state rather than a blank panel.
  const showGhost = centerSlot === "none" && tabs.openDocs.length === 0;

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
          prefixHeaderActionsComponent={DockGraphLegend}
          rightHeaderActionsComponent={DockHeaderActions}
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
