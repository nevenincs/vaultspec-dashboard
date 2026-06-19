// FeatureTree browser — the Vault mode's feature-based tree representation. It
// is a PURE CLIENT-SIDE PROJECTION of the `/vault-tree` response, re-nested
// feature → doc_type → document (views-are-projections-of-one-model). There is
// NO engine work and NO new model: it reuses the existing `useVaultTree()` stores hook, reads
// degradation ONLY through the stores selector (never the raw `tiers` block), and
// joins selection on the same stable `doc:<stem>` node id the vault browser uses
// (dashboard-layer-ownership). It fetches nothing and mints no identity — chrome
// over the one projection. The root surface state (loading / transport error)
// is classified by the stores selector; degradation renders from the same
// stores-owned availability view.
//
// Shape (binding design):
//   #feature-tag                                  ← level 0, collapsed by default
//     ▸ Research / ADR / Plan / Exec / Audit …    ← level 1, doc-type group
//         …-stem                                  ← level 2, the document rows
//
// Each level is a collapsible disclosure (collapsed chevron points RIGHT,
// expanded DOWN). Document rows carry their actual document-type glyph; the
// selected document row gets the soft accent background + the leading accent bar
// (exactly one selected row, as in the vault browser). The in-rail filter narrows
// the already-fetched listing client-side — never a wire request.

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useRef } from "react";

import { FoldSection, SectionLabel } from "../kit";
import type { VaultDocEntity } from "../../platform/actions/entity";
import type { VaultTreeEntry } from "../../stores/server/engine";
import {
  deriveVaultTreeBrowserView,
  tierAvailabilityReason,
  useActiveScope,
  useVaultTreeSurface,
} from "../../stores/server/queries";
import {
  deriveBrowserTreeRovingKey,
  deriveBrowserTreeExpansionItem,
  deriveVaultBrowserTreeNavOrder,
  useBrowserTreeExpansion,
} from "../../stores/view/browserTreeExpansion";
import { openContextMenu } from "../../stores/view/contextMenu";
import { handleKeyboardContextMenu } from "../chrome/keyboardContextMenu";
import {
  pathStem,
  pathToNodeId,
  useDashboardBrowserSelection,
  useHighlightedPath,
} from "./browserSelection";
// Self-registering left-rail context-menu resolver (W03.P07): importing the
// module runs its `registerResolver("vault-doc", …)` side effect once. The tree
// rows are the SAME vault documents, so they share the vault-doc menu.
import "./menus/vaultDocMenu";
// Shared row presentation — doc-type glyphs, freshness, and sizing for the
// `/vault-tree` projection.
import {
  CHEVRON_PX,
  DOC_MARK_PX,
  docGroupLabel,
  docMark,
  freshnessLabel,
  freshnessToneClass,
} from "./vaultRowPresentation";

/** Display stem — the shared derivation from the selection join. */
export function entryStem(path: string): string {
  return pathStem(path);
}

// --- component -------------------------------------------------------------------

export interface TreeBrowserProps {
  /** Row click handler (defaults to the shared bidirectional selection). */
  onEntryClick?: (entry: VaultTreeEntry) => void;
  /** Row open handler (double-click / Enter → open in the reader). Defaults to
   *  selecting the node and opening its body in the markdown reader. */
  onEntryOpen?: (entry: VaultTreeEntry) => void;
  /** The document path currently highlighted by the shared selection. */
  highlightedPath?: string | null;
  /** In-rail filter — a client-side narrowing of the visible listing by
   *  stem/path/feature-tag, never a wire search. Empty/absent shows all. */
  filter?: string;
  /** Landmark label for the mounted tree surface. Vault mode owns this now. */
  ariaLabel?: "tree browser" | "vault browser";
}

/** Build the vault-doc context-menu entity from a tree row's data (shared with
 *  the vault browser — the rows are the same documents). */
function vaultDocEntity(entry: VaultTreeEntry, scope: string | null): VaultDocEntity {
  const nodeId = pathToNodeId(entry.path);
  return {
    kind: "vault-doc",
    id: nodeId,
    scope,
    path: entry.path,
    stem: pathStem(entry.path),
    nodeId,
  };
}

export function TreeBrowser({
  onEntryClick,
  onEntryOpen,
  highlightedPath,
  filter,
  ariaLabel = "tree browser",
}: TreeBrowserProps) {
  const scope = useActiveScope();
  const { tree, availability, state } = useVaultTreeSurface(scope);
  const dashboardSelection = useDashboardBrowserSelection(scope);
  const sharedHighlight = useHighlightedPath(tree.data?.entries, scope);
  const clickHandler = onEntryClick ?? dashboardSelection.handleEntryClick;
  const openHandler = onEntryOpen ?? dashboardSelection.handleEntryOpen;
  const highlight = highlightedPath ?? sharedHighlight;

  // Expanded state, keyed by stable nav-key: feature groups `f:<feature>` and
  // doc-type sub-groups `d:<feature>/<docType>`. The browser-tree store owns this
  // so a scope/workspace swap clears disclosure state through one reset path.
  const {
    expanded,
    activeKey,
    setActiveKey,
    toggle: toggleExpanded,
  } = useBrowserTreeExpansion(scope, "vault");

  // TRUE roving-tabindex focus model (matching the vault browser): the whole rail
  // is ONE Tab-stop. Exactly one navigable element carries tabIndex 0; ArrowUp/
  // ArrowDown move it through the single linear list of VISIBLE nodes in
  // top-to-bottom DOM order (feature header → its doc-type headers → their rows).
  const navEls = useRef(new Map<string, HTMLButtonElement>());
  const registerNav = useCallback(
    (key: string) => (el: HTMLButtonElement | null) => {
      if (el) navEls.current.set(key, el);
      else navEls.current.delete(key);
    },
    [],
  );
  const navOrder = useRef<string[]>([]);
  const moveActive = useCallback((from: string, delta: number) => {
    const order = navOrder.current;
    const at = order.indexOf(from);
    if (at === -1) return;
    const next = order[Math.min(order.length - 1, Math.max(0, at + delta))];
    if (next === undefined) return;
    setActiveKey(next);
    navEls.current.get(next)?.focus();
  }, []);
  const navKeyDown = useCallback(
    (key: string, opts?: { onArrowRight?: () => void; onArrowLeft?: () => void }) =>
      (e: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          moveActive(key, 1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          moveActive(key, -1);
        } else if (e.key === "ArrowRight" && opts?.onArrowRight) {
          e.preventDefault();
          opts.onArrowRight();
        } else if (e.key === "ArrowLeft" && opts?.onArrowLeft) {
          e.preventDefault();
          opts.onArrowLeft();
        }
      },
    [moveActive],
  );

  if (state === "loading") {
    return (
      <p
        className="animate-pulse-live px-fg-1 py-fg-0-5 text-label text-ink-faint"
        role="status"
        aria-live="polite"
      >
        reading the vault…
      </p>
    );
  }

  if (state === "error") {
    // A genuine tiers-less transport failure — contained, distinguished from
    // degradation (degradation-is-read-from-tiers).
    return (
      <div
        className="space-y-fg-1 px-fg-1 py-fg-0-5"
        role="status"
        aria-live="polite"
        data-tree-error
      >
        <p className="text-label text-state-broken">vault tree unavailable</p>
        <button
          type="button"
          onClick={tree.retry}
          className="rounded-fg-xs text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          try again
        </button>
      </div>
    );
  }

  const browser = deriveVaultTreeBrowserView(tree.data?.entries ?? [], filter ?? "");
  const { groups, filteredToNothing } = browser;
  const now = Date.now();

  const order = deriveVaultBrowserTreeNavOrder(groups, expanded);
  navOrder.current = order;
  const rovingKey = deriveBrowserTreeRovingKey(activeKey, order);
  const degradedReason = tierAvailabilityReason(availability);

  return (
    <nav
      className="text-label"
      aria-label={ariaLabel}
      data-tree-browser={ariaLabel === "tree browser" ? "" : undefined}
      data-vault-browser={ariaLabel === "vault browser" ? "" : undefined}
    >
      {availability.degraded && (
        <p
          className="mb-fg-1 rounded-fg-xs bg-accent-subtle/40 px-fg-1 py-fg-0-5 text-caption text-ink-muted"
          role="status"
          aria-live="polite"
          data-tree-degraded
        >
          some of the corpus is unavailable right now
          {degradedReason ? ` — ${degradedReason}` : ""}. showing what loaded.
        </p>
      )}

      {groups.length === 0 ? (
        filteredToNothing ? (
          <p
            className="px-fg-1 py-fg-0-5 text-label text-ink-faint"
            data-tree-filter-empty
          >
            no vault documents match the filter.
          </p>
        ) : (
          <p className="px-fg-1 py-fg-0-5 text-label text-ink-faint" data-tree-empty>
            no vault documents in this scope yet.
          </p>
        )
      ) : (
        <div>
          {groups.map((group) => {
            const fKey = `f:${group.feature}`;
            const fExpanded = deriveBrowserTreeExpansionItem(fKey, expanded).expanded;
            const fSectionId = `tree-feature-${group.feature}`;
            return (
              // Level 0 — the #feature header, rendered through the ONE canonical
              // fold (FoldSection): a flush twisty + a SEMIBOLD body-ink `#tag`,
              // count quietly right-aligned. Identical fold idiom and structure to
              // the right rail's Status sections (design-system-is-centralized).
              // The rail keeps its roving-tabindex keyboard model by passing the
              // nav ref + tabIndex/onFocus/onKeyDown through `headerRef`/`headerProps`.
              <FoldSection
                key={group.feature}
                open={fExpanded}
                onToggle={() => toggleExpanded(fKey)}
                bodyId={fSectionId}
                twistyPx={CHEVRON_PX}
                headerClassName="flex h-[30px] w-full items-center gap-fg-1 rounded-fg-xs px-fg-1 text-meta font-semibold text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                headerRef={registerNav(fKey)}
                headerProps={{
                  tabIndex: rovingKey === fKey ? 0 : -1,
                  onFocus: () => setActiveKey(fKey),
                  onKeyDown: navKeyDown(fKey, {
                    onArrowRight: () => !fExpanded && toggleExpanded(fKey),
                    onArrowLeft: () => fExpanded && toggleExpanded(fKey),
                  }),
                }}
                label={
                  <span className="min-w-0 truncate" data-tree-feature-tag>
                    #{group.feature}
                  </span>
                }
                trailing={
                  <span className="pl-fg-1 text-caption text-ink-faint" data-tabular>
                    {group.count}
                  </span>
                }
                data-tree-feature
              >
                {fExpanded &&
                  group.docTypes.map((sub) => {
                    const dKey = `d:${group.feature}/${sub.docType}`;
                    const dExpanded = deriveBrowserTreeExpansionItem(
                      dKey,
                      expanded,
                    ).expanded;
                    const dSectionId = `tree-doctype-${group.feature}-${sub.docType}`;
                    const DocTypeMark = docMark(sub.docType);
                    return (
                      // Level 1 — the doc-type group header, indented one step, the
                      // same FoldSection with the doc-type glyph as the leading mark
                      // and the kit SectionLabel eyebrow + count as the label.
                      <FoldSection
                        key={sub.docType}
                        open={dExpanded}
                        onToggle={() => toggleExpanded(dKey)}
                        bodyId={dSectionId}
                        twistyPx={CHEVRON_PX}
                        headerClassName="flex h-[30px] w-full items-center gap-fg-1 rounded-fg-xs pl-fg-3 transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                        headerRef={registerNav(dKey)}
                        headerProps={{
                          tabIndex: rovingKey === dKey ? 0 : -1,
                          onFocus: () => setActiveKey(dKey),
                          onKeyDown: navKeyDown(dKey, {
                            onArrowRight: () => !dExpanded && toggleExpanded(dKey),
                            onArrowLeft: () => dExpanded && toggleExpanded(dKey),
                          }),
                        }}
                        leading={
                          <span className="shrink-0 text-ink-faint" aria-hidden>
                            <DocTypeMark size={DOC_MARK_PX} />
                          </span>
                        }
                        label={
                          <SectionLabel
                            count={sub.entries.length}
                            className="min-w-0 flex-1"
                          >
                            {docGroupLabel(sub.docType)}
                          </SectionLabel>
                        }
                        data-tree-doctype
                      >
                        <ul>
                          {sub.entries.map((entry) => (
                            <TreeRow
                              key={entry.path}
                              entry={entry}
                              docType={sub.docType}
                              highlighted={entry.path === highlight}
                              fresh={freshnessLabel(entry.dates.modified, now)}
                              rovingKey={rovingKey}
                              registerNav={registerNav}
                              setActiveKey={setActiveKey}
                              navKeyDown={navKeyDown}
                              onClick={() => clickHandler(entry)}
                              onOpen={() => openHandler(entry)}
                              entity={vaultDocEntity(entry, scope)}
                            />
                          ))}
                        </ul>
                      </FoldSection>
                    );
                  })}
              </FoldSection>
            );
          })}
        </div>
      )}
    </nav>
  );
}

// --- the document row (level 2) --------------------------------------------------

interface TreeRowProps {
  entry: VaultTreeEntry;
  docType: string;
  highlighted: boolean;
  fresh: string;
  rovingKey: string | null;
  registerNav: (key: string) => (el: HTMLButtonElement | null) => void;
  setActiveKey: (key: string) => void;
  navKeyDown: (key: string) => (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onClick: () => void;
  onOpen: () => void;
  entity: VaultDocEntity;
}

/** One document row at level 2 (binding `LeftRail` 244:750 document row): the
 *  leading cue is the actual doc-type glyph, followed by the stem and freshness
 *  label. The selected row
 *  alone gets the kit ListRow accent treatment — a 2px left accent bar +
 *  accent-subtle tint — exactly one selected row across the whole tree. */
function TreeRow({
  entry,
  docType,
  highlighted,
  fresh,
  rovingKey,
  registerNav,
  setActiveKey,
  navKeyDown,
  onClick,
  onOpen,
  entity,
}: TreeRowProps) {
  const rowKey = `r:${entry.path}`;
  const FallbackMark = docMark(docType);

  return (
    <li>
      <button
        ref={registerNav(rowKey)}
        type="button"
        title={entry.path}
        aria-current={highlighted ? "page" : undefined}
        tabIndex={rovingKey === rowKey ? 0 : -1}
        onClick={onClick}
        onDoubleClick={onOpen}
        onFocus={() => setActiveKey(rowKey)}
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(entity, { x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e) => {
          if (
            handleKeyboardContextMenu(e, (anchor) => openContextMenu(entity, anchor))
          ) {
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            onOpen();
            return;
          }
          navKeyDown(rowKey)(e);
        }}
        // Level-2 indent (binding row at `pl-36px`) lines the rows up under the
        // doc-type group; the kit ListRow accent treatment (2px left bar + tint)
        // marks selection, the leading category cue + stem + freshness follow.
        className={`flex h-[30px] w-full min-w-0 items-center gap-fg-1-5 rounded-r-fg-xs border-l-2 pe-fg-1 ps-fg-6 text-meta text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
          highlighted
            ? "border-l-accent bg-accent-subtle font-medium text-accent-text"
            : "border-l-transparent text-ink-muted hover:bg-paper-sunken hover:text-ink"
        }`}
      >
        {/* Leading cue is the actual document-type glyph. The Vault tree no
            longer uses legend-coloured circular document markers, so the row
            identity survives in grayscale and matches the doc-type group. */}
        <span className="flex shrink-0 items-center text-ink-faint" aria-hidden>
          <FallbackMark size={DOC_MARK_PX} />
        </span>
        <span className="min-w-0 shrink truncate">{entryStem(entry.path)}</span>
        {fresh && (
          <span
            className={`ml-auto shrink-0 text-caption ${freshnessToneClass(fresh)}`}
            data-tabular
          >
            {fresh}
          </span>
        )}
      </button>
    </li>
  );
}
