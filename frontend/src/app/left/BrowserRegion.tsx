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

import { ArrowUpDown, Plus } from "lucide-react";

import { resolveActionPresentation } from "../../platform/actions/action";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { useBrowserMode, useBrowserModeIntent } from "../../stores/view/browserMode";
import { useActiveScope, useVaultFilesNarrowText } from "../../stores/server/queries";
import { openContextMenu } from "../../stores/view/contextMenu";
import { newDocumentAction } from "../../stores/view/leftRailKeybindings";
import { railSortPresentation, useRailSort } from "../../stores/view/railSort";
import { useViewportClass } from "../../stores/view/viewportClass";
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
  const resolveMessage = useLocalizedMessageResolver();
  const sort = useRailSort();
  const activePresentation = railSortPresentation(sort.key);
  const activeLabel =
    activePresentation === null
      ? null
      : resolveMessage(activePresentation.triggerLabel);
  if (activeLabel === null || activeLabel.usedFallback) return null;
  return (
    <IconButton
      label={activeLabel.message}
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
  const resolveMessage = useLocalizedMessageResolver();
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
  // In the compact unified rail (mobile-unified-rail ADR) the whole Home pane is ONE
  // scroll, so the tree flows at natural height and opens no scroll region of its own
  // (a nested scroll would trap the tree below the Status section). On desktop the
  // tree keeps its bounded internal scroll under the pinned mode tabs.
  const compact = useViewportClass() === "compact";

  return (
    <section
      className={
        compact ? "flex flex-col gap-fg-3" : "flex min-h-0 flex-1 flex-col gap-fg-3"
      }
      aria-label={resolveMessage({ key: "common:shell.regions.fileBrowser" }).message}
      data-browser-region
    >
      <div className="flex items-center gap-fg-2">
        <div className="min-w-0 flex-1">
          <BrowserModeToggle mode={mode} onModeChange={setMode} />
        </div>
        {mode === "vault" && (
          <>
            {/* Always-visible create discovery (authoring-surface ADR D5): dispatches
                the ONE shared new-document action descriptor, never a bespoke handler.
                Vault mode only — the Files tree lists source, not authored docs. */}
            <IconButton
              label={
                resolveActionPresentation(newDocumentAction().label, resolveMessage)
                  .message
              }
              data-new-document
              onClick={() => newDocumentAction().run?.()}
            >
              <Plus size={16} aria-hidden />
            </IconButton>
            <VaultTreeOptionsButton scope={scope} />
          </>
        )}
      </div>

      {/* The active tab's tree. On desktop the listing scrolls under the pinned tabs;
          on compact it flows into the one Home-pane scroll. */}
      <div className={compact ? undefined : "min-h-0 flex-1 overflow-y-auto"}>
        {mode === "code" ? <CodeTree filter={filesNarrowText} /> : <VaultBrowser />}
      </div>
    </section>
  );
}
