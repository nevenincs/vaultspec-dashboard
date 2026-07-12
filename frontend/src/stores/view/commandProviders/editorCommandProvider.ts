// Editor command provider (command-palette-providers ADR W01.P02). Wraps the tested
// pure `buildEditorCommands` core (close-document, toggle-diff), reading close intents
// from the CommandContext and importing the store-only diff toggle directly
// (module-level import; no context injection needed — toggleEditorDiff is a stable
// store dispatch, not a scope-bound hook). Save / edit-mode / rename are enrolled at
// the editor surface in the actions wave, not here.

import { toggleEditorDiff } from "../editor";
import { buildEditorCommands } from "../commandPaletteCommands";
import { registerCommandProvider, type CommandContext } from "../commandRegistry";

export function editorCommandProvider(ctx: CommandContext): readonly unknown[] {
  return buildEditorCommands({
    closeDoc: ctx.intents.closeDocument,
    closeAllDocs: ctx.intents.closeAllDocuments,
    reloadDoc: ctx.intents.reloadActiveDocument,
    keepOpen: ctx.intents.keepActiveDocumentOpen,
    toggleDiff: toggleEditorDiff,
  });
}

registerCommandProvider("editor", editorCommandProvider);
