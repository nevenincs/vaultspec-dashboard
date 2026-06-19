import { useShallow } from "zustand/react/shallow";

import {
  DASHBOARD_PANEL_TABS,
  type DashboardPanelState,
  type DashboardPanelTab,
} from "../server/engine";
import {
  type DashboardShellChromeView,
  useDashboardShellChromeView,
} from "../server/queries";
import { useViewStore } from "./viewStore";

export {
  LEFT_RAIL_MAX_WIDTH,
  LEFT_RAIL_MIN_WIDTH,
  RIGHT_RAIL_MAX_WIDTH,
  RIGHT_RAIL_MIN_WIDTH,
  TIMELINE_MAX_HEIGHT,
  TIMELINE_MIN_HEIGHT,
} from "./viewStore";

export interface ShellLayoutState {
  leftRailVisible: boolean;
  leftRailWidth: number;
  rightRailWidth: number;
  timelineVisible: boolean;
  timelineHeight: number;
  panelFlyoutOpen: boolean;
}

export const LEFT_RAIL_COLLAPSED_WIDTH = 48;
export const SHELL_PANEL_KEY_STEP = 16;
export type RailTabId = DashboardPanelState["right_tab"];

export interface RightRailTabOption {
  id: RailTabId;
  label: string;
}

const RIGHT_RAIL_TAB_LABELS: Record<DashboardPanelTab, string> = {
  status: "Status",
  changes: "Changes",
  search: "Search",
};

// Status · Changes · Search, left to right: ids come from the dashboard-state
// wire schema; labels live with the shell frame view so right-rail chrome does not
// mint a parallel tab domain.
export const RIGHT_RAIL_TABS: readonly RightRailTabOption[] = DASHBOARD_PANEL_TABS.map(
  (id) => ({
    id,
    label: RIGHT_RAIL_TAB_LABELS[id],
  }),
);

export function boundedShellPanelSize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export type ShellResizeAxis = "left" | "right" | "timeline";
export type ShellResizeKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

export interface ShellResizePointerInput {
  axis: ShellResizeAxis;
  startSize: number;
  startClientX: number;
  startClientY: number;
  clientX: number;
  clientY: number;
  min: number;
  max: number;
}

export function shellResizePointerSize({
  axis,
  startSize,
  startClientX,
  startClientY,
  clientX,
  clientY,
  min,
  max,
}: ShellResizePointerInput): number {
  const delta =
    axis === "left"
      ? clientX - startClientX
      : axis === "right"
        ? startClientX - clientX
        : startClientY - clientY;
  return boundedShellPanelSize(startSize + delta, min, max);
}

export interface ShellResizeKeyInput {
  axis: ShellResizeAxis;
  current: number;
  key: string;
  min: number;
  max: number;
}

export function shellResizeKeySize({
  axis,
  current,
  key,
  min,
  max,
}: ShellResizeKeyInput): number | null {
  const forward =
    (axis === "left" && key === "ArrowRight") ||
    (axis === "right" && key === "ArrowLeft") ||
    (axis === "timeline" && key === "ArrowUp");
  const backward =
    (axis === "left" && key === "ArrowLeft") ||
    (axis === "right" && key === "ArrowRight") ||
    (axis === "timeline" && key === "ArrowDown");
  if (!forward && !backward) return null;
  return boundedShellPanelSize(
    current + (forward ? SHELL_PANEL_KEY_STEP : -SHELL_PANEL_KEY_STEP),
    min,
    max,
  );
}

export interface ShellGridColumnsInput {
  leftRailVisible: boolean;
  leftCollapsed: boolean;
  leftRailWidth: number;
  rightCollapsed: boolean;
  rightRailWidth: number;
}

export function appShellGridColumns({
  leftRailVisible,
  leftCollapsed,
  leftRailWidth,
  rightCollapsed,
  rightRailWidth,
}: ShellGridColumnsInput): string {
  const leftColumnWidth = !leftRailVisible
    ? 0
    : leftCollapsed
      ? LEFT_RAIL_COLLAPSED_WIDTH
      : leftRailWidth;
  const rightColumnWidth = rightCollapsed ? 0 : rightRailWidth;
  return `${leftColumnWidth}px 1fr ${rightColumnWidth}px`;
}

export interface ShellFrameView extends ShellLayoutState {
  panelState: DashboardPanelState;
  timeTravel: boolean;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  rightTab: DashboardPanelState["right_tab"];
  gridColumns: string;
  rootClassName: string;
  leftRailClassName: string;
  showCollapsedLeftRail: boolean;
  showExpandedLeftRail: boolean;
  leftRailContentClassName: string;
  stageColumnClassName: string;
  stageBodyClassName: string;
  showTimeline: boolean;
  timelineClassName: string;
  timelineStyle: { height: string };
  timelineControlsClassName: string;
  timelineBodyClassName: string;
  rightRailClassName: string;
  showRightRail: boolean;
  panelFlyoutRootClassName: string;
  panelFlyoutButtonWrapperClassName: string;
  panelControls: ShellPanelControlsView;
  activityRailClassName: string;
  activityPanelClassName: string;
}

export interface ShellPanelControlsView {
  flyoutButtonLabel: string;
  flyoutMenuLabel: string;
  flyoutMenuClassName: string;
  itemClassName: string;
  leftRailVisibilityLabel: string;
  showLeftCollapseControl: boolean;
  leftCollapseLabel: string;
  rightRailVisibilityLabel: string;
  timelineVisibilityLabel: string;
}

export type ShellResizeHandleSide = "left" | "right" | "top";

export interface ShellResizeHandleView {
  label: string;
  orientation: "horizontal" | "vertical";
  className: string;
}

const SHELL_ROOT_CLASS = "relative grid h-screen min-h-0 bg-paper text-ink";
const SHELL_LEFT_RAIL_CLASS = "relative flex min-h-0 flex-col overflow-hidden";
const SHELL_LEFT_RAIL_CONTENT_CLASS =
  "flex min-h-0 flex-1 flex-col border-r border-rule";
const SHELL_STAGE_COLUMN_CLASS = "flex min-h-0 min-w-0 flex-col";
const SHELL_STAGE_BODY_CLASS = "relative min-h-0 min-w-0 flex-1";
const SHELL_TIMELINE_CLASS =
  "relative flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden border-t border-rule";
const SHELL_TIMELINE_CONTROLS_CLASS = "min-w-0 shrink-0";
const SHELL_TIMELINE_BODY_CLASS = "relative min-h-0 min-w-0 flex-1";
const SHELL_RIGHT_RAIL_BASE_CLASS = "relative flex min-h-0 flex-col overflow-hidden";
const SHELL_RIGHT_RAIL_OPEN_CLASS = `${SHELL_RIGHT_RAIL_BASE_CLASS} border-l border-rule`;
const SHELL_PANEL_FLYOUT_ROOT_CLASS = "pointer-events-none absolute left-2 top-2 z-20";
const SHELL_PANEL_FLYOUT_BUTTON_WRAPPER_CLASS = "pointer-events-auto";
const SHELL_PANEL_FLYOUT_MENU_CLASS =
  "pointer-events-auto mt-fg-2 w-52 rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-raised";
const SHELL_PANEL_FLYOUT_ITEM_CLASS =
  "flex w-full items-center rounded-fg-sm px-fg-2 py-fg-1-5 text-left text-label text-ink-muted transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const SHELL_ACTIVITY_RAIL_CLASS =
  "flex min-h-0 flex-1 flex-col gap-fg-2 overflow-y-auto p-fg-2";
const SHELL_ACTIVITY_PANEL_CLASS = "min-h-0 flex-1";
const SHELL_RESIZE_HANDLE_BASE_CLASS =
  "absolute z-10 bg-transparent outline-none transition-colors duration-ui-fast ease-settle hover:bg-accent/20 focus-visible:bg-accent/20 focus-visible:outline-2 focus-visible:outline-focus";

const SHELL_RESIZE_HANDLE_PLACEMENT: Record<ShellResizeHandleSide, string> = {
  right: "right-[-3px] top-0 h-full w-2 cursor-col-resize",
  left: "left-[-3px] top-0 h-full w-2 cursor-col-resize",
  top: "left-0 top-[-3px] h-2 w-full cursor-row-resize",
};

const SHELL_RESIZE_HANDLE_LABEL: Record<ShellResizeHandleSide, string> = {
  right: "Resize left rail",
  left: "Resize right rail",
  top: "Resize timeline",
};

export function deriveShellPanelControlsView(
  input: Pick<
    ShellFrameView,
    | "panelFlyoutOpen"
    | "leftRailVisible"
    | "leftCollapsed"
    | "rightCollapsed"
    | "timelineVisible"
  >,
): ShellPanelControlsView {
  return {
    flyoutButtonLabel: input.panelFlyoutOpen
      ? "Close panel controls"
      : "Open panel controls",
    flyoutMenuLabel: "panel controls",
    flyoutMenuClassName: SHELL_PANEL_FLYOUT_MENU_CLASS,
    itemClassName: SHELL_PANEL_FLYOUT_ITEM_CLASS,
    leftRailVisibilityLabel: input.leftRailVisible
      ? "Hide left rail"
      : "Show left rail",
    showLeftCollapseControl: input.leftRailVisible,
    leftCollapseLabel: input.leftCollapsed ? "Expand left rail" : "Collapse left rail",
    rightRailVisibilityLabel: input.rightCollapsed
      ? "Show right rail"
      : "Hide right rail",
    timelineVisibilityLabel: input.timelineVisible ? "Hide timeline" : "Show timeline",
  };
}

export function deriveShellResizeHandleView(
  side: ShellResizeHandleSide,
): ShellResizeHandleView {
  return {
    label: SHELL_RESIZE_HANDLE_LABEL[side],
    orientation: side === "top" ? "horizontal" : "vertical",
    className: `${SHELL_RESIZE_HANDLE_BASE_CLASS} ${SHELL_RESIZE_HANDLE_PLACEMENT[side]}`,
  };
}

export function deriveShellFrameView(
  shellLayout: ShellLayoutState,
  shellChrome: DashboardShellChromeView,
): ShellFrameView {
  const panelState = shellChrome.panelState;
  const leftCollapsed = panelState.left_collapsed;
  const rightCollapsed = panelState.right_collapsed;
  const showTimeline = shellLayout.timelineVisible;
  const frame = {
    ...shellLayout,
    panelState,
    timeTravel: shellChrome.timeline.timeTravel,
    leftCollapsed,
    rightCollapsed,
    rightTab: panelState.right_tab,
    gridColumns: appShellGridColumns({
      leftRailVisible: shellLayout.leftRailVisible,
      leftCollapsed,
      leftRailWidth: shellLayout.leftRailWidth,
      rightCollapsed,
      rightRailWidth: shellLayout.rightRailWidth,
    }),
    rootClassName: SHELL_ROOT_CLASS,
    leftRailClassName: SHELL_LEFT_RAIL_CLASS,
    showCollapsedLeftRail: shellLayout.leftRailVisible && leftCollapsed,
    showExpandedLeftRail: shellLayout.leftRailVisible && !leftCollapsed,
    leftRailContentClassName: SHELL_LEFT_RAIL_CONTENT_CLASS,
    stageColumnClassName: SHELL_STAGE_COLUMN_CLASS,
    stageBodyClassName: SHELL_STAGE_BODY_CLASS,
    showTimeline,
    timelineClassName: SHELL_TIMELINE_CLASS,
    timelineStyle: { height: `${shellLayout.timelineHeight}px` },
    timelineControlsClassName: SHELL_TIMELINE_CONTROLS_CLASS,
    timelineBodyClassName: SHELL_TIMELINE_BODY_CLASS,
    rightRailClassName: rightCollapsed
      ? SHELL_RIGHT_RAIL_BASE_CLASS
      : SHELL_RIGHT_RAIL_OPEN_CLASS,
    showRightRail: !rightCollapsed,
    panelFlyoutRootClassName: SHELL_PANEL_FLYOUT_ROOT_CLASS,
    panelFlyoutButtonWrapperClassName: SHELL_PANEL_FLYOUT_BUTTON_WRAPPER_CLASS,
    activityRailClassName: SHELL_ACTIVITY_RAIL_CLASS,
    activityPanelClassName: SHELL_ACTIVITY_PANEL_CLASS,
  };
  return {
    ...frame,
    panelControls: deriveShellPanelControlsView(frame),
  };
}

export function useShellLayoutState(): ShellLayoutState {
  return useViewStore(
    useShallow((state) => ({
      leftRailVisible: state.leftRailVisible,
      leftRailWidth: state.leftRailWidth,
      rightRailWidth: state.rightRailWidth,
      timelineVisible: state.timelineVisible,
      timelineHeight: state.timelineHeight,
      panelFlyoutOpen: state.panelFlyoutOpen,
    })),
  );
}

export function useShellFrameView(scope: string | null): ShellFrameView {
  const shellChrome = useDashboardShellChromeView(scope);
  const shellLayout = useShellLayoutState();
  return deriveShellFrameView(shellLayout, shellChrome);
}

export function setShellLeftRailVisible(visible: boolean): void {
  useViewStore.getState().setLeftRailVisible(visible);
}

export function setShellLeftRailWidth(width: number): void {
  useViewStore.getState().setLeftRailWidth(width);
}

export function setShellRightRailWidth(width: number): void {
  useViewStore.getState().setRightRailWidth(width);
}

export function setShellTimelineVisible(visible: boolean): void {
  useViewStore.getState().setTimelineVisible(visible);
}

export function setShellTimelineHeight(height: number): void {
  useViewStore.getState().setTimelineHeight(height);
}

export function setShellPanelFlyoutOpen(open: boolean): void {
  useViewStore.getState().setPanelFlyoutOpen(open);
}

export function toggleShellPanelFlyout(): void {
  useViewStore.getState().togglePanelFlyout();
}

export function resetShellLayout(): void {
  useViewStore.getState().resetShellLayout();
}
