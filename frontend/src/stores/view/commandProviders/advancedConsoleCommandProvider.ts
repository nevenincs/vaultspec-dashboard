// Advanced-console command provider (advanced-service-console ADR D7).
// Contributes the TWO surviving chrome commands from the retired rail-footer
// cluster: "Open advanced settings" (Settings ▸ Advanced, the one home for every
// operational console) and the pending-changes inbox, which opens the Agent
// panel's pending view and is NOT a dev surface (ADR D3). Both compose the
// SHARED `chromeActions` builders, so the palette and any other plane surface
// one verb from one definition. Grouped under the `app` family, like the shared
// Settings command.
//
// The four retired per-panel toggles are deliberately NOT re-emitted as aliases
// pointing at the same destination (no-deprecation-bridges): one destination,
// one command.

import {
  agentPendingChangesAction,
  openAdvancedSettingsAction,
} from "../chromeActions";
import { registerCommandProvider } from "../commandRegistry";

export function advancedConsoleCommandProvider(): readonly unknown[] {
  return [openAdvancedSettingsAction(), agentPendingChangesAction()].map((action) => ({
    ...action,
    family: "app" as const,
  }));
}

registerCommandProvider("advanced-console", advancedConsoleCommandProvider);
