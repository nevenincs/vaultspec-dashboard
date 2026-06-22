// Right-rail command provider (action-surface-mapping W03.P21). Resolves the
// asymmetry where the right rail had no dedicated command provider (its tab switches
// ride the window provider): it gives the right rail its own provider and surfaces the
// global right-rail focus-search verb in the palette under its SHARED keymap id (so its
// accelerator derives), mirroring the left-rail focus-filter enrollment. The focus
// effect (switch to the search tab, then focus) is injected via the CommandContext so
// the provider stays pure.

import { rightRailFocusSearchAction } from "../rightRailKeybindings";
import { registerCommandProvider, type CommandContext } from "../commandRegistry";

export function rightRailCommandProvider(ctx: CommandContext): readonly unknown[] {
  return [
    {
      ...rightRailFocusSearchAction(ctx.intents.focusRightRailSearch),
      family: "focus",
    },
  ];
}

registerCommandProvider("right-rail", rightRailCommandProvider);
