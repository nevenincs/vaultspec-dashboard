// Reload/refresh command provider (command-palette-actions ADR W03.P09). The
// campaign's "reload commands" the brief called out as missing: a client-side refresh
// that re-fetches the engine data on demand. It complements the backend ops verbs
// (reindex / rag service control) the ops provider already contributes — those mutate
// the backend; this just invalidates the query cache so the next read is fresh. A
// non-mutating refresh, so it carries no confirm guard and is not time-travel gated.

import { registerCommandProvider, type CommandContext } from "../commandRegistry";
import { refreshDataAction } from "../reloadKeybindings";

export function reloadCommandProvider(_ctx: CommandContext): readonly unknown[] {
  // Compose the SHARED Refresh builder (unified-action-plane): the palette, the
  // Mod+Shift+R chord, and the context-menu global tail all run the same descriptor, so
  // the verb cannot drift. The palette groups by `family`, not the descriptor's section.
  return [{ ...refreshDataAction(), family: "reload" }];
}

registerCommandProvider("reload", reloadCommandProvider);
