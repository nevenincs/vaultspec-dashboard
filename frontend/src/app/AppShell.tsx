import { Suspense, lazy, useState } from "react";

import { CrashInjector, CrashZone } from "../platform/errors/CrashInjector";
import { ErrorBoundary } from "../platform/errors/ErrorBoundary";
import { useBackendSignalStream } from "../stores/server/queries";
import { useViewStore } from "../stores/view/viewStore";
import { LeftRail } from "./left/LeftRail";
import { KeyboardNav } from "./a11y/KeyboardNav";
import { DegradationDebugSwitch } from "./degradation/DebugSwitch";
import { IconButton } from "./kit";
import { PanelLeft, PanelRight } from "./kit/glyphs";
import { ContextMenuHost } from "./menu/ContextMenuHost";
import { KeyboardShortcuts } from "./menu/KeyboardShortcuts";
// Register every per-surface context-menu resolver once at app load.
import "./menus/registerAll";
import { CommandPalette } from "./palette/CommandPalette";
import { SettingsDialog } from "./settings/SettingsDialog";
import { useSettingsDialog } from "./settings/useSettingsDialog";
import { useSettingsEffects } from "./settings/settingsEffects";
import { useThemeSetting } from "./settings/themeSetting";
import { ChangesOverview } from "./right/ChangesOverview";
import { RailTabs, type RailTabId } from "./right/RailTabs";
import { SearchTab } from "./right/SearchTab";
import { StatusTab } from "./right/StatusTab";
import { IconRail, type PrimaryView } from "./shell/IconRail";
import { StageTopbar } from "./shell/StageTopbar";
import { Stage } from "./stage/Stage";
import { Playhead } from "./timeline/Playhead";
import { RangeSelect } from "./timeline/RangeSelect";
import { Timeline } from "./timeline/Timeline";
import { TimelineControls } from "./timeline/TimelineControls";
import { handleNodeClick } from "./timeline/eventSelection";
// The reader/code-viewer stack (react-markdown + Shiki) is heavy and only needed
// once a document is opened, so it is code-split out of the initial shell graph
// and loaded on demand (the graph view is the default surface).
const ViewerSurface = lazy(() =>
  import("./viewer/ViewerSurface").then((m) => ({ default: m.ViewerSurface })),
);

// Binding AppShell grid (figma-frontend-rewrite W02.P03 — board 117:2): four
// fluid/fixed columns at full viewport height —
//   left-icon-bar (48px) | left-pane (290px) | stage (flex) | right-pane (290px)
// — where the two 290px panes are collapsible and reflow the grid. The stage
// column is itself a vertical stack: a 44px breadcrumb topbar, the graph area
// (the existing Stage, fills), and a 212px Timeline at the bottom.
//
// Layer law (dashboard-layer-ownership / view-rewrite-preserves-the-state-and-
// scene-contract): the shell is leaf chrome — it composes the centralized kit and
// renders the existing LeftRail / Stage / Timeline / ActivityRail in their slots,
// consuming the preserved stores hooks and SceneController contract UNCHANGED. It
// adds no new fetch, mints no model, and reads no raw `tiers`.
const LEFT_PANE = "290px";
const RIGHT_PANE = "290px";

export function AppShell() {
  const leftCollapsed = useViewStore((s) => s.leftRailCollapsed);
  const rightCollapsed = useViewStore((s) => s.rightRailCollapsed);
  // Whether a document viewer is open — drives the stage-area reader overlay.
  const viewerOpen = useViewStore((s) => s.viewerTarget !== null);
  const toggleLeft = useViewStore((s) => s.toggleLeftRail);
  const toggleRight = useViewStore((s) => s.toggleRightRail);
  const openSettings = useSettingsDialog((s) => s.openDialog);
  // The active primary view drives the icon rail's accent indicator. No store
  // concept for "primary view" exists yet, so it is local shell state (the
  // supervisor-sanctioned fallback); the four glyphs are present-and-correct
  // navigation chrome that the deeper rail content will bind onto later.
  const [primaryView, setPrimaryView] = useState<PrimaryView>("overview");

  // Theme is an engine setting now (dashboard-settings W05): the bridge reconciles
  // the server value to the framework-free controller and persists changes. Called
  // once here so the reconcile runs regardless of rail collapse state.
  useThemeSetting();
  // Apply the non-theme consumed settings (reduce_motion, default_granularity)
  // to app state once at the shell top (review HIGH-1: no dead controls).
  useSettingsEffects();
  // F-M1 (event-unity): mount the shared backend-signal stream (backends + git)
  // once here so status / rag-health stay live regardless of which rail tab is
  // open; NowStrip and the search controller read the deduped shared accumulator.
  useBackendSignalStream();

  return (
    <div
      className="relative grid h-screen min-h-0 bg-paper text-ink"
      style={{
        gridTemplateColumns: `48px ${leftCollapsed ? "0px" : LEFT_PANE} 1fr ${
          rightCollapsed ? "0px" : RIGHT_PANE
        }`,
      }}
    >
      <CommandPalette />
      <SettingsDialog />
      <ContextMenuHost />
      <KeyboardShortcuts />
      <DegradationDebugSwitch />
      <KeyboardNav />

      {/* ── Far-left icon rail (48px) ──────────────────────────────── */}
      <IconRail
        active={primaryView}
        onSelect={setPrimaryView}
        onOpenSettings={openSettings}
      />

      {/* ── Left pane (290px) — the scope/browser rail ─────────────── */}
      <aside className="relative flex min-h-0 flex-col overflow-hidden border-r border-rule">
        {!leftCollapsed && (
          <ErrorBoundary region="left-rail">
            <CrashZone region="left-rail" />
            <div className="flex min-h-0 flex-1 flex-col">
              <LeftRail />
            </div>
          </ErrorBoundary>
        )}
      </aside>

      {/* ── Stage column (flex) — topbar | graph | timeline ────────── */}
      <main className="flex min-h-0 min-w-0 flex-col">
        <StageTopbar trail={["Vault", "Live delta sync"]} />

        {/* Graph area — fills the remaining height; renders the existing Stage.
            The reader/code viewer (review-rail-viewers) overlays this area when an
            open-in-viewer target is set: the Pixi graph stays mounted underneath
            (its state and the SceneController seam are preserved — view-rewrite-
            preserves-the-state-and-scene-contract) and ViewerSurface paints an
            opaque bg-paper surface over it; it renders null when no viewer is
            open, so the graph shows through. */}
        <div className="relative min-h-0 min-w-0 flex-1">
          <ErrorBoundary region="stage">
            <CrashZone region="stage" />
            <Stage />
          </ErrorBoundary>
          {viewerOpen && (
            <div className="absolute inset-0 z-10">
              <ErrorBoundary region="viewer">
                <Suspense fallback={null}>
                  <ViewerSurface />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}
        </div>

        {/* Bottom timeline (212px). The relational phase-lane timeline
            (dashboard-timeline ADR): the control bar docks at the region's top
            edge, the lineage surface fills the rest. Layer law: this region wires
            stores hooks and shared-state intent only — no fetch, no raw `tiers`. A
            mark click flows into the ONE shared selection + a bounded stage ego
            pulse through `handleNodeClick`. */}
        <footer className="flex h-[212px] min-h-0 min-w-0 shrink-0 flex-col overflow-hidden border-t border-rule">
          <ErrorBoundary region="timeline">
            <CrashZone region="timeline" />
            <div className="min-w-0 shrink-0">
              <TimelineControls />
            </div>
            <div className="relative min-h-0 min-w-0 flex-1">
              <Timeline
                onNodeClick={handleNodeClick}
                overlay={
                  <>
                    <RangeSelect />
                    <Playhead />
                  </>
                }
              />
            </div>
          </ErrorBoundary>
        </footer>
      </main>

      {/* ── Right pane (290px) — the activity rail ─────────────────── */}
      <aside className="relative flex min-h-0 flex-col overflow-hidden border-l border-rule">
        {!rightCollapsed && (
          <ErrorBoundary region="right-rail">
            <CrashZone region="right-rail" />
            <ActivityRail />
          </ErrorBoundary>
        )}
      </aside>

      {/* ── Floating pane toggles ──────────────────────────────────── */}
      {/* PanelLeft sits over the left pane's header zone; PanelRight pins to the
          far-right corner. Each reflects + flips the corresponding collapse flag. */}
      <div className="pointer-events-none absolute left-[14px] top-3 z-20">
        <span className="pointer-events-auto">
          <IconButton
            label={leftCollapsed ? "Show left panel" : "Hide left panel"}
            active={!leftCollapsed}
            onClick={toggleLeft}
          >
            <PanelLeft size={16} />
          </IconButton>
        </span>
      </div>
      <div className="pointer-events-none absolute right-2 top-2 z-20">
        <span className="pointer-events-auto">
          <IconButton
            label={rightCollapsed ? "Show right panel" : "Hide right panel"}
            active={!rightCollapsed}
            onClick={toggleRight}
          >
            <PanelRight size={16} />
          </IconButton>
        </span>
      </div>

      <CrashInjector />
    </div>
  );
}

// The activity-rail composition (binding Figma `ActivityRail`, node 244:753): the
// rail is EXACTLY three label-only tabs — Status | Changes | Search — over their
// panes, with NO persistent pillar header (the rewrite retires the status-overview
// liveness pillars and the Inspect pane that board 112:2 carried; node detail now
// lives in the reader / DocHeader, and worktree/branch identity rides the Status
// pane's context card). Status is the primary tab: the location anchor +
// plan-derived open work + recent commits.
function ActivityRail() {
  const [tab, setTab] = useState<RailTabId>("status");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-fg-2 overflow-y-auto p-fg-2">
      {/* Tab bar (roving-keys tablist) — the board's three label-only tabs. */}
      <RailTabs active={tab} onChange={setTab} />

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
