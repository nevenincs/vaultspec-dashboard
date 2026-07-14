// Control-panels command provider (activity-rail-realignment ADR D4). Contributes
// one palette command per framework control panel — Search service, Approvals,
// Backend health, Vault health — each composing the SHARED `controlPanelActions`
// builders (unified-action-plane), so the palette, the rail-footer chip, and the
// keymap all surface a panel toggle from one definition. Grouped under the `app`
// family, like the shared Settings command.

import { controlPanelActions } from "../chromeActions";
import { registerCommandProvider, type CommandContext } from "../commandRegistry";

export function controlPanelsCommandProvider(
  ctx: Pick<CommandContext, "openControlPanel">,
): readonly unknown[] {
  return controlPanelActions(ctx.openControlPanel).map((action) => ({
    ...action,
    family: "app" as const,
  }));
}

registerCommandProvider("control-panels", controlPanelsCommandProvider);
