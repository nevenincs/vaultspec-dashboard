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
import { useTranslation } from "react-i18next";

import { ChevronDown, ChevronRight, Plus } from "lucide-react";

import { categoryColorVar, categoryToken, IconButton, type Category } from "../kit";
import { RailSection } from "../chrome/RailSection";
import { useFocusZone, type FocusZoneItemProps } from "../chrome/useFocusZone";
import { DocTypeMark } from "../../scene/field/markComponents";
import { RailDegradedNotice, RailMessage, RailSkeleton } from "./railStates";
import type {
  VaultCategoryEntity,
  VaultDocEntity,
  VaultFeatureEntity,
  VaultSectionEntity,
} from "../../platform/actions/entity";
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
import {
  featureNodeIdFromTag,
  featureTagFromNodeId,
  normalizeFeatureTag,
} from "../../stores/server/liveAdapters";
import {
  followFeatureKeyForNode,
  selectFeature,
  useFollowMode,
} from "../../stores/view/selection";
import { useSelectionRevealTarget } from "../../stores/view/selectionReveal";
import {
  deriveAllVaultBrowserTreeKeys,
  deriveBrowserTreeExpansionItem,
  publishVaultBrowserTreeKeys,
  useBrowserTreeExpansion,
} from "../../stores/view/browserTreeExpansion";
import {
  LEFT_RAIL_COLLAPSE_TREE_ACTION_ID,
  LEFT_RAIL_EXPAND_TREE_ACTION_ID,
  collapseTreeAction,
  expandTreeAction,
  newDocumentAction,
} from "../../stores/view/leftRailKeybindings";
import { type RailSortKey, useRailSort } from "../../stores/view/railSort";
import { registerKeyAction } from "../../stores/view/keymapDispatcher";
import { openContextMenu } from "../../stores/view/contextMenu";
import { guardedContextMenu } from "../menus/guardedContextMenu";
import { useViewportClass } from "../../stores/view/viewportClass";
import { handleKeyboardContextMenu } from "../chrome/keyboardContextMenu";
import { RowMenuDisclosure } from "../chrome/RowMenuDisclosure";
import {
  formatBytes,
  formatDate,
  formatNumber,
  formatPercentage,
} from "../../platform/localization/formatters";
import {
  useActiveLocale,
  useLocalizedMessageResolver,
  type LocalizedMessageResolver,
} from "../../platform/localization/LocalizationProvider";
import type {
  AnyMessageDescriptor,
  MessageDescriptor,
} from "../../platform/localization/message";
import { createCountMessageDescriptor } from "../../platform/localization/message";
import { localizationNamespaces } from "../../platform/localization/runtime";
import {
  pathStem,
  pathToNodeId,
  useDashboardBrowserSelection,
  useHighlightedPath,
} from "./browserSelection";
// Self-registering left-rail context-menu resolvers: importing each module runs its
// `registerResolver(...)` side effect once. The tree contributes a resolver for EVERY
// row level — the document leaf (vault-doc), the feature folder (vault-feature), the
// category folder (vault-category), and the section header (vault-section) — so the
// whole rail opens a real menu, not just the leaves (context-menu-actions-are-layered).
import "./menus/vaultDocMenu";
import "./menus/vaultFeatureMenu";
import "./menus/vaultCategoryMenu";
import "./menus/vaultSectionMenu";
import {
  CHEVRON_PX,
  STATUS_MARK_PX,
  adrStatusMark,
  adrStatusToneClass,
  docDateTimestamp,
  docDisplayTitle,
  docGroupMessage,
  docTypeCategory,
  featureDisplayName,
  planStatus,
  planStatusMark,
  planStatusToneClass,
  planTierLabel,
} from "./vaultRowPresentation";

export const TREE_BROWSER_MESSAGES = {
  addDocumentToFeature: {
    key: "documents:accessibility.addDocumentToFeature",
  },
  degraded: { key: "documents:tree.degraded" },
  emptyWorktree: { key: "documents:tree.emptyWorktree" },
  features: { key: "features:labels.feature" },
  loading: { key: "documents:tree.loading" },
  noFilterMatches: { key: "documents:tree.noFilterMatches" },
  noFilterMatchesYet: { key: "documents:tree.noFilterMatchesYet" },
  partialAnnouncement: { key: "documents:tree.partialAnnouncement" },
  retry: { key: "common:actions.retry" },
  treeBrowser: { key: "documents:accessibility.treeBrowser" },
  unavailable: { key: "documents:tree.unavailable" },
  vaultBrowser: { key: "documents:tree.vaultBrowser" },
  documents: { key: "documents:browserModes.documents" },
} as const satisfies Record<string, MessageDescriptor>;

export function treePartialCountMessage(count: number): AnyMessageDescriptor {
  const descriptor = createCountMessageDescriptor("documents:tree.partialCount", count);
  if (descriptor === null) return TREE_BROWSER_MESSAGES.partialAnnouncement;
  return descriptor;
}

export function treeRowActionsMessage(item: string): MessageDescriptor {
  return {
    key: "common:accessibility.actionsForItem",
    values: { item },
  };
}

export function treePlanProgressMessage(
  done: number,
  total: number,
): MessageDescriptor | null {
  if (
    !Number.isSafeInteger(done) ||
    !Number.isSafeInteger(total) ||
    done < 0 ||
    total <= 0 ||
    done > total
  ) {
    return null;
  }
  return { key: "documents:tree.planProgress", values: { done, total } };
}

export function treeWordCountMessage(count: number): AnyMessageDescriptor | null {
  return createCountMessageDescriptor("documents:tree.wordCount", count);
}

export function treeSizeSummaryMessage(
  count: number,
  size: string,
): AnyMessageDescriptor | null {
  return createCountMessageDescriptor("documents:tree.sizeSummary", count, { size });
}

export function formatTreeWeight(
  locale: string,
  weightBytes: number,
  totalBytes: number,
  resolveMessage: LocalizedMessageResolver,
): string {
  if (
    !Number.isFinite(weightBytes) ||
    !Number.isFinite(totalBytes) ||
    weightBytes <= 0 ||
    totalBytes <= 0 ||
    weightBytes > totalBytes
  ) {
    return "";
  }
  const ratio = weightBytes / totalBytes;
  if (ratio < 0.01) {
    const threshold = formatPercentage(locale, 0.01, { maximumFractionDigits: 0 });
    return threshold
      ? resolveMessage({
          key: "documents:tree.weightBelowThreshold",
          values: { threshold },
        }).message
      : "";
  }
  return formatPercentage(locale, ratio, { maximumFractionDigits: 1 }) ?? "";
}

const PLAN_STATUS_MESSAGES = {
  complete: { key: "documents:accessibility.planComplete" },
  "in-progress": { key: "documents:accessibility.planInProgress" },
  "not-started": { key: "documents:accessibility.planNotStarted" },
} as const satisfies Record<ReturnType<typeof planStatus>, MessageDescriptor>;

const DECISION_STATUS_MESSAGES = {
  accepted: { key: "documents:accessibility.decisionAccepted" },
  deprecated: { key: "documents:accessibility.decisionDeprecated" },
  proposed: { key: "documents:accessibility.decisionProposed" },
  rejected: { key: "documents:accessibility.decisionRejected" },
  superseded: { key: "documents:accessibility.decisionSuperseded" },
} as const satisfies Record<string, MessageDescriptor>;

const DECISION_STATUS_LABEL_MESSAGES = {
  accepted: { key: "documents:tree.decisionStatusAccepted" },
  deprecated: { key: "documents:tree.decisionStatusDeprecated" },
  proposed: { key: "documents:tree.decisionStatusProposed" },
  rejected: { key: "documents:tree.decisionStatusRejected" },
  superseded: { key: "documents:tree.decisionStatusSuperseded" },
} as const satisfies Record<string, MessageDescriptor>;

export function treeDecisionStatusMessage(status: string): MessageDescriptor | null {
  return (
    DECISION_STATUS_MESSAGES[status as keyof typeof DECISION_STATUS_MESSAGES] ?? null
  );
}

export function treeDecisionStatusLabelMessage(
  status: string,
): MessageDescriptor | null {
  return (
    DECISION_STATUS_LABEL_MESSAGES[
      status as keyof typeof DECISION_STATUS_LABEL_MESSAGES
    ] ?? null
  );
}

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

// The vertical indent guide (left-rail-tree-controls ADR D5): every expanded
// folder body draws a hairline `bg-rule` line under its parent's CHEVRON COLUMN
// — the standard tree-view guide — absolutely positioned so it never shifts the
// rows' own absolute indentation. The chevron column is 0.75rem wide
// (CHEVRON_PX at the 16 basis), so its center sits half that — 0.375rem — into
// the parent's content box (rem only, no-hardcoded-px).
const GUIDE_CENTER_REM = 0.375;
function guideStyle(parentLevel: number): CSSProperties {
  return {
    insetInlineStart: `${INDENT_BASE_REM + parentLevel * INDENT_STEP_REM + GUIDE_CENTER_REM}rem`,
  };
}

/** The ONE row shell + selection treatment shared by EVERY tree level (feature,
 *  category folder, document leaf). Fully rounded (`rounded-fg-xs`) always; a
 *  highlighted row is filled with the accent tint over the whole rounded row — the
 *  binding Figma selected-row look. No left-edge bar, no half-rounded/straight edge:
 *  a leaf and a folder select identically. */
function rowClassName(highlighted: boolean): string {
  return `flex w-full select-text items-center gap-fg-1-5 rounded-fg-xs py-fg-1-5 pe-fg-2 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
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
  /** Semantic surface variant; its landmark label resolves from the catalog. */
  variant?: "tree" | "vault";
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

/** Build the vault-feature context-menu entity for a feature folder row. The feature
 *  resolves to its constellation node id (when present) so the menu can focus it. */
function vaultFeatureEntity(
  feature: string,
  scope: string | null,
  expanded: boolean,
): VaultFeatureEntity {
  return {
    kind: "vault-feature",
    id: `vault-feature:${feature}`,
    feature,
    scope,
    nodeId: featureNodeIdFromTag(feature),
    expansionKey: `feat:${feature}`,
    expanded,
  };
}

/** Build the vault-category context-menu entity for a category folder row. `feature`
 *  is the parent feature tag for a Features-section sub-folder, undefined for a
 *  top-level Documents-section category. `expansionKey` IS the folder's toggle key. */
function vaultCategoryEntity(
  expansionKey: string,
  docType: string,
  feature: string | undefined,
  scope: string | null,
  expanded: boolean,
): VaultCategoryEntity {
  return {
    kind: "vault-category",
    id: `vault-category:${expansionKey}`,
    docType,
    ...(feature ? { feature } : {}),
    scope,
    expansionKey,
    expanded,
  };
}

/** Build the vault-section context-menu entity for a section header. */
function vaultSectionEntity(
  section: "features" | "documents",
  scope: string | null,
): VaultSectionEntity {
  return { kind: "vault-section", id: `vault-section:${section}`, section, scope };
}

export function TreeBrowser({
  onEntryClick,
  onEntryOpen,
  highlightedPath,
  variant = "tree",
}: TreeBrowserProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const activeLocale = useActiveLocale();
  const scope = useActiveScope();
  const { tree, availability, state, complete } = useVaultTreeSurface(scope);
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
  // Every row — including the two top-level sections — starts COLLAPSED and the
  // user's open/closed choice PERSISTS across reloads (parity with the activity
  // rail's persisted folds; the store is persisted, the default seed is empty). A
  // fresh key is absent from the expanded set.
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
  // The canonically-selected FEATURE tag (feature-selection-global-state): when the one
  // shared selection is a `feature:<tag>` id, its rail folder row reads as SELECTED — the
  // same accent treatment a selected document leaf gets. Derived (de-hashed) from the ONE
  // global selection so the rail, the graph spotlight, and the inspector all agree. null
  // when a document/code node (or nothing) is selected.
  const selectedFeatureTag = featureTagFromNodeId(selectedNodeId);
  const nodeFeatureTags = useMemo(() => {
    const map = new Map<string, readonly string[]>();
    for (const entry of tree.data?.entries ?? []) {
      map.set(pathToNodeId(entry.path), entry.feature_tags);
    }
    return map;
  }, [tree.data?.entries]);
  // node id -> its doc-type, so a reveal can expand the DOCUMENTS-section ancestor path
  // (`sec:documents` + `type:<docType>`) that mounts the leaf independently of follow mode.
  const nodeDocType = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of tree.data?.entries ?? []) {
      map.set(pathToNodeId(entry.path), entry.doc_type);
    }
    return map;
  }, [tree.data?.entries]);
  // EVENT-gated on the selection CHANGING (cross-surface state review GSR-001): the
  // expand is a one-shot reaction to a NEW selection, consumed via ref. Without the
  // gate this effect re-asserted `expandAll` whenever ANY dependency identity changed
  // — `nodeFeatureTags` is rebuilt on every tree refetch (SSE vault edits) — so a
  // folder the user had just collapsed silently re-expanded ("expand/collapse double
  // fires"). Consumed only on a successful expand (a tag unknown while the tree is
  // still loading retries when the tags arrive); follow-off resets the gate so
  // re-enabling follow re-reveals the current selection once.
  const followExpandedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!followMode) {
      followExpandedForRef.current = null;
      return;
    }
    if (selectedNodeId === null || followExpandedForRef.current === selectedNodeId) {
      return;
    }
    const tag = followFeatureKeyForNode(
      selectedNodeId,
      nodeFeatureTags.get(selectedNodeId),
    );
    if (tag === null) return;
    followExpandedForRef.current = selectedNodeId;
    expandAll(["sec:features", `feat:${tag}`]);
    setActiveKey(`feat:${tag}`);
  }, [followMode, selectedNodeId, nodeFeatureTags, expandAll, setActiveKey]);
  // Reveal-on-selection scroll (GS-003): an OFF-CANVAS selection (rail row, search hit,
  // menu Open — activateEntity `frame:true`) requests a reveal; scroll the selected
  // document's row into view so it is not merely highlighted somewhere out of sight. An
  // ON-CANVAS click (`frame:false`) never requests one, so the rail never yanks under a
  // canvas click — the same gate the camera focus bounce uses. Independent of follow
  // mode: it expands the DOCUMENTS-section ancestor path (`sec:documents` + the doc's
  // `type:<docType>` folder) so the leaf mounts even when follow mode left it collapsed,
  // then scrolls the selected leaf (the sole `aria-current` row) into view on the next
  // frame (after the expand commits). scrollIntoView({block:"nearest"}) no-ops when the
  // row is already visible. Deduped on the request nonce, consumed up-front so re-expanding
  // an already-expanded path can never feed an effect loop (expandKeys mints a fresh set).
  const revealTarget = useSelectionRevealTarget();
  const rootRef = useRef<HTMLElement | null>(null);
  const consumedRevealNonce = useRef(0);
  useEffect(() => {
    if (revealTarget === null || revealTarget.nonce === consumedRevealNonce.current) {
      return;
    }
    // Reveal only the node the request targets AND that is now the current selection.
    if (revealTarget.nodeId !== selectedNodeId) return;
    consumedRevealNonce.current = revealTarget.nonce;
    const docType = nodeDocType.get(revealTarget.nodeId);
    if (docType) expandAll(["sec:documents", `type:${docType}`]);
    const raf = requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector('[aria-current="page"]')
        ?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(raf);
  }, [revealTarget, selectedNodeId, nodeDocType, expandAll]);
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

  // The rail view and its full collapsible-key set are derived once per entries/
  // facets change (memoized above the loading/error early returns so the hook order
  // is stable). The key set feeds two consumers: the in-component expand-all keymap
  // thunk (via `treeKeysRef`) and the section context-menu's "expand all" verb (via
  // the published store seam) — ONE derivation, two readers (no drift).
  // The ONE sort plane (left-rail-tree-controls ADR D3): the persisted view-local
  // value orders the whole tree through the one projection, and the leaf meta
  // shows THE SORTED FIELD's value so the visible number is the one being
  // sorted by (title-first truncation: the row carries exactly one meta value).
  const sort = useRailSort();
  const view = useMemo(
    () => deriveVaultRailView(tree.data?.entries ?? [], facets, sort, activeLocale),
    [tree.data?.entries, facets, sort, activeLocale],
  );
  const allTreeKeys = useMemo(
    () =>
      deriveAllVaultBrowserTreeKeys({
        features: view.featureGroups.map((group) => ({
          feature: group.feature,
          docTypes: group.docTypes.map((sub) => sub.docType),
        })),
        docTypes: view.docTypeGroups.map((group) => group.docType),
      }),
    [view],
  );
  treeKeysRef.current = allTreeKeys;
  useEffect(() => {
    publishVaultBrowserTreeKeys(scope, allTreeKeys);
  }, [scope, allTreeKeys]);

  if (state === "loading") {
    // LOADING mode (binding `LeftRail` State=Loading): the shared designed skeleton.
    return (
      <RailSkeleton label={resolveMessage(TREE_BROWSER_MESSAGES.loading).message} />
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
        <p className="text-label text-state-broken">
          {resolveMessage(TREE_BROWSER_MESSAGES.unavailable).message}
        </p>
        <button
          type="button"
          onClick={tree.retry}
          className="rounded-fg-xs text-label text-ink-muted underline-offset-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {resolveMessage(TREE_BROWSER_MESSAGES.retry).message}
        </button>
      </div>
    );
  }

  const empty = view.featureCount === 0 && view.docTypeCount === 0;

  return (
    <nav
      ref={rootRef}
      className="flex flex-col gap-fg-4 text-label"
      aria-label={
        resolveMessage(
          variant === "vault"
            ? TREE_BROWSER_MESSAGES.vaultBrowser
            : TREE_BROWSER_MESSAGES.treeBrowser,
        ).message
      }
      data-tree-browser={variant === "tree" ? "" : undefined}
      data-vault-browser={variant === "vault" ? "" : undefined}
    >
      {/* DEGRADED mode (binding `LeftRail` State=Degraded): the shared designed
          notice — an AlertTriangle and ONE plain sentence above whatever loaded.
          Never the raw tier reason. */}
      {availability.degraded && (
        <RailDegradedNotice
          label={resolveMessage(TREE_BROWSER_MESSAGES.degraded).message}
        />
      )}

      {/* PARTIAL listing (universal-data-loading ADR D5): the first pages are
          interactive while the drain continues in the background. Honest
          affordance — any filter/search over this prefix may be missing later
          matches; narrowing re-runs per render as pages land, so matches never
          silently vanish once the drain completes. */}
      {!complete && (
        <p className="px-fg-1 text-label text-ink-muted" data-tree-partial>
          {/* The live region announces only the STATIC sentence; the growing
              count is aria-hidden so per-page updates never queue repeated
              announcements (review nit: SR chattiness). */}
          <span role="status" className="sr-only">
            {resolveMessage(TREE_BROWSER_MESSAGES.partialAnnouncement).message}
          </span>
          <span aria-hidden>
            {
              resolveMessage(treePartialCountMessage(tree.data?.entries.length ?? 0))
                .message
            }
          </span>
        </p>
      )}

      {empty ? (
        <RailMessage
          tone="empty"
          label={
            view.filteredToNothing && complete
              ? resolveMessage(TREE_BROWSER_MESSAGES.noFilterMatches).message
              : view.filteredToNothing
                ? resolveMessage(TREE_BROWSER_MESSAGES.noFilterMatchesYet).message
                : resolveMessage(TREE_BROWSER_MESSAGES.emptyWorktree).message
          }
        />
      ) : (
        <>
          {/* FEATURES — feature → category sub-folders → documents (ADR D4). */}
          <Section
            title={resolveMessage(TREE_BROWSER_MESSAGES.features).message}
            count={view.featureCount}
            sectionKey="sec:features"
            entity={vaultSectionEntity("features", scope)}
            expanded={expanded}
            toggle={toggle}
            nav={rowNav}
            onCreate={() =>
              newDocumentAction(undefined, { focusFeature: true }).run?.()
            }
          >
            {view.featureGroups.map((group) => (
              <FeatureFolderRow
                key={group.feature}
                group={group}
                sortKey={sort.key}
                totalCorpusBytes={view.totalCorpusBytes}
                expanded={expanded}
                toggle={toggle}
                scope={scope}
                highlight={highlight}
                selectedFeatureTag={selectedFeatureTag}
                onClick={clickHandler}
                onOpen={openHandler}
                nav={rowNav}
              />
            ))}
          </Section>

          {/* DOCUMENTS — category folder → its documents (ADR D4). */}
          <Section
            title={resolveMessage(TREE_BROWSER_MESSAGES.documents).message}
            count={view.docTypeCount}
            sectionKey="sec:documents"
            entity={vaultSectionEntity("documents", scope)}
            expanded={expanded}
            toggle={toggle}
            nav={rowNav}
          >
            {view.docTypeGroups.map((group: VaultDocTypeGroup) => (
              <CategoryFolderRow
                key={group.docType}
                folderKey={`type:${group.docType}`}
                sortKey={sort.key}
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
  /** Trailing meta text (a document's date / weight cluster). */
  meta?: string;
  /** Compact (touch) second meta line: the authored date + the plain-language
   *  review-status WORD (ADR acceptance / plan progress), rendered UNDER the title
   *  instead of the desktop trailing one-value + shape-mark (mobile-enrichment ADR
   *  D2). Leaf rows only, compact viewport only; desktop stays single-line and its
   *  one-meta-value + hover-tooltip law is untouched. */
  subMeta?: ReactNode;
  /** A leaf's review-state signal (plan progress pip, ADR status token),
   *  rendered just before the trailing meta (left-rail-tree-controls ADR D1). */
  signal?: ReactNode;
  /** Full-metadata tooltip; falls back to the entity path / label. */
  tooltip?: string;
  /** Whether this row is the selected document (leaf). */
  highlighted?: boolean;
  /** `aria-controls` target id for an expandable row's body. */
  bodyId?: string;
  /** Activate: toggle (folder) or select (leaf). */
  onActivate: () => void;
  /** Open in the reader (leaf: double-click / Enter). */
  onOpen?: () => void;
  /** Context-menu entity for the row: a document leaf (vault-doc), a feature folder
   *  (vault-feature), or a category folder (vault-category). Section headers wire
   *  their own menu in `Section`, not through this shell. */
  entity?: VaultDocEntity | VaultFeatureEntity | VaultCategoryEntity;
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
  subMeta,
  signal,
  tooltip,
  highlighted = false,
  bodyId,
  onActivate,
  onOpen,
  entity,
  folderMarker,
  nav,
  body,
}: VaultTreeRowProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const { i18n } = useTranslation(localizationNamespaces, { useSuspense: false });
  const locale = i18n.resolvedLanguage ?? i18n.language;
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
      title={tooltip ?? (entity && "path" in entity ? entity.path : undefined) ?? label}
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
          ? guardedContextMenu((e) => {
              e.preventDefault();
              openContextMenu(entity, { x: e.clientX, y: e.clientY });
            })
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
      {subMeta ? (
        // Compact leaf (mobile-enrichment ADR D2): title over an inline meta line —
        // authored date + plain-language status word — so the review state and date
        // read WITHOUT a hover tooltip on touch.
        <span className="flex min-w-0 flex-1 flex-col gap-fg-0-5">
          <span
            className={`truncate text-body ${highlighted ? "text-accent-text" : "text-ink"}`}
          >
            {label}
          </span>
          <span className="flex items-center gap-fg-1-5 truncate text-meta">
            {subMeta}
          </span>
        </span>
      ) : (
        <span
          className={`min-w-0 flex-1 truncate text-body ${
            highlighted ? "text-accent-text" : "text-ink"
          }`}
        >
          {label}
        </span>
      )}
      {count !== undefined && formatNumber(locale, count) !== null && (
        <span className="shrink-0 text-meta text-ink-muted" data-tabular>
          {formatNumber(locale, count)}
        </span>
      )}
      {signal}
      {meta && (
        <span className="shrink-0 text-meta text-ink-muted" data-tabular>
          {meta}
        </span>
      )}
    </button>
  );

  if (!expandable) {
    // Leaf row + the coarse-pointer menu entry (touch-selectability ADR D3):
    // long-press is the selection gesture, so the row's resolver menu gets a
    // deliberate tap target; renders nothing on fine-pointer devices.
    return (
      <li className="flex items-center">
        {button}
        {entity && (
          <RowMenuDisclosure
            entity={entity}
            label={resolveMessage(treeRowActionsMessage(label)).message}
          />
        )}
      </li>
    );
  }
  return (
    <>
      {/* Folder row + the coarse-pointer menu entry (touch-selectability ADR D3):
          a deliberate tap target for the vault-feature/vault-category menu,
          sibling of the button (never nested inside it); the button stays a
          DIRECT child of the `data-vault-folder` marker (existing selector
          contract). */}
      <div
        data-vault-folder={folderMarker ? "" : undefined}
        className="flex items-center"
      >
        {button}
        {entity && (
          <RowMenuDisclosure
            entity={entity}
            label={resolveMessage(treeRowActionsMessage(label)).message}
          />
        )}
      </div>
      {expanded && (
        <div id={bodyId} data-vault-folder-body className="relative">
          {/* the indent guide: a quiet rule under this folder's chevron column
              (ADR D5) — presentation only, never a layout shift. */}
          <span
            aria-hidden
            data-tree-guide
            className="pointer-events-none absolute inset-y-0 w-px bg-rule"
            style={guideStyle(level)}
          />
          {body}
        </div>
      )}
    </>
  );
}

// --- the section header (binding `LeftRail` SectionHeader 666:2158) ---------------

interface SectionProps {
  title: string;
  count: number;
  sectionKey: string;
  /** The section context-menu entity (expand-all / collapse-all / new document). */
  entity: VaultSectionEntity;
  expanded: ReadonlySet<string>;
  toggle: (key: string) => void;
  nav: RowNav;
  /** When set, the header gains a scoped create affordance (the Features-section
   *  Plus, authoring-surface ADR D5/D6) — a visible sibling of the menu disclosure
   *  that opens the create dialog focused on the feature field. */
  onCreate?: () => void;
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
  entity,
  expanded,
  toggle,
  nav,
  onCreate,
  children,
}: SectionProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const { i18n } = useTranslation(localizationNamespaces, { useSuspense: false });
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const open = deriveBrowserTreeExpansionItem(sectionKey, expanded).expanded;
  const { ref, tabIndex, onKeyDown } = nav.rove(sectionKey, {
    onArrowRight: open ? undefined : () => toggle(sectionKey),
    onArrowLeft: open ? () => toggle(sectionKey) : undefined,
  });
  return (
    <RailSection
      title={title}
      count={formatNumber(locale, count) ?? undefined}
      open={open}
      onToggle={() => toggle(sectionKey)}
      bodyId={`vault-${sectionKey}`}
      headerRef={ref}
      headerProps={{
        tabIndex,
        onFocus: () => nav.setActiveKey(sectionKey),
        // The section header opens its own menu (expand/collapse-all + new doc) on
        // right-click and on the ContextMenu/Shift+F10 keys; the roving keydown runs
        // only when those keyboard entry points did not consume the event.
        onContextMenu: guardedContextMenu((e) => {
          e.preventDefault();
          openContextMenu(entity, { x: e.clientX, y: e.clientY });
        }),
        onKeyDown: (e) => {
          if (
            handleKeyboardContextMenu(e, (anchor) => openContextMenu(entity, anchor))
          ) {
            return;
          }
          onKeyDown(e);
        },
      }}
      labelProps={{ "data-vault-section": sectionKey.slice("sec:".length) }}
      // The section header's own coarse-pointer menu entry (touch-selectability
      // ADR D3): a deliberate tap target for the vault-section (expand/collapse-
      // all + new doc) menu, sibling of the header button. The Features section
      // additionally gains a scoped, always-visible create Plus (D5/D6) — also a
      // sibling, so neither trailing control toggles the fold.
      headerTrailingSibling={
        <>
          {onCreate && (
            <IconButton
              label={resolveMessage(TREE_BROWSER_MESSAGES.addDocumentToFeature).message}
              data-new-feature-document
              onClick={(event) => {
                event.stopPropagation();
                onCreate();
              }}
            >
              <Plus size={14} aria-hidden />
            </IconButton>
          )}
          <RowMenuDisclosure
            entity={entity}
            label={resolveMessage(treeRowActionsMessage(title)).message}
          />
        </>
      }
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

// --- the feature folder row (Features section, level 1 → category sub-folders) -----

interface FeatureFolderRowProps {
  group: VaultTreeFeatureGroup;
  /** The active sort key — the leaf meta shows its field's value. */
  sortKey: RailSortKey;
  /** Whole-vault served byte weight (the corpus-weight share denominator). */
  totalCorpusBytes: number;
  expanded: ReadonlySet<string>;
  toggle: (key: string) => void;
  scope: string | null;
  highlight: string | null;
  /** The canonically-selected feature tag (de-hashed), or null. This row reads as
   *  SELECTED when it matches. */
  selectedFeatureTag: string | null;
  onClick: (entry: VaultTreeEntry) => void;
  onOpen: (entry: VaultTreeEntry) => void;
  nav: RowNav;
}

/** A feature folder: leads with the plan mark in the feature color, expands to one
 *  category sub-folder per doc type present (each itself expanding to documents). */
function FeatureFolderRow({
  group,
  sortKey,
  totalCorpusBytes,
  expanded,
  toggle,
  scope,
  highlight,
  selectedFeatureTag,
  onClick,
  onOpen,
  nav,
}: FeatureFolderRowProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const { i18n } = useTranslation(localizationNamespaces, { useSuspense: false });
  const locale = i18n.resolvedLanguage ?? i18n.language;
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
      // Under the corpus-weight sort the folder shows ITS SORTED VALUE — the
      // normalized share of the whole vault — in place of the member count
      // (one trailing value per row).
      count={sortKey === "weight" ? undefined : group.count}
      meta={
        sortKey === "weight"
          ? formatTreeWeight(
              locale,
              group.weightBytes,
              totalCorpusBytes,
              resolveMessage,
            ) || undefined
          : undefined
      }
      highlighted={normalizeFeatureTag(group.feature) === selectedFeatureTag}
      bodyId={`vault-${folderKey}`}
      onActivate={() => {
        toggle(folderKey);
        // FORWARD half (rail feature -> graph): selecting a feature row writes the ONE
        // canonical selection `selected_ids = [feature:<tag>]` (feature-selection-global-
        // state). That global state drives EVERY surface — this row's accent highlight, the
        // graph's durable cluster spotlight (and follow-gated camera frame), the inspector —
        // and survives data refreshes because the spotlight is re-derived from it. Always
        // writes the selection (it is the global authority); follow mode only gates the
        // camera frame in the scene projection.
        void selectFeature(group.feature, scope);
      }}
      folderMarker
      entity={vaultFeatureEntity(group.feature, scope, open)}
      nav={nav}
      body={group.docTypes.map((sub) => (
        <CategoryFolderRow
          key={sub.docType}
          folderKey={`featcat:${group.feature}:${sub.docType}`}
          sortKey={sortKey}
          docType={sub.docType}
          feature={group.feature}
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
  /** The active sort key — the leaf meta shows its field's value. */
  sortKey: RailSortKey;
  docType: string;
  /** The parent feature tag for a Features-section sub-folder; absent for a
   *  top-level Documents-section category folder. Threads into the context-menu
   *  entity so "New document…" pre-fills the feature for a sub-folder. */
  feature?: string;
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
  sortKey,
  docType,
  feature,
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
  const resolveMessage = useLocalizedMessageResolver();
  const open = deriveBrowserTreeExpansionItem(folderKey, expanded).expanded;
  return (
    <VaultTreeRow
      navKey={folderKey}
      level={level}
      label={resolveMessage(docGroupMessage(docType)).message}
      markKind={docType}
      markColor={folderCategory(docType)}
      expandable
      expanded={open}
      count={count}
      bodyId={`vault-${folderKey}`}
      onActivate={() => toggle(folderKey)}
      folderMarker={level === 1}
      entity={vaultCategoryEntity(folderKey, docType, feature, scope, open)}
      nav={nav}
      body={
        <ul className="flex flex-col gap-fg-1 py-fg-1">
          {entries.map((entry) => (
            <DocumentRow
              key={entry.path}
              navKey={`${folderKey}:doc:${entry.path}`}
              sortKey={sortKey}
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
  /** The active sort key — the leaf meta shows its field's value. */
  sortKey: RailSortKey;
  entry: VaultTreeEntry;
  docType: string;
  level: number;
  highlighted: boolean;
  scope: string | null;
  onClick: () => void;
  onOpen: () => void;
  nav: RowNav;
}

function docSignal(
  entry: VaultTreeEntry,
  resolveMessage: LocalizedMessageResolver,
): ReactNode {
  if (entry.doc_type === "plan") {
    const progressMessage = entry.progress
      ? treePlanProgressMessage(entry.progress.done, entry.progress.total)
      : null;
    if (entry.progress && !progressMessage) return null;
    const status = planStatus(entry.progress);
    const Mark = planStatusMark(status);
    return (
      <span
        className={`flex shrink-0 items-center gap-fg-1 text-meta ${planStatusToneClass(status)}`}
        data-plan-status={status}
        aria-label={resolveMessage(PLAN_STATUS_MESSAGES[status]).message}
      >
        <Mark size={STATUS_MARK_PX} aria-hidden />
        {entry.progress && (
          <span data-tabular>{resolveMessage(progressMessage!).message}</span>
        )}
      </span>
    );
  }
  if (entry.doc_type === "adr" && entry.status) {
    const Mark = adrStatusMark(entry.status);
    const statusMessage = treeDecisionStatusMessage(entry.status);
    if (!Mark || !statusMessage) return null;
    return (
      <span
        className={`flex shrink-0 items-center ${adrStatusToneClass(entry.status)}`}
        data-adr-status={entry.status}
        role="img"
        aria-label={resolveMessage(statusMessage).message}
      >
        <Mark size={STATUS_MARK_PX} aria-hidden />
      </span>
    );
  }
  return null;
}

function docCompactSubMeta(
  entry: VaultTreeEntry,
  resolveMessage: LocalizedMessageResolver,
  locale: string,
): ReactNode | undefined {
  const date = formatTreeDate(
    locale,
    entry.dates.created ?? entry.dates.modified,
    "compact",
  );
  const pillClass = "shrink-0 rounded-fg-xs bg-paper-sunken px-fg-1";
  let status: ReactNode = null;
  if (entry.doc_type === "adr" && entry.status) {
    const statusMessage = treeDecisionStatusLabelMessage(entry.status);
    if (statusMessage && adrStatusMark(entry.status)) {
      status = (
        <span
          className={`${pillClass} ${adrStatusToneClass(entry.status)}`}
          data-adr-status={entry.status}
        >
          {resolveMessage(statusMessage).message}
        </span>
      );
    }
  } else if (entry.doc_type === "plan") {
    const planState = planStatus(entry.progress);
    const progressMessage = entry.progress
      ? treePlanProgressMessage(entry.progress.done, entry.progress.total)
      : null;
    const label = entry.progress
      ? progressMessage
        ? resolveMessage(progressMessage).message
        : null
      : resolveMessage(PLAN_STATUS_MESSAGES[planState]).message;
    if (!label) return date ? <span>{date}</span> : undefined;
    status = (
      <span
        className={`${pillClass} ${planStatusToneClass(planState)}`}
        data-plan-status={planState}
      >
        {label}
      </span>
    );
  }
  if (!date && !status) return undefined;
  return (
    <>
      {date && (
        <span className="shrink-0 text-ink-muted" data-doc-date>
          {date}
        </span>
      )}
      {status}
    </>
  );
}

function docMetaLabel(
  entry: VaultTreeEntry,
  sortKey: RailSortKey,
  resolveMessage: LocalizedMessageResolver,
  locale: string,
): string {
  if (sortKey === "size" && entry.size) {
    const message = treeWordCountMessage(entry.size.words);
    return message ? resolveMessage(message).message : "";
  }
  if (sortKey === "weight" && entry.size) {
    return formatBytes(locale, entry.size.bytes) ?? "";
  }
  if (
    (sortKey === "recency" || sortKey === "docs" || sortKey === "name") &&
    entry.doc_type === "plan" &&
    entry.progress
  ) {
    return "";
  }
  const date =
    sortKey === "modified"
      ? (entry.dates.modified ?? entry.dates.created)
      : (entry.dates.created ?? entry.dates.modified);
  return formatTreeDate(locale, date, "compact");
}

export function docTooltipLabel(
  entry: VaultTreeEntry,
  resolveMessage: LocalizedMessageResolver,
  locale: string,
): string {
  const lines = [entry.path];
  const dateMessages = [
    ["documents:tree.created", entry.dates.created],
    ["documents:tree.updated", entry.dates.stamped],
    ["documents:tree.lastEdited", entry.dates.modified],
  ] as const;
  for (const [key, rawDate] of dateMessages) {
    const date = formatTreeDate(locale, rawDate, "full");
    if (date) lines.push(resolveMessage({ key, values: { date } }).message);
  }
  if (entry.size) {
    const size = formatBytes(locale, entry.size.bytes);
    if (size) {
      const message = treeSizeSummaryMessage(entry.size.words, size);
      if (message) lines.push(resolveMessage(message).message);
    }
  }
  const tier = entry.tier ? planTierLabel(entry.tier) : "";
  if (tier) lines.push(tier);
  return lines.join("\n");
}

export function formatTreeDate(
  locale: string,
  iso: string | undefined,
  style: "compact" | "full",
): string {
  const timestamp = docDateTimestamp(iso);
  if (timestamp === null) return "";
  return (
    formatDate(locale, timestamp, {
      day: "numeric",
      month: "short",
      ...(style === "full" ? { year: "numeric" as const } : {}),
      timeZone: "UTC",
    }) ?? ""
  );
}

function DocumentRow({
  navKey,
  sortKey,
  entry,
  docType,
  level,
  highlighted,
  scope,
  onClick,
  onOpen,
  nav,
}: DocumentRowProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const { i18n } = useTranslation(localizationNamespaces, { useSuspense: false });
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const compact = useViewportClass() === "compact";
  return (
    <VaultTreeRow
      navKey={navKey}
      level={level}
      label={docDisplayTitle(entry.path, entry.title)}
      markKind={docType}
      expandable={false}
      signal={compact ? undefined : docSignal(entry, resolveMessage)}
      meta={compact ? undefined : docMetaLabel(entry, sortKey, resolveMessage, locale)}
      subMeta={compact ? docCompactSubMeta(entry, resolveMessage, locale) : undefined}
      tooltip={docTooltipLabel(entry, resolveMessage, locale)}
      highlighted={highlighted}
      onActivate={onClick}
      onOpen={onOpen}
      entity={vaultDocEntity(entry, scope)}
      nav={nav}
    />
  );
}
