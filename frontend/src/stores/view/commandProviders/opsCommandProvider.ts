// Ops command provider (command-palette-providers ADR W01.P02; the backend verb feed
// extended with the reload/refresh family in the actions wave). Contributes the
// whitelisted core/rag operational verbs and the open-settings app command, each
// dispatched through the appDispatcher seam (palette-ops-dispatch-through-the-seam)
// via the injected `runOp` intent. It replaces the hard-coded ops branch in the old
// `buildCommands`; the OPS_WHITELIST stays the bounded source of WHICH verbs exist,
// the provider is HOW they enter the palette.

import { OPS_WHITELIST } from "../../server/opsActions";
import { registerCommandProvider, type CommandContext } from "../commandRegistry";
import { openSettingsDialog } from "../settingsDialog";

export function opsCommandProvider(ctx: CommandContext): readonly unknown[] {
  // Map the ops TARGET (dispatch routing) explicitly to a display FAMILY rather than
  // relying on the two strings happening to coincide, so a future non-family target
  // is grouped deliberately instead of silently dropped by family normalization.
  const familyForTarget = (target: "core" | "rag") =>
    target === "rag" ? "rag" : "core";
  const commands: unknown[] = OPS_WHITELIST.map(({ target, verb, label }) => ({
    id: `ops:${target}:${verb}`,
    label: `ops: ${label}`,
    family: familyForTarget(target),
    confirm: true,
    disabledInTimeTravel: true,
    run: () => ctx.intents.runOp(target, verb),
  }));
  commands.push({
    id: "app:settings",
    label: "open settings",
    family: "app",
    run: () => openSettingsDialog(),
  });
  return commands;
}

registerCommandProvider("ops", opsCommandProvider);
