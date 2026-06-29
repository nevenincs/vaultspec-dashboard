// Project command provider (command-palette-providers ADR): the single provider
// parent for the global project-management plane. Wraps the tested pure
// `buildProjectCommands` core (Project: Open / Browse or Switch / Clear History,
// all reusing the shared `projectActions` builders), reading its one scope-free
// effect (clear history) from the CommandContext, and self-registers.

import { buildProjectCommands } from "../commandPaletteCommands";
import { registerCommandProvider, type CommandContext } from "../commandRegistry";

export function projectCommandProvider(ctx: CommandContext): readonly unknown[] {
  return buildProjectCommands({
    clearProjectHistory: ctx.intents.clearProjectHistory,
  });
}

registerCommandProvider("project", projectCommandProvider);
