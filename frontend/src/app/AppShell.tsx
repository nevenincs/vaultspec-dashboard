import { useState } from "react";

import { CrashInjector, CrashZone } from "../platform/errors/CrashInjector";
import { ErrorBoundary } from "../platform/errors/ErrorBoundary";
import { useViewStore } from "../stores/view/viewStore";
import { VaultBrowser } from "./left/VaultBrowser";
import { KeyboardNav } from "./a11y/KeyboardNav";
import { DegradationDebugSwitch } from "./degradation/DebugSwitch";
import { CommandPalette } from "./palette/CommandPalette";
import { ChangesOverview } from "./right/ChangesOverview";
import { Inspector } from "./right/Inspector";
import { NowStrip } from "./right/NowStrip";
import { OpsPanel } from "./right/OpsPanel";
import { SearchTab } from "./right/SearchTab";
import { WorktreePicker } from "./left/WorktreePicker";
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
              {leftCollapsed ? "›" : "‹"}
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

          {/* Rail content */}
          {!leftCollapsed && (
            <ErrorBoundary region="left-rail">
              <CrashZone region="left-rail" />
              <div className="flex-1 overflow-y-auto p-vs-2">
                <WorktreePicker />
                <hr className="my-vs-2 border-rule" />
                <VaultBrowser />
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
                ‹
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
                  ›
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

/** Light + dark from day one (G7.3): remaps the token variables only. */
function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.dataset.theme === "dark",
  );
  return (
    <button
      type="button"
      aria-label={dark ? "switch to light theme" : "switch to dark theme"}
      className="flex h-5 w-5 items-center justify-center rounded-vs-sm border border-rule text-label text-ink-faint transition-colors hover:border-rule-strong hover:text-ink-muted"
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.dataset.theme = next ? "dark" : "light";
      }}
    >
      {dark ? "☀" : "☾"}
    </button>
  );
}

// Tab labels — compact to keep the rail header-aligned.
const RAIL_TABS = [
  { id: "activity" as const, label: "now" },
  { id: "changes" as const, label: "changes" },
  { id: "search" as const, label: "search" },
];

function ActivityRail() {
  const [tab, setTab] = useState<"activity" | "changes" | "search">("activity");
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
        {tab === "changes" && <ChangesOverview />}
        {tab === "search" && <SearchTab />}
      </div>
    </div>
  );
}
