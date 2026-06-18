import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

import { CrashInjector, CrashZone } from "../platform/errors/CrashInjector";
import { ErrorBoundary } from "../platform/errors/ErrorBoundary";
import { useActiveScope, useBackendSignalStream } from "../stores/server/queries";
import { useDashboardStateMutations } from "../stores/server/dashboardState";
import {
  setBrowserMode,
  useBrowserMode,
  type BrowserMode,
} from "../stores/view/browserMode";
import {
  LEFT_RAIL_MAX_WIDTH,
  LEFT_RAIL_MIN_WIDTH,
  RIGHT_RAIL_MAX_WIDTH,
  RIGHT_RAIL_MIN_WIDTH,
  TIMELINE_MAX_HEIGHT,
  TIMELINE_MIN_HEIGHT,
  setShellLeftRailVisible as setLeftRailVisible,
  setShellLeftRailWidth as setLeftRailWidth,
  setShellPanelFlyoutOpen as setPanelFlyoutOpen,
  setShellRightRailWidth as setRightRailWidth,
  setShellTimelineHeight as setTimelineHeight,
  setShellTimelineVisible as setTimelineVisible,
  toggleShellPanelFlyout as togglePanelFlyout,
  useShellFrameView,
} from "../stores/view/shellLayout";
import { LeftRail } from "./left/LeftRail";
import { KeyboardNav } from "./a11y/KeyboardNav";
import { DegradationDebugSwitch } from "./degradation/DebugSwitch";
import { IconButton } from "./kit";
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
import { RailTabs, type RailTabId } from "./right/RailTabs";
import { SearchTab } from "./right/SearchTab";
import { StatusTab } from "./right/StatusTab";
import { IconRail } from "./shell/IconRail";
import { StageTopbar } from "./shell/StageTopbar";
import { getScene } from "./stage/Stage";
import { DockWorkspace } from "./stage/DockWorkspace";
import { Playhead } from "./timeline/Playhead";
import { RangeSelect } from "./timeline/RangeSelect";
import { Timeline } from "./timeline/Timeline";
import { TimelineControls } from "./timeline/TimelineControls";
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
const PANEL_KEY_STEP = 16;

function clampPanel(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export { appShellGridColumns } from "../stores/view/shellLayout";

export function AppShell() {
  const scope = useActiveScope();
  const shellFrame = useShellFrameView(scope);
  const dashboardMutations = useDashboardStateMutations(scope);
  const {
    leftRailVisible,
    leftRailWidth,
    rightRailWidth,
    timelineVisible,
    timelineHeight,
    panelFlyoutOpen,
    timeTravel,
    leftCollapsed,
    rightCollapsed,
    rightTab,
    gridColumns,
  } = shellFrame;
  const browserMode = useBrowserMode();
  const setLeftCollapsed = (left_collapsed: boolean) => {
    if (!scope) {
      return;
    }
    void dashboardMutations.updatePanelState({ left_collapsed }).catch(() => undefined);
  };
  const toggleLeftCollapsed = () => setLeftCollapsed(!leftCollapsed);
  const toggleRight = () => {
    if (!scope) {
      return;
    }
    void dashboardMutations
      .updatePanelState({ right_collapsed: !rightCollapsed })
      .catch(() => undefined);
  };
  const openLeftRailMode = (mode: BrowserMode) => {
    setBrowserMode(mode);
    setLeftRailVisible(true);
    if (leftCollapsed) setLeftCollapsed(false);
  };
  const runPanelAction = (action: () => void) => {
    action();
    setPanelFlyoutOpen(false);
  };

  const startLeftResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = leftRailWidth;
    const onMove = (move: PointerEvent) => {
      setLeftRailWidth(
        clampPanel(
          startWidth + move.clientX - startX,
          LEFT_RAIL_MIN_WIDTH,
          LEFT_RAIL_MAX_WIDTH,
        ),
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
        clampPanel(
          startWidth + startX - move.clientX,
          RIGHT_RAIL_MIN_WIDTH,
          RIGHT_RAIL_MAX_WIDTH,
        ),
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
        clampPanel(
          startHeight + startY - move.clientY,
          TIMELINE_MIN_HEIGHT,
          TIMELINE_MAX_HEIGHT,
        ),
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
    direction: "horizontal" | "right" | "vertical",
  ) => {
    const key = event.key;
    const forward =
      (direction === "horizontal" && key === "ArrowRight") ||
      (direction === "right" && key === "ArrowLeft") ||
      (direction === "vertical" && key === "ArrowUp");
    const backward =
      (direction === "horizontal" && key === "ArrowLeft") ||
      (direction === "right" && key === "ArrowRight") ||
      (direction === "vertical" && key === "ArrowDown");
    if (!forward && !backward) return;
    event.preventDefault();
    setSize(
      clampPanel(current + (forward ? PANEL_KEY_STEP : -PANEL_KEY_STEP), min, max),
    );
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
  useBackendSignalStream();

  return (
    <div
      className="relative grid h-screen min-h-0 bg-paper text-ink"
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
      <aside className="relative flex min-h-0 flex-col overflow-hidden">
        {leftRailVisible && leftCollapsed && (
          <IconRail active={browserMode} onSelect={openLeftRailMode} />
        )}
        {leftRailVisible && !leftCollapsed && (
          <ErrorBoundary region="left-rail">
            <CrashZone region="left-rail" />
            <div className="flex min-h-0 flex-1 flex-col border-r border-rule">
              <LeftRail />
            </div>
            <ResizeHandle
              label="Resize left rail"
              orientation="vertical"
              side="right"
              onPointerDown={startLeftResize}
              onKeyDown={(event) =>
                resizeByKey(
                  event,
                  leftRailWidth,
                  setLeftRailWidth,
                  LEFT_RAIL_MIN_WIDTH,
                  LEFT_RAIL_MAX_WIDTH,
                  "horizontal",
                )
              }
            />
          </ErrorBoundary>
        )}
      </aside>

      {/* ── Stage column (flex) — topbar | graph | timeline ────────── */}
      <main className="flex min-h-0 min-w-0 flex-col">
        <StageTopbar trail={["Vault", "Live delta sync"]} />

        {/* Graph + documents area (editor-dock-workspace): the dock workspace
            replaces the single-doc viewer overlay. The graph is a portal-pinned
            canvas panel (default right, full width until a document opens) and
            documents open as walkable/tabbable/movable/hot-dockable panels to its
            left. Stage's canvas + SceneController seam are preserved unchanged —
            GraphCanvasHost renders the whole Stage and dockview only manages an
            empty placeholder, so docking never re-parents the canvas. */}
        <div className="relative min-h-0 min-w-0 flex-1">
          <ErrorBoundary region="stage">
            <CrashZone region="stage" />
            <DockWorkspace />
          </ErrorBoundary>
        </div>

        {/* Bottom timeline. The relational phase-lane timeline
            (dashboard-timeline ADR): the control bar docks at the region's top
            edge, the lineage surface fills the rest. Layer law: this region wires
            stores hooks and shared-state intent only — no fetch, no raw `tiers`. A
            mark click flows into the ONE shared selection + a bounded stage ego
            pulse through `handleNodeClick`. */}
        {timelineVisible && (
          <footer
            className="relative flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden border-t border-rule"
            style={{ height: `${timelineHeight}px` }}
          >
            <ResizeHandle
              label="Resize timeline"
              orientation="horizontal"
              side="top"
              onPointerDown={startTimelineResize}
              onKeyDown={(event) =>
                resizeByKey(
                  event,
                  timelineHeight,
                  setTimelineHeight,
                  TIMELINE_MIN_HEIGHT,
                  TIMELINE_MAX_HEIGHT,
                  "vertical",
                )
              }
            />
            <ErrorBoundary region="timeline">
              <CrashZone region="timeline" />
              <div className="min-w-0 shrink-0">
                <TimelineControls />
              </div>
              <div className="relative min-h-0 min-w-0 flex-1">
                <Timeline
                  onNodeClick={(node, arcs) =>
                    handleNodeClick(node, arcs, getScene().controller, scope)
                  }
                  overlay={
                    <>
                      <RangeSelect />
                      <Playhead scope={scope} />
                    </>
                  }
                />
              </div>
            </ErrorBoundary>
          </footer>
        )}
      </main>

      {/* ── Right pane — the activity rail ──────────────────────────── */}
      <aside
        className={`relative flex min-h-0 flex-col overflow-hidden ${
          rightCollapsed ? "" : "border-l border-rule"
        }`}
      >
        {!rightCollapsed && (
          <ErrorBoundary region="right-rail">
            <CrashZone region="right-rail" />
            <ResizeHandle
              label="Resize right rail"
              orientation="vertical"
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
              onTabChange={(right_tab) => {
                if (!scope) {
                  return;
                }
                void dashboardMutations
                  .updatePanelState({ right_tab })
                  .catch(() => undefined);
              }}
            />
          </ErrorBoundary>
        )}
      </aside>

      {/* ── Single panel flyout ─────────────────────────────────────── */}
      <div className="pointer-events-none absolute left-2 top-2 z-20">
        <span className="pointer-events-auto">
          <IconButton
            label={panelFlyoutOpen ? "Close panel controls" : "Open panel controls"}
            active={panelFlyoutOpen}
            onClick={togglePanelFlyout}
          >
            <PanelLeft size={16} />
          </IconButton>
        </span>
        {panelFlyoutOpen && (
          <div
            className="pointer-events-auto mt-fg-2 w-52 rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-raised"
            role="menu"
            aria-label="panel controls"
          >
            <PanelFlyoutItem
              label={leftRailVisible ? "Hide left rail" : "Show left rail"}
              onClick={() =>
                runPanelAction(() => {
                  setLeftRailVisible(!leftRailVisible);
                })
              }
            />
            {leftRailVisible && (
              <PanelFlyoutItem
                label={leftCollapsed ? "Expand left rail" : "Collapse left rail"}
                onClick={() => runPanelAction(toggleLeftCollapsed)}
              />
            )}
            <PanelFlyoutItem
              label={rightCollapsed ? "Show right rail" : "Hide right rail"}
              onClick={() => runPanelAction(toggleRight)}
            />
            <PanelFlyoutItem
              label={timelineVisible ? "Hide timeline" : "Show timeline"}
              onClick={() =>
                runPanelAction(() => {
                  setTimelineVisible(!timelineVisible);
                })
              }
            />
          </div>
        )}
      </div>

      <CrashInjector />
    </div>
  );
}

function ResizeHandle({
  label,
  orientation,
  side,
  onPointerDown,
  onKeyDown,
}: {
  label: string;
  orientation: "horizontal" | "vertical";
  side: "left" | "right" | "top";
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const placement =
    side === "right"
      ? "right-[-3px] top-0 h-full w-2 cursor-col-resize"
      : side === "left"
        ? "left-[-3px] top-0 h-full w-2 cursor-col-resize"
        : "left-0 top-[-3px] h-2 w-full cursor-row-resize";

  return (
    <div
      aria-label={label}
      aria-orientation={orientation}
      className={`absolute z-10 bg-transparent outline-none transition-colors duration-ui-fast ease-settle hover:bg-accent/20 focus-visible:bg-accent/20 focus-visible:outline-2 focus-visible:outline-focus ${placement}`}
      role="separator"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}

function PanelFlyoutItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex w-full items-center rounded-fg-sm px-fg-2 py-fg-1-5 text-left text-label text-ink-muted transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      onClick={onClick}
    >
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
  onTabChange,
}: {
  tab: RailTabId;
  onTabChange: (tab: RailTabId) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-fg-2 overflow-y-auto p-fg-2">
      {/* Tab bar (roving-keys tablist) — the board's three label-only tabs. */}
      <RailTabs active={tab} onChange={onTabChange} />

      {/* Active pane. Each pane is the tabpanel for its tab; only the active one
          is mounted, so the rail body stays light. */}
      <div
        className="min-h-0 flex-1"
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
