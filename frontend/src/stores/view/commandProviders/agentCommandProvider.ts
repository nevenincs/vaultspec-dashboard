// Contributes agent
// verbs to the ONE Cmd+K command plane, each composing the SHARED `agentActions`
// builder (actions-keymap-palette) so the palette, the keymap chord, the footer
// chip, and the in-panel controls all surface one verb from one definition.
// Grouped under the `app` family, like the shared Settings / control-panel
// commands. Stop is offered ONLY when a run is actually stoppable (eligibility
// gate); toggle-panel and New session are
// always available. Sessions never enter the plane as standing commands.

import {
  agentNewSessionAction,
  agentStopRunAction,
  agentTogglePanelAction,
  hasStoppableAgentRun,
} from "../agentActions";
import { registerCommandProvider } from "../commandRegistry";

export function agentCommandProvider(): readonly unknown[] {
  const commands: unknown[] = [
    { ...agentTogglePanelAction(), family: "app" as const },
    { ...agentNewSessionAction(), family: "app" as const },
  ];
  if (hasStoppableAgentRun()) {
    commands.push({ ...agentStopRunAction(), family: "app" as const });
  }
  return commands;
}

registerCommandProvider("agent", agentCommandProvider);
