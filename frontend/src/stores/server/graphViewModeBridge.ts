// The graph view-mode bridge (codebase-graphing ADR D7). "View mode" is one
// concept the user drives from the left-rail vault|code toggle — AND from the
// keyboard cycle and the command palette, which all write the view-local
// `browserMode` store. A view-mode change must (1) flip the rail tree (that is
// browserMode itself), (2) re-query the graph against the other corpus and WIPE
// the canvas, and (3) persist as a durable user setting.
//
// This one hook, mounted once at the shell top, bridges the view-local
// browserMode to the graph in BOTH directions, convergently (no write-back
// loop, because each direction only fires when the two disagree and moves them
// toward agreement):
//
//   browserMode -> corpus   (a user switch, however triggered):
//     - `clearWorkingSet()` drops ego-expansion node ids so no stale vault node
//       leaks into the code display slice (the frontend half of the
//       disconnection invariant);
//     - `setCorpus(mode)` writes `dashboardState.corpus`, the graph-query
//       identity — the cache key changes, TanStack refetches the other corpus,
//       and the Stage stamps the freshly-fetched slice's set-data with the
//       seam's explicit `reset` cold contract (full prewarm + one-time fit):
//       the canvas wiped clean and reloaded by intent, not by the id-overlap
//       heuristic happening to see disjoint corpus id namespaces;
//     - `putSettings(graph_corpus)` is the durable, user-settings-backed
//       persistence (scope-eligible: a worktree remembers its last view mode).
//
//   corpus -> browserMode   (a fresh scope seeds `dashboardState.corpus` from
//     the durable setting via the settings-effects bridge): the rail adopts the
//     persisted view mode on load. Read through a ref so it fires only on a
//     corpus change and never reverts an in-flight user switch.

import { useEffect, useRef } from "react";

import { setBrowserMode, useBrowserMode, type BrowserMode } from "../view/browserMode";
import { clearWorkingSet } from "../view/workingSet";
import { CONSUMED_SETTING_KEYS, normalizeSettingsScope } from "./settingsSelectors";
import { useDashboardStateMutations } from "./dashboardState";
import { useDashboardState, usePutSettings } from "./queries";

export function useGraphViewModeBridge(scope: unknown): void {
  const mode = useBrowserMode();
  const corpus = useDashboardState(scope).data?.corpus;
  const { setCorpus } = useDashboardStateMutations(scope);
  const putSettings = usePutSettings();
  const activeScope = normalizeSettingsScope(scope);

  // Refs so each effect reads the freshest counterpart without listing it as a
  // dependency (depending on both would let the two directions fight).
  const corpusRef = useRef(corpus);
  corpusRef.current = corpus;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const seenModeRef = useRef<BrowserMode | null>(null);

  // browserMode -> corpus: propagate a user view-mode change to the graph.
  useEffect(() => {
    // Skip the very first observation (mount) — that is the initial mode, not a
    // user switch; propagating it would clear the working set on every load.
    if (seenModeRef.current === null) {
      seenModeRef.current = mode;
      return;
    }
    if (seenModeRef.current === mode) return;
    seenModeRef.current = mode;
    // Already aligned (the corpus->rail seed just set this mode): nothing to do.
    if (mode === corpusRef.current) return;
    clearWorkingSet();
    void setCorpus(mode);
    if (activeScope !== null) {
      putSettings.mutate({
        key: CONSUMED_SETTING_KEYS.graphCorpus,
        value: mode,
        scope: activeScope,
      });
    }
  }, [mode, setCorpus, putSettings, activeScope]);

  // corpus -> browserMode: adopt an externally-seeded corpus on the rail.
  useEffect(() => {
    if (corpus && corpus !== modeRef.current) setBrowserMode(corpus);
  }, [corpus]);
}
