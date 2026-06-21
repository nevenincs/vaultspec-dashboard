// Reload/refresh command provider (command-palette-actions ADR W03.P09). The
// campaign's "reload commands" the brief called out as missing: a client-side refresh
// that re-fetches the engine data on demand. It complements the backend ops verbs
// (reindex / rag service control) the ops provider already contributes — those mutate
// the backend; this just invalidates the query cache so the next read is fresh. A
// non-mutating refresh, so it carries no confirm guard and is not time-travel gated.

import { refreshAllEngineQueries } from "../../server/queries";
import { registerCommandProvider, type CommandContext } from "../commandRegistry";

export function reloadCommandProvider(_ctx: CommandContext): readonly unknown[] {
  return [
    {
      id: "reload:refresh-data",
      label: "reload: refresh all data",
      family: "reload",
      run: () => refreshAllEngineQueries(),
    },
  ];
}

registerCommandProvider("reload", reloadCommandProvider);
