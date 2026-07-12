// The project navigator popup ("Project: Browse or Switch"): an interactive modal
// that lists the machine-global cross-project recents and lets the operator pick a
// new project/worktree, prune one entry, or clear the whole history. Dumb `app/`
// chrome — it consumes the shared `useProjectHistory` seam (the sole owner of the
// history data + switch/CRUD actions) and the kit Dialog; it never touches the
// engine client, the raw view store, or the raw `tiers` block.

import { FolderPlus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { openAddProjectDialog } from "../../stores/view/addProjectChrome";
import {
  closeProjectNavigator,
  useProjectNavigatorOpen,
} from "../../stores/view/projectNavigatorChrome";
import {
  useProjectHistory,
  type ProjectHistoryView,
} from "../../stores/view/worktreePickerChrome";
import { useFocusZone } from "../chrome/useFocusZone";
import { Dialog } from "../chrome/Dialog";
import { Button, IconButton } from "../kit";

const GLYPH_PX = 14;

export function ProjectNavigator() {
  const open = useProjectNavigatorOpen();
  const history = useProjectHistory();
  return open ? <ProjectNavigatorBody history={history} /> : null;
}

/** Split so the FocusZone + roving state only mount while the popup is open. */
function ProjectNavigatorBody({ history }: { history: ProjectHistoryView }) {
  const { recentRows, activateRecent, removeRecent, clearRecents } = history;
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const zone = useFocusZone({
    orientation: "vertical",
    wrap: false,
    activeKey,
    onActiveKeyChange: setActiveKey,
  });

  const choose = (recent: ProjectHistoryView["recentRows"][number]) =>
    activateRecent(recent, closeProjectNavigator);
  const openAdd = () => {
    closeProjectNavigator();
    openAddProjectDialog();
  };

  return (
    <Dialog
      open
      onClose={closeProjectNavigator}
      title="Switch project"
      description="Browse recent projects and worktrees across every registered project, then pick one."
    >
      <div
        className="flex flex-col gap-fg-2 px-fg-4 pt-fg-3 pb-fg-4"
        data-project-navigator
      >
        {recentRows.length === 0 ? (
          <p className="py-fg-4 text-center text-label text-ink-faint">
            No recent projects yet — open a project to get started.
          </p>
        ) : (
          <ul className="flex flex-col gap-fg-0-5" aria-label="recent projects">
            {recentRows.map((recent) => {
              const item = zone.rove(recent.key);
              return (
                <li key={recent.key} className="flex items-center gap-fg-1">
                  <button
                    ref={item.ref}
                    tabIndex={item.tabIndex}
                    type="button"
                    aria-disabled={!recent.selectable}
                    aria-current={recent.isActive ? "true" : undefined}
                    title={recent.title}
                    aria-label={recent.ariaLabel}
                    onFocus={() => setActiveKey(recent.key)}
                    onClick={() => choose(recent)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        choose(recent);
                      } else if (e.key === "Delete" || e.key === "Backspace") {
                        // Prune this entry from the history (CRUD remove) without leaving.
                        e.preventDefault();
                        removeRecent(recent);
                      } else {
                        item.onKeyDown(e);
                      }
                    }}
                    className={`min-w-0 flex-1 ${recent.rowClassName}`}
                  >
                    <span aria-hidden className={recent.activeCueClassName} />
                    {/* The shared row label leads with the project on a
                        cross-project entry, matching the picker dropdown. */}
                    <span className="min-w-0 select-text truncate">
                      {recent.label}
                    </span>
                  </button>
                  <IconButton
                    label={`remove ${recent.worktreeName} from history`}
                    title="Remove from history"
                    onClick={() => removeRecent(recent)}
                  >
                    <X size={GLYPH_PX} aria-hidden />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}

        {/* Footer: clear the whole history, or open/register a new project. */}
        <div className="flex items-center justify-between gap-fg-2 border-t border-rule pt-fg-3">
          <Button
            variant="ghost"
            onClick={clearRecents}
            aria-label="clear project history"
          >
            <Trash2 size={GLYPH_PX} aria-hidden className="mr-fg-1" />
            Clear history
          </Button>
          <Button variant="primary" onClick={openAdd}>
            <FolderPlus size={GLYPH_PX} aria-hidden className="mr-fg-1" />
            Open project…
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
