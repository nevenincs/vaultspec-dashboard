import { ChevronLeft, ChevronRight, Contrast, Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";

import { CrashInjector, CrashZone } from "../platform/errors/CrashInjector";
import { ErrorBoundary } from "../platform/errors/ErrorBoundary";
import type { ThemePreference } from "../platform/theme/themeController";
import { useTheme } from "../platform/theme/useTheme";
import { useViewStore } from "../stores/view/viewStore";
import { LeftRail } from "./left/LeftRail";
import { KeyboardNav } from "./a11y/KeyboardNav";
import { DegradationDebugSwitch } from "./degradation/DebugSwitch";
import { CommandPalette } from "./palette/CommandPalette";
import { ChangesOverview } from "./right/ChangesOverview";
import { Inspector } from "./right/Inspector";
import { NowStrip } from "./right/NowStrip";
import { OpsPanel } from "./right/OpsPanel";
import { SearchTab } from "./right/SearchTab";
import { WorkTab } from "./right/WorkTab";
import { Stage } from "./stage/Stage";
import { Playhead } from "./timeline/Playhead";
import { RangeSelect } from "./timeline/RangeSelect";
import { handleEventClick } from "./timeline/eventSelection";
import { Timeline } from "./timeline/Timeline";

// Four-region skeleton in the converged agentic-desktop idiom (gui-spec §2):
// left scope rail, center stage, right activity rail, bottom timeline.
// Layer law: each rail reads stores hooks only; no rail component fetches.
export function AppShell() {
  const leftCollapsed = useViewStore((s) => s.leftRailCollapsed);
  const rightCollapsed = useViewStore((s) => s.rightRailCollapsed);
  const toggleLeft = useViewStore((s) => s.toggleLeftRail);
  const toggleRight = useViewStore((s) => s.toggleRightRail);

  return (
    <div className="grid h-screen grid-rows-[1fr_8rem] bg-paper text-ink">
      <CommandPalette />
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
                <ThemeToggle />
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
      <footer className="border-t border-rule">
        <ErrorBoundary region="timeline">
          <CrashZone region="timeline" />
          <Timeline
            onEventClick={handleEventClick}
            overlay={
              <>
                <RangeSelect />
                <Playhead />
              </>
            }
          />
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

/** Theme model (S09): cycles preference through system/light/dark/high-contrast. */
function ThemeToggle() {
  const { preference, setPreference } = useTheme();
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

// Tab labels — compact to keep the rail header-aligned. The four-tab review-rail
// IA (dashboard-activity-rail ADR): now / work / changes / search, a left-to-right
// narrowing of attention (live status → in-flight work → material changes → find).
// `work` sits second between the liveness pillar and the evidence pillar; the `now`
// tab's internal id stays `activity` (unchanged membership: NowStrip, OpsPanel,
// Inspector).
export const RAIL_TABS = [
  { id: "activity" as const, label: "now" },
  { id: "work" as const, label: "work" },
  { id: "changes" as const, label: "changes" },
  { id: "search" as const, label: "search" },
];

function ActivityRail() {
  const [tab, setTab] = useState<"activity" | "work" | "changes" | "search">(
    "activity",
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Tab strip */}
      <div
        className="flex shrink-0 gap-vs-0-5 border-b border-rule px-vs-2 py-vs-1-5"
        role="tablist"
        aria-label="rail tabs"
      >
        {RAIL_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-vs-sm px-vs-2 py-vs-0-5 text-label transition-colors ${
              tab === id
                ? "bg-paper-sunken font-medium text-ink"
                : "text-ink-faint hover:text-ink-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 space-y-vs-3 overflow-y-auto p-vs-2">
        {tab === "activity" && (
          <>
            <NowStrip />
            <OpsPanel />
            <Inspector />
          </>
        )}
        {tab === "work" && <WorkTab />}
        {tab === "changes" && <ChangesOverview />}
        {tab === "search" && <SearchTab />}
      </div>
    </div>
  );
}
