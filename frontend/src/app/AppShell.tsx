import { useState } from "react";

import { CrashInjector, CrashZone } from "../platform/errors/CrashInjector";
import { ErrorBoundary } from "../platform/errors/ErrorBoundary";
import { useViewStore } from "../stores/view/viewStore";
import { VaultBrowser } from "./left/VaultBrowser";
import { KeyboardNav } from "./a11y/KeyboardNav";
import { DegradationDebugSwitch } from "./degradation/DebugSwitch";
import { CommandPalette } from "./palette/CommandPalette";
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
// Placeholder panels only — the foundation scaffold proves the layout and
// the three-store wiring, not the product.
export function AppShell() {
  const leftCollapsed = useViewStore((s) => s.leftRailCollapsed);
  const rightCollapsed = useViewStore((s) => s.rightRailCollapsed);
  const toggleLeft = useViewStore((s) => s.toggleLeftRail);
  const toggleRight = useViewStore((s) => s.toggleRightRail);

  return (
    <div className="grid h-screen grid-rows-[1fr_8rem] bg-stone-50 text-stone-900">
      <CommandPalette />
      <DegradationDebugSwitch />
      <KeyboardNav />
      <div
        className="grid min-h-0"
        style={{
          gridTemplateColumns: `${leftCollapsed ? "2.5rem" : "16rem"} 1fr ${rightCollapsed ? "2.5rem" : "20rem"}`,
        }}
      >
        <aside className="overflow-hidden border-r border-stone-200 p-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={toggleLeft}
              className="text-xs text-stone-500"
            >
              {leftCollapsed ? "»" : "« scope"}
            </button>
            {!leftCollapsed && <ThemeToggle />}
          </div>
          {!leftCollapsed && (
            <ErrorBoundary region="left-rail">
              <CrashZone region="left-rail" />
              <div className="mt-2 space-y-3 overflow-y-auto">
                <WorktreePicker />
                <VaultBrowser />
              </div>
            </ErrorBoundary>
          )}
        </aside>
        <main className="relative min-w-0">
          <ErrorBoundary region="stage">
            <CrashZone region="stage" />
            <Stage />
          </ErrorBoundary>
        </main>
        <aside className="overflow-hidden border-l border-stone-200 p-2">
          <button
            type="button"
            onClick={toggleRight}
            className="text-xs text-stone-500"
          >
            {rightCollapsed ? "«" : "activity »"}
          </button>
          {!rightCollapsed && (
            <ErrorBoundary region="right-rail">
              <CrashZone region="right-rail" />
              <ActivityRail />
            </ErrorBoundary>
          )}
        </aside>
      </div>
      <footer className="border-t border-stone-200">
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
      className="text-xs text-stone-500"
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

function ActivityRail() {
  const [tab, setTab] = useState<"activity" | "search">("activity");
  return (
    <div className="mt-2 space-y-3 overflow-y-auto">
      <div className="flex gap-1 text-xs" role="tablist" aria-label="rail tabs">
        {(["activity", "search"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded px-2 py-0.5 ${
              tab === t ? "bg-stone-200 text-stone-900" : "text-stone-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "activity" ? (
        <>
          <NowStrip />
          <OpsPanel />
          <Inspector />
        </>
      ) : (
        <SearchTab />
      )}
    </div>
  );
}
