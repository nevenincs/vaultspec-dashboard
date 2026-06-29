// Editor command provider (command-palette-providers ADR W01.P02). Wraps the tested
// pure `buildEditorCommands` core (close-document), reading the close intent from the
// CommandContext, and self-registers. Save / edit-mode / rename are enrolled at the
// editor surface in the actions wave, not here.

import { buildEditorCommands } from "../commandPaletteCommands";
import { registerCommandProvider, type CommandContext } from "../commandRegistry";

export function editorCommandProvider(ctx: CommandContext): readonly unknown[] {
  return buildEditorCommands({
    closeDoc: ctx.intents.closeDocument,
    closeAllDocs: ctx.intents.closeAllDocuments,
    reloadDoc: ctx.intents.reloadActiveDocument,
    keepOpen: ctx.intents.keepActiveDocumentOpen,
  });
}

registerCommandProvider("editor", editorCommandProvider);
