import { FolderPlus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import {
  WORKSPACE_IDENTITY_MESSAGES,
  type WorkspaceIdentityText,
} from "../../stores/server/queries";

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
  const resolveMessage = useLocalizedMessageResolver();
  const message = (descriptor: MessageDescriptor) => resolveMessage(descriptor).message;
  const identity = (value: WorkspaceIdentityText) =>
    typeof value === "string" ? value : message(value);
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
      title={message(WORKSPACE_IDENTITY_MESSAGES.switchProjectTitle)}
      description={message(WORKSPACE_IDENTITY_MESSAGES.switchProjectDescription)}
      footer={
        <div className="flex items-center justify-between gap-fg-2">
          <Button
            variant="ghost"
            onClick={clearRecents}
            aria-label={message(WORKSPACE_IDENTITY_MESSAGES.clearHistory)}
          >
            <Trash2 size={GLYPH_PX} aria-hidden className="mr-fg-1" />
            {message(WORKSPACE_IDENTITY_MESSAGES.clearHistory)}
          </Button>
          <Button variant="primary" onClick={openAdd}>
            <FolderPlus size={GLYPH_PX} aria-hidden className="mr-fg-1" />
            {message(WORKSPACE_IDENTITY_MESSAGES.openProject)}
          </Button>
        </div>
      }
    >
      <div
        className="flex flex-col gap-fg-2 px-fg-4 pt-fg-3 pb-fg-4"
        data-project-navigator
      >
        {recentRows.length === 0 ? (
          <p className="py-fg-4 text-center text-label text-ink-muted">
            {message(WORKSPACE_IDENTITY_MESSAGES.noRecent)}
          </p>
        ) : (
          <ul
            className="flex flex-col gap-fg-0-5"
            aria-label={message(WORKSPACE_IDENTITY_MESSAGES.recentProjects)}
          >
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
                    title={message(recent.title)}
                    aria-label={message(recent.ariaLabel)}
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
                      {identity(recent.label)}
                    </span>
                  </button>
                  <IconButton
                    label={message({
                      key: "projects:workspaceIdentity.accessibility.removeRecent",
                      values: { worktree: identity(recent.worktreeName) },
                    })}
                    title={message(WORKSPACE_IDENTITY_MESSAGES.removeFromHistory)}
                    onClick={() => removeRecent(recent)}
                  >
                    <X size={GLYPH_PX} aria-hidden />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
