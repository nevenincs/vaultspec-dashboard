// Document-scoped command provider (authoring-surface ADR D3). Wraps the pure
// `buildDocumentCommands` core (copy-link), reading the active document's stem from
// the CommandContext, and self-registers. The command enrolls ONLY when a document is
// open, so it is never a dead palette entry with no target.

import { buildDocumentCommands } from "../commandPaletteCommands";
import { registerCommandProvider, type CommandContext } from "../commandRegistry";

export function documentCommandProvider(ctx: CommandContext): readonly unknown[] {
  return buildDocumentCommands({ stem: ctx.activeDocumentStem ?? null });
}

registerCommandProvider("document", documentCommandProvider);
