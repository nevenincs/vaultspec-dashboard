// Editor command provider. Wraps the tested pure `buildEditorCommands` core
// (close-document, toggle-diff), reading close intents from the CommandContext and
// importing the store-only diff toggle directly (module-level import; no context
// injection needed — toggleEditorDiff is a stable store dispatch, not a scope-bound
// hook). Save / edit-mode / rename are enrolled at the editor surface, not here.

import { toggleEditorDiff } from "../editor";
import { buildEditorCommands } from "../commandPaletteCommands";
import {
  EDITOR_NEXT_CHANGE_ACTION_ID,
  EDITOR_PREVIOUS_CHANGE_ACTION_ID,
} from "../editorKeybindings";
import { fireKeyAction, resolveKeyAction } from "../keymapDispatcher";
import { registerCommandProvider, type CommandContext } from "../commandRegistry";

/** Fire a view-registered editor action by its shared id, so the palette entry and
 *  the keymap chord are the one verb. A no-op when nothing is registered (no editor
 *  mounted) or the action is disabled (no change to jump to) — the palette lists the
 *  capability without lying about its current state. */
function fireEditorAction(id: string): void {
  const action = resolveKeyAction(id);
  if (action && !action.disabled) fireKeyAction(action);
}

export function editorCommandProvider(ctx: CommandContext): readonly unknown[] {
  return buildEditorCommands({
    closeDoc: ctx.intents.closeDocument,
    closeAllDocs: ctx.intents.closeAllDocuments,
    reloadDoc: ctx.intents.reloadActiveDocument,
    keepOpen: ctx.intents.keepActiveDocumentOpen,
    toggleDiff: toggleEditorDiff,
    nextChange: () => fireEditorAction(EDITOR_NEXT_CHANGE_ACTION_ID),
    previousChange: () => fireEditorAction(EDITOR_PREVIOUS_CHANGE_ACTION_ID),
  });
}

registerCommandProvider("editor", editorCommandProvider);
