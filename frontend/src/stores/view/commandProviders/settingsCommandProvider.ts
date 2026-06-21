// Settings command provider (command-palette-providers ADR W01.P02; extended with
// schema-driven quick-toggles in the actions wave). Wraps the tested pure
// `buildSettingsCommands` core (the theme presets), reading the theme intent from the
// CommandContext, and self-registers.

import { buildSettingsCommands } from "../commandPaletteCommands";
import { registerCommandProvider, type CommandContext } from "../commandRegistry";

export function settingsCommandProvider(ctx: CommandContext): readonly unknown[] {
  return buildSettingsCommands(ctx.intents.setTheme);
}

registerCommandProvider("settings", settingsCommandProvider);
