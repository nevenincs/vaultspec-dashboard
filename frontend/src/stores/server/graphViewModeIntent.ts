// The graph view-mode write seam (codebase-graphing ADR D7). "View mode" is one
// concept the user drives from the left-rail vault|code toggle; a switch must
// (1) flip the rail tree (the view-local `browserMode`, which also feeds the
// keyboard cycle and the command palette), (2) re-query the graph against the
// other corpus and WIPE the canvas, and (3) persist as a durable user setting.
//
// This intent composes those into one gesture:
//   - `setBrowserMode(mode)` — the rail tree switches instantly (view-local).
//   - `setCorpus(mode)` — writes `dashboardState.corpus`, the graph-query
//     identity; the cache key changes, TanStack refetches the other corpus, and
//     because the two corpora share NO node id the scene takes its cold path
//     (a full re-explode + refit) — the canvas wiped clean and reloaded.
//   - `clearWorkingSet()` — drops the ego-expansion node ids so no stale vault
//     node leaks into the code display slice (the frontend half of the
//     disconnection invariant).
//   - `putSettings(graph_corpus)` — the durable, user-settings-backed persistence
//     (scope-eligible: a worktree remembers its last view mode); a fresh scope
//     seeds `dashboardState.corpus` back from it via the settings-effects bridge.
//
// The write is idempotent-guarded by the caller (it only fires on an actual mode
// change), so re-selecting the active mode is inert.

import { useCallback } from "react";

import { setBrowserMode, type BrowserMode } from "../view/browserMode";
import { clearWorkingSet } from "../view/workingSet";
import { CONSUMED_SETTING_KEYS, normalizeSettingsScope } from "./settingsSelectors";
import { useDashboardStateMutations } from "./dashboardState";
import { usePutSettings } from "./queries";

export function useGraphViewModeIntent(scope: unknown): (mode: BrowserMode) => void {
  const { setCorpus } = useDashboardStateMutations(scope);
  const putSettings = usePutSettings();
  const activeScope = normalizeSettingsScope(scope);
  return useCallback(
    (mode: BrowserMode) => {
      // The rail tree switches immediately (view-local).
      setBrowserMode(mode);
      // Wipe the canvas working set BEFORE the new corpus lands so the merged
      // display slice never unions a stale vault ego node into the code view.
      clearWorkingSet();
      // The live graph-query driver: a corpus change re-keys the slice query.
      void setCorpus(mode);
      // Durable, user-settings-backed persistence (scope-eligible).
      if (activeScope !== null) {
        putSettings.mutate({
          key: CONSUMED_SETTING_KEYS.graphCorpus,
          value: mode,
          scope: activeScope,
        });
      }
    },
    [setCorpus, putSettings, activeScope],
  );
}
