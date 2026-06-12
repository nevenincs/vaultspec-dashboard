import { useViewStore } from "../stores/view/viewStore";
import { VaultBrowser } from "./left/VaultBrowser";
import { Inspector } from "./right/Inspector";
import { NowStrip } from "./right/NowStrip";
import { OpsPanel } from "./right/OpsPanel";
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
  return (
    <div className="mt-2 space-y-3 overflow-y-auto">
      <NowStrip />
      <OpsPanel />
      <Inspector />
    </div>
  );
}
