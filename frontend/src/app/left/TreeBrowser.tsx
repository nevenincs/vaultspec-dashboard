// The Vault tab's tree (binding `LeftRail` 238:600): TWO parallel collapsible
// sections over the ONE `/vault-tree` projection (views-are-projections-of-one-
// model) — a FEATURES index and a doc-type-first DOCUMENTS tree. Both start
// COLLAPSED; expanding a section reveals its folder rows, and expanding a folder
// reveals its documents as two-line DocRows (title + date + status). The whole
// listing is narrowed by the ONE canonical left-rail facet pass (feature text +
// doc types + statuses + feature tags + edited range) read from
// `dashboardState.filters`, so the rail tree agrees with the graph the same
// filter narrows (left-rail-top ADR D5).
//
// Composition only (dashboard-layer-ownership): this fetches nothing, mints no
// node identity, and reads degradation ONLY through the stores selector (never the
// raw `tiers` block). Selection joins on the same stable `doc:<stem>` node id the
// rest of the rail uses.

import type { ReactNode, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useRef } from "react";

import {
  ChevronDown,
  ChevronRight,
  Folder,
  FoldVertical,
  UnfoldVertical,
} from "lucide-react";

import { Badge, FoldSection, IconButton, SectionLabel } from "../kit";
import type { VaultDocEntity } from "../../platform/actions/entity";
import type { VaultTreeEntry } from "../../stores/server/engine";
import {
  deriveVaultRailView,
  tierAvailabilityReason,
  useActiveScope,
  useVaultRailFacets,
  useVaultTreeSurface,
  type VaultDocTypeGroup,
  type VaultTreeFeatureGroup,
} from "../../stores/server/queries";
import {
  deriveAllVaultBrowserTreeKeys,
  deriveBrowserTreeKeyboardTarget,
  deriveBrowserTreeExpansionItem,
  deriveBrowserTreeRovingKey,
  useBrowserTreeExpansion,
} from "../../stores/view/browserTreeExpansion";
import {
  LEFT_RAIL_COLLAPSE_TREE_ACTION_ID,
  LEFT_RAIL_COLLAPSE_TREE_LABEL,
  LEFT_RAIL_EXPAND_TREE_ACTION_ID,
  LEFT_RAIL_EXPAND_TREE_LABEL,
  collapseTreeAction,
  expandTreeAction,
} from "../../stores/view/leftRailKeybindings";
import { registerKeyAction } from "../../stores/view/keymapDispatcher";
import { openContextMenu } from "../../stores/view/contextMenu";
import { handleKeyboardContextMenu } from "../chrome/keyboardContextMenu";
import {
  pathStem,
  pathToNodeId,
  useDashboardBrowserSelection,
  useHighlightedPath,
} from "./browserSelection";
// Self-registering left-rail context-menu resolver (W03.P07): importing the
// module runs its `registerResolver("vault-doc", …)` side effect once. The rows
// are the SAME vault documents, so they share the vault-doc menu.
import "./menus/vaultDocMenu";
import {
  CHEVRON_PX,
  DOC_MARK_PX,
  docDateLabel,
  docDisplayTitle,
  docGroupLabel,
  featureDisplayName,
  freshnessLabel,
  freshnessToneClass,
} from "./vaultRowPresentation";

/** Display stem — the shared derivation from the selection join. */
export function entryStem(path: string): string {
  return pathStem(path);
}

// --- props -----------------------------------------------------------------------

export interface TreeBrowserProps {
  /** Row click handler (defaults to the shared bidirectional selection). */
  onEntryClick?: (entry: VaultTreeEntry) => void;
  /** Row open handler (double-click / Enter → open in the reader). */
  onEntryOpen?: (entry: VaultTreeEntry) => void;
  /** The document path currently highlighted by the shared selection. */
  highlightedPath?: string | null;
  /** Landmark label for the mounted tree surface. */
  ariaLabel?: "tree browser" | "vault browser";
}

/** Build the vault-doc context-menu entity from a tree row's data. */
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

/** Flatten a feature group's doc-type sub-lists into one recency-ordered list of
 *  documents — the Features section lists a feature's documents directly (the
 *  doc-type-first split lives in the Documents section). */
function featureEntries(group: VaultTreeFeatureGroup): VaultTreeEntry[] {
  return group.docTypes
    .flatMap((sub) => sub.entries)
    .slice()
    .sort((a, b) => {
      const am = a.dates.modified ?? "";
      const bm = b.dates.modified ?? "";
      if (am !== bm) return am < bm ? 1 : -1;
      return a.path.localeCompare(b.path);
    });
}

export function TreeBrowser({
  onEntryClick,
  onEntryOpen,
  highlightedPath,
  ariaLabel = "tree browser",
}: TreeBrowserProps) {
  const scope = useActiveScope();
  const { tree, availability, state } = useVaultTreeSurface(scope);
  const facets = useVaultRailFacets(scope);
  const dashboardSelection = useDashboardBrowserSelection(scope);
  const sharedHighlight = useHighlightedPath(tree.data?.entries, scope);
  const clickHandler = onEntryClick ?? dashboardSelection.handleEntryClick;
  const openHandler = onEntryOpen ?? dashboardSelection.handleEntryOpen;
  const highlight = highlightedPath ?? sharedHighlight;

  // Expansion keyed by stable nav-key: sections `sec:*`, feature folders
  // `feat:<feature>`, doc-type folders `type:<docType>`. The browser-tree store
  // owns this so a scope/workspace swap clears disclosure state in ONE reset path.
  // Default = collapsed (a fresh key is absent from the set) — the binding sections
  // start collapsed.
  const { expanded, toggle, activeKey, setActiveKey, expandAll, collapseAll } =
    useBrowserTreeExpansion(scope, "vault");
  // The full expandable-key set tracks the latest rendered tree (a ref, not state,
  // so the registered key-action thunk reads fresh keys without re-registering on
  // every render). The expand/collapse-all verbs are enrolled into the one keymap
  // dispatcher here — where the loaded tree keys live — under the left-rail context.
  const treeKeysRef = useRef<string[]>([]);
  const expandWholeTree = useCallback(() => {
    expandAll(treeKeysRef.current);
  }, [expandAll]);
  useEffect(() => {
    const disposeExpand = registerKeyAction(LEFT_RAIL_EXPAND_TREE_ACTION_ID, () =>
      expandTreeAction(expandWholeTree),
    );
    const disposeCollapse = registerKeyAction(LEFT_RAIL_COLLAPSE_TREE_ACTION_ID, () =>
      collapseTreeAction(collapseAll),
    );
    return () => {
      disposeCollapse();
      disposeExpand();
    };
  }, [expandWholeTree, collapseAll]);
  const navEls = useRef(new Map<string, HTMLButtonElement>());
  const previousNavOrder = useRef<string[]>([]);
  const currentNavOrder = useRef<string[]>([]);
  const tabStopAssigned = useRef(false);
  const rovingKey = deriveBrowserTreeRovingKey(activeKey, previousNavOrder.current);
  currentNavOrder.current = [];
  tabStopAssigned.current = false;
  const registerNav = useCallback(
    (key: string) => (el: HTMLButtonElement | null) => {
      if (el) navEls.current.set(key, el);
      else navEls.current.delete(key);
    },
    [],
  );
  const registerVisibleKey = useCallback(
    (key: string) => {
      currentNavOrder.current.push(key);
      previousNavOrder.current = currentNavOrder.current;
      // The whole rail is ONE tab-stop: the active key roves, but before any focus
      // (rovingKey === null) the FIRST visible node carries tabIndex 0 so the rail
      // is reachable by Tab from the start (the proven CodeTree pattern).
      const tabbable =
        rovingKey === key || (rovingKey === null && !tabStopAssigned.current);
      if (tabbable) tabStopAssigned.current = true;
      return tabbable ? 0 : -1;
    },
    [rovingKey],
  );
  const moveActive = useCallback(
    (from: string, key: unknown) => {
      const next = deriveBrowserTreeKeyboardTarget(previousNavOrder.current, from, key);
      if (next === null) return;
      setActiveKey(next);
      navEls.current.get(next)?.focus();
    },
    [setActiveKey],
  );
  const navKeyDown = useCallback(
    (key: string, opts?: { onArrowRight?: () => void; onArrowLeft?: () => void }) =>
      (e: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          moveActive(key, e.key);
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

  const view = deriveVaultRailView(tree.data?.entries ?? [], facets);
  const degradedReason = tierAvailabilityReason(availability);
  const empty = view.featureCount === 0 && view.docTypeCount === 0;
  // Latest full expandable-key set (the two sections + every feature + doc-type
  // folder) for the expand-all verb; document rows are leaves and never expand.
  treeKeysRef.current = deriveAllVaultBrowserTreeKeys({
    features: view.featureGroups.map((group) => group.feature),
    docTypes: view.docTypeGroups.map((group) => group.docType),
  });

  return (
    <nav
      className="flex flex-col gap-fg-1 text-label"
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

      {empty ? (
        view.filteredToNothing ? (
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
        <>
          {/* Tree-wide expand / collapse — the disclosure verbs surfaced as rail
              controls (also Mod+Alt+] / Mod+Alt+[ and the command palette). */}
          <div
            className="flex items-center justify-end gap-fg-0-5 pr-fg-1"
            data-tree-disclosure-controls
          >
            <IconButton
              label={LEFT_RAIL_EXPAND_TREE_LABEL}
              title={LEFT_RAIL_EXPAND_TREE_LABEL}
              onClick={expandWholeTree}
            >
              <UnfoldVertical size={14} aria-hidden />
            </IconButton>
            <IconButton
              label={LEFT_RAIL_COLLAPSE_TREE_LABEL}
              title={LEFT_RAIL_COLLAPSE_TREE_LABEL}
              onClick={collapseAll}
            >
              <FoldVertical size={14} aria-hidden />
            </IconButton>
          </div>

          {/* FEATURES — feature → its documents. */}
          <Section
            title="Features"
            count={view.featureCount}
            sectionKey="sec:features"
            expanded={expanded}
            toggle={toggle}
            registerNav={registerNav}
            registerVisibleKey={registerVisibleKey}
            setActiveKey={setActiveKey}
            navKeyDown={navKeyDown}
          >
            {view.featureGroups.map((group) => (
              <FolderRow
                key={group.feature}
                folderKey={`feat:${group.feature}`}
                name={featureDisplayName(group.feature)}
                count={group.count}
                entries={featureEntries(group)}
                expanded={expanded}
                toggle={toggle}
                scope={scope}
                highlight={highlight}
                onClick={clickHandler}
                onOpen={openHandler}
                registerNav={registerNav}
                registerVisibleKey={registerVisibleKey}
                setActiveKey={setActiveKey}
                navKeyDown={navKeyDown}
              />
            ))}
          </Section>

          {/* DOCUMENTS — doc-type folder → its documents. */}
          <Section
            title="Documents"
            count={view.docTypeCount}
            sectionKey="sec:documents"
            expanded={expanded}
            toggle={toggle}
            registerNav={registerNav}
            registerVisibleKey={registerVisibleKey}
            setActiveKey={setActiveKey}
            navKeyDown={navKeyDown}
          >
            {view.docTypeGroups.map((group: VaultDocTypeGroup) => (
              <FolderRow
                key={group.docType}
                folderKey={`type:${group.docType}`}
                name={docGroupLabel(group.docType)}
                count={group.count}
                entries={group.entries}
                expanded={expanded}
                toggle={toggle}
                scope={scope}
                highlight={highlight}
                onClick={clickHandler}
                onOpen={openHandler}
                registerNav={registerNav}
                registerVisibleKey={registerVisibleKey}
                setActiveKey={setActiveKey}
                navKeyDown={navKeyDown}
              />
            ))}
          </Section>
        </>
      )}
    </nav>
  );
}

// --- the section header (binding `LeftRail` SectionHeader 666:2158) ---------------

interface SectionProps {
  title: string;
  count: number;
  sectionKey: string;
  expanded: ReadonlySet<string>;
  toggle: (key: string) => void;
  registerNav: (key: string) => (el: HTMLButtonElement | null) => void;
  registerVisibleKey: (key: string) => number;
  setActiveKey: (key: string) => void;
  navKeyDown: (
    key: string,
    opts?: { onArrowRight?: () => void; onArrowLeft?: () => void },
  ) => (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}

/** A top-level collapsible section — a twisty + uppercase eyebrow + count, folding
 *  its folder rows. Built on the ONE canonical fold (FoldSection), identical idiom
 *  to the right rail's Status sections (design-system-is-centralized). The header
 *  joins the rail's single roving-tabindex nav order (the whole rail is ONE
 *  tab-stop) via `registerVisibleKey`/`registerNav`. */
function Section({
  title,
  count,
  sectionKey,
  expanded,
  toggle,
  registerNav,
  registerVisibleKey,
  setActiveKey,
  navKeyDown,
  children,
}: SectionProps) {
  const open = deriveBrowserTreeExpansionItem(sectionKey, expanded).expanded;
  const tabIndex = registerVisibleKey(sectionKey);
  return (
    <FoldSection
      open={open}
      onToggle={() => toggle(sectionKey)}
      bodyId={`vault-${sectionKey}`}
      twistyPx={DOC_MARK_PX}
      headerClassName="flex w-full items-center gap-fg-2 rounded-fg-xs py-fg-1 transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      bodyClassName="flex flex-col gap-fg-1"
      headerRef={registerNav(sectionKey)}
      headerProps={{
        tabIndex,
        onFocus: () => setActiveKey(sectionKey),
        onKeyDown: navKeyDown(sectionKey, {
          onArrowRight: open ? undefined : () => toggle(sectionKey),
          onArrowLeft: open ? () => toggle(sectionKey) : undefined,
        }),
      }}
      label={
        <SectionLabel
          className="min-w-0 flex-1"
          data-vault-section={title.toLowerCase()}
        >
          {title}
        </SectionLabel>
      }
      trailing={
        <span className="text-meta text-ink-faint" data-tabular>
          {count}
        </span>
      }
      data-vault-section-header
    >
      {children}
    </FoldSection>
  );
}

// --- the folder row (binding `LeftRail` Row 666:2165) -----------------------------

interface FolderRowProps {
  folderKey: string;
  name: string;
  count: number;
  entries: VaultTreeEntry[];
  expanded: ReadonlySet<string>;
  toggle: (key: string) => void;
  scope: string | null;
  highlight: string | null;
  onClick: (entry: VaultTreeEntry) => void;
  onOpen: (entry: VaultTreeEntry) => void;
  registerNav: (key: string) => (el: HTMLButtonElement | null) => void;
  registerVisibleKey: (key: string) => number;
  setActiveKey: (key: string) => void;
  navKeyDown: (
    key: string,
    opts?: { onArrowRight?: () => void; onArrowLeft?: () => void },
  ) => (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
}

/** A feature / doc-type folder: chevron + folder glyph + name + member count,
 *  toggling a body of DocRows. The folder glyph is the ONE structural Lucide
 *  chrome mark (icons-come-from-the-two-sanctioned-families); leaves (the DocRows)
 *  carry no icon. */
function FolderRow({
  folderKey,
  name,
  count,
  entries,
  expanded,
  toggle,
  scope,
  highlight,
  onClick,
  onOpen,
  registerNav,
  registerVisibleKey,
  setActiveKey,
  navKeyDown,
}: FolderRowProps) {
  const open = deriveBrowserTreeExpansionItem(folderKey, expanded).expanded;
  const bodyId = `vault-${folderKey}`;
  const tabIndex = registerVisibleKey(folderKey);
  return (
    <div data-vault-folder>
      <button
        ref={registerNav(folderKey)}
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        tabIndex={tabIndex}
        onFocus={() => setActiveKey(folderKey)}
        onClick={() => toggle(folderKey)}
        onKeyDown={navKeyDown(folderKey, {
          onArrowRight: open ? undefined : () => toggle(folderKey),
          onArrowLeft: open ? () => toggle(folderKey) : undefined,
        })}
        className="flex w-full items-center gap-fg-1-5 rounded-fg-xs px-fg-2 py-fg-1-5 text-left transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        <span className="shrink-0 text-ink-faint" aria-hidden>
          {open ? (
            <ChevronDown size={CHEVRON_PX} />
          ) : (
            <ChevronRight size={CHEVRON_PX} />
          )}
        </span>
        <span className="shrink-0 text-ink-muted" aria-hidden>
          <Folder size={DOC_MARK_PX} />
        </span>
        <span className="min-w-0 flex-1 truncate text-body text-ink">{name}</span>
        <span className="shrink-0 text-meta text-ink-faint" data-tabular>
          {count}
        </span>
      </button>

      {open && (
        <ul
          id={bodyId}
          className="flex flex-col gap-fg-2 py-fg-1-5"
          data-vault-folder-body
        >
          {entries.map((entry) => (
            <DocRow
              key={entry.path}
              navKey={`${folderKey}:doc:${entry.path}`}
              entry={entry}
              highlighted={entry.path === highlight}
              scope={scope}
              registerNav={registerNav}
              registerVisibleKey={registerVisibleKey}
              setActiveKey={setActiveKey}
              navKeyDown={navKeyDown}
              onClick={() => onClick(entry)}
              onOpen={() => onOpen(entry)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// --- the document row (binding `LeftRail/DocRow` 660:1875) ------------------------

interface DocRowProps {
  navKey: string;
  entry: VaultTreeEntry;
  highlighted: boolean;
  scope: string | null;
  registerNav: (key: string) => (el: HTMLButtonElement | null) => void;
  registerVisibleKey: (key: string) => number;
  setActiveKey: (key: string) => void;
  navKeyDown: (key: string) => (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onClick: () => void;
  onOpen: () => void;
}

/** One document, as a two-line leaf: the human title over a meta line carrying the
 *  modified date and (for ADRs) the status badge. Selection alone gets the kit
 *  accent treatment (2px left bar + accent tint) — exactly one selected row. */
function DocRow({
  navKey,
  entry,
  highlighted,
  scope,
  registerNav,
  registerVisibleKey,
  setActiveKey,
  navKeyDown,
  onClick,
  onOpen,
}: DocRowProps) {
  const title = docDisplayTitle(entry.path);
  const date = docDateLabel(entry.dates.modified);
  const fresh = freshnessLabel(entry.dates.modified, Date.now());
  const entity = vaultDocEntity(entry, scope);
  const tabIndex = registerVisibleKey(navKey);
  const handleNavKeyDown = navKeyDown(navKey);
  return (
    <li>
      <button
        ref={registerNav(navKey)}
        type="button"
        title={entry.path}
        aria-current={highlighted ? "page" : undefined}
        tabIndex={tabIndex}
        onFocus={() => setActiveKey(navKey)}
        onClick={onClick}
        onDoubleClick={onOpen}
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(entity, { x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e: ReactKeyboardEvent<HTMLButtonElement>) => {
          if (
            handleKeyboardContextMenu(e, (anchor) => openContextMenu(entity, anchor))
          ) {
            return;
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            handleNavKeyDown(e);
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            onOpen();
          }
        }}
        className={`flex w-full min-w-0 flex-col gap-fg-0-5 rounded-r-fg-xs border-l-2 py-fg-1-5 pe-fg-2 ps-fg-8 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
          highlighted
            ? "border-l-accent bg-accent-subtle"
            : "border-l-transparent hover:bg-paper-sunken"
        }`}
      >
        <span
          className={`w-full truncate text-body ${highlighted ? "text-accent-text" : "text-ink"}`}
        >
          {title}
        </span>
        <span className="flex items-center gap-fg-1-5">
          {date && (
            <span
              className={`shrink-0 text-meta ${freshnessToneClass(fresh)}`}
              data-tabular
            >
              {date}
            </span>
          )}
          {entry.status && (
            <Badge tone="neutral" data-doc-status>
              {entry.status}
            </Badge>
          )}
        </span>
      </button>
    </li>
  );
}
