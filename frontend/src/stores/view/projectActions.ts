import { useEffect } from "react";

import { FolderGit2, FolderPlus, Trash2 } from "lucide-react";

import type { ActionDescriptor } from "../../platform/actions/action";
import type { MessageDescriptor } from "../../platform/localization/message";
import {
  type KeybindingDef,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { openAddProjectDialog } from "./addProjectChrome";
import { registerKeyAction } from "./keymapDispatcher";
import { openProjectNavigator } from "./projectNavigatorChrome";

// The "Project" action group (global project-management plane): open/register a
// project, browse-or-switch the cross-project history, and clear that history.
// One shared id per verb, enrolled across the keymap and the command palette (the
// single `projectCommandProvider`) under that id — action-verbs-enroll. The verbs
// are authored ONCE here and composed by every eligible plane (unified-action-plane).
export const PROJECT_OPEN_ACTION_ID = "project:open";
export const PROJECT_CLEAR_HISTORY_ACTION_ID = "project:clear-history";
export const PROJECT_BROWSE_ACTION_ID = "project:browse";

export const PROJECT_OPEN_LABEL = Object.freeze({
  key: "projects:actions.add",
} as const satisfies MessageDescriptor);
export const PROJECT_BROWSE_LABEL = Object.freeze({
  key: "projects:actions.switch",
} as const satisfies MessageDescriptor);

const PROJECT_GROUP = Object.freeze({
  key: "projects:shortcutGroups.projects",
} as const satisfies MessageDescriptor);

/** The keymap-bound Project verbs: Open and Browse-or-Switch are global chords.
 *  Clear History is palette-only (a destructive verb needs no standing chord). */
export function deriveProjectKeybindings(): KeybindingDef[] {
  return [
    {
      id: PROJECT_OPEN_ACTION_ID,
      defaultChord: "Mod+Alt+O",
      label: PROJECT_OPEN_LABEL,
      group: PROJECT_GROUP,
      context: "global",
    },
    {
      id: PROJECT_BROWSE_ACTION_ID,
      defaultChord: "Mod+Alt+P",
      label: PROJECT_BROWSE_LABEL,
      group: PROJECT_GROUP,
      context: "global",
    },
  ];
}

/**
 * "Project: Open" — opens the add-project dialog (a path-input prompt that
 * registers a new workspace root read-only via the engine `add_workspace`). A
 * store-only intent (the registration rides `useAddWorkspace` from the dialog),
 * so no time-travel gate.
 */
export function openProjectAction(): ActionDescriptor {
  return {
    id: PROJECT_OPEN_ACTION_ID,
    label: PROJECT_OPEN_LABEL,
    section: "transform",
    icon: FolderPlus,
    run: openAddProjectDialog,
  };
}

/**
 * "Project: Browse or Switch" — opens the interactive project navigator popup,
 * which lists the cross-project recents and lets the operator pick a new one (or
 * prune/clear the history). A store-only disclosure intent.
 */
export function browseProjectsAction(): ActionDescriptor {
  return {
    id: PROJECT_BROWSE_ACTION_ID,
    label: PROJECT_BROWSE_LABEL,
    section: "navigate",
    icon: FolderGit2,
    run: openProjectNavigator,
  };
}

/**
 * "Project: Clear History" — clears the machine-global cross-project recents.
 * The caller supplies the `clear` closure (the stores `useClearRecents` write
 * seam), so the verb stays a pure descriptor.
 */
export function clearHistoryAction(clear: () => void): ActionDescriptor {
  return {
    id: PROJECT_CLEAR_HISTORY_ACTION_ID,
    label: { key: "projects:actions.clearHistory" },
    section: "transform",
    icon: Trash2,
    run: clear,
  };
}

/** Register the keymap-bound Project verbs (Open, Browse). Mounted once near the
 *  shell top, mirroring `useLeftRailKeybindings`. */
export function useProjectKeybindings(): void {
  useEffect(() => {
    const disposeBindings = registerKeybindings(deriveProjectKeybindings());
    const disposeOpen = registerKeyAction(PROJECT_OPEN_ACTION_ID, () =>
      openProjectAction(),
    );
    const disposeBrowse = registerKeyAction(PROJECT_BROWSE_ACTION_ID, () =>
      browseProjectsAction(),
    );
    return () => {
      disposeBrowse();
      disposeOpen();
      disposeBindings();
    };
  }, []);
}
