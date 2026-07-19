// Rail-footer command provider (activity-rail-realignment ADR D4, review-surface-flow
// ADR F1). Contributes one palette command per footer surface — the three modal
// control panels (Search service, Backend health, Vault health) plus the Review
// inbox (`panel:approvals`, which now opens the Agent panel's pending-changes view,
// not a modal) — each composing the SHARED `chromeActions` builders
// (unified-action-plane), so the palette, the rail-footer chip, and the keymap all
// surface one verb from one definition. Grouped under the `app` family, like the
// shared Settings command.

import { controlPanelActions, reviewInboxAction } from "../chromeActions";
import { registerCommandProvider, type CommandContext } from "../commandRegistry";

export function controlPanelsCommandProvider(
  ctx: Pick<CommandContext, "openControlPanel">,
): readonly unknown[] {
  return [...controlPanelActions(ctx.openControlPanel), reviewInboxAction()].map(
    (action) => ({
      ...action,
      family: "app" as const,
    }),
  );
}

registerCommandProvider("control-panels", controlPanelsCommandProvider);
