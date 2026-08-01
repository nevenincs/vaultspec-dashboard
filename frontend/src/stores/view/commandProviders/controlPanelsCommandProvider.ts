// Rail-footer command provider. Contributes one palette command per footer surface —
// the three modal control panels (Search service, Backend health, Vault health) plus
// the pending-changes inbox (`agent:pending-changes`, which opens the Agent panel's
// pending-changes view, not a modal) — each composing the SHARED `chromeActions`
// builders, so the palette, the rail-footer chip, and the keymap all surface one
// verb from one definition. Grouped under the `app` family, like the shared Settings
// command.

import { agentPendingChangesAction, controlPanelActions } from "../chromeActions";
import { registerCommandProvider, type CommandContext } from "../commandRegistry";

export function controlPanelsCommandProvider(
  ctx: Pick<CommandContext, "openControlPanel">,
): readonly unknown[] {
  return [
    ...controlPanelActions(ctx.openControlPanel),
    agentPendingChangesAction(),
  ].map((action) => ({
    ...action,
    family: "app" as const,
  }));
}

registerCommandProvider("control-panels", controlPanelsCommandProvider);
