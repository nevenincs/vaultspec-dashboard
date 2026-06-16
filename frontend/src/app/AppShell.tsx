import {
  ChevronLeft,
  ChevronRight,
  Contrast,
  Monitor,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import { useState } from "react";

import { CrashInjector, CrashZone } from "../platform/errors/CrashInjector";
import { ErrorBoundary } from "../platform/errors/ErrorBoundary";
import type { ThemePreference } from "../platform/theme/themeController";
import { useBackendSignalStream } from "../stores/server/queries";
import { useViewStore } from "../stores/view/viewStore";
import { LeftRail } from "./left/LeftRail";
import { KeyboardNav } from "./a11y/KeyboardNav";
import { DegradationDebugSwitch } from "./degradation/DebugSwitch";
import { ContextMenuHost } from "./menu/ContextMenuHost";
// Register every per-surface context-menu resolver once at app load.
import "./menus/registerAll";
import { CommandPalette } from "./palette/CommandPalette";
import { SettingsDialog } from "./settings/SettingsDialog";
import { useSettingsDialog } from "./settings/useSettingsDialog";
import { useSettingsEffects } from "./settings/settingsEffects";
import { useThemeSetting } from "./settings/themeSetting";
import { ChangesOverview } from "./right/ChangesOverview";
import { Inspector } from "./right/Inspector";
import { NowStrip } from "./right/NowStrip";
import { OpsPanel } from "./right/OpsPanel";
import { RailTabs, type RailTabId } from "./right/RailTabs";
import { SearchTab } from "./right/SearchTab";
import { StatusTab } from "./right/StatusTab";
import { Stage } from "./stage/Stage";
import { Playhead } from "./timeline/Playhead";
import { RangeSelect } from "./timeline/RangeSelect";
import { Timeline } from "./timeline/Timeline";
import { TimelineControls } from "./timeline/TimelineControls";
import { handleNodeClick } from "./timeline/eventSelection";

// Four-region skeleton in the converged agentic-desktop idiom (gui-spec §2):
// left scope rail, center stage, right activity rail, bottom timeline.
// Layer law: each rail reads stores hooks only; no rail component fetches.
export function AppShell() {
  const leftCollapsed = useViewStore((s) => s.leftRailCollapsed);
  const rightCollapsed = useViewStore((s) => s.rightRailCollapsed);
  const toggleLeft = useViewStore((s) => s.toggleLeftRail);
  const toggleRight = useViewStore((s) => s.toggleRightRail);
  // Theme is an engine setting now (dashboard-settings W05): the bridge reconciles
  // the server value to the framework-free controller and persists changes. Called
  // once here so the reconcile runs regardless of rail collapse state.
  const theme = useThemeSetting();
  // Apply the non-theme consumed settings (reduce_motion, default_granularity)
  // to app state once at the shell top (review HIGH-1: no dead controls).
  useSettingsEffects();
  // F-M1 (event-unity): mount the shared backend-signal stream (backends + git)
  // once here so status / rag-health stay live regardless of which rail tab is
  // open; NowStrip and the search controller read the deduped shared accumulator.
  useBackendSignalStream();

  return (
    <div className="grid h-screen grid-rows-[1fr_13rem] bg-paper text-ink">
      <CommandPalette />
      <SettingsDialog />
      <ContextMenuHost />
      <DegradationDebugSwitch />
      <KeyboardNav />
      <div
        className="grid min-h-0"
        style={{
          gridTemplateColumns: `${leftCollapsed ? "2.5rem" : "16rem"} 1fr ${rightCollapsed ? "2.5rem" : "20rem"}`,
        }}
      >
        {/* ── Left scope rail ────────────────────────────────────── */}
        <aside className="flex flex-col overflow-hidden border-r border-rule">
          {/* Rail header */}
          <div className="flex h-9 shrink-0 items-center border-b border-rule px-vs-2">
            <button
              type="button"
              onClick={toggleLeft}
              aria-label={leftCollapsed ? "expand scope rail" : "collapse scope rail"}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-vs-sm border border-rule text-label text-ink-faint transition-colors hover:border-rule-strong hover:text-ink-muted"
            >
              {leftCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
            </button>
            {!leftCollapsed && (
              <>
                <span className="ml-vs-2 flex-1 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                  Scope
                </span>
                <ThemeToggle
                  preference={theme.preference}
                  setPreference={theme.setPreference}
                />
                <SettingsButton />
              </>
            )}
          </div>

          {/* Rail content — the ordered hosted-slot stack (dashboard-left-rail
              IA): workspace → worktree → browser (vault|code + in-rail filter),
              composed in LeftRail. The collapse toggle in the header above is
              first in the rail's single top-to-bottom focus order; LeftRail is
              the labelled landmark continuing it. */}
          {!leftCollapsed && (
            <ErrorBoundary region="left-rail">
              <CrashZone region="left-rail" />
              <div className="flex min-h-0 flex-1 flex-col">
                <LeftRail />
              </div>
            </ErrorBoundary>
          )}
        </aside>

        {/* ── Center stage ───────────────────────────────────────── */}
        <main className="relative min-w-0">
          <ErrorBoundary region="stage">
            <CrashZone region="stage" />
            <Stage />
          </ErrorBoundary>
        </main>

        {/* ── Right activity rail ────────────────────────────────── */}
        <aside className="flex flex-col overflow-hidden border-l border-rule">
          {/* Rail header */}
          <div className="flex h-9 shrink-0 items-center border-b border-rule px-vs-2">
            {rightCollapsed ? (
              <button
                type="button"
                onClick={toggleRight}
                aria-label="expand activity rail"
                className="mx-auto flex h-5 w-5 items-center justify-center rounded-vs-sm border border-rule text-label text-ink-faint transition-colors hover:border-rule-strong hover:text-ink-muted"
              >
                <ChevronLeft size={12} />
              </button>
            ) : (
              <>
                <span className="flex-1 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                  Activity
                </span>
                <button
                  type="button"
                  onClick={toggleRight}
                  aria-label="collapse activity rail"
                  className="flex h-5 w-5 items-center justify-center rounded-vs-sm border border-rule text-label text-ink-faint transition-colors hover:border-rule-strong hover:text-ink-muted"
                >
                  <ChevronRight size={12} />
                </button>
              </>
            )}
          </div>

          {/* Rail content */}
          {!rightCollapsed && (
            <ErrorBoundary region="right-rail">
              <CrashZone region="right-rail" />
              <ActivityRail />
            </ErrorBoundary>
          )}
        </aside>
      </div>

      {/* ── Bottom timeline ────────────────────────────────────────── */}
      {/* The relational phase-lane timeline (dashboard-timeline ADR): the control
          bar docks at the region's top edge, the lineage surface fills the rest.
          Layer law (dashboard-layer-ownership): this region wires stores hooks and
          shared-state intent only — no fetch, no raw `tiers`. A mark click flows
          into the ONE shared selection + a bounded stage ego pulse through
          `handleNodeClick` (the deferred S45 wiring); the surface hands its
          visible-slice arcs so the bounded 1-hop join is derived honestly. */}
      <footer className="flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-rule">
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
      <CrashInjector />
    </div>
  );
}

// Theme preferences the toggle cycles through (ADR layer 2): system
// auto-switch plus the three peer themes as manual overrides. The controller
// owns <html>; this button only cycles the preference and never touches
// data-theme directly (no dark: utility variant).
const THEME_CYCLE: ThemePreference[] = ["system", "light", "dark", "high-contrast"];

const THEME_META: Record<ThemePreference, { icon: typeof Sun; label: string }> = {
  system: { icon: Monitor, label: "system theme (auto)" },
  light: { icon: Sun, label: "light theme" },
  dark: { icon: Moon, label: "dark theme" },
  "high-contrast": { icon: Contrast, label: "high-contrast theme" },
};

/** Theme model: cycles preference through system/light/dark/high-contrast. The
 *  preference is now an engine setting (dashboard-settings W05) — the shell owns
 *  the bridge (useThemeSetting) and passes the current value + setter in. */
function ThemeToggle({
  preference,
  setPreference,
}: {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}) {
  const current = THEME_META[preference];
  const Icon = current.icon;
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(preference) + 1) % THEME_CYCLE.length];
  return (
    <button
      type="button"
      aria-label={`theme: ${current.label}; click for ${THEME_META[next].label}`}
      title={current.label}
      className="flex h-5 w-5 items-center justify-center rounded-vs-sm border border-rule text-label text-ink-faint transition-colors hover:border-rule-strong hover:text-ink-muted"
      onClick={() => setPreference(next)}
    >
      <Icon size={12} />
    </button>
  );
}

/** The settings entry point (dashboard-settings W04.P09): a gear that opens the
 *  schema-driven settings dialog. The command palette opens the same dialog. */
function SettingsButton() {
  const openDialog = useSettingsDialog((s) => s.openDialog);
  return (
    <button
      type="button"
      aria-label="open settings"
      title="Settings"
      className="ml-vs-1 flex h-5 w-5 items-center justify-center rounded-vs-sm border border-rule text-label text-ink-faint transition-colors hover:border-rule-strong hover:text-ink-muted"
      onClick={openDialog}
    >
      <Settings size={12} />
    </button>
  );
}

// The activity-rail composition (binding Figma `RightRail`, node 17:563; the
// Status overview node 112:2): the NowStrip status pillars are a PERSISTENT
// header above the tab bar — git / core / rag liveness stays visible regardless
// of which pane is open — then the segmented tab bar (Status | Inspect | Search |
// Changes) and the active pane. Status is the primary tab (the status-overview
// ADR): the location anchor + plan-derived open work + recent commits. Inspect is
// the selected-node lens (Inspector) plus the modest ops surface; Search and
// Changes own their pillars.
function ActivityRail() {
  const [tab, setTab] = useState<RailTabId>("status");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-vs-2 overflow-y-auto p-vs-2">
      {/* Persistent liveness header — the three status pillars, always visible. */}
      <NowStrip />

      {/* Segmented tab bar (roving-keys tablist). */}
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
        {tab === "inspect" && (
          <div className="space-y-vs-3">
            <Inspector />
            <OpsPanel />
          </div>
        )}
        {tab === "search" && <SearchTab />}
        {tab === "changes" && <ChangesOverview />}
      </div>
    </div>
  );
}
