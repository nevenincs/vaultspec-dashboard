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

import { useBrowserMode, useBrowserModeIntent } from "../../stores/view/browserMode";
import { useActiveScope } from "../../stores/server/queries";
import { useDashboardTextFilterDraft } from "../../stores/view/dashboardTextFilter";
import { BrowserModeToggle } from "./BrowserModeToggle";
import { CodeTree } from "./CodeTree";
import { VaultBrowser } from "./VaultBrowser";

export function BrowserRegion() {
  const scope = useActiveScope();
  const mode = useBrowserMode();
  const setMode = useBrowserModeIntent();
  // The Files tree narrows by the SAME canonical feature/text filter the field
  // authors; the Vault tree reads the full facet set straight from the store.
  const textFilter = useDashboardTextFilterDraft(scope);

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-fg-3"
      aria-label="file browser"
      data-browser-region
    >
      <BrowserModeToggle mode={mode} onModeChange={setMode} />

      {/* The active tab's tree. The listing scrolls; the tabs above stay pinned. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "code" ? <CodeTree filter={textFilter.value} /> : <VaultBrowser />}
      </div>
    </section>
  );
}
