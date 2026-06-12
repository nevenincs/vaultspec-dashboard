import { useState } from "react";

import { useViewStore } from "../stores/view/viewStore";
import { VaultBrowser } from "./left/VaultBrowser";
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
      <div
        className="grid min-h-0"
        style={{
          gridTemplateColumns: `${leftCollapsed ? "2.5rem" : "16rem"} 1fr ${rightCollapsed ? "2.5rem" : "20rem"}`,
        }}
      >
        <aside className="overflow-hidden border-r border-stone-200 p-2">
          <button type="button" onClick={toggleLeft} className="text-xs text-stone-500">
            {leftCollapsed ? "»" : "« scope"}
          </button>
          {!leftCollapsed && (
            <div className="mt-2 space-y-3 overflow-y-auto">
              <WorktreePicker />
              <VaultBrowser />
            </div>
          )}
        </aside>
        <main className="relative min-w-0">
          <Stage />
        </main>
        <aside className="overflow-hidden border-l border-stone-200 p-2">
          <button
            type="button"
            onClick={toggleRight}
            className="text-xs text-stone-500"
          >
            {rightCollapsed ? "«" : "activity »"}
          </button>
          {!rightCollapsed && <ActivityRail />}
        </aside>
      </div>
      <footer className="border-t border-stone-200">
        <Timeline
          onEventClick={handleEventClick}
          overlay={
            <>
              <RangeSelect />
              <Playhead />
            </>
          }
        />
      </footer>
    </div>
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
