// The Vault tab's tree (binding `LeftRail` Vault variant): TWO parallel collapsible
// sections over the ONE `/vault-tree` projection (views-are-projections-of-one-
// model) — a FEATURES tree (feature → category sub-folder → documents) and a
// doc-type-first DOCUMENTS tree (category → documents).
//
// ONE ROW ELEMENT AT EVERY LEVEL. Features, category folders, and document leaves
// all render through the SAME `VaultTreeRow` shell so every level reads identically:
// the same fully-rounded row (`rounded-fg-xs` — never a square or half-rounded edge),
// the same one-step-per-level indentation, and the SAME selection treatment — a
// filled accent tint over the WHOLE rounded row plus accent label ink (the binding
// Figma selected-row look: accent tint + accent name). There is no left-edge bar and
// no straight-edged highlight anywhere; selection is the rounded fill, identical on a
// folder and on a leaf.
//
// Category identity is the centralized color-coded GLYPH (`DocTypeMark`): feature
// rows carry the plan mark in the feature color, category folders carry their
// doc-type mark in the doc-type color. Color lives ONLY on these parent rows — a
// document leaf carries the SAME doc-type mark in QUIET neutral ink (no category
// color) so the leaf still reads as a row with an icon, but color stays a top-level
// signal.
//
// Composition only (dashboard-layer-ownership): this fetches nothing, mints no
// node identity, and reads degradation ONLY through the stores selector (never the
// raw `tiers` block). Selection joins on the same stable `doc:<stem>` node id the
// rest of the rail uses. `index` is never a displayed node (ADR D5) — the
// projection already excludes it.

import type {
  CSSProperties,
  ReactNode,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { ChevronDown, ChevronRight } from "lucide-react";

import { categoryColorVar, categoryToken, type Category } from "../kit";
import { RailSection } from "../chrome/RailSection";
import { useFocusZone, type FocusZoneItemProps } from "../chrome/useFocusZone";
import { DocTypeMark } from "../../scene/field/markComponents";
import { RailDegradedNotice, RailMessage, RailSkeleton } from "./railStates";
import type { VaultDocEntity } from "../../platform/actions/entity";
import type { VaultTreeEntry } from "../../stores/server/engine";
import {
  deriveVaultRailView,
  useActiveScope,
  useDashboardSelectedNodeId,
  useVaultRailFacets,
  useVaultTreeSurface,
  type VaultDocTypeGroup,
  type VaultTreeFeatureGroup,
} from "../../stores/server/queries";
import { featureNodeIdFromTag } from "../../stores/server/liveAdapters";
import {
  followFeatureKeyForNode,
  followModeEnabled,
  selectFeatureAndFrame,
  useFollowMode,
} from "../../stores/view/selection";
import {
  deriveAllVaultBrowserTreeKeys,
  deriveBrowserTreeExpansionItem,
  useBrowserTreeExpansion,
} from "../../stores/view/browserTreeExpansion";
import {
  LEFT_RAIL_COLLAPSE_TREE_ACTION_ID,
  LEFT_RAIL_EXPAND_TREE_ACTION_ID,
  collapseTreeAction,
  expandTreeAction,
} from "../../stores/view/leftRailKeybindings";
import { registerKeyAction } from "../../stores/view/keymapDispatcher";
import { openContextMenu } from "../../stores/view/contextMenu";
import { useViewportClass } from "../../stores/view/viewportClass";
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
  docDateLabel,
  docDisplayTitle,
  docGroupLabel,
  docTypeCategory,
  featureDisplayName,
} from "./vaultRowPresentation";

/** Display stem — the shared derivation from the selection join. */
export function entryStem(path: string): string {
  return pathStem(path);
}

// --- indentation (a real tree: one step per level, token-aligned rem; no px) ------
// Each tree LEVEL indents exactly one rem step deeper than its parent so the nesting
// reads as a clear staircase under one UI-scale change (no-hardcoded-px — rem, not
// px). The section header sits at level 0; a section's first folder row is level 1;
// a feature's category sub-folder is level 2; a document leaf is one level deeper
// than its parent folder. The inset is applied as `padding-inline-start` so the
// whole row (chevron + icon + label) shifts together.
const INDENT_STEP_REM = 1;
const INDENT_BASE_REM = 0.5;
function indentStyle(level: number): CSSProperties {
  return { paddingInlineStart: `${INDENT_BASE_REM + level * INDENT_STEP_REM}rem` };
}

// The leading category GLYPH reads at the row text size — a real icon, not a dot.
const ICON_PX = 15;

/** The ONE row shell + selection treatment shared by EVERY tree level (feature,
 *  category folder, document leaf). Fully rounded (`rounded-fg-xs`) always; a
 *  highlighted row is filled with the accent tint over the whole rounded row — the
 *  binding Figma selected-row look. No left-edge bar, no half-rounded/straight edge:
 *  a leaf and a folder select identically. */
function rowClassName(highlighted: boolean): string {
  return `flex w-full items-center gap-fg-1-5 rounded-fg-xs py-fg-1-5 pe-fg-2 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
    highlighted ? "bg-accent-subtle" : "hover:bg-paper-sunken"
  }`;
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
  // `feat:<feature>`, feature category sub-folders `featcat:<feature>:<docType>`,
  // and Documents-section category folders `type:<docType>`. The browser-tree store
  // owns this so a scope/workspace swap clears disclosure state in ONE reset path.
  // Sections start COLLAPSED (the tested a11y contract; binding sections are
  // collapsible). A fresh key is absent from the expanded set.
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
  // Follow-mode REVERSE half (graph -> rail, follow-mode-selection-sync / Issue #13):
  // when follow mode is on and the graph's canonical selected node changes, EXPAND
  // that node's parent feature group (and the Features section) and make its row the
  // active tab stop. Row highlight already tracks selection via `useHighlightedPath`;
  // the new behaviour is auto-revealing the parent. The seam returns the canonical
  // feature TAG for the node (a `doc:` node maps to its first feature tag); the rail
  // owns the `feat:<tag>` key format. `expandAll` unions, so an already-open feature
  // is never collapsed. No-op (null tag) when follow mode is off or the feature is
  // unknown — the rail leaves its expansion untouched.
  const followMode = useFollowMode();
  const selectedNodeId = useDashboardSelectedNodeId(scope);
  const nodeFeatureTags = useMemo(() => {
    const map = new Map<string, readonly string[]>();
    for (const entry of tree.data?.entries ?? []) {
      map.set(pathToNodeId(entry.path), entry.feature_tags);
    }
    return map;
  }, [tree.data?.entries]);
  useEffect(() => {
    if (!followMode || selectedNodeId === null) return;
    const tag = followFeatureKeyForNode(
      selectedNodeId,
      nodeFeatureTags.get(selectedNodeId),
    );
    if (tag === null) return;
    expandAll(["sec:features", `feat:${tag}`]);
    setActiveKey(`feat:${tag}`);
  }, [followMode, selectedNodeId, nodeFeatureTags, expandAll, setActiveKey]);
  // The whole tree is ONE tab stop with arrow / Home / End roving through the
  // shared FocusZone primitive (keyboard-navigation W02.P05.S14). It replaces the
  // prior bespoke render-time roving (registerNav / registerVisibleKey /
  // moveActive), whose keyboard-target derivation returned null for the focused
  // row so arrow nav was dead. FocusZone also stops consumed arrows from reaching
  // the global keymap dispatcher (the Class-A/Class-B split). A row's cross-axis
  // ArrowRight / ArrowLeft (expand / collapse) maps onto the zone's cross intents.
  const zone = useFocusZone({
    orientation: "vertical",
    wrap: false,
    activeKey,
    onActiveKeyChange: setActiveKey,
  });
  const rowNav: RowNav = {
    rove: (key, opts) =>
      zone.rove(
        key,
        opts
          ? { onCrossNext: opts.onArrowRight, onCrossPrev: opts.onArrowLeft }
          : undefined,
      ),
    setActiveKey,
  };

  if (state === "loading") {
    // LOADING mode (binding `LeftRail` State=Loading): the shared designed skeleton.
    return <RailSkeleton label="Loading the vault…" />;
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
  const empty = view.featureCount === 0 && view.docTypeCount === 0;
  // Latest full expandable-key set (the two sections + every feature + every
  // feature category sub-folder + every Documents category folder) for the
  // expand-all verb; document rows are leaves and never expand.
  treeKeysRef.current = deriveAllVaultBrowserTreeKeys({
    features: view.featureGroups.map((group) => ({
      feature: group.feature,
      docTypes: group.docTypes.map((sub) => sub.docType),
    })),
    docTypes: view.docTypeGroups.map((group) => group.docType),
  });

  return (
    <nav
      className="flex flex-col gap-fg-1 text-label"
      aria-label={ariaLabel}
      data-tree-browser={ariaLabel === "tree browser" ? "" : undefined}
      data-vault-browser={ariaLabel === "vault browser" ? "" : undefined}
    >
      {/* DEGRADED mode (binding `LeftRail` State=Degraded): the shared designed
          notice — an AlertTriangle and ONE plain sentence above whatever loaded.
          Never the raw tier reason. */}
      {availability.degraded && (
        <RailDegradedNotice label="Some documents are temporarily unavailable." />
      )}

      {empty ? (
        <RailMessage
          tone="empty"
          label={
            view.filteredToNothing
              ? "No documents match this filter."
              : "No documents in this scope yet."
          }
        />
      ) : (
        <>
          {/* FEATURES — feature → category sub-folders → documents (ADR D4). */}
          <Section
            title="Features"
            count={view.featureCount}
            sectionKey="sec:features"
            expanded={expanded}
            toggle={toggle}
            nav={rowNav}
          >
            {view.featureGroups.map((group) => (
              <FeatureFolderRow
                key={group.feature}
                group={group}
                expanded={expanded}
                toggle={toggle}
                scope={scope}
                highlight={highlight}
                onClick={clickHandler}
                onOpen={openHandler}
                nav={rowNav}
              />
            ))}
          </Section>

          {/* DOCUMENTS — category folder → its documents (ADR D4). */}
          <Section
            title="Documents"
            count={view.docTypeCount}
            sectionKey="sec:documents"
            expanded={expanded}
            toggle={toggle}
            nav={rowNav}
          >
            {view.docTypeGroups.map((group: VaultDocTypeGroup) => (
              <CategoryFolderRow
                key={group.docType}
                folderKey={`type:${group.docType}`}
                docType={group.docType}
                count={group.count}
                entries={group.entries}
                level={1}
                expanded={expanded}
                toggle={toggle}
                scope={scope}
                highlight={highlight}
                onClick={clickHandler}
                onOpen={openHandler}
                nav={rowNav}
              />
            ))}
          </Section>
        </>
      )}
    </nav>
  );
}

// --- shared row navigation plumbing ----------------------------------------------

interface RowNav {
  /** Register a row with the FocusZone: returns its ref, roving tabIndex, and the
   *  arrow/Home/End keydown handler. A row's cross-axis ArrowRight/ArrowLeft maps
   *  to expand/collapse via the opts. */
  rove: (
    key: string,
    opts?: { onArrowRight?: () => void; onArrowLeft?: () => void },
  ) => FocusZoneItemProps;
  setActiveKey: (key: string) => void;
}

// --- the ONE tree row (feature, category folder, AND document leaf) ---------------

interface VaultTreeRowProps {
  /** Stable nav/expansion key. */
  navKey: string;
  /** Tree level (1 = a section's first row, 2 = a feature's sub-folder, …). */
  level: number;
  /** Visible label. */
  label: string;
  /** Which `DocTypeMark` silhouette to lead with (a GLYPH_KINDS key). */
  markKind: string;
  /** When set, the icon is tinted by this category's bound color (parent rows). When
   *  absent, the icon reads in quiet neutral ink (document leaves) — color is a
   *  top-level-only signal. */
  markColor?: Category;
  /** Expandable (folder) rows show a chevron and toggle; leaves show an aligned
   *  spacer and select/open. */
  expandable: boolean;
  expanded?: boolean;
  /** Trailing member count (folders). */
  count?: number;
  /** Trailing meta text (a document's modified date). */
  meta?: string;
  /** Whether this row is the selected document (leaf). */
  highlighted?: boolean;
  /** `aria-controls` target id for an expandable row's body. */
  bodyId?: string;
  /** Activate: toggle (folder) or select (leaf). */
  onActivate: () => void;
  /** Open in the reader (leaf: double-click / Enter). */
  onOpen?: () => void;
  /** Context-menu entity (leaves only). */
  entity?: VaultDocEntity;
  /** Marks the row's wrapper for `[data-vault-folder]` selectors. */
  folderMarker?: boolean;
  nav: RowNav;
  /** The body revealed when an expandable row is open. */
  body?: ReactNode;
}

function VaultTreeRow({
  navKey,
  level,
  label,
  markKind,
  markColor,
  expandable,
  expanded = false,
  count,
  meta,
  highlighted = false,
  bodyId,
  onActivate,
  onOpen,
  entity,
  folderMarker,
  nav,
  body,
}: VaultTreeRowProps) {
  const {
    ref,
    tabIndex,
    onKeyDown: zoneKeyDown,
  } = nav.rove(
    navKey,
    expandable
      ? {
          onArrowRight: expanded ? undefined : onActivate,
          onArrowLeft: expanded ? onActivate : undefined,
        }
      : undefined,
  );
  // On a compact (touch) viewport a single tap on a leaf OPENS it (the mobile
  // file-list gesture; there is no double-click on touch). Folders still toggle on
  // tap, and desktop keeps single-tap-select / double-click-open
  // (mobile-responsive-layout ADR D5).
  const compact = useViewportClass() === "compact";
  const tapOpensLeaf = compact && !expandable && onOpen != null;
  const button = (
    <button
      ref={ref}
      type="button"
      title={entity?.path ?? label}
      aria-expanded={expandable ? expanded : undefined}
      aria-controls={expandable ? bodyId : undefined}
      aria-current={!expandable && highlighted ? "page" : undefined}
      tabIndex={tabIndex}
      style={indentStyle(level)}
      onFocus={() => nav.setActiveKey(navKey)}
      onClick={tapOpensLeaf ? onOpen : onActivate}
      onDoubleClick={onOpen}
      onContextMenu={
        entity
          ? (e) => {
              e.preventDefault();
              openContextMenu(entity, { x: e.clientX, y: e.clientY });
            }
          : undefined
      }
      onKeyDown={(e: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (
          entity &&
          handleKeyboardContextMenu(e, (anchor) => openContextMenu(entity, anchor))
        ) {
          return;
        }
        // Enter opens a leaf document (folders toggle via the native button click).
        if (!expandable && e.key === "Enter") {
          e.preventDefault();
          onOpen?.();
          return;
        }
        zoneKeyDown(e);
      }}
      className={rowClassName(highlighted)}
    >
      {/* disclosure chevron (folders) or an aligned spacer (leaves) so every row's
          icon shares one column. */}
      <span className="flex shrink-0 items-center text-ink-faint" aria-hidden>
        {expandable ? (
          expanded ? (
            <ChevronDown size={CHEVRON_PX} />
          ) : (
            <ChevronRight size={CHEVRON_PX} />
          )
        ) : (
          <span style={{ display: "inline-block", width: CHEVRON_PX }} />
        )}
      </span>
      {/* the category GLYPH — tinted (parents) or quiet neutral ink (leaves). */}
      <span
        className="flex shrink-0 items-center text-ink-faint"
        style={markColor ? { color: categoryColorVar(markColor) } : undefined}
        data-doc-mark={markKind}
        data-category={markColor ? categoryToken(markColor) : undefined}
        aria-hidden
      >
        <DocTypeMark kind={markKind} size={ICON_PX} />
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-body ${
          highlighted ? "text-accent-text" : "text-ink"
        }`}
      >
        {label}
      </span>
      {count !== undefined && (
        <span className="shrink-0 text-meta text-ink-faint" data-tabular>
          {count}
        </span>
      )}
      {meta && (
        <span className="shrink-0 text-meta text-ink-faint" data-tabular>
          {meta}
        </span>
      )}
    </button>
  );

  if (!expandable) {
    return <li>{button}</li>;
  }
  return (
    <div data-vault-folder={folderMarker ? "" : undefined}>
      {button}
      {expanded && (
        <div id={bodyId} data-vault-folder-body>
          {body}
        </div>
      )}
    </div>
  );
}

// --- the section header (binding `LeftRail` SectionHeader 666:2158) ---------------

interface SectionProps {
  title: string;
  count: number;
  sectionKey: string;
  expanded: ReadonlySet<string>;
  toggle: (key: string) => void;
  nav: RowNav;
  children: ReactNode;
}

/** A top-level collapsible section (Features / Documents). Renders through the ONE
 *  shared `RailSection` so its header is IDENTICAL to the right rail's section
 *  headers (OPEN PLANS / OPEN PRS) — same padding, same flush hover, same UPPERCASE
 *  eyebrow + inline count — with the rail's roving-tabindex nav driven through the
 *  pass-through header props (design-system-is-centralized; full cross-rail parity). */
function Section({
  title,
  count,
  sectionKey,
  expanded,
  toggle,
  nav,
  children,
}: SectionProps) {
  const open = deriveBrowserTreeExpansionItem(sectionKey, expanded).expanded;
  const { ref, tabIndex, onKeyDown } = nav.rove(sectionKey, {
    onArrowRight: open ? undefined : () => toggle(sectionKey),
    onArrowLeft: open ? () => toggle(sectionKey) : undefined,
  });
  return (
    <RailSection
      title={title}
      count={count}
      open={open}
      onToggle={() => toggle(sectionKey)}
      bodyId={`vault-${sectionKey}`}
      headerRef={ref}
      headerProps={{
        tabIndex,
        onFocus: () => nav.setActiveKey(sectionKey),
        onKeyDown,
      }}
      labelProps={{ "data-vault-section": title.toLowerCase() }}
      data-vault-section-header
    >
      {children}
    </RailSection>
  );
}

/** A neutral fallback category for a doc type with no bound category color. */
const NEUTRAL_FOLDER_CATEGORY: Category = "code";

function folderCategory(docType: string): Category {
  return docTypeCategory(docType) ?? NEUTRAL_FOLDER_CATEGORY;
}

/** The feature's member document node ids — the `doc:<stem>` ids the rail holds in
 *  its tree slice — for the follow-mode `frame-nodes` camera (Issue #13). */
function featureMemberNodeIds(group: VaultTreeFeatureGroup): string[] {
  return group.docTypes.flatMap((sub) =>
    sub.entries.map((entry) => pathToNodeId(entry.path)),
  );
}

// --- the feature folder row (Features section, level 1 → category sub-folders) -----

interface FeatureFolderRowProps {
  group: VaultTreeFeatureGroup;
  expanded: ReadonlySet<string>;
  toggle: (key: string) => void;
  scope: string | null;
  highlight: string | null;
  onClick: (entry: VaultTreeEntry) => void;
  onOpen: (entry: VaultTreeEntry) => void;
  nav: RowNav;
}

/** A feature folder: leads with the plan mark in the feature color, expands to one
 *  category sub-folder per doc type present (each itself expanding to documents). */
function FeatureFolderRow({
  group,
  expanded,
  toggle,
  scope,
  highlight,
  onClick,
  onOpen,
  nav,
}: FeatureFolderRowProps) {
  const folderKey = `feat:${group.feature}`;
  const open = deriveBrowserTreeExpansionItem(folderKey, expanded).expanded;
  return (
    <VaultTreeRow
      navKey={folderKey}
      level={1}
      label={featureDisplayName(group.feature)}
      markKind="plan"
      markColor="feature"
      expandable
      expanded={open}
      count={group.count}
      bodyId={`vault-${folderKey}`}
      onActivate={() => {
        toggle(folderKey);
        // Follow-mode FORWARD half (rail feature -> graph, follow-mode-selection-sync /
        // Issue #13): selecting a feature row selects the feature and rings + frames its
        // member nodes on the graph. The seam is follow-gated (no-op when off) and reaches
        // the scene through the registered runSceneCommand bridge (the rail never imports
        // the scene); the outer check just avoids the work when follow mode is off.
        if (followModeEnabled()) {
          void selectFeatureAndFrame(
            featureNodeIdFromTag(group.feature),
            featureMemberNodeIds(group),
            scope,
          );
        }
      }}
      folderMarker
      nav={nav}
      body={group.docTypes.map((sub) => (
        <CategoryFolderRow
          key={sub.docType}
          folderKey={`featcat:${group.feature}:${sub.docType}`}
          docType={sub.docType}
          count={sub.entries.length}
          entries={sub.entries}
          level={2}
          expanded={expanded}
          toggle={toggle}
          scope={scope}
          highlight={highlight}
          onClick={onClick}
          onOpen={onOpen}
          nav={nav}
        />
      ))}
    />
  );
}

// --- the category folder row (Features sub-folder AND Documents category) ---------

interface CategoryFolderRowProps {
  folderKey: string;
  docType: string;
  count: number;
  entries: VaultTreeEntry[];
  /** Tree level: 1 = Documents-section category folder, 2 = Features sub-folder. */
  level: number;
  expanded: ReadonlySet<string>;
  toggle: (key: string) => void;
  scope: string | null;
  highlight: string | null;
  onClick: (entry: VaultTreeEntry) => void;
  onOpen: (entry: VaultTreeEntry) => void;
  nav: RowNav;
}

/** A category folder: leads with the doc-type's category mark, expands to its
 *  document leaves. Used in BOTH sections for visual parity (ADR D4). Its documents
 *  sit one level deeper. */
function CategoryFolderRow({
  folderKey,
  docType,
  count,
  entries,
  level,
  expanded,
  toggle,
  scope,
  highlight,
  onClick,
  onOpen,
  nav,
}: CategoryFolderRowProps) {
  const open = deriveBrowserTreeExpansionItem(folderKey, expanded).expanded;
  return (
    <VaultTreeRow
      navKey={folderKey}
      level={level}
      label={docGroupLabel(docType)}
      markKind={docType}
      markColor={folderCategory(docType)}
      expandable
      expanded={open}
      count={count}
      bodyId={`vault-${folderKey}`}
      onActivate={() => toggle(folderKey)}
      folderMarker={level === 1}
      nav={nav}
      body={
        <ul className="flex flex-col gap-fg-1 py-fg-1">
          {entries.map((entry) => (
            <DocumentRow
              key={entry.path}
              navKey={`${folderKey}:doc:${entry.path}`}
              entry={entry}
              docType={docType}
              level={level + 1}
              highlighted={entry.path === highlight}
              scope={scope}
              onClick={() => onClick(entry)}
              onOpen={() => onOpen(entry)}
              nav={nav}
            />
          ))}
        </ul>
      }
    />
  );
}

// --- the document leaf (the SAME row shell, no chevron, neutral icon) -------------

interface DocumentRowProps {
  navKey: string;
  entry: VaultTreeEntry;
  docType: string;
  level: number;
  highlighted: boolean;
  scope: string | null;
  onClick: () => void;
  onOpen: () => void;
  nav: RowNav;
}

/** One document leaf. Renders through the SAME `VaultTreeRow` shell as every folder
 *  — fully rounded, same selection — with an aligned spacer in place of the chevron,
 *  the doc-type mark in QUIET neutral ink (color is a top-level signal), the human
 *  title, and the modified date as trailing meta. Selection is the rounded accent
 *  tint + accent label, identical to any other selected row. */
function DocumentRow({
  navKey,
  entry,
  docType,
  level,
  highlighted,
  scope,
  onClick,
  onOpen,
  nav,
}: DocumentRowProps) {
  return (
    <VaultTreeRow
      navKey={navKey}
      level={level}
      label={docDisplayTitle(entry.path)}
      markKind={docType}
      expandable={false}
      meta={docDateLabel(entry.dates.modified)}
      highlighted={highlighted}
      onActivate={onClick}
      onOpen={onOpen}
      entity={vaultDocEntity(entry, scope)}
      nav={nav}
    />
  );
}
