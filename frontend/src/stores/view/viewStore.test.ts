import { describe, expect, it } from "vitest";

import type { EngineEdge } from "../server/engine";
import { useLiveStatusStore } from "../server/liveStatus";
import {
  browserTreeExpansionKey,
  useBrowserTreeExpansionStore,
} from "./browserTreeExpansion";
import { useCommandPaletteStore } from "./commandPalette";
import { openContextMenu, useContextMenuStore } from "./contextMenu";
import {
  setCreateDocFeature,
  toggleCreateDocDialog,
  useCreateDocChromeStore,
} from "./createDocChrome";
import { openDiscoveryPanel, useDiscoveryPanelStore } from "./discoveries";
import { DISCOVERY_EDGE_ID_MAX_CHARS } from "./discoveryEdges";
import { useFilterSidebarStore } from "./filterSidebar";
import {
  setGraphControlsSettingsOpen,
  useGraphControlsChromeStore,
} from "./graphControlsChrome";
import {
  inspectorExpansionKey,
  useInspectorExpansionStore,
} from "./inspectorExpansion";
import { setIslandAnchor, useIslandAnchorStore } from "./islandAnchors";
import { useKeyboardShortcutsStore } from "./keyboardShortcuts";
import { useLensStore } from "./lenses";
import { usePinStore } from "./pins";
import { pipelineExpansionKey, usePipelineExpansionStore } from "./pipelineExpansion";
import { useSearchIntentStore } from "./searchIntent";
import {
  showMoreRecentCommits,
  toggleRecentCommit,
  toggleStatusSection,
  useStatusTabChromeStore,
} from "./statusTabChrome";
import {
  DEFAULT_PX_PER_MS,
  openTimelineDatePicker,
  setTimelineMinimapDrag,
  startTimelineRangeDrag,
  useTimelineStore,
} from "./timeline";
import {
  LEFT_RAIL_DEFAULT_WIDTH,
  LEFT_RAIL_MAX_WIDTH,
  LEFT_RAIL_MIN_WIDTH,
  OPENED_IDS_CAP,
  PINNED_DISCOVERIES_CAP,
  RIGHT_RAIL_DEFAULT_WIDTH,
  RIGHT_RAIL_MAX_WIDTH,
  RIGHT_RAIL_MIN_WIDTH,
  SCOPE_ID_MAX_CHARS,
  TIMELINE_DEFAULT_HEIGHT,
  TIMELINE_MAX_HEIGHT,
  TIMELINE_MIN_HEIGHT,
  VIEW_STORE_SESSION_STRING_LIST_MAX_ITEMS,
  WORKING_SET_CAP,
  DEFAULT_GRAPH_OVERLAYS,
  normalizeViewStoreSessionString,
  normalizeViewStoreSessionStringList,
  normalizeShellLayoutPanelSize,
  normalizeShellLayoutVisible,
  useViewStore,
} from "./viewStore";
import {
  beginWorktreeSwitch,
  setWorktreePickerExpanded,
  useWorktreePickerChromeStore,
} from "./worktreePickerChrome";

describe("view store", () => {
  it("stores local event/edge selection metadata only", () => {
    useViewStore
      .getState()
      .selectEntity({ kind: "event", id: "evt-1", nodeIds: ["doc:a"] });
    expect(useViewStore.getState().selection).toEqual({
      kind: "event",
      id: "evt-1",
      nodeIds: ["doc:a"],
    });
    useViewStore.getState().selectEntity({ kind: "edge", id: "edge-1" });
    expect(useViewStore.getState().selection).toEqual({
      kind: "edge",
      id: "edge-1",
    });
  });

  it("keeps the working set explicit and deduplicated", () => {
    const store = useViewStore.getState();
    store.clearWorkingSet();
    store.addToWorkingSet(" a ");
    store.addToWorkingSet("a");
    store.addToWorkingSet("   ");
    store.addToWorkingSet("b");
    expect(useViewStore.getState().workingSet).toEqual(["a", "b"]);
    useViewStore.getState().removeFromWorkingSet(" a ");
    expect(useViewStore.getState().workingSet).toEqual(["b"]);
  });

  it("caps the working set to the most-recent entries (P-MED-4)", () => {
    const store = useViewStore.getState();
    store.clearWorkingSet();
    for (let i = 0; i < WORKING_SET_CAP + 10; i += 1) store.addToWorkingSet(`n${i}`);
    const ws = useViewStore.getState().workingSet;
    // bounded — the ego-query fan-out cannot grow without limit
    expect(ws).toHaveLength(WORKING_SET_CAP);
    // oldest evicted, newest retained
    expect(ws).not.toContain("n0");
    expect(ws[ws.length - 1]).toBe(`n${WORKING_SET_CAP + 9}`);
  });

  it("caps opened islands to the most-recent entries (B3, resource-hardening)", () => {
    const store = useViewStore.getState();
    for (let i = 0; i < OPENED_IDS_CAP + 8; i += 1) store.openNode(`open${i}`);
    const opened = useViewStore.getState().openedIds;
    // bounded — each opened island holds live node/neighbor query observers, so
    // an uncapped list would retain payloads + prevent GC for the whole session
    expect(opened).toHaveLength(OPENED_IDS_CAP);
    // oldest evicted (LRU), newest retained
    expect(opened).not.toContain("open0");
    expect(opened[opened.length - 1]).toBe(`open${OPENED_IDS_CAP + 7}`);
    // re-opening keeps the cap and does not duplicate
    const before = useViewStore.getState().openedIds.length;
    const oldest = opened[0];
    store.openNode(oldest);
    const after = useViewStore.getState().openedIds;
    expect(after).toHaveLength(before);
    expect(after.filter((id) => id === oldest)).toHaveLength(1);
    // move-to-end LRU: re-opening the oldest refreshes it to the most-recent slot
    expect(after[after.length - 1]).toBe(oldest);
  });

  it("normalizes opened island ids and hover ids at the store boundary", () => {
    const store = useViewStore.getState();
    useViewStore.setState({ openedIds: [], hoveredId: null, dwelledHoverId: null });

    store.openNode(" doc:a ");
    store.openNode("doc:a");
    store.openNode("   ");
    expect(useViewStore.getState().openedIds).toEqual(["doc:a"]);

    store.closeNode(" doc:a ");
    expect(useViewStore.getState().openedIds).toEqual([]);

    store.setHovered(" doc:hover ");
    store.setDwelledHover(" doc:hover ");
    expect(useViewStore.getState()).toMatchObject({
      hoveredId: "doc:hover",
      dwelledHoverId: "doc:hover",
    });
    store.setHovered("   ");
    expect(useViewStore.getState()).toMatchObject({
      hoveredId: null,
      dwelledHoverId: null,
    });
  });

  it("caps session-pinned discoveries to the most-recent entries (P-LOW-10)", () => {
    const edge = (id: string): EngineEdge => ({
      id,
      src: "a",
      dst: "b",
      relation: "declares",
      tier: "semantic",
      confidence: 0.5,
    });
    const store = useViewStore.getState();
    for (let i = 0; i < PINNED_DISCOVERIES_CAP + 5; i += 1)
      store.pinDiscovery(edge(`p${i}`));
    const pins = useViewStore.getState().pinnedDiscoveries;
    expect(pins).toHaveLength(PINNED_DISCOVERIES_CAP);
    expect(pins.some((e) => e.id === "p0")).toBe(false);
  });

  it("normalizes pinned discovery endpoints and ignores invalid endpoint ids", () => {
    const store = useViewStore.getState();
    useViewStore.setState({ pinnedDiscoveries: [] });

    store.pinDiscovery({
      id: "pin-valid",
      src: " doc:a ",
      dst: " doc:b ",
      relation: "similar-to",
      tier: "semantic",
      confidence: 0.7,
    });
    store.pinDiscovery({
      id: "pin-invalid",
      src: "",
      dst: "doc:c",
      relation: "similar-to",
      tier: "semantic",
      confidence: 0.7,
    });

    expect(useViewStore.getState().pinnedDiscoveries).toEqual([
      expect.objectContaining({ id: "pin-valid", src: "doc:a", dst: "doc:b" }),
    ]);
  });

  it("normalizes full pinned discovery edges at the store boundary", () => {
    const store = useViewStore.getState();
    useViewStore.setState({ pinnedDiscoveries: [] });
    const overlongId = "p".repeat(DISCOVERY_EDGE_ID_MAX_CHARS + 1);

    store.pinDiscovery({
      id: " pin-valid ",
      src: " doc:a ",
      dst: " doc:b ",
      relation: " similar-to ",
      tier: "semantic",
      confidence: 7,
    });
    store.pinDiscovery({
      id: "pin-invalid-relation",
      src: "doc:a",
      dst: "doc:b",
      relation: "   ",
      tier: "semantic",
      confidence: 0.5,
    });
    store.pinDiscovery({
      id: "pin-invalid-tier",
      src: "doc:a",
      dst: "doc:b",
      relation: "similar-to",
      tier: "runtime-invalid",
      confidence: 0.5,
    } as unknown as EngineEdge);
    store.pinDiscovery({
      id: overlongId,
      src: "doc:a",
      dst: "doc:b",
      relation: "similar-to",
      tier: "semantic",
      confidence: 0.5,
    });

    expect(useViewStore.getState().pinnedDiscoveries).toEqual([
      expect.objectContaining({
        id: "pin-valid",
        src: "doc:a",
        dst: "doc:b",
        relation: "similar-to",
        confidence: 1,
      }),
    ]);

    store.unpinDiscovery({ id: "pin-valid" });
    expect(useViewStore.getState().pinnedDiscoveries).toHaveLength(1);

    store.unpinDiscovery(" pin-valid ");
    expect(useViewStore.getState().pinnedDiscoveries).toEqual([]);
  });

  it("prunes visual node affordances against the held graph model", () => {
    const validEdge: EngineEdge = {
      id: "pin-valid",
      src: "doc:keep",
      dst: "doc:related",
      relation: "similar-to",
      tier: "semantic",
      confidence: 0.7,
    };
    const staleEdge: EngineEdge = {
      id: "pin-stale",
      src: "doc:keep",
      dst: "doc:missing",
      relation: "similar-to",
      tier: "semantic",
      confidence: 0.7,
    };
    useViewStore.setState({
      selection: null,
      workingSet: [],
      openedIds: [],
      pinnedDiscoveries: [],
    });
    const store = useViewStore.getState();
    store.selectEntity({
      kind: "event",
      id: "evt-stale",
      nodeIds: ["doc:keep", "doc:missing"],
    });
    store.addToWorkingSet("doc:keep");
    store.addToWorkingSet("doc:missing");
    store.openNode("doc:keep");
    store.openNode("doc:missing");
    store.pinDiscovery(validEdge);
    store.pinDiscovery(staleEdge);

    store.pruneNodeAffordances(["doc:keep", "doc:related"]);

    expect(useViewStore.getState()).toMatchObject({
      selection: { kind: "event", id: "evt-stale", nodeIds: ["doc:keep"] },
      workingSet: ["doc:keep"],
      openedIds: ["doc:keep"],
      pinnedDiscoveries: [validEdge],
    });
  });

  it("clears local event selection when none of its carried nodes remain", () => {
    useViewStore.setState({
      selection: { kind: "event", id: "evt-stale", nodeIds: ["doc:missing"] },
    });

    useViewStore.getState().pruneNodeAffordances(["doc:keep"]);

    expect(useViewStore.getState().selection).toBeNull();
  });

  it("copies graph overlay state at the store boundary", () => {
    const overlays = { featureCountries: false, featureHulls: true };

    useViewStore.getState().setOverlays(overlays);
    overlays.featureCountries = true;

    expect(useViewStore.getState().overlays).toEqual({
      featureCountries: false,
      featureHulls: true,
    });

    useViewStore.getState().setOverlays(DEFAULT_GRAPH_OVERLAYS);
  });

  it("resets the live-connection slice on a wholesale scope swap (live-state D1)", () => {
    // Seed a previous scope's live plane, then swap scope.
    const live = useLiveStatusStore.getState();
    live.setStreamConnected(true);
    live.setLastSeq(12);
    live.setBrokenLinkCount(3);
    useViewStore.getState().setScope("worktree-b");
    // The previous corpus's live plane must not bleed into the new scope.
    expect(useLiveStatusStore.getState()).toMatchObject({
      streamConnected: null,
      lastSeq: null,
      brokenLinkCount: 0,
    });
  });

  it("resets timeline view affordances on a wholesale scope swap", () => {
    const timeline = useTimelineStore.getState();
    timeline.setPlayhead(1234);
    timeline.setPxPerMs(DEFAULT_PX_PER_MS * 8);
    timeline.setScrollOffset(999);
    timeline.toggleLane("exec", false);
    openTimelineDatePicker("2026-06-01", "2026-06-30");
    startTimelineRangeDrag(22);
    setTimelineMinimapDrag({
      pointerId: 7,
      mode: "move",
      initialFromMs: 10,
      initialToMs: 20,
      grabOffsetMs: 5,
    });

    useViewStore.getState().setScope("timeline-reset-scope");

    expect(useTimelineStore.getState()).toMatchObject({
      playheadT: "live",
      pxPerMs: DEFAULT_PX_PER_MS,
      scrollOffset: 0,
      datePicker: { open: false, draftFrom: "", draftTo: "" },
      rangeDrag: null,
      minimapDrag: null,
    });
    expect(useTimelineStore.getState().laneVisibility.exec).toBe(true);
  });

  it("resets right-rail pipeline expansion on a wholesale scope swap", () => {
    const key = pipelineExpansionKey("previous-scope");
    usePipelineExpansionStore.getState().toggle(key, "doc:previous-plan");

    useViewStore.getState().setScope("pipeline-reset-scope");

    expect(usePipelineExpansionStore.getState().expandedIds).toEqual([]);
  });

  it("resets left-rail browser tree expansion on a wholesale scope swap", () => {
    const key = browserTreeExpansionKey("previous-scope", "vault");
    useBrowserTreeExpansionStore.getState().toggle(key, "f:previous-feature");

    useViewStore.getState().setScope("browser-tree-reset-scope");

    expect(useBrowserTreeExpansionStore.getState().expandedKeys).toEqual([]);
  });

  it("resets inspector expansion on a wholesale scope swap", () => {
    const key = inspectorExpansionKey("previous-scope", "doc:previous");
    useInspectorExpansionStore.getState().toggleTier(key, "structural");

    useViewStore.getState().setScope("inspector-reset-scope");

    expect(useInspectorExpansionStore.getState().expandedTiers).toEqual([]);
  });

  it("resets DOM island anchors on a wholesale scope swap", () => {
    setIslandAnchor("doc:previous", { x: 8, y: 13, scale: 1 });

    useViewStore.getState().setScope("island-anchor-reset-scope");

    expect(useIslandAnchorStore.getState().anchors).toEqual({});
  });

  it("resets right-rail search intent on a wholesale scope swap", () => {
    const search = useSearchIntentStore.getState();
    search.setQuery("previous corpus");
    search.setTarget("code");

    useViewStore.getState().setScope("search-reset-scope");

    expect(useSearchIntentStore.getState()).toMatchObject({
      query: "",
      target: "vault",
    });
  });

  it("closes the command palette on a wholesale scope swap", () => {
    useCommandPaletteStore.getState().openPalette();
    useKeyboardShortcutsStore.getState().openDialog();
    openContextMenu({ kind: "node", id: "doc:previous" }, { x: 10, y: 20 });
    useContextMenuStore.getState().arm("node:delete");

    useViewStore.getState().setScope("command-palette-reset-scope");

    expect(useCommandPaletteStore.getState().open).toBe(false);
    expect(useKeyboardShortcutsStore.getState().open).toBe(false);
    expect(useContextMenuStore.getState()).toMatchObject({
      open: false,
      entity: null,
      anchor: null,
      armedItemId: null,
    });
  });

  it("closes the stage filter sidebar on wholesale swaps", () => {
    useFilterSidebarStore.getState().setOpen(true);

    useViewStore.getState().setScope("filter-sidebar-reset-scope");

    expect(useFilterSidebarStore.getState().open).toBe(false);

    useFilterSidebarStore.getState().setOpen(true);
    useViewStore.getState().swapWorkspace("/project-b/.git", "/project-b/main");

    expect(useFilterSidebarStore.getState().open).toBe(false);
  });

  it("stores shell panel flyout state and closes it on wholesale swaps", () => {
    const store = useViewStore.getState();
    store.setPanelFlyoutOpen(false);

    store.togglePanelFlyout();
    expect(useViewStore.getState().panelFlyoutOpen).toBe(true);

    store.setScope("panel-flyout-reset-scope");
    expect(useViewStore.getState().panelFlyoutOpen).toBe(false);

    useViewStore.getState().setPanelFlyoutOpen(true);
    useViewStore.getState().swapWorkspace("/project-b/.git", "/project-b/main");
    expect(useViewStore.getState().panelFlyoutOpen).toBe(false);
  });

  it("restores the shell layout to defaults on reset", () => {
    const store = useViewStore.getState();
    store.setLeftRailVisible(false);
    store.setTimelineVisible(false);
    store.setLeftRailWidth(LEFT_RAIL_MAX_WIDTH);
    store.setRightRailWidth(RIGHT_RAIL_MAX_WIDTH);
    store.setTimelineHeight(TIMELINE_MAX_HEIGHT);
    store.setPanelFlyoutOpen(true);

    useViewStore.getState().resetShellLayout();

    expect(useViewStore.getState()).toMatchObject({
      leftRailVisible: true,
      timelineVisible: true,
      leftRailWidth: LEFT_RAIL_DEFAULT_WIDTH,
      rightRailWidth: RIGHT_RAIL_DEFAULT_WIDTH,
      timelineHeight: TIMELINE_DEFAULT_HEIGHT,
      panelFlyoutOpen: false,
    });
  });

  it("keeps shell panel dimensions bounded", () => {
    const store = useViewStore.getState();

    store.setLeftRailWidth(10);
    store.setRightRailWidth(10);
    store.setTimelineHeight(10);
    expect(useViewStore.getState().leftRailWidth).toBe(LEFT_RAIL_MIN_WIDTH);
    expect(useViewStore.getState().rightRailWidth).toBe(RIGHT_RAIL_MIN_WIDTH);
    expect(useViewStore.getState().timelineHeight).toBe(TIMELINE_MIN_HEIGHT);

    store.setLeftRailWidth(9999);
    store.setRightRailWidth(9999);
    store.setTimelineHeight(9999);
    expect(useViewStore.getState().leftRailWidth).toBe(LEFT_RAIL_MAX_WIDTH);
    expect(useViewStore.getState().rightRailWidth).toBe(RIGHT_RAIL_MAX_WIDTH);
    expect(useViewStore.getState().timelineHeight).toBe(TIMELINE_MAX_HEIGHT);
  });

  it("normalizes malformed shell layout writes at the view-store boundary", () => {
    const store = useViewStore.getState();
    store.resetShellLayout();

    expect(normalizeShellLayoutVisible(true)).toBe(true);
    expect(normalizeShellLayoutVisible("true")).toBe(false);
    expect(
      normalizeShellLayoutPanelSize(
        Number.NaN,
        LEFT_RAIL_MIN_WIDTH,
        LEFT_RAIL_MAX_WIDTH,
      ),
    ).toBe(LEFT_RAIL_MIN_WIDTH);
    expect(
      normalizeShellLayoutPanelSize(
        LEFT_RAIL_MIN_WIDTH + 0.7,
        LEFT_RAIL_MIN_WIDTH,
        LEFT_RAIL_MAX_WIDTH,
      ),
    ).toBe(LEFT_RAIL_MIN_WIDTH + 1);

    store.setLeftRailVisible("false");
    store.setTimelineVisible({ visible: true });
    store.setPanelFlyoutOpen("open");
    store.setLeftRailWidth(Number.NaN);
    store.setRightRailWidth("320");
    store.setTimelineHeight(Number.POSITIVE_INFINITY);

    expect(useViewStore.getState()).toMatchObject({
      leftRailVisible: false,
      timelineVisible: false,
      panelFlyoutOpen: false,
      leftRailWidth: LEFT_RAIL_MIN_WIDTH,
      rightRailWidth: RIGHT_RAIL_MIN_WIDTH,
      timelineHeight: TIMELINE_MIN_HEIGHT,
    });
  });

  it("normalizes session scope-context runtime inputs at the view-store boundary", () => {
    expect(normalizeViewStoreSessionString(" scope-a ")).toBe("scope-a");
    expect(normalizeViewStoreSessionString("   ")).toBeNull();
    expect(normalizeViewStoreSessionString({ value: "scope-a" })).toBeNull();
    expect(
      normalizeViewStoreSessionString("x".repeat(SCOPE_ID_MAX_CHARS + 1)),
    ).toBeNull();
    expect(
      normalizeViewStoreSessionStringList([" feature-a ", "feature-a", "", 7]),
    ).toEqual(["feature-a"]);
    expect(
      normalizeViewStoreSessionStringList(
        Array.from(
          { length: VIEW_STORE_SESSION_STRING_LIST_MAX_ITEMS + 1 },
          (_, index) => `feature-${index}`,
        ),
      ),
    ).toHaveLength(VIEW_STORE_SESSION_STRING_LIST_MAX_ITEMS);

    usePinStore.setState({
      pinnedIds: [],
      workspace: "source-workspace",
      scope: "source-scope",
    });
    useLensStore.setState({
      saved: [],
      workspace: "source-workspace",
      scope: "source-scope",
    });

    useViewStore.getState().seedFromSession({
      workspace: " workspace-a ",
      scope: " scope-a ",
      folder: " .vault/adr ",
      featureTags: [" feature-a ", "feature-a", "", 7],
    });

    expect(useViewStore.getState()).toMatchObject({
      scope: "scope-a",
      activeFolder: ".vault/adr",
      featureContexts: ["feature-a"],
    });
    expect(usePinStore.getState()).toMatchObject({
      workspace: "workspace-a",
      scope: "scope-a",
    });
    expect(useLensStore.getState()).toMatchObject({
      workspace: "workspace-a",
      scope: "scope-a",
    });

    useViewStore.getState().setScopeContext({
      folder: { value: ".vault/plan" },
      featureTags: [" plan ", "plan", null],
    });
    expect(useViewStore.getState()).toMatchObject({
      activeFolder: null,
      featureContexts: ["plan"],
    });

    useViewStore.getState().swapWorkspace({ bad: "workspace" }, "   ");
    expect(useViewStore.getState().scope).toBeNull();
    expect(usePinStore.getState()).toMatchObject({
      workspace: "workspace-a",
      scope: "default",
    });
  });

  it("stores shell panel visibility without resetting scoped corpus state", () => {
    const store = useViewStore.getState();
    store.setScopeContext({ folder: ".vault/adr", featureTags: ["rail"] });

    store.setLeftRailVisible(false);
    store.setTimelineVisible(false);
    expect(useViewStore.getState()).toMatchObject({
      leftRailVisible: false,
      timelineVisible: false,
      activeFolder: ".vault/adr",
      featureContexts: ["rail"],
    });

    store.setLeftRailVisible(true);
    store.setTimelineVisible(true);
    expect(useViewStore.getState()).toMatchObject({
      leftRailVisible: true,
      timelineVisible: true,
      activeFolder: ".vault/adr",
      featureContexts: ["rail"],
    });
  });

  it("keeps shell layout preferences across corpus swaps while clearing transient panel chrome", () => {
    const store = useViewStore.getState();
    store.setScopeContext({ folder: ".vault/adr", featureTags: ["rail"] });
    store.selectEntity({ kind: "event", id: "evt:previous", nodeIds: ["doc:old"] });
    store.addToWorkingSet("doc:old");
    store.setOverlays({ featureCountries: false, featureHulls: true });
    store.setLeftRailVisible(false);
    store.setTimelineVisible(false);
    store.setLeftRailWidth(333);
    store.setRightRailWidth(277);
    store.setTimelineHeight(188);
    store.setPanelFlyoutOpen(true);
    openDiscoveryPanel("doc:previous-discovery");
    toggleCreateDocDialog();
    setCreateDocFeature("previous-feature");
    setGraphControlsSettingsOpen(true);
    toggleStatusSection("recent-commits", true);
    toggleRecentCommit("previous-commit");
    showMoreRecentCommits(20, 20);
    setWorktreePickerExpanded(true, false);
    beginWorktreeSwitch("previous-worktree");

    store.setScope("shell-layout-preserved-worktree");

    expect(useViewStore.getState()).toMatchObject({
      leftRailVisible: false,
      timelineVisible: false,
      leftRailWidth: 333,
      rightRailWidth: 277,
      timelineHeight: 188,
      panelFlyoutOpen: false,
      activeFolder: null,
      featureContexts: [],
      selection: null,
      workingSet: [],
      overlays: { featureCountries: false, featureHulls: true },
    });
    expect(useDiscoveryPanelStore.getState().openFor).toBeNull();
    expect(useCreateDocChromeStore.getState()).toMatchObject({
      open: false,
      feature: "",
    });
    expect(useGraphControlsChromeStore.getState().settingsOpen).toBe(false);
    expect(useStatusTabChromeStore.getState()).toMatchObject({
      sections: {},
      openRecentCommitHashes: [],
      recentCommitsLimit: null,
    });
    expect(useWorktreePickerChromeStore.getState()).toMatchObject({
      expanded: false,
      pendingId: null,
      switchError: null,
    });

    useViewStore.getState().setLeftRailVisible(true);
    useViewStore.getState().setTimelineVisible(true);
    useViewStore.getState().setLeftRailWidth(312);
    useViewStore.getState().setRightRailWidth(318);
    useViewStore.getState().setTimelineHeight(222);
    useViewStore.getState().setPanelFlyoutOpen(true);
    useViewStore.getState().addToWorkingSet("doc:workspace-old");
    useViewStore
      .getState()
      .setOverlays({ featureCountries: true, featureHulls: false });
    openDiscoveryPanel("doc:workspace-old-discovery");
    toggleCreateDocDialog();
    setCreateDocFeature("workspace-old-feature");
    setGraphControlsSettingsOpen(true);
    toggleStatusSection("recent-commits", true);
    toggleRecentCommit("workspace-old-commit");
    showMoreRecentCommits(20, 20);
    setWorktreePickerExpanded(true, false);
    beginWorktreeSwitch("workspace-old-worktree");

    useViewStore.getState().swapWorkspace("/project-b/.git", "/project-b/main");

    expect(useViewStore.getState()).toMatchObject({
      leftRailVisible: true,
      timelineVisible: true,
      leftRailWidth: 312,
      rightRailWidth: 318,
      timelineHeight: 222,
      panelFlyoutOpen: false,
      activeFolder: null,
      featureContexts: [],
      workingSet: [],
      overlays: { featureCountries: true, featureHulls: false },
    });
    expect(useDiscoveryPanelStore.getState().openFor).toBeNull();
    expect(useCreateDocChromeStore.getState()).toMatchObject({
      open: false,
      feature: "",
    });
    expect(useGraphControlsChromeStore.getState().settingsOpen).toBe(false);
    expect(useStatusTabChromeStore.getState()).toMatchObject({
      sections: {},
      openRecentCommitHashes: [],
      recentCommitsLimit: null,
    });
    expect(useWorktreePickerChromeStore.getState()).toMatchObject({
      expanded: false,
      pendingId: null,
      switchError: null,
    });

    useViewStore.getState().setOverlays(DEFAULT_GRAPH_OVERLAYS);
  });
});
