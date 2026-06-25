// The codebase file browser (dashboard-code-tree ADR "The rail's code mode"): a
// read-only, lazy, collapsible DIRECTORY HIERARCHY over the active worktree,
// beside the vault browser. It consumes the `/file-tree` projection ONLY through
// stores hooks (`useFileTreeRootSurface` for the root, `useFileTreeLevel` for lazy
// child levels), reads degradation ONLY through a stores selector (never the raw
// `tiers` block), and joins selection on the contract's stable `code:<path>` node id — the same
// bidirectional join the vault browser realizes for `doc:<stem>`. It fetches
// nothing itself and defines no model (dashboard-layer-ownership): chrome over the
// one projection. The root surface state (loading / degraded / transport error)
// is classified by the stores selector, not recomputed in chrome.
//
// Two ADR-mandated deltas from the vault browser: the tree is a TRUE directory
// hierarchy (not doc-type grouping), and it is BOUNDED + LAZY — each directory
// fetches its children ONE level at a time on first expansion, cached per scope by
// the stores hook (the rail never requests the whole tree). The in-rail filter
// (left-rail IA ADR) narrows the visible, already-fetched tree client-side; it is
// not a wire search — global "find a file by meaning" is the `POST /search` pillar.
//
// The mode toggle that swaps this in for the vault browser is owned by the
// left-rail IA plan; this module exports the self-contained `CodeTree` component
// the IA host mounts behind that toggle.

import { File, Folder, type Icon } from "@phosphor-icons/react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Skeleton, SkeletonRow, StateBlock } from "../kit";

import type { CodeFileEntity } from "../../platform/actions/entity";
import type { FileTreeEntry } from "../../stores/server/engine";
import {
  useActiveScope,
  useFileTreeLevel,
  useFileTreeRootSurface,
  fileTreeChildStatusStyle,
  type FileTreeRowView,
} from "../../stores/server/queries";
import {
  deriveCodeBrowserTreeRowView,
  useBrowserTreeExpansion,
} from "../../stores/view/browserTreeExpansion";
import { openContextMenu } from "../../stores/view/contextMenu";
import { handleKeyboardContextMenu } from "../chrome/keyboardContextMenu";
import { useFocusZone, type FocusZoneItemProps } from "../chrome/useFocusZone";
import {
  useDashboardBrowserSelection,
  useHighlightedCodePath,
} from "./browserSelection";
import { RailMessage, RailSkeleton } from "./railStates";
// Self-registering left-rail context-menu resolver (W03.P07): importing the
// module runs its `registerResolver("code-file", …)` side effect once.
import "./menus/codeFileMenu";

/** Build the code-file context-menu entity from a tree row's data. A directory
 *  carries no graph node, so its `nodeId` is left undefined. */
function codeFileEntity(entry: FileTreeEntry, scope: string | null): CodeFileEntity {
  const isDir = entry.kind === "dir";
  return {
    kind: "code-file",
    id: entry.node_id,
    scope,
    path: entry.path,
    isDir,
    nodeId: isDir ? undefined : entry.node_id || undefined,
  };
}

// Domain marks (iconography ADR): Phosphor `Folder` / `File`, each grayscale-
// distinct by SHAPE at 14px (an open container vs a dog-eared page). They read in
// `currentColor` and inherit the rail's dimmed ink, so hue is never the identity
// channel — the same grayscale-by-shape discipline the vault doc-type marks pass.
const DIR_MARK: Icon = Folder;
const FILE_MARK: Icon = File;

/** The mark for a row by kind — exported so the unit test can assert grayscale-
 *  by-shape distinctness (two distinct Phosphor marks) without rendering React. */
export function rowMark(kind: FileTreeEntry["kind"]): Icon {
  return kind === "dir" ? DIR_MARK : FILE_MARK;
}

export function rowMarkName(kind: FileTreeEntry["kind"]): string {
  const mark = rowMark(kind);
  return mark.displayName ?? mark.name ?? (kind === "dir" ? "Folder" : "File");
}

// --- icon sizing (token-aligned, matching the vault browser) ----------------------
// 14px is the iconography ADR's grayscale-by-shape gate size; the disclosure
// chevrons read one density step smaller so structural chrome stays attenuated
// relative to the domain marks.
const ROW_MARK_PX = 14;
const CHEVRON_PX = 12;

export interface CodeTreeProps {
  /**
   * Optional row click handler (defaults to the bidirectional code: selection
   * join). The IA host may override for an embedding context; absent, a file row
   * focuses its `code:` node on the stage.
   */
  onEntryClick?: (entry: FileTreeEntry) => void;
  /**
   * The set of `code:<path>` node ids that currently have a graph node, for the
   * quiet right-aligned linkage marker (ADR "The interlink"). A file whose
   * `node_id` is NOT in this set renders the quiet ABSENT-interlink state (no
   * marker) — it is still listed and selectable for navigation, never an error.
   * Absent/empty (the default) means "no linkage known yet": every file reads as
   * the absent state, which is the honest baseline until the host supplies the set.
   */
  linkedNodeIds?: ReadonlySet<string>;
  /**
   * In-rail filter (left-rail IA ADR): a client-side narrowing of the VISIBLE,
   * already-fetched tree — never a wire search. A row matches when its path
   * contains the (lowercased) query; a directory is kept when it or any visible
   * descendant matches. Empty/absent shows the full tree.
   */
  filter?: string;
}

/**
 * The code mode: the worktree root level, then lazily-expanded subdirectories.
 * Renders the rail's FOUR honest states (loading / empty / degraded / error) at
 * the root and a subordinate liveness cue per expanding directory.
 */
export function CodeTree({ onEntryClick, linkedNodeIds, filter }: CodeTreeProps) {
  const scope = useActiveScope();
  const rootSurface = useFileTreeRootSurface(scope);
  const { rootLevel, state, degradedMessage, browserLabel } = rootSurface;
  const dashboardSelection = useDashboardBrowserSelection(scope);
  const clickHandler = onEntryClick ?? dashboardSelection.handleCodeEntryClick;
  const { expanded, activeKey, toggle, setActiveKey } = useBrowserTreeExpansion(
    scope,
    "code",
  );
  // The whole file tree is ONE tab stop with arrow / Home / End roving through the
  // shared FocusZone primitive (keyboard-navigation W02.P05.S15), replacing the
  // prior bespoke render-time roving whose keyboard-target derivation left arrow
  // nav dead. A row's cross-axis ArrowRight / ArrowLeft maps to expand / collapse.
  const zone = useFocusZone({
    orientation: "vertical",
    wrap: false,
    activeKey,
    onActiveKeyChange: setActiveKey,
  });
  const expansion = { expanded, toggle };
  const navigation: CodeTreeNavigation = {
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
    // LOADING mode (binding `LeftRail` State=Loading): the shared designed skeleton,
    // identical to the Vault tree's — the rail's modes are ONE feature, not per-tab.
    return <RailSkeleton label={rootLevel.loadingMessage} />;
  }

  if (state === "error") {
    // Error: a genuine /file-tree failure — contained, region-scoped, with retry,
    // distinguished from degradation so the user can tell "this read failed" from
    // "a backend is down" (ADR "States"). A tiers-bearing failure (a backend tier
    // reported down) is degradation, not a transport error, so it falls through to
    // the designed degraded state below — only a tiers-less transport fault renders
    // this error state (degradation-is-read-from-tiers).
    return (
      <div
        className={rootSurface.errorRootClassName}
        role="status"
        aria-live="polite"
        data-code-error
      >
        <p className={rootSurface.errorTitleClassName}>{rootLevel.errorTitle}</p>
        <button
          type="button"
          onClick={rootLevel.retry}
          className={rootSurface.retryButtonClassName}
        >
          {rootLevel.retryLabel}
        </button>
      </div>
    );
  }

  // Degraded: a worktree-only capability with no working tree (a remote-ref
  // scope) or an absent structural tier renders as a DESIGNED degraded state
  // explaining the absence, distinct from empty; read through the stores
  // selector, never the raw tiers block (ADR "Structural-tier degradation").
  if (state === "degraded") {
    // DEGRADED mode (binding `LeftRail` State=Degraded): the shared designed state —
    // AlertTriangle + the clean view-model sentence, never a raw tier reason.
    return <RailMessage tone="degraded" label={degradedMessage} />;
  }

  const entries = rootLevel.entries;

  if (entries.length === 0) {
    // EMPTY mode (binding `LeftRail` State=Empty): the shared designed state.
    return <RailMessage tone="empty" label={rootLevel.emptyMessage} />;
  }

  return (
    <nav
      className={rootSurface.navClassName}
      aria-label={browserLabel}
      data-code-browser
    >
      <ul>
        {rootLevel.rows.map((row) => (
          <DirectoryRow
            key={row.entry.path}
            row={row}
            scope={scope}
            depth={0}
            clickHandler={clickHandler}
            linkedNodeIds={linkedNodeIds}
            filter={filter ?? ""}
            truncated={rootLevel.truncated}
            expansion={expansion}
            navigation={navigation}
          />
        ))}
      </ul>
      {/* Bounded-read honesty at the root level: a capped level reads as "more
          here", never a silent partial result (graph-queries-are-bounded). */}
      {rootLevel.truncationMessage && (
        <TruncatedNote
          message={rootLevel.truncationMessage}
          className={rootLevel.truncationClassName}
        />
      )}
    </nav>
  );
}

/** The "more here — expand a subdirectory" note for a capped level. */
function TruncatedNote({ message, className }: { message: string; className: string }) {
  return (
    <p className={className} role="status" data-code-truncated>
      {message}
    </p>
  );
}

interface RowProps {
  row: FileTreeRowView;
  scope: string | null;
  depth: number;
  clickHandler: (entry: FileTreeEntry) => void;
  linkedNodeIds?: ReadonlySet<string>;
  filter: string;
  truncated: { total_children: number } | null;
  expansion: { expanded: ReadonlySet<string>; toggle: (id: string) => void };
  navigation: CodeTreeNavigation;
}

interface CodeTreeNavigation {
  /** Register a row with the FocusZone: returns its ref, roving tabIndex, and the
   *  arrow/Home/End keydown handler. Cross-axis ArrowRight/ArrowLeft maps to
   *  expand/collapse via the opts. */
  rove: (
    key: string,
    opts?: { onArrowRight?: () => void; onArrowLeft?: () => void },
  ) => FocusZoneItemProps;
  setActiveKey: (key: string) => void;
}

/**
 * One row in the hierarchy. A directory is a disclosure (Lucide chevron + Phosphor
 * folder mark) that LAZILY fetches and renders its children on first expansion; a
 * file is a leaf that joins selection to its `code:` node. The whole subtree is
 * built recursively, one level per `useFileTreeLevel` call — the bounded, lazy grammar.
 */
function DirectoryRow({
  row,
  scope,
  depth,
  clickHandler,
  linkedNodeIds,
  filter,
  expansion,
  navigation,
}: RowProps) {
  const { entry } = row;
  const highlight = useHighlightedCodePath([entry], scope);
  const rowView = deriveCodeBrowserTreeRowView(entry, {
    depth,
    filter,
    highlightPath: highlight,
    expanded: expansion.expanded,
    linkedNodeIds,
    chevronPx: CHEVRON_PX,
  });

  if (!rowView.visible) {
    return null;
  }

  const {
    ref,
    tabIndex,
    onKeyDown: zoneKeyDown,
  } = navigation.rove(
    rowView.navKey,
    rowView.isDir
      ? {
          onArrowRight: rowView.expanded
            ? undefined
            : () => expansion.toggle(entry.path),
          onArrowLeft: rowView.expanded
            ? () => expansion.toggle(entry.path)
            : undefined,
        }
      : undefined,
  );
  const Mark = rowMark(entry.kind);

  return (
    <li>
      <button
        type="button"
        title={entry.path}
        aria-current={rowView.highlighted ? "page" : undefined}
        aria-expanded={rowView.isDir ? rowView.expanded : undefined}
        tabIndex={tabIndex}
        ref={ref}
        data-code-row
        data-code-dir={rowView.isDir ? "" : undefined}
        data-code-linked={rowView.linked ? "" : undefined}
        onFocus={() => navigation.setActiveKey(rowView.navKey)}
        onClick={() => {
          if (rowView.isDir) {
            expansion.toggle(entry.path);
          } else {
            clickHandler(entry);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(codeFileEntity(entry, scope), {
            x: e.clientX,
            y: e.clientY,
          });
        }}
        onKeyDown={(e) => {
          if (
            handleKeyboardContextMenu(e, (anchor) =>
              openContextMenu(codeFileEntity(entry, scope), anchor),
            )
          ) {
            return;
          }
          zoneKeyDown(e);
        }}
        style={rowView.rowStyle}
        className={rowView.rowClassName}
      >
        <DepthGuides depth={depth} />
        <span aria-hidden className={rowView.selectionCueClassName} />
        <span className={rowView.chevronClassName} aria-hidden>
          {rowView.isDir ? (
            rowView.expanded ? (
              <ChevronDown size={CHEVRON_PX} />
            ) : (
              <ChevronRight size={CHEVRON_PX} />
            )
          ) : (
            <span style={rowView.chevronSpacerStyle} />
          )}
        </span>
        <span className={rowView.markClassName}>
          <Mark size={ROW_MARK_PX} />
        </span>
        <span className={rowView.labelClassName}>{row.displayName}</span>
        {rowView.linked && (
          <span
            aria-label={rowView.linkedCueAriaLabel}
            className={rowView.linkedCueClassName}
          />
        )}
      </button>

      {/* Lazily-fetched children: mounted only once the directory is expanded, so
          its `useFileTreeLevel(scope, path)` selector fires on first expansion and is
          cached per scope thereafter — the one-level-per-call lazy grammar. */}
      {rowView.isDir && rowView.expanded && (
        <ChildLevel
          path={entry.path}
          scope={scope}
          depth={depth + 1}
          clickHandler={clickHandler}
          linkedNodeIds={linkedNodeIds}
          filter={filter}
          expansion={expansion}
          navigation={navigation}
        />
      )}
    </li>
  );
}

function DepthGuides({ depth }: { depth: number }) {
  if (depth <= 0) return null;
  return (
    <span
      aria-hidden
      className="relative h-full shrink-0"
      style={{ width: `${depth * 0.75}rem` }}
      data-code-depth-guides
      data-code-depth={depth}
    >
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          className="absolute top-[0.3125rem] bottom-[0.3125rem] w-px rounded-full bg-rule"
          style={{ left: `${i * 0.75 + 0.375}rem` }}
        />
      ))}
    </span>
  );
}

interface ChildLevelProps {
  path: string;
  scope: string | null;
  depth: number;
  clickHandler: (entry: FileTreeEntry) => void;
  linkedNodeIds?: ReadonlySet<string>;
  filter: string;
  expansion: { expanded: ReadonlySet<string>; toggle: (id: string) => void };
  navigation: CodeTreeNavigation;
}

/**
 * One lazily-fetched directory level. Mounting this component IS the lazy fetch:
 * `useFileTreeLevel(scope, path, true)` fires for `path`'s children only when the
 * parent directory is expanded (this component is mounted). A subordinate
 * liveness cue shows while the level is in flight (no spinner theatre); an empty
 * level and a per-level read failure are handled subordinately, never crashing the
 * whole tree.
 */
function ChildLevel({
  path,
  scope,
  depth,
  clickHandler,
  linkedNodeIds,
  filter,
  expansion,
  navigation,
}: ChildLevelProps) {
  const level = useFileTreeLevel(scope, path);

  if (level.state === "loading") {
    // CHILD LOADING (state-mode-uniformity ADR D2/D4): a small inline skeleton,
    // indented to the level — no on-screen text; the message is the sr-only label.
    return (
      <div style={fileTreeChildStatusStyle(depth)} data-code-level-loading>
        <Skeleton label={level.childLoadingMessage}>
          <SkeletonRow width="w-2/3" />
        </Skeleton>
      </div>
    );
  }

  if (level.state === "error") {
    // CHILD ERROR (state-mode-uniformity ADR D3): the shared inline degraded notice —
    // shared glyph + one plain sentence, indented to the level.
    return (
      <div style={fileTreeChildStatusStyle(depth)} data-code-level-error>
        <StateBlock mode="degraded" layout="inline" message={level.childErrorMessage} />
      </div>
    );
  }

  if (level.state === "empty") return null;

  return (
    <ul>
      {level.rows.map((row) => (
        <DirectoryRow
          key={row.entry.path}
          row={row}
          scope={scope}
          depth={depth}
          clickHandler={clickHandler}
          linkedNodeIds={linkedNodeIds}
          filter={filter}
          truncated={level.truncated}
          expansion={expansion}
          navigation={navigation}
        />
      ))}
      {level.truncationMessage && (
        <TruncatedNote
          message={level.truncationMessage}
          className={level.truncationClassName}
        />
      )}
    </ul>
  );
}
