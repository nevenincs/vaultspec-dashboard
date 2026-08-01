// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";

import type { DashboardShellChromeView } from "../server/queries";
import {
  appShellGridColumns,
  boundedShellPanelSize,
  deriveShellFrameView,
  deriveShellResizeHandleView,
  normalizeRightRailTab,
  RIGHT_RAIL_TABS,
  RIGHT_RAIL_TAB_PRESENTATION,
  SHELL_MESSAGES,
  rightRailTabPresentation,
  rightRailAdjacentTab,
  resetShellLayout,
  resizeShellPanelByKey,
  setShellCenterSlot,
  shellResizeKeySize,
  shellResizePointerSize,
  startShellResizePointerSession,
  type ShellLayoutState,
} from "./shellLayout";
import { normalizeCenterSlot, useViewStore } from "./viewStore";

describe("shell layout frame view", () => {
  beforeEach(() => {
    resetShellLayout();
  });

  const shellLayout: ShellLayoutState = {
    leftRailVisible: true,
    leftRailWidth: 300,
    rightRailWidth: 320,
    timelineVisible: true,
    centerSlot: "graph",
    timelineHeight: 180,
  };
  const shellChrome: DashboardShellChromeView = {
    panelState: {
      left_collapsed: false,
      right_collapsed: false,
      right_tab: "status",
    },
    timeline: {
      mode: { kind: "live" },
      timeTravel: false,
      opsDisabled: false,
      asOf: undefined,
    },
  };

  it("uses one left-rail column for expanded, collapsed, and hidden states", () => {
    expect(
      appShellGridColumns({
        leftRailVisible: true,
        leftCollapsed: false,
        leftRailWidth: 300,
        rightCollapsed: false,
        rightRailWidth: 320,
      }),
    ).toBe("300px 1fr 320px");

    expect(
      appShellGridColumns({
        leftRailVisible: true,
        leftCollapsed: true,
        leftRailWidth: 300,
        rightCollapsed: false,
        rightRailWidth: 320,
      }),
    ).toBe("48px 1fr 320px");

    expect(
      appShellGridColumns({
        leftRailVisible: false,
        leftCollapsed: true,
        leftRailWidth: 300,
        rightCollapsed: true,
        rightRailWidth: 320,
      }),
    ).toBe("0px 1fr 0px");
  });

  it("is always exactly three tracks — the agent panel has no column of its own", () => {
    // The 4th track is DELETED (agent-panel-shell-integration D1): the agent panel
    // rides the center dock's reserved slot, so the shell grid never grows a column
    // for it in ANY slot state. Nothing about the slot may reach the track math.
    for (const slot of ["graph", "agent", "none"] as const) {
      expect(normalizeCenterSlot(slot)).toBe(slot);
      expect(
        appShellGridColumns({
          leftRailVisible: true,
          leftCollapsed: false,
          leftRailWidth: 300,
          rightCollapsed: false,
          rightRailWidth: 320,
        }),
      ).toBe("300px 1fr 320px");
    }
  });

  it("bounds shell panel dimensions at the shell layout seam", () => {
    expect(boundedShellPanelSize(301.7, 240, 480)).toBe(302);
    expect(boundedShellPanelSize(10, 240, 480)).toBe(240);
    expect(boundedShellPanelSize(999, 240, 480)).toBe(480);
    expect(boundedShellPanelSize(Number.NaN, 240, 480)).toBe(240);
  });

  it("derives pointer resize sizes for each shell edge", () => {
    expect(
      shellResizePointerSize({
        axis: "left",
        startSize: 300,
        startClientX: 100,
        startClientY: 200,
        clientX: 124,
        clientY: 180,
        min: 240,
        max: 480,
      }),
    ).toBe(324);
    expect(
      shellResizePointerSize({
        axis: "right",
        startSize: 320,
        startClientX: 900,
        startClientY: 200,
        clientX: 876,
        clientY: 180,
        min: 280,
        max: 520,
      }),
    ).toBe(344);
    expect(
      shellResizePointerSize({
        axis: "timeline",
        startSize: 180,
        startClientX: 300,
        startClientY: 600,
        clientX: 340,
        clientY: 568,
        min: 120,
        max: 360,
      }),
    ).toBe(212);
  });

  it("derives keyboard resize sizes for shell panel orientation", () => {
    expect(
      shellResizeKeySize({
        axis: "left",
        current: 300,
        key: "ArrowRight",
        min: 240,
        max: 480,
      }),
    ).toBe(316);
    expect(
      shellResizeKeySize({
        axis: "right",
        current: 320,
        key: "ArrowLeft",
        min: 280,
        max: 520,
      }),
    ).toBe(336);
    expect(
      shellResizeKeySize({
        axis: "timeline",
        current: 180,
        key: "ArrowUp",
        min: 120,
        max: 360,
      }),
    ).toBe(196);
    expect(
      shellResizeKeySize({
        axis: "timeline",
        current: 180,
        key: "ArrowRight",
        min: 120,
        max: 360,
      }),
    ).toBeNull();
  });

  it("runs pointer resize sessions through the shell layout write seam", () => {
    useViewStore.getState().setLeftRailWidth(300);

    startShellResizePointerSession({
      axis: "left",
      startSize: 300,
      startClientX: 100,
      startClientY: 200,
      target: document,
    });

    document.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 124, clientY: 180 }),
    );
    expect(useViewStore.getState().leftRailWidth).toBe(324);

    document.dispatchEvent(new MouseEvent("pointerup"));
    document.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 150, clientY: 180 }),
    );
    expect(useViewStore.getState().leftRailWidth).toBe(324);
  });

  it("runs keyboard resize intents through the shell layout write seam", () => {
    useViewStore.getState().setRightRailWidth(320);
    const prevented: string[] = [];

    expect(
      resizeShellPanelByKey({
        axis: "right",
        current: 320,
        key: "ArrowLeft",
        preventDefault: () => prevented.push("right"),
      }),
    ).toBe(true);
    expect(useViewStore.getState().rightRailWidth).toBe(336);
    expect(prevented).toEqual(["right"]);

    const timelineHeight = useViewStore.getState().timelineHeight;
    expect(
      resizeShellPanelByKey({
        axis: "timeline",
        current: 180,
        key: "ArrowRight",
        preventDefault: () => prevented.push("timeline"),
      }),
    ).toBe(false);
    expect(useViewStore.getState().timelineHeight).toBe(timelineHeight);
    expect(prevented).toEqual(["right"]);
  });

  it("projects the right-rail tab domain from the shell layout seam", () => {
    expect(RIGHT_RAIL_TABS).toEqual([
      RIGHT_RAIL_TAB_PRESENTATION.status,
      RIGHT_RAIL_TAB_PRESENTATION.changes,
    ]);
    expect(RIGHT_RAIL_TABS[0]).toBe(RIGHT_RAIL_TAB_PRESENTATION.status);
    expect(RIGHT_RAIL_TABS[1]).toBe(RIGHT_RAIL_TAB_PRESENTATION.changes);
    expect(RIGHT_RAIL_TAB_PRESENTATION.status).toEqual({
      id: "status",
      label: { key: "common:activityTabs.status" },
      actionLabel: { key: "common:actions.showStatus" },
    });
    expect(RIGHT_RAIL_TAB_PRESENTATION.changes).toEqual({
      id: "changes",
      label: { key: "common:activityTabs.changes" },
      actionLabel: { key: "common:actions.showChanges" },
    });
    expect(Object.isFrozen(RIGHT_RAIL_TAB_PRESENTATION)).toBe(true);
    expect(Object.isFrozen(RIGHT_RAIL_TAB_PRESENTATION.status)).toBe(true);
    expect(Object.isFrozen(RIGHT_RAIL_TAB_PRESENTATION.changes)).toBe(true);
    expect(Object.isFrozen(RIGHT_RAIL_TABS)).toBe(true);
    expect(rightRailTabPresentation("status")).toBe(RIGHT_RAIL_TAB_PRESENTATION.status);
    expect(rightRailTabPresentation("changes")).toBe(
      RIGHT_RAIL_TAB_PRESENTATION.changes,
    );
    expect(rightRailTabPresentation(" status ")).toBeNull();
    expect(rightRailTabPresentation("search")).toBeNull();
    expect(rightRailTabPresentation(null)).toBeNull();
  });

  it("projects right-rail roving tab movement from the tab domain", () => {
    expect(normalizeRightRailTab("changes")).toBe("changes");
    expect(normalizeRightRailTab(" changes ")).toBe("changes");
    expect(normalizeRightRailTab("missing")).toBe("status");
    expect(normalizeRightRailTab("   ")).toBe("status");
    expect(normalizeRightRailTab(null)).toBe("status");

    // Two tabs now (Status, Changes): next/previous wrap between the pair.
    expect(rightRailAdjacentTab("status", "next")).toBe("changes");
    expect(rightRailAdjacentTab(" changes ", "next")).toBe("status");
    expect(rightRailAdjacentTab("changes", "next")).toBe("status");
    expect(rightRailAdjacentTab("status", "previous")).toBe("changes");
    expect(rightRailAdjacentTab("missing", "next")).toBe("changes");
    expect(rightRailAdjacentTab("changes", "sideways")).toBe("status");
  });

  it("projects dashboard chrome and local layout into one shell frame", () => {
    expect(deriveShellFrameView(shellLayout, shellChrome)).toMatchObject({
      leftCollapsed: false,
      rightCollapsed: false,
      rightTab: "status",
      timeTravel: false,
      leftRailVisible: true,
      timelineVisible: true,
      gridColumns: "300px 1fr 320px",
      rootClassName: "relative grid h-screen min-h-0 bg-paper text-ink",
      leftRailClassName: "relative flex min-h-0 flex-col overflow-hidden",
      showCollapsedLeftRail: false,
      showExpandedLeftRail: true,
      leftRailContentClassName: "flex min-h-0 flex-1 flex-col border-r border-rule",
      stageColumnClassName: "flex min-h-0 min-w-0 flex-col",
      stageBodyClassName: "relative min-h-0 min-w-0 flex-1",
      showTimeline: true,
      timelineClassName:
        "relative flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden border-t border-rule",
      timelineStyle: { height: "180px" },
      timelineBodyClassName: "relative min-h-0 min-w-0 flex-1",
      rightRailClassName:
        "relative flex min-h-0 flex-col overflow-hidden border-l border-rule",
      showRightRail: true,
      rightRailToggleLabel: SHELL_MESSAGES.hideActivityPanel,
      // The scroll lives on the inner panel so the framework status cluster
      // pins as a footer outside the scroll region (activity-rail-realignment D2).
      activityRailClassName: "flex min-h-0 flex-1 flex-col",
      activityPanelClassName: "min-h-0 flex-1 overflow-y-auto p-fg-2",
    });
  });

  it("names the right-rail toggle for its inverse (hide when shown, show when hidden)", () => {
    expect(deriveShellFrameView(shellLayout, shellChrome).rightRailToggleLabel).toBe(
      SHELL_MESSAGES.hideActivityPanel,
    );
    const collapsed = deriveShellFrameView(shellLayout, {
      ...shellChrome,
      panelState: {
        left_collapsed: false,
        right_collapsed: true,
        right_tab: "status",
      },
    });
    expect(collapsed.rightRailToggleLabel).toBe(SHELL_MESSAGES.showActivityPanel);
  });

  it("applies dashboard collapse state while preserving visual dimensions", () => {
    const frame = deriveShellFrameView(shellLayout, {
      ...shellChrome,
      panelState: {
        left_collapsed: true,
        right_collapsed: true,
        right_tab: "changes",
      },
      timeline: {
        mode: { kind: "time-travel", at: 42 },
        timeTravel: true,
        opsDisabled: true,
        asOf: 42,
      },
    });

    expect(frame).toMatchObject({
      leftCollapsed: true,
      rightCollapsed: true,
      rightTab: "changes",
      timeTravel: true,
      leftRailWidth: 300,
      rightRailWidth: 320,
      gridColumns: "48px 1fr 0px",
      showCollapsedLeftRail: true,
      showExpandedLeftRail: false,
      showRightRail: false,
      rightRailClassName: "relative flex min-h-0 flex-col overflow-hidden",
    });
  });

  it("projects resize handle copy, orientation, and placement", () => {
    expect(deriveShellResizeHandleView("right")).toEqual({
      label: SHELL_MESSAGES.resizeNavigationPanel,
      orientation: "vertical",
      className:
        "absolute z-10 bg-transparent outline-none transition-colors duration-ui-fast ease-settle hover:bg-accent/20 focus-visible:bg-accent/20 focus-visible:outline-2 focus-visible:outline-focus right-[-0.1875rem] top-0 h-full w-2 cursor-col-resize",
    });
    expect(deriveShellResizeHandleView("left")).toMatchObject({
      label: SHELL_MESSAGES.resizeActivityPanel,
      orientation: "vertical",
    });
    expect(deriveShellResizeHandleView("top")).toMatchObject({
      label: SHELL_MESSAGES.resizeTimeline,
      orientation: "horizontal",
    });
    expect(deriveShellResizeHandleView("bottom")).toBeNull();
    expect(deriveShellResizeHandleView(null)).toBeNull();
  });
});

// The center slot is the shell verb the graph and the Agent panel share
// (agent-panel-shell-integration D1). It normalizes at the boundary — including the
// LEGACY boolean any pre-slot layout blob would carry — and resets to the graph.
describe("center slot verb", () => {
  beforeEach(() => {
    resetShellLayout();
  });

  it("migrates a legacy graphVisible boolean onto the slot", () => {
    // The verb this replaced was a boolean: true meant the graph was in the center,
    // false meant the center was empty. A restored blob written before the slot
    // existed must land on exactly that reading, not on the fallback.
    expect(normalizeCenterSlot(true)).toBe("graph");
    expect(normalizeCenterSlot(false)).toBe("none");
  });

  it("falls back to the graph for anything it does not recognize", () => {
    expect(normalizeCenterSlot("terminal")).toBe("graph");
    expect(normalizeCenterSlot(null)).toBe("graph");
    expect(normalizeCenterSlot(undefined)).toBe("graph");
    expect(normalizeCenterSlot(7)).toBe("graph");
  });

  it("stores each occupant and validates through the same seam", () => {
    setShellCenterSlot("agent");
    expect(useViewStore.getState().centerSlot).toBe("agent");
    setShellCenterSlot("none");
    expect(useViewStore.getState().centerSlot).toBe("none");
    setShellCenterSlot("nonsense");
    expect(useViewStore.getState().centerSlot).toBe("graph");
  });

  it("restores the graph on layout reset", () => {
    setShellCenterSlot("agent");
    resetShellLayout();
    expect(useViewStore.getState().centerSlot).toBe("graph");
  });
});
