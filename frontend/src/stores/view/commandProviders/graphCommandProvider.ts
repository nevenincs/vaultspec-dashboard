// Graph command provider (command-palette-providers ADR W01.P02). Wraps the tested
// pure `buildGraphCommands` core (camera verbs, freeze toggle, reset-defaults),
// reading the frozen flag and the set-frozen intent from the CommandContext and the
// reset-defaults effect from the module-level graph-commands seam, and self-registers.

import { buildGraphCommands } from "../commandPaletteCommands";
import { registerCommandProvider, type CommandContext } from "../commandRegistry";
import { resetGraphControlsToDefaults } from "../graphCommands";

export function graphCommandProvider(ctx: CommandContext): readonly unknown[] {
  return buildGraphCommands({
    frozen: ctx.graphFrozen,
    setFrozen: ctx.intents.setGraphFrozen,
    resetDefaults: resetGraphControlsToDefaults,
  });
}

registerCommandProvider("graph", graphCommandProvider);
