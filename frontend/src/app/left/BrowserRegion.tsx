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

import { ArrowUpDown } from "lucide-react";

import { useBrowserMode, useBrowserModeIntent } from "../../stores/view/browserMode";
import { useActiveScope, useVaultFilesNarrowText } from "../../stores/server/queries";
import { openContextMenu } from "../../stores/view/contextMenu";
import { RAIL_SORT_OPTIONS, useRailSort } from "../../stores/view/railSort";
import { IconButton } from "../kit";
import { BrowserModeToggle } from "./BrowserModeToggle";
import { CodeTree } from "./CodeTree";
import { VaultBrowser } from "./VaultBrowser";

/** The vault tree's list-options button (left-rail-tree-controls ADR D3): opens
 *  the SAME vault-section menu the section headers open — sort options, reset
 *  sorting, expand/collapse, filter resets — so the verbs are authored once and
 *  this button is pure chrome. Vault mode only: the Files tree keeps its fixed
 *  directories-first order and offers no sort control. */
function VaultTreeOptionsButton({ scope }: { scope: string | null }) {
  const sort = useRailSort();
  const activeLabel =
    RAIL_SORT_OPTIONS.find((option) => option.id === sort.key)?.label ??
    "Latest Activity";
  return (
    <IconButton
      label={`Tree options (sorted by ${activeLabel.toLowerCase()})`}
      aria-haspopup="menu"
      data-rail-sort-trigger
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        openContextMenu(
          {
            kind: "vault-section",
            id: "vault-section:documents",
            section: "documents",
            scope,
          },
          { x: rect.left, y: rect.bottom },
        );
      }}
    >
      <ArrowUpDown size={16} aria-hidden />
    </IconButton>
  );
}

export function BrowserRegion() {
  const scope = useActiveScope();
  const mode = useBrowserMode();
  // The rail vault|code toggle writes the view-local browser mode, which is the
  // GRAPH VIEW MODE (codebase-graphing ADR D7): the shell-mounted
  // `useGraphViewModeBridge` mirrors a browserMode change onto the graph corpus
  // (re-query + canvas wipe) and the durable setting, so the toggle, the keyboard
  // cycle, and the command palette all drive the same graph switch through one
  // seam. This region just flips the mode.
  const setMode = useBrowserModeIntent();
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
      <div className="flex items-center gap-fg-2">
        <div className="min-w-0 flex-1">
          <BrowserModeToggle mode={mode} onModeChange={setMode} />
        </div>
        {mode === "vault" && <VaultTreeOptionsButton scope={scope} />}
      </div>

      {/* The active tab's tree. The listing scrolls; the tabs above stay pinned. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "code" ? <CodeTree filter={filesNarrowText} /> : <VaultBrowser />}
      </div>
    </section>
  );
}
