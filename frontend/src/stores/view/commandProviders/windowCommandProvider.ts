// Window/shell command provider (command-palette-providers ADR W01.P02). Wraps the
// tested pure `buildWindowCommands` core, reading the shell-frame snapshot and the
// window intents from the injected CommandContext, and self-registers into the
// command-provider registry. The builder core is unchanged; this is the enrollment
// seam that replaces the hand-call in the assembly hook.

import { buildWindowCommands } from "../commandPaletteCommands";
import { registerCommandProvider, type CommandContext } from "../commandRegistry";

export function windowCommandProvider(ctx: CommandContext): readonly unknown[] {
  return buildWindowCommands({
    leftRailVisible: ctx.shell.leftRailVisible,
    leftCollapsed: ctx.shell.leftCollapsed,
    rightCollapsed: ctx.shell.rightCollapsed,
    timelineVisible: ctx.shell.timelineVisible,
    graphVisible: ctx.shell.graphVisible,
    toggleLeftRail: ctx.intents.toggleLeftRail,
    toggleLeftCollapsed: ctx.intents.toggleLeftCollapsed,
    toggleRightRail: ctx.intents.toggleRightRail,
    toggleTimeline: ctx.intents.toggleTimeline,
    toggleGraph: ctx.intents.toggleGraph,
    setRightTab: ctx.intents.setRightTab,
    resetLayout: ctx.intents.resetLayout,
    showKeyboardShortcuts: ctx.intents.showKeyboardShortcuts,
  });
}

registerCommandProvider("window", windowCommandProvider);
