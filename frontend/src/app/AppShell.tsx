import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

import { CrashInjector, CrashZone } from "../platform/errors/CrashInjector";
import { ErrorBoundary } from "../platform/errors/ErrorBoundary";
import { useActiveScope } from "../stores/server/queries";
import { useBackendSignalSubscription } from "../stores/view/backendSignals";
import {
  useBrowserMode,
  useBrowserModeIntent,
  type BrowserMode,
} from "../stores/view/browserMode";
import {
  LEFT_RAIL_MAX_WIDTH,
  LEFT_RAIL_MIN_WIDTH,
  RIGHT_RAIL_MAX_WIDTH,
  RIGHT_RAIL_MIN_WIDTH,
  TIMELINE_MAX_HEIGHT,
  TIMELINE_MIN_HEIGHT,
  setShellLeftRailWidth as setLeftRailWidth,
  setShellRightRailWidth as setRightRailWidth,
  setShellTimelineHeight as setTimelineHeight,
  deriveShellResizeHandleView,
  shellResizeKeySize,
  shellResizePointerSize,
  type ShellResizeAxis,
  type ShellResizeHandleSide,
  toggleShellPanelFlyout as togglePanelFlyout,
  type RailTabId,
  type ShellFrameView,
  useShellFrameView,
  useShellWindowActions,
} from "../stores/view/shellLayout";
import { LeftRail } from "./left/LeftRail";
import { KeyboardNav } from "./a11y/KeyboardNav";
import { DegradationDebugSwitch } from "./degradation/DebugSwitch";
import { IconButton, Popover } from "./kit";
import { PanelLeft } from "./kit/glyphs";
import { ContextMenuHost } from "./menu/ContextMenuHost";
import { KeyboardShortcuts } from "./menu/KeyboardShortcuts";
// Register every per-surface context-menu resolver once at app load.
import "./menus/registerAll";
import { CommandPalette } from "./palette/CommandPalette";
import { SettingsDialog } from "./settings/SettingsDialog";
import { useSettingsEffects } from "./settings/settingsEffects";
import { useThemeSetting } from "./settings/themeSetting";
import { ChangesOverview } from "./right/ChangesOverview";
import { RailTabs } from "./right/RailTabs";
import { SearchTab } from "./right/SearchTab";
import { StatusTab } from "./right/StatusTab";
import { IconRail } from "./shell/IconRail";
import { getScene } from "./stage/Stage";
import { DockWorkspace } from "./stage/DockWorkspace";
import { Playhead } from "./timeline/Playhead";
import { Timeline } from "./timeline/Timeline";
import { handleNodeClick } from "./timeline/eventSelection";
// The reader/code-viewer stack (react-markdown + Shiki) is heavy and only needed
// Binding AppShell grid (figma-frontend-rewrite W02.P03 — board 117:2): three
// fluid/fixed columns at full viewport height —
//   left rail (expanded width, collapsed 48px, or hidden) | stage (flex) |
//   right-pane (resizable, or hidden)
// — where the side panes are collapsible/toggleable and reflow the grid. The stage
// column is itself a vertical stack: a 44px breadcrumb topbar, the graph area
// (the existing Stage, fills), and a resizable/toggleable Timeline at the bottom.
//
// Layer law (dashboard-layer-ownership / view-rewrite-preserves-the-state-and-
// scene-contract): the shell is leaf chrome — it composes the centralized kit and
// renders the existing LeftRail / Stage / Timeline / ActivityRail in their slots,
// consuming the preserved stores hooks and SceneController contract UNCHANGED. It
// adds no new fetch, mints no model, and reads no raw `tiers`.

export function AppShell() {
  const scope = useActiveScope();
  const shellFrame = useShellFrameView(scope);
  const shellActions = useShellWindowActions(scope, shellFrame);
  const {
    leftRailVisible,
    leftRailWidth,
    rightRailWidth,
    timelineHeight,
    panelFlyoutOpen,
    timeTravel,
    leftCollapsed,
    rightTab,
    gridColumns,
    panelControls,
  } = shellFrame;
  const browserMode = useBrowserMode();
  const browserModeIntent = useBrowserModeIntent();
  const openLeftRailMode = (mode: BrowserMode) => {
    browserModeIntent(mode);
    if (!leftRailVisible) shellActions.toggleLeftRail();
    if (leftCollapsed) shellActions.toggleLeftCollapsed();
  };

  const startLeftResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = leftRailWidth;
    const onMove = (move: PointerEvent) => {
      setLeftRailWidth(
        shellResizePointerSize({
          axis: "left",
          startSize: startWidth,
          startClientX: startX,
          startClientY: event.clientY,
          clientX: move.clientX,
          clientY: move.clientY,
          min: LEFT_RAIL_MIN_WIDTH,
          max: LEFT_RAIL_MAX_WIDTH,
        }),
      );
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
  };

  const startRightResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = rightRailWidth;
    const onMove = (move: PointerEvent) => {
      setRightRailWidth(
        shellResizePointerSize({
          axis: "right",
          startSize: startWidth,
          startClientX: startX,
          startClientY: event.clientY,
          clientX: move.clientX,
          clientY: move.clientY,
          min: RIGHT_RAIL_MIN_WIDTH,
          max: RIGHT_RAIL_MAX_WIDTH,
        }),
      );
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
  };

  const startTimelineResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = timelineHeight;
    const onMove = (move: PointerEvent) => {
      setTimelineHeight(
        shellResizePointerSize({
          axis: "timeline",
          startSize: startHeight,
          startClientX: event.clientX,
          startClientY: startY,
          clientX: move.clientX,
          clientY: move.clientY,
          min: TIMELINE_MIN_HEIGHT,
          max: TIMELINE_MAX_HEIGHT,
        }),
      );
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
  };

  const resizeByKey = (
    event: KeyboardEvent<HTMLDivElement>,
    current: number,
    setSize: (size: number) => void,
    min: number,
    max: number,
    axis: ShellResizeAxis,
  ) => {
    const next = shellResizeKeySize({
      axis,
      current,
      key: event.key,
      min,
      max,
    });
    if (next === null) return;
    event.preventDefault();
    setSize(next);
  };

  // Theme is an engine setting now (dashboard-settings W05): the bridge reconciles
  // the server value to the framework-free controller and persists changes. Called
  // once here so the reconcile runs regardless of rail collapse state.
  useThemeSetting();
  // Apply document-level settings effects once at the shell top. Graph/filter
  // defaults are dashboard-state concerns, not legacy store seeds.
  useSettingsEffects(scope);
  // F-M1 (event-unity): mount the shared backend-signal stream (backends + git)
  // once here so status / rag-health stay live regardless of which rail tab is
  // open; NowStrip and the search controller read the deduped shared accumulator.
  useBackendSignalSubscription();

  return (
    <div
      className={shellFrame.rootClassName}
      style={{
        gridTemplateColumns: gridColumns,
      }}
    >
      <CommandPalette />
      <SettingsDialog />
      <ContextMenuHost timeTravel={timeTravel} />
      <KeyboardShortcuts />
      <DegradationDebugSwitch />
      <KeyboardNav />

      {/* ── Left rail — expanded content, collapsed mode icons, or hidden ──── */}
      <aside className={shellFrame.leftRailClassName}>
        {shellFrame.showCollapsedLeftRail && (
          <IconRail active={browserMode} onSelect={openLeftRailMode} />
        )}
        {shellFrame.showExpandedLeftRail && (
          <ErrorBoundary region="left-rail">
            <CrashZone region="left-rail" />
            <div className={shellFrame.leftRailContentClassName}>
              <LeftRail />
            </div>
            <ResizeHandle
              side="right"
              onPointerDown={startLeftResize}
              onKeyDown={(event) =>
                resizeByKey(
                  event,
                  leftRailWidth,
                  setLeftRailWidth,
                  LEFT_RAIL_MIN_WIDTH,
                  LEFT_RAIL_MAX_WIDTH,
                  "left",
                )
              }
            />
          </ErrorBoundary>
        )}
      </aside>

      {/* ── Stage column (flex) — graph | timeline ────────────────── */}
      <main className={shellFrame.stageColumnClassName}>
        {/* Graph + documents area (editor-dock-workspace): the dock workspace
            replaces the single-doc viewer overlay. The graph is a portal-pinned
            canvas panel (default right, full width until a document opens) and
            documents open as walkable/tabbable/movable/hot-dockable panels to its
            left. Stage's canvas + SceneController seam are preserved unchanged —
            GraphCanvasHost renders the whole Stage and dockview only manages an
            empty placeholder, so docking never re-parents the canvas. */}
        <div className={shellFrame.stageBodyClassName}>
          <ErrorBoundary region="stage">
            <CrashZone region="stage" />
            <DockWorkspace />
          </ErrorBoundary>
        </div>

        {/* Bottom timeline — the lower SECTION of the unified graph+timeline element
            (graph-timeline-workspace). Its own header is retired: navigation lives in
            the shared stage top bar, and the ResizeHandle above is the fine-tunable
            buffer between the two sections. The lineage surface fills the section.
            Layer law: this region wires stores hooks and shared-state intent only —
            no fetch, no raw `tiers`. A mark click flows into the ONE shared selection
            + a bounded stage ego pulse through `handleNodeClick`. The playhead stays
            (temporal navigation); the date-range brush is gone (filtering retired). */}
        {shellFrame.showTimeline && (
          <footer
            className={shellFrame.timelineClassName}
            style={shellFrame.timelineStyle}
          >
            <ResizeHandle
              side="top"
              onPointerDown={startTimelineResize}
              onKeyDown={(event) =>
                resizeByKey(
                  event,
                  timelineHeight,
                  setTimelineHeight,
                  TIMELINE_MIN_HEIGHT,
                  TIMELINE_MAX_HEIGHT,
                  "timeline",
                )
              }
            />
            <ErrorBoundary region="timeline">
              <CrashZone region="timeline" />
              <div className={shellFrame.timelineBodyClassName}>
                <Timeline
                  onNodeClick={(node, arcs) =>
                    handleNodeClick(node, arcs, getScene().controller, scope)
                  }
                  overlay={<Playhead scope={scope} />}
                />
              </div>
            </ErrorBoundary>
          </footer>
        )}
      </main>

      {/* ── Right pane — the activity rail ──────────────────────────── */}
      <aside className={shellFrame.rightRailClassName}>
        {shellFrame.showRightRail && (
          <ErrorBoundary region="right-rail">
            <CrashZone region="right-rail" />
            <ResizeHandle
              side="left"
              onPointerDown={startRightResize}
              onKeyDown={(event) =>
                resizeByKey(
                  event,
                  rightRailWidth,
                  setRightRailWidth,
                  RIGHT_RAIL_MIN_WIDTH,
                  RIGHT_RAIL_MAX_WIDTH,
                  "right",
                )
              }
            />
            <ActivityRail
              tab={rightTab}
              shellFrame={shellFrame}
              onTabChange={shellActions.setRightTab}
            />
          </ErrorBoundary>
        )}
      </aside>

      {/* ── Single panel flyout ─────────────────────────────────────── */}
      {/* Anchor the panel-controls toggle to the EXPANDED rail's top-right corner
          so it never bleeds over the left-aligned worktree/project header
          (board 244:750 keeps the rail header clean). When the rail is collapsed
          or hidden it falls back to the stage's top-left, where there is no
          content to collide with. */}
      <Popover
        open={panelFlyoutOpen}
        onDismiss={shellActions.closePanelFlyout}
        className={shellFrame.panelFlyoutRootClassName}
        style={shellFrame.panelFlyoutRootStyle}
      >
        <span className={shellFrame.panelFlyoutButtonWrapperClassName}>
          <IconButton
            label={panelControls.flyoutButtonLabel}
            active={panelFlyoutOpen}
            onClick={togglePanelFlyout}
          >
            <PanelLeft size={16} />
          </IconButton>
        </span>
        {panelFlyoutOpen && (
          <div
            className={panelControls.flyoutMenuClassName}
            role="menu"
            aria-label={panelControls.flyoutMenuLabel}
          >
            <PanelFlyoutItem
              label={panelControls.leftRailVisibilityLabel}
              className={panelControls.itemClassName}
              onClick={() => shellActions.runPanelAction(shellActions.toggleLeftRail)}
            />
            {panelControls.showLeftCollapseControl && (
              <PanelFlyoutItem
                label={panelControls.leftCollapseLabel}
                className={panelControls.itemClassName}
                onClick={() =>
                  shellActions.runPanelAction(shellActions.toggleLeftCollapsed)
                }
              />
            )}
            <PanelFlyoutItem
              label={panelControls.rightRailVisibilityLabel}
              className={panelControls.itemClassName}
              onClick={() => shellActions.runPanelAction(shellActions.toggleRightRail)}
            />
            <PanelFlyoutItem
              label={panelControls.timelineVisibilityLabel}
              className={panelControls.itemClassName}
              onClick={() => shellActions.runPanelAction(shellActions.toggleTimeline)}
            />
          </div>
        )}
      </Popover>

      <CrashInjector />
    </div>
  );
}

function ResizeHandle({
  side,
  onPointerDown,
  onKeyDown,
}: {
  side: ShellResizeHandleSide;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const view = deriveShellResizeHandleView(side);

  return (
    <div
      aria-label={view.label}
      aria-orientation={view.orientation}
      className={view.className}
      role="separator"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}

function PanelFlyoutItem({
  label,
  className,
  onClick,
}: {
  label: string;
  className: string;
  onClick: () => void;
}) {
  return (
    <button type="button" role="menuitem" className={className} onClick={onClick}>
      {label}
    </button>
  );
}

// The activity-rail composition (binding Figma `ActivityRail`, node 244:753): the
// rail is EXACTLY three label-only tabs — Status | Changes | Search — over their
// panes, with NO persistent pillar header (the rewrite retires the status-overview
// liveness pillars and the Inspect pane that board 112:2 carried; node detail now
// lives in the reader / DocHeader, and worktree/branch identity rides the Status
// pane's context card). Status is the primary tab: the location anchor +
// plan-derived open work + recent commits.
function ActivityRail({
  tab,
  shellFrame,
  onTabChange,
}: {
  tab: RailTabId;
  shellFrame: Pick<ShellFrameView, "activityRailClassName" | "activityPanelClassName">;
  onTabChange: (tab: RailTabId) => void;
}) {
  return (
    <div className={shellFrame.activityRailClassName}>
      {/* Tab bar (roving-keys tablist) — the board's three label-only tabs. */}
      <RailTabs active={tab} onChange={onTabChange} />

      {/* Active pane. Each pane is the tabpanel for its tab; only the active one
          is mounted, so the rail body stays light. */}
      <div
        className={shellFrame.activityPanelClassName}
        role="tabpanel"
        id={`rail-panel-${tab}`}
        aria-labelledby={`rail-tab-${tab}`}
        tabIndex={0}
      >
        {tab === "status" && <StatusTab />}
        {tab === "changes" && <ChangesOverview />}
        {tab === "search" && <SearchTab />}
      </div>
    </div>
  );
}
