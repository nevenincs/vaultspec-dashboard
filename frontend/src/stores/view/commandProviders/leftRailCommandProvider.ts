// Left-rail command provider (command-palette-providers ADR W01.P02). Wraps the
// tested pure `buildLeftRailCommands` core (new-document, browse-mode, toggle-facets,
// collapse-tree, reset-filters, all reusing the shared ActionDescriptor builders),
// reading its two scope-bound effects from the CommandContext, and self-registers.

import { buildLeftRailCommands } from "../commandPaletteCommands";
import { registerCommandProvider, type CommandContext } from "../commandRegistry";

export function leftRailCommandProvider(ctx: CommandContext): readonly unknown[] {
  return buildLeftRailCommands({
    collapseTree: ctx.intents.collapseTree,
    resetFilters: ctx.intents.resetFilters,
  });
}

registerCommandProvider("left-rail", leftRailCommandProvider);
