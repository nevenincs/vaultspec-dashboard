// Read-only, lazy directory browser for the active worktree. Each directory
// loads one level on expansion, while filtering narrows only visible entries.

import { File, Folder, type Icon } from "@phosphor-icons/react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Button, Skeleton, SkeletonRow, StateBlock } from "../kit";

import type { CodeFileEntity } from "../../platform/actions/entity";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import type { FileTreeEntry, FileTreeTruncated } from "../../stores/server/engine";
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
import { guardedContextMenu } from "../menus/guardedContextMenu";
import { RowMenuDisclosure } from "../chrome/RowMenuDisclosure";
import { useFocusZone, type FocusZoneItemProps } from "../chrome/useFocusZone";
import {
  useDashboardBrowserSelection,
  useHighlightedCodePath,
} from "./browserSelection";
import { RailMessage, RailSkeleton } from "./railStates";
// Importing the menu registers the code-file context actions once.
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

// Folder and file marks remain distinguishable by shape without relying on color.
const DIR_MARK: Icon = Folder;
const FILE_MARK: Icon = File;

/** Return the semantic mark for a row kind. */
export function rowMark(kind: FileTreeEntry["kind"]): Icon {
  return kind === "dir" ? DIR_MARK : FILE_MARK;
}

export function rowMarkName(kind: FileTreeEntry["kind"]): string {
  const mark = rowMark(kind);
  return mark.displayName ?? mark.name ?? (kind === "dir" ? "Folder" : "File");
}

// Disclosure chevrons are smaller than the folder and file marks.
const ROW_MARK_PX = 14;
const CHEVRON_PX = 12;

const CODE_TREE_NAV_CLASS = "text-label";
const CODE_TREE_TRUNCATION_CLASS = "px-fg-1 py-fg-0-5 text-caption text-ink-faint";

export const CODE_TREE_MESSAGES = {
  browser: { key: "documents:codeTree.accessibility.browser" },
  childLoading: { key: "documents:codeTree.states.childLoading" },
  childUnavailable: { key: "documents:codeTree.errors.childUnavailable" },
  degraded: { key: "documents:codeTree.states.degraded" },
  empty: { key: "documents:codeTree.states.empty" },
  linkedToMap: { key: "documents:codeTree.accessibility.linkedToMap" },
  loading: { key: "documents:codeTree.states.loading" },
  retry: { key: "common:actions.retry" },
  truncatedUnknown: { key: "documents:codeTree.states.truncatedUnknown" },
  unavailable: { key: "documents:codeTree.errors.unavailable" },
} as const satisfies Record<string, MessageDescriptor>;

export function codeTreeRowActionsMessage(name: string): MessageDescriptor {
  return { key: "common:accessibility.actionsForItem", values: { item: name } };
}

export function codeTreeTruncationMessage(
  truncated: FileTreeTruncated,
): MessageDescriptor {
  const shown = truncated.returned_children;
  const total = truncated.total_children;
  if (
    !Number.isSafeInteger(shown) ||
    !Number.isSafeInteger(total) ||
    shown < 0 ||
    total < shown
  ) {
    return CODE_TREE_MESSAGES.truncatedUnknown;
  }
  return {
    key: "documents:codeTree.states.truncated",
    values: { shown, total },
  };
}

export interface CodeTreeProps {
  /**
   * Optional row click handler. A host may override it for an embedding context; absent, a file row
   * focuses its `code:` node on the stage.
   */
  onEntryClick?: (entry: FileTreeEntry) => void;
  /**
   * The set of `code:<path>` node ids that currently have a graph node, for the
   * quiet right-aligned linkage marker. A file absent from this set has no
   * marker. It remains listed and selectable.
   * Absent/empty (the default) means "no linkage known yet": every file reads as
   * the absent state, which is the honest baseline until the host supplies the set.
   */
  linkedNodeIds?: ReadonlySet<string>;
  /**
   * A local narrowing of the visible, already-fetched tree. A row matches when its path
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
  const resolveMessage = useLocalizedMessageResolver();
  const message = (descriptor: MessageDescriptor) => resolveMessage(descriptor).message;
  const scope = useActiveScope();
  const rootSurface = useFileTreeRootSurface(scope);
  const { rootLevel, state } = rootSurface;
  const dashboardSelection = useDashboardBrowserSelection(scope);
  const clickHandler = onEntryClick ?? dashboardSelection.handleCodeEntryClick;
  const { expanded, activeKey, toggle, setActiveKey } = useBrowserTreeExpansion(
    scope,
    "code",
  );
  // The tree is one tab stop. Arrow, Home, and End keys move between rows;
  // horizontal arrows expand and collapse directories.
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
    // Use the shared rail skeleton while the root loads.
    return <RailSkeleton label={message(CODE_TREE_MESSAGES.loading)} />;
  }

  if (state === "error") {
    // Unexpected read failures remain contained and offer a retry.
    return (
      <div data-code-error>
        <StateBlock
          mode="degraded"
          layout="block"
          message={message(CODE_TREE_MESSAGES.unavailable)}
        />
        <div className="flex justify-center px-fg-3 pb-fg-6">
          <Button variant="ghost" onClick={rootLevel.retry}>
            {message(CODE_TREE_MESSAGES.retry)}
          </Button>
        </div>
      </div>
    );
  }

  // Capability loss remains distinct from an empty directory.
  if (state === "degraded") {
    // The shared degraded state contains no diagnostic detail.
    return <RailMessage tone="degraded" label={message(CODE_TREE_MESSAGES.degraded)} />;
  }

  const entries = rootLevel.entries;

  if (entries.length === 0) {
    // Use the shared empty state.
    return <RailMessage tone="empty" label={message(CODE_TREE_MESSAGES.empty)} />;
  }

  return (
    <nav
      className={CODE_TREE_NAV_CLASS}
      aria-label={message(CODE_TREE_MESSAGES.browser)}
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
      {rootLevel.truncated && (
        <TruncatedNote
          message={message(codeTreeTruncationMessage(rootLevel.truncated))}
          className={CODE_TREE_TRUNCATION_CLASS}
        />
      )}
    </nav>
  );
}

/** The localized bounded-result note for a capped level. */
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
 * folder mark) that fetches and renders its children on first expansion; a
 * file is a leaf that joins selection to its `code:` node. The whole subtree is
 * built recursively, one level per `useFileTreeLevel` call.
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
  const resolveMessage = useLocalizedMessageResolver();
  const message = (descriptor: MessageDescriptor) => resolveMessage(descriptor).message;
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
      <div className="flex items-center">
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
          onContextMenu={guardedContextMenu((e) => {
            e.preventDefault();
            openContextMenu(codeFileEntity(entry, scope), {
              x: e.clientX,
              y: e.clientY,
            });
          })}
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
              aria-label={message(CODE_TREE_MESSAGES.linkedToMap)}
              className={rowView.linkedCueClassName}
            />
          )}
        </button>
        {/* Coarse pointers receive the same context actions as right-click. */}
        <RowMenuDisclosure
          entity={codeFileEntity(entry, scope)}
          label={message(codeTreeRowActionsMessage(row.displayName))}
        />
      </div>

      {/* Child data mounts only after the directory expands. */}
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
 * liveness cue shows while the level is in flight; an empty
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
  const resolveMessage = useLocalizedMessageResolver();
  const message = (descriptor: MessageDescriptor) => resolveMessage(descriptor).message;
  const level = useFileTreeLevel(scope, path);

  if (level.state === "loading") {
    // Child loading uses an indented skeleton with an accessible label.
    return (
      <div style={fileTreeChildStatusStyle(depth)} data-code-level-loading>
        <Skeleton label={message(CODE_TREE_MESSAGES.childLoading)}>
          <SkeletonRow width="w-2/3" />
        </Skeleton>
      </div>
    );
  }

  if (level.state === "error") {
    // Child failures use the shared indented notice.
    return (
      <div
        className="space-y-fg-0-5"
        style={fileTreeChildStatusStyle(depth)}
        data-code-level-error
      >
        <StateBlock
          mode="degraded"
          layout="inline"
          message={message(CODE_TREE_MESSAGES.childUnavailable)}
        />
        <Button variant="ghost" onClick={level.retry}>
          {message(CODE_TREE_MESSAGES.retry)}
        </Button>
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
      {level.truncated && (
        <TruncatedNote
          message={message(codeTreeTruncationMessage(level.truncated))}
          className={CODE_TREE_TRUNCATION_CLASS}
        />
      )}
    </ul>
  );
}
