// Timeline command provider (command-palette-providers ADR W01.P02). Wraps the
// tested pure `buildTimelineCommands` core (Issue #14: the date_range presets +
// clear — the timeline is now a fixed date-range selector), reading its effects from
// the CommandContext, and self-registers.

import { buildTimelineCommands } from "../commandPaletteCommands";
import { registerCommandProvider, type CommandContext } from "../commandRegistry";

export function timelineCommandProvider(ctx: CommandContext): readonly unknown[] {
  return buildTimelineCommands({
    setRangeDays: ctx.intents.setTimelineRangeDays,
    clearDateRange: ctx.intents.clearDateRange,
  });
}

registerCommandProvider("timeline", timelineCommandProvider);
