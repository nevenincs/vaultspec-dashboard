// The browser region (dashboard-left-rail ADR "Browser" + "In-rail filter"): the
// single file-thinking region of the rail that hosts the two browser modes —
// VAULT (existing) and CODE (new) — behind a compact keyboard-reachable toggle,
// with an in-rail filter scoped to the active mode above the listing.
//
// Composition only (dashboard-layer-ownership): this region fetches nothing,
// mints no node identity, and reads no `tiers` block — the VaultBrowser and
// CodeTree it mounts each own that through their stores hooks. It reads the
// chosen mode and the filter text from the per-scope browser-mode store
// (`stores/view/browserMode`), and the store's wholesale-reset wiring
// (`viewStore.setScope` / `swapWorkspace`) clears both on a scope/workspace
// swap, so neither bleeds across a swap (the ADR's "view-local state re-keyed
// per scope").
//
// The filter narrows the ALREADY-FETCHED listing client-side — for code mode it
// rides CodeTree's `filter` prop; for vault mode it rides VaultBrowser's `filter`
// prop. It issues no wire request, the deliberate counterpart to the global
// right-rail search pillar.

import { useBrowserModeStore } from "../../stores/view/browserMode";
import { BrowserModeToggle } from "./BrowserModeToggle";
import { CodeTree } from "./CodeTree";
import { RailFilter } from "./RailFilter";
import { VaultBrowser } from "./VaultBrowser";

export function BrowserRegion() {
  const mode = useBrowserModeStore((s) => s.mode);
  const filter = useBrowserModeStore((s) => s.filter);
  const setMode = useBrowserModeStore((s) => s.setMode);
  const setFilter = useBrowserModeStore((s) => s.setFilter);

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-vs-1"
      aria-label="file browser"
      data-browser-region
    >
      {/* Mode toggle + in-rail filter — the region's two view-local affordances,
          above the scrollable listing so they stay reachable as the tree grows. */}
      <BrowserModeToggle mode={mode} onModeChange={setMode} />
      <RailFilter modeLabel={mode} value={filter} onChange={setFilter} />

      {/* The active mode's browser, both narrowed by the same in-rail filter. The
          listing scrolls; the affordances above stay pinned. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "code" ? (
          <CodeTree filter={filter} />
        ) : (
          <VaultBrowser filter={filter} />
        )}
      </div>
    </section>
  );
}
