// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";

import type { DashboardShellChromeView } from "../server/queries";
import {
  appShellGridColumns,
  boundedShellPanelSize,
  deriveShellFrameView,
  deriveShellPanelControlsView,
  deriveShellResizeHandleView,
  normalizeRightRailTab,
  RIGHT_RAIL_TABS,
  rightRailAdjacentTab,
  resetShellLayout,
  resizeShellPanelByKey,
  shellResizeKeySize,
  shellResizePointerSize,
  startShellResizePointerSession,
  type ShellLayoutState,
} from "./shellLayout";
import { useViewStore } from "./viewStore";

describe("shell layout frame view", () => {
  beforeEach(() => {
    resetShellLayout();
  });

  const shellLayout: ShellLayoutState = {
    leftRailVisible: true,
    leftRailWidth: 300,
    rightRailWidth: 320,
    timelineVisible: true,
    timelineHeight: 180,
    panelFlyoutOpen: false,
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
      { id: "status", label: "Status" },
      { id: "changes", label: "Changes" },
      { id: "search", label: "Search" },
    ]);
  });

  it("projects right-rail roving tab movement from the tab domain", () => {
    expect(normalizeRightRailTab("changes")).toBe("changes");
    expect(normalizeRightRailTab(" changes ")).toBe("changes");
    expect(normalizeRightRailTab("missing")).toBe("status");
    expect(normalizeRightRailTab("   ")).toBe("status");
    expect(normalizeRightRailTab(null)).toBe("status");

    expect(rightRailAdjacentTab("status", "next")).toBe("changes");
    expect(rightRailAdjacentTab(" changes ", "next")).toBe("search");
    expect(rightRailAdjacentTab("changes", "next")).toBe("search");
    expect(rightRailAdjacentTab("search", "next")).toBe("status");
    expect(rightRailAdjacentTab("status", "previous")).toBe("search");
    expect(rightRailAdjacentTab("missing", "next")).toBe("changes");
    expect(rightRailAdjacentTab("search", "sideways")).toBe("status");
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
      panelFlyoutRootClassName: "pointer-events-none absolute top-2 z-20",
      panelFlyoutRootStyle: { left: 262 },
      panelFlyoutButtonWrapperClassName: "pointer-events-auto",
      activityRailClassName:
        "flex min-h-0 flex-1 flex-col gap-fg-2 overflow-y-auto p-fg-2",
      activityPanelClassName: "min-h-0 flex-1",
      panelControls: {
        flyoutButtonLabel: "Open panel controls",
        flyoutMenuLabel: "panel controls",
        flyoutMenuClassName:
          "pointer-events-auto mt-fg-2 w-52 rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-raised",
        itemClassName:
          "flex w-full items-center rounded-fg-sm px-fg-2 py-fg-1-5 text-left text-label text-ink-muted transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        leftRailVisibilityLabel: "Hide left rail",
        showLeftCollapseControl: true,
        leftCollapseLabel: "Collapse left rail",
        rightRailVisibilityLabel: "Hide right rail",
        timelineVisibilityLabel: "Hide timeline",
      },
    });
  });

  it("projects panel-control labels from shell frame state", () => {
    expect(
      deriveShellPanelControlsView({
        panelFlyoutOpen: true,
        leftRailVisible: false,
        leftCollapsed: true,
        rightCollapsed: true,
        timelineVisible: false,
      }),
    ).toEqual({
      flyoutButtonLabel: "Close panel controls",
      flyoutMenuLabel: "panel controls",
      flyoutMenuClassName:
        "pointer-events-auto mt-fg-2 w-52 rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-raised",
      itemClassName:
        "flex w-full items-center rounded-fg-sm px-fg-2 py-fg-1-5 text-left text-label text-ink-muted transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      leftRailVisibilityLabel: "Show left rail",
      showLeftCollapseControl: false,
      leftCollapseLabel: "Expand left rail",
      rightRailVisibilityLabel: "Show right rail",
      timelineVisibilityLabel: "Show timeline",
    });
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
      label: "Resize left rail",
      orientation: "vertical",
      className:
        "absolute z-10 bg-transparent outline-none transition-colors duration-ui-fast ease-settle hover:bg-accent/20 focus-visible:bg-accent/20 focus-visible:outline-2 focus-visible:outline-focus right-[-3px] top-0 h-full w-2 cursor-col-resize",
    });
    expect(deriveShellResizeHandleView("left")).toMatchObject({
      label: "Resize right rail",
      orientation: "vertical",
    });
    expect(deriveShellResizeHandleView("top")).toMatchObject({
      label: "Resize timeline",
      orientation: "horizontal",
    });
  });
});
