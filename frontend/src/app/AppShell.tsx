import { useEngineStatus } from "../stores/server/engine";
import { useViewStore } from "../stores/view/viewStore";
import { Stage } from "./stage/Stage";

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
            <div className="mt-2 text-sm text-stone-400">
              worktree picker · vault browser (scaffold)
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
      <footer className="border-t border-stone-200 p-2 text-sm text-stone-400">
        timeline — movie idiom: lanes · zoom · playhead (scaffold){" "}
        <span className="float-right">▶ LIVE</span>
      </footer>
    </div>
  );
}

function ActivityRail() {
  const { data, isError, isPending } = useEngineStatus();
  return (
    <div className="mt-2 space-y-1 text-sm">
      <div className="font-medium text-stone-600">engine</div>
      {isPending && <div className="text-stone-400">contacting engine…</div>}
      {isError && (
        <div className="text-amber-700">
          engine unreachable — start it with <code>vaultspec serve</code>
        </div>
      )}
      {data && (
        <ul className="text-stone-500">
          <li>nodes: {data.nodes}</li>
          <li>edges: {data.edges}</li>
          {data.degradations.map((d) => (
            <li key={d} className="text-amber-700">
              degraded: {d}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
