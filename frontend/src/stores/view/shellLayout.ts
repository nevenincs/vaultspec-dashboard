import { useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import type { MessageDescriptor } from "../../platform/localization/message";
import { DASHBOARD_PANEL_TABS, type DashboardPanelState } from "../server/engine";
import { useShellPanelIntent } from "../server/panelStateIntent";
import {
  type DashboardShellChromeView,
  useDashboardShellChromeView,
} from "../server/queries";
import {
  LEFT_RAIL_MAX_WIDTH,
  LEFT_RAIL_MIN_WIDTH,
  RIGHT_RAIL_MAX_WIDTH,
  RIGHT_RAIL_MIN_WIDTH,
  TIMELINE_MAX_HEIGHT,
  TIMELINE_MIN_HEIGHT,
  useViewStore,
} from "./viewStore";
import { useViewportClass, type ViewportClass } from "./viewportClass";

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
  graphVisible: boolean;
  timelineHeight: number;
}

export const LEFT_RAIL_COLLAPSED_WIDTH = 48;
export const SHELL_PANEL_KEY_STEP = 16;
export type RailTabId = DashboardPanelState["right_tab"];

type RightRailTabLabelKey =
  | "common:activityTabs.status"
  | "common:activityTabs.changes";
type RightRailTabActionLabelKey =
  | "common:actions.showStatus"
  | "common:actions.showChanges";

export interface RightRailTabPresentation<
  Tab extends RailTabId = RailTabId,
  LabelKey extends RightRailTabLabelKey = RightRailTabLabelKey,
  ActionLabelKey extends RightRailTabActionLabelKey = RightRailTabActionLabelKey,
> {
  readonly id: Tab;
  readonly label: MessageDescriptor<LabelKey>;
  readonly actionLabel: MessageDescriptor<ActionLabelKey>;
}

type RightRailTabPresentationMap = Readonly<{
  status: RightRailTabPresentation<
    "status",
    "common:activityTabs.status",
    "common:actions.showStatus"
  >;
  changes: RightRailTabPresentation<
    "changes",
    "common:activityTabs.changes",
    "common:actions.showChanges"
  >;
}>;

export const RIGHT_RAIL_TAB_PRESENTATION = Object.freeze({
  status: Object.freeze({
    id: "status",
    label: Object.freeze({ key: "common:activityTabs.status" }),
    actionLabel: Object.freeze({ key: "common:actions.showStatus" }),
  }),
  changes: Object.freeze({
    id: "changes",
    label: Object.freeze({ key: "common:activityTabs.changes" }),
    actionLabel: Object.freeze({ key: "common:actions.showChanges" }),
  }),
} as const satisfies RightRailTabPresentationMap);

// The ordered consumer seam retains one stable object per raw dashboard tab id.
export const RIGHT_RAIL_TABS = Object.freeze(
  DASHBOARD_PANEL_TABS.map((tab) => RIGHT_RAIL_TAB_PRESENTATION[tab]),
);

/** Resolve presentation only for an exact raw tab identity. */
export function rightRailTabPresentation(
  tab: unknown,
): RightRailTabPresentation | null {
  return tab === "status" || tab === "changes"
    ? RIGHT_RAIL_TAB_PRESENTATION[tab]
    : null;
}

export const SHELL_MESSAGES = Object.freeze({
  showActivityPanel: Object.freeze({
    key: "common:actions.showActivityPanel",
  } as const satisfies MessageDescriptor<"common:actions.showActivityPanel">),
  hideActivityPanel: Object.freeze({
    key: "common:actions.hideActivityPanel",
  } as const satisfies MessageDescriptor<"common:actions.hideActivityPanel">),
  resizeNavigationPanel: Object.freeze({
    key: "common:accessibility.resizeNavigationPanel",
  } as const satisfies MessageDescriptor<"common:accessibility.resizeNavigationPanel">),
  resizeActivityPanel: Object.freeze({
    key: "common:accessibility.resizeActivityPanel",
  } as const satisfies MessageDescriptor<"common:accessibility.resizeActivityPanel">),
  resizeTimeline: Object.freeze({
    key: "common:accessibility.resizeTimeline",
  } as const satisfies MessageDescriptor<"common:accessibility.resizeTimeline">),
});
export const DEFAULT_RIGHT_RAIL_TAB: RailTabId = DASHBOARD_PANEL_TABS[0]!;

export function normalizeRightRailTab(tab: unknown): RailTabId {
  if (typeof tab !== "string") return DEFAULT_RIGHT_RAIL_TAB;
  const normalized = tab.trim();
  return (DASHBOARD_PANEL_TABS as readonly string[]).includes(normalized)
    ? (normalized as RailTabId)
    : DEFAULT_RIGHT_RAIL_TAB;
}

function normalizeRightRailTabDirection(direction: unknown): "previous" | "next" {
  return direction === "previous" ? "previous" : "next";
}

export function rightRailAdjacentTab(current: unknown, direction: unknown): RailTabId {
  const normalizedCurrent = normalizeRightRailTab(current);
  const normalizedDirection = normalizeRightRailTabDirection(direction);
  const currentIndex = RIGHT_RAIL_TABS.findIndex((tab) => tab.id === normalizedCurrent);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const offset = normalizedDirection === "next" ? 1 : RIGHT_RAIL_TABS.length - 1;
  return RIGHT_RAIL_TABS[(safeIndex + offset) % RIGHT_RAIL_TABS.length]!.id;
}

export function boundedShellPanelSize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export type ShellResizeAxis = "left" | "right" | "timeline";
export type ShellResizeKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

export interface ShellResizeBounds {
  min: number;
  max: number;
}

export const SHELL_RESIZE_BOUNDS: Readonly<Record<ShellResizeAxis, ShellResizeBounds>> =
  {
    left: { min: LEFT_RAIL_MIN_WIDTH, max: LEFT_RAIL_MAX_WIDTH },
    right: { min: RIGHT_RAIL_MIN_WIDTH, max: RIGHT_RAIL_MAX_WIDTH },
    timeline: { min: TIMELINE_MIN_HEIGHT, max: TIMELINE_MAX_HEIGHT },
  };

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

export function shellResizeBounds(axis: ShellResizeAxis): ShellResizeBounds {
  return SHELL_RESIZE_BOUNDS[axis];
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

interface ShellResizePointerEventLike {
  clientX: number;
  clientY: number;
}

export interface ShellResizePointerTarget {
  addEventListener(
    type: "pointermove" | "pointerup",
    listener: (event: ShellResizePointerEventLike) => void,
    options?: AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: "pointermove" | "pointerup",
    listener: (event: ShellResizePointerEventLike) => void,
  ): void;
}

export interface ShellResizePointerSessionInput {
  axis: ShellResizeAxis;
  startSize: number;
  startClientX: number;
  startClientY: number;
  target?: ShellResizePointerTarget;
}

export interface ShellResizeKeyIntentInput {
  axis: ShellResizeAxis;
  current: number;
  key: string;
  preventDefault?: () => void;
}

export function setShellResizeSize(axis: ShellResizeAxis, size: number): void {
  if (axis === "left") {
    setShellLeftRailWidth(size);
    return;
  }
  if (axis === "right") {
    setShellRightRailWidth(size);
    return;
  }
  setShellTimelineHeight(size);
}

export function startShellResizePointerSession({
  axis,
  startSize,
  startClientX,
  startClientY,
  target = typeof document === "undefined" ? undefined : document,
}: ShellResizePointerSessionInput): () => void {
  if (target === undefined) return () => undefined;
  const { min, max } = shellResizeBounds(axis);
  const onMove = (move: ShellResizePointerEventLike) => {
    setShellResizeSize(
      axis,
      shellResizePointerSize({
        axis,
        startSize,
        startClientX,
        startClientY,
        clientX: move.clientX,
        clientY: move.clientY,
        min,
        max,
      }),
    );
  };
  const stop = () => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", stop);
  };
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", stop, { once: true });
  return stop;
}

export function resizeShellPanelByKey({
  axis,
  current,
  key,
  preventDefault,
}: ShellResizeKeyIntentInput): boolean {
  const { min, max } = shellResizeBounds(axis);
  const next = shellResizeKeySize({ axis, current, key, min, max });
  if (next === null) return false;
  preventDefault?.();
  setShellResizeSize(axis, next);
  return true;
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
  /** True when the viewport is compact (phone/tablet): the AppShell renders the
   *  single-pane + bottom-tab-bar frame instead of the desktop three-column grid
   *  (mobile-responsive-layout ADR D1/D2). */
  compact: boolean;
  gridColumns: string;
  rootClassName: string;
  leftRailClassName: string;
  showCollapsedLeftRail: boolean;
  showExpandedLeftRail: boolean;
  leftRailContentClassName: string;
  stageColumnClassName: string;
  stageBodyClassName: string;
  /** Whether the graph (and its tethered timeline) is mounted in the center. */
  showGraph: boolean;
  showTimeline: boolean;
  timelineClassName: string;
  timelineStyle: { height: string };
  timelineBodyClassName: string;
  rightRailClassName: string;
  showRightRail: boolean;
  /** Accessible label for the layout-level right-rail visibility toggle, named for
   *  its inverse ("hide" vs "show") like every other window/pane control. */
  rightRailToggleLabel: MessageDescriptor<
    "common:actions.showActivityPanel" | "common:actions.hideActivityPanel"
  >;
  activityRailClassName: string;
  activityPanelClassName: string;
}

export interface ShellWindowActions {
  toggleLeftRail: () => void;
  toggleLeftCollapsed: () => void;
  toggleRightRail: () => void;
  toggleTimeline: () => void;
  toggleGraph: () => void;
  setRightTab: (tab: unknown) => void;
  resetLayout: () => void;
}

export type ShellResizeHandleSide = "left" | "right" | "top";

export interface ShellResizeHandleView {
  label: MessageDescriptor;
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
const SHELL_TIMELINE_BODY_CLASS = "relative min-h-0 min-w-0 flex-1";
const SHELL_RIGHT_RAIL_BASE_CLASS = "relative flex min-h-0 flex-col overflow-hidden";
const SHELL_RIGHT_RAIL_OPEN_CLASS = `${SHELL_RIGHT_RAIL_BASE_CLASS} border-l border-rule`;
// The scroll lives on the inner PANEL, not the rail column, so the framework
// status cluster (activity-rail-realignment D2) pins as a footer OUTSIDE the
// scroll region: the rail is a plain flex column, the panel is the flex-1
// scroll region carrying the status stack's inset, and the cluster is a
// shrink-0 sibling below it.
const SHELL_ACTIVITY_RAIL_CLASS = "flex min-h-0 flex-1 flex-col";
const SHELL_ACTIVITY_PANEL_CLASS = "min-h-0 flex-1 overflow-y-auto p-fg-2";
const SHELL_RESIZE_HANDLE_BASE_CLASS =
  "absolute z-10 bg-transparent outline-none transition-colors duration-ui-fast ease-settle hover:bg-accent/20 focus-visible:bg-accent/20 focus-visible:outline-2 focus-visible:outline-focus";

const SHELL_RESIZE_HANDLE_PLACEMENT: Record<ShellResizeHandleSide, string> = {
  right: "right-[-0.1875rem] top-0 h-full w-2 cursor-col-resize",
  left: "left-[-0.1875rem] top-0 h-full w-2 cursor-col-resize",
  top: "left-0 top-[-0.1875rem] h-2 w-full cursor-row-resize",
};

const SHELL_RESIZE_HANDLE_LABEL: Readonly<
  Record<ShellResizeHandleSide, MessageDescriptor>
> = {
  right: SHELL_MESSAGES.resizeNavigationPanel,
  left: SHELL_MESSAGES.resizeActivityPanel,
  top: SHELL_MESSAGES.resizeTimeline,
};

export function deriveShellResizeHandleView(
  side: unknown,
): ShellResizeHandleView | null {
  if (side !== "right" && side !== "left" && side !== "top") return null;
  return {
    label: SHELL_RESIZE_HANDLE_LABEL[side],
    orientation: side === "top" ? "horizontal" : "vertical",
    className: `${SHELL_RESIZE_HANDLE_BASE_CLASS} ${SHELL_RESIZE_HANDLE_PLACEMENT[side]}`,
  };
}

export function deriveShellFrameView(
  shellLayout: ShellLayoutState,
  shellChrome: DashboardShellChromeView,
  viewportClass: ViewportClass = "regular",
): ShellFrameView {
  const panelState = shellChrome.panelState;
  const leftCollapsed = panelState.left_collapsed;
  const rightCollapsed = panelState.right_collapsed;
  const compact = viewportClass === "compact";
  // The timeline is tethered to the graph (they are one panel): it shows only when
  // the graph is visible AND the timeline is toggled on. Hiding the graph hides the
  // timeline with it (the documents pane then takes the full center width).
  const showGraph = shellLayout.graphVisible;
  const showTimeline = shellLayout.timelineVisible && showGraph;
  const frame = {
    ...shellLayout,
    panelState,
    timeTravel: shellChrome.timeline.timeTravel,
    leftCollapsed,
    rightCollapsed,
    rightTab: panelState.right_tab,
    compact,
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
    showGraph,
    showTimeline,
    timelineClassName: SHELL_TIMELINE_CLASS,
    timelineStyle: { height: `${shellLayout.timelineHeight}px` },
    timelineBodyClassName: SHELL_TIMELINE_BODY_CLASS,
    rightRailClassName: rightCollapsed
      ? SHELL_RIGHT_RAIL_BASE_CLASS
      : SHELL_RIGHT_RAIL_OPEN_CLASS,
    showRightRail: !rightCollapsed,
    rightRailToggleLabel: rightCollapsed
      ? SHELL_MESSAGES.showActivityPanel
      : SHELL_MESSAGES.hideActivityPanel,
    activityRailClassName: SHELL_ACTIVITY_RAIL_CLASS,
    activityPanelClassName: SHELL_ACTIVITY_PANEL_CLASS,
  };
  return frame;
}

export function useShellLayoutState(): ShellLayoutState {
  return useViewStore(
    useShallow((state) => ({
      leftRailVisible: state.leftRailVisible,
      leftRailWidth: state.leftRailWidth,
      rightRailWidth: state.rightRailWidth,
      timelineVisible: state.timelineVisible,
      graphVisible: state.graphVisible,
      timelineHeight: state.timelineHeight,
    })),
  );
}

/** Lightweight primitive selector for the graph-visibility signal (the dock
 *  workspace reconciles the graph panel on this without pulling the whole frame
 *  view). A primitive return is referentially stable (stable-selectors). */
export function useShellGraphVisible(): boolean {
  return useViewStore((state) => state.graphVisible);
}

export function useShellFrameView(scope: unknown): ShellFrameView {
  const shellChrome = useDashboardShellChromeView(scope);
  const shellLayout = useShellLayoutState();
  const viewportClass = useViewportClass();
  return deriveShellFrameView(shellLayout, shellChrome, viewportClass);
}

export function useShellWindowActions(
  scope: unknown,
  shellFrame: Pick<
    ShellFrameView,
    | "leftRailVisible"
    | "leftCollapsed"
    | "rightCollapsed"
    | "timelineVisible"
    | "graphVisible"
  >,
): ShellWindowActions {
  const panelIntent = useShellPanelIntent(scope);
  const ignore = () => undefined;
  const setLeftCollapsed = useCallback(
    (leftCollapsed: boolean) => {
      void panelIntent.setLeftCollapsed(leftCollapsed).catch(ignore);
    },
    [panelIntent],
  );
  const setRightCollapsed = useCallback(
    (rightCollapsed: boolean) => {
      void panelIntent.setRightCollapsed(rightCollapsed).catch(ignore);
    },
    [panelIntent],
  );
  return useMemo(
    () => ({
      toggleLeftRail: () => setShellLeftRailVisible(!shellFrame.leftRailVisible),
      toggleLeftCollapsed: () => setLeftCollapsed(!shellFrame.leftCollapsed),
      toggleRightRail: () => setRightCollapsed(!shellFrame.rightCollapsed),
      toggleTimeline: () => setShellTimelineVisible(!shellFrame.timelineVisible),
      toggleGraph: () => setShellGraphVisible(!shellFrame.graphVisible),
      setRightTab: (tab) => {
        void panelIntent.setRightTab(normalizeRightRailTab(tab)).catch(ignore);
        void panelIntent.setRightCollapsed(false).catch(ignore);
      },
      resetLayout: () => {
        resetShellLayout();
        void panelIntent.setLeftCollapsed(false).catch(ignore);
        void panelIntent.setRightCollapsed(false).catch(ignore);
        void panelIntent.setRightTab(DEFAULT_RIGHT_RAIL_TAB).catch(ignore);
      },
    }),
    [
      panelIntent,
      setLeftCollapsed,
      setRightCollapsed,
      shellFrame.leftCollapsed,
      shellFrame.leftRailVisible,
      shellFrame.rightCollapsed,
      shellFrame.timelineVisible,
      shellFrame.graphVisible,
    ],
  );
}

export function setShellLeftRailVisible(visible: unknown): void {
  useViewStore.getState().setLeftRailVisible(visible);
}

export function setShellLeftRailWidth(width: unknown): void {
  useViewStore.getState().setLeftRailWidth(width);
}

export function setShellRightRailWidth(width: unknown): void {
  useViewStore.getState().setRightRailWidth(width);
}

export function setShellTimelineVisible(visible: unknown): void {
  useViewStore.getState().setTimelineVisible(visible);
}

export function setShellGraphVisible(visible: unknown): void {
  useViewStore.getState().setGraphVisible(visible);
}

/** Read the current graph visibility outside React (the shared toggle action's
 *  label and the dispatcher-fired toggle read it without a hook). */
export function getShellGraphVisible(): boolean {
  return useViewStore.getState().graphVisible;
}

/** Flip the graph (and its tethered timeline) visibility. */
export function toggleShellGraphVisible(): void {
  setShellGraphVisible(!getShellGraphVisible());
}

export function setShellTimelineHeight(height: unknown): void {
  useViewStore.getState().setTimelineHeight(height);
}

export function resetShellLayout(): void {
  useViewStore.getState().resetShellLayout();
}
