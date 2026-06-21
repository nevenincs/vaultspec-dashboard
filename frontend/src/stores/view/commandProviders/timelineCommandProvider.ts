// Timeline command provider (command-palette-providers ADR W01.P02). Wraps the
// tested pure `buildTimelineCommands` core (jump-to-now, fit-to-corpus, range
// presets), reading its effects from the CommandContext, and self-registers.

import { buildTimelineCommands } from "../commandPaletteCommands";
import { registerCommandProvider, type CommandContext } from "../commandRegistry";

export function timelineCommandProvider(ctx: CommandContext): readonly unknown[] {
  return buildTimelineCommands({
    jumpToLive: ctx.intents.jumpToLive,
    fitToCorpus: ctx.intents.fitTimelineToCorpus,
    setRangeDays: ctx.intents.setTimelineRangeDays,
  });
}

registerCommandProvider("timeline", timelineCommandProvider);
