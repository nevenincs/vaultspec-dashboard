// The browser region (binding `LeftRail` 238:600 tabs + tree): the Vault | Files
// switcher and the active tab's tree. VAULT renders the `/vault-tree` projection as
// the Features + Documents sections; FILES renders the `/file-tree` directory tree.
//
// Composition only (dashboard-layer-ownership): this fetches nothing, mints no node
// identity, and reads no `tiers` block — the VaultBrowser and CodeTree it mounts own
// that through their stores hooks. The canonical filter is authored by the rail's
// RailFilterField (the header search-or-filter field); the Vault tree reads those
// facets from `dashboardState.filters`, and the Files tree narrows by the same
// canonical text. This region hosts no filter control of its own.

import { useEffect, useRef } from "react";

import {
  isBrowserMode,
  setBrowserMode,
  useBrowserMode,
} from "../../stores/view/browserMode";
import {
  useActiveScope,
  useDashboardState,
  useVaultFilesNarrowText,
} from "../../stores/server/queries";
import { useGraphViewModeIntent } from "../../stores/server/graphViewModeIntent";
import { BrowserModeToggle } from "./BrowserModeToggle";
import { CodeTree } from "./CodeTree";
import { VaultBrowser } from "./VaultBrowser";

export function BrowserRegion() {
  const scope = useActiveScope();
  const mode = useBrowserMode();
  // The rail vault|code toggle is the GRAPH VIEW MODE switch (codebase-graphing
  // ADR D7): it drives the rail tree AND the graph corpus, wiping + reloading the
  // canvas and persisting the durable setting. Re-selecting the active mode is
  // inert (the intent only writes on an actual change).
  const applyViewMode = useGraphViewModeIntent(scope);
  const onModeChange = (next: string) => {
    if (isBrowserMode(next) && next !== mode) applyViewMode(next);
  };
  // Align the rail tree to a corpus that changed EXTERNALLY — a fresh scope
  // seeds `dashboardState.corpus` from the durable `graph_corpus` setting
  // (settings-effects), so the rail must adopt the persisted view mode on load.
  // One-way (corpus -> rail); the toggle owns the rail -> corpus direction, so
  // there is no write-back loop. `mode` is read through a ref so this genuinely
  // fires only on a corpus change — depending on `mode` would revert an
  // in-flight user switch before the corpus write lands.
  const corpus = useDashboardState(scope).data?.corpus;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    if (corpus && corpus !== modeRef.current) setBrowserMode(corpus);
  }, [corpus]);
  // The Files tree narrows by the SAME canonical feature filter the search bar
  // authors, reduced to a plain path substring; the Vault tree reads the full facet
  // set (including the feature query proper) straight from the store.
  const filesNarrowText = useVaultFilesNarrowText(scope);

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-fg-3"
      aria-label="file browser"
      data-browser-region
    >
      <BrowserModeToggle mode={mode} onModeChange={onModeChange} />

      {/* The active tab's tree. The listing scrolls; the tabs above stay pinned. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "code" ? <CodeTree filter={filesNarrowText} /> : <VaultBrowser />}
      </div>
    </section>
  );
}
