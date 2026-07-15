// Controlled project folder browser. The parent owns data and intent while this
// component renders selection, navigation, filtering, and keyboard behavior.

import { CaretRight, Folder as FolderMark } from "@phosphor-icons/react";
import type { MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";

import { useFocusZone } from "../chrome/useFocusZone";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import type { FsListEntry, FsListResponse } from "../../stores/server/engine";
import {
  Badge,
  Breadcrumb,
  SearchField,
  Skeleton,
  SkeletonRow,
  StateBlock,
  Switch,
} from "../kit";

const GLYPH_PX = 14;
const FOLDER_BROWSER_ENTRY_LIMIT = 256;

export type FolderBrowserBadge =
  | "already-added"
  | "project"
  | "git-repository"
  | "hidden";

export interface FolderBrowserRowView {
  /** Stable row key (the absolute path). */
  key: string;
  /** The filesystem-supplied folder name (data, not translatable copy). */
  label: string;
  path: string;
  /** De-emphasized dotfolder / OS-hidden row (served under the toggle). */
  isHidden: boolean;
  /** Already registered and therefore unavailable for selection or navigation. */
  isRegistered: boolean;
  badge: FolderBrowserBadge | null;
}

export interface FolderBrowserCrumbView {
  label: MessageDescriptor | string;
  /** Navigation target; null is the filesystem-roots level. */
  path: string | null;
}

export interface FolderBrowserView {
  state: "loading" | "error" | "ready";
  /** The trail to the listed directory, ending with the current location. */
  breadcrumbs: FolderBrowserCrumbView[];
  /** The listed directory's absolute path, or null at the roots level. */
  currentPath: string | null;
  /** The listed directory's display name (path basename), or null at roots. */
  currentName: string | null;
  rows: FolderBrowserRowView[];
  emptyMessage: MessageDescriptor | null;
  truncated: boolean;
}

export const FOLDER_BROWSER_MESSAGES = {
  filterFoldersAria: { key: "projects:folderBrowser.accessibility.filterFolders" },
  filterFoldersPlaceholder: { key: "projects:folderBrowser.labels.filterFolders" },
  folders: { key: "projects:folderBrowser.accessibility.folders" },
  hiddenToggle: { key: "projects:folderBrowser.labels.hidden" },
  loading: { key: "projects:folderBrowser.states.loading" },
  noMatches: { key: "projects:folderBrowser.empty.noMatches" },
  noSubfolders: { key: "projects:folderBrowser.empty.noSubfolders" },
  readFailed: { key: "projects:folderBrowser.errors.readFailed" },
  readFailedHint: { key: "projects:folderBrowser.errors.readFailedHint" },
  roots: { key: "projects:folderBrowser.labels.roots" },
  showHiddenFolders: {
    key: "projects:folderBrowser.accessibility.showHiddenFolders",
  },
} as const satisfies Record<string, MessageDescriptor>;

export function folderBrowserBadgeMessage(
  badge: FolderBrowserBadge | null,
): MessageDescriptor | null {
  switch (badge) {
    case "already-added":
      return { key: "projects:folderBrowser.badges.alreadyAdded" };
    case "project":
      return { key: "projects:folderBrowser.badges.project" };
    case "git-repository":
      return { key: "projects:folderBrowser.badges.gitRepository" };
    case "hidden":
      return { key: "projects:folderBrowser.badges.hidden" };
    default:
      return null;
  }
}

/** The row's accessible name: the folder name, qualified by its marker so a
 *  screen-reader hears what the visuals badge. A plain folder's name is
 *  filesystem data, not translatable copy, and passes through untouched. */
export function folderBrowserRowAriaMessage(
  row: FolderBrowserRowView,
): MessageDescriptor | null {
  const values = { folder: row.label };
  switch (row.badge) {
    case "already-added":
      return {
        key: "projects:folderBrowser.accessibility.folderOptionRegistered",
        values,
      };
    case "project":
      return {
        key: "projects:folderBrowser.accessibility.folderOptionProject",
        values,
      };
    case "git-repository":
      return {
        key: "projects:folderBrowser.accessibility.folderOptionGitRepository",
        values,
      };
    case "hidden":
      return {
        key: "projects:folderBrowser.accessibility.folderOptionHidden",
        values,
      };
    default:
      return null;
  }
}

export function folderBrowserTruncatedMessage(): MessageDescriptor {
  return {
    key: "projects:folderBrowser.states.truncated",
    values: { limit: FOLDER_BROWSER_ENTRY_LIMIT },
  };
}

function entryBadge(entry: FsListEntry): FolderBrowserBadge | null {
  if (entry.is_registered) return "already-added";
  if (entry.is_managed) return "project";
  if (entry.is_git) return "git-repository";
  if (entry.is_hidden) return "hidden";
  return null;
}

/** Derive the clickable trail from the served absolute path. Paths use forward
 *  slashes, so splitting is portable; a bare
 *  Windows drive segment ("Y:") navigates through its root form ("Y:/"). */
export function deriveBreadcrumbs(path: string | null): FolderBrowserCrumbView[] {
  const crumbs: FolderBrowserCrumbView[] = [
    { label: FOLDER_BROWSER_MESSAGES.roots, path: null },
  ];
  if (path === null) return crumbs;
  const segments = path.split("/").filter((segment) => segment.length > 0);
  let prefix = path.startsWith("//") ? "/" : path.startsWith("/") ? "" : null;
  for (const segment of segments) {
    prefix = prefix === null ? segment : `${prefix}/${segment}`;
    const target = /^[A-Za-z]:$/.test(prefix) ? `${prefix}/` : prefix;
    crumbs.push({ label: segment, path: target });
  }
  return crumbs;
}

/** Pure resolver: honest loading / error / ready states plus render-ready rows
 *  and the breadcrumb trail. `filtered` only chooses the empty-state copy. */
export function deriveFolderBrowserView(inputs: {
  data: FsListResponse | undefined;
  loading: boolean;
  errored: boolean;
  filtered: boolean;
}): FolderBrowserView {
  const { data, loading, errored, filtered } = inputs;
  if (loading || (data === undefined && !errored)) {
    return {
      state: "loading",
      breadcrumbs: deriveBreadcrumbs(null),
      currentPath: null,
      currentName: null,
      rows: [],
      emptyMessage: null,
      truncated: false,
    };
  }
  if (errored || data === undefined) {
    return {
      state: "error",
      breadcrumbs: deriveBreadcrumbs(null),
      currentPath: null,
      currentName: null,
      rows: [],
      emptyMessage: null,
      truncated: false,
    };
  }
  const path = data.path;
  const rows: FolderBrowserRowView[] = data.entries.map((entry) => ({
    key: entry.path,
    label: entry.name,
    path: entry.path,
    isHidden: entry.is_hidden,
    isRegistered: entry.is_registered,
    badge: entryBadge(entry),
  }));
  return {
    state: "ready",
    breadcrumbs: deriveBreadcrumbs(path),
    currentPath: path,
    currentName:
      path === null
        ? null
        : (path
            .split("/")
            .filter((segment) => segment.length > 0)
            .pop() ?? path),
    rows,
    emptyMessage:
      rows.length === 0
        ? filtered
          ? FOLDER_BROWSER_MESSAGES.noMatches
          : FOLDER_BROWSER_MESSAGES.noSubfolders
        : null,
    truncated: data.truncated,
  };
}

export interface FolderBrowserProps {
  view: FolderBrowserView;
  /** Held data remains visible during a level change but cannot be acted on. */
  inert?: boolean;
  /** The selected row's absolute path. */
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
  /** Navigate to a directory (null = the filesystem roots). */
  onNavigate: (path: string | null) => void;
  /** The current level filter draft. */
  query: string;
  onQueryChange: (query: string) => void;
  /** Whether hidden folders are shown. */
  showHidden: boolean;
  onShowHiddenChange: (show: boolean) => void;
  /** The navigation owner arms this ref for list gestures, breadcrumbs,
   *  shortcuts, and completed typed paths. The browser consumes it when the new
   *  level lands, refocusing the first row so keyboard focus never drops to
   *  `document.body` when the activated control unmounts. */
  focusIntent?: MutableRefObject<boolean>;
}

export function FolderBrowser({
  view,
  inert = false,
  selectedPath,
  onSelect,
  onNavigate,
  query,
  onQueryChange,
  showHidden,
  onShowHiddenChange,
  focusIntent,
}: FolderBrowserProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const message = (descriptor: MessageDescriptor) => resolveMessage(descriptor).message;
  const crumbLabel = (label: MessageDescriptor | string) =>
    typeof label === "string" ? label : message(label);

  // The listbox uses the shared focus zone. The row list is a single tab
  // stop, arrows/Home/End move the roving focus, and consumed keys stop
  // propagating so they never reach the global keymap dispatcher. Selection
  // follows the roving focus.
  const [activeRow, setActiveRow] = useState<string | null>(null);
  const roveTo = (key: string) => {
    setActiveRow(key);
    const row = view.rows.find((candidate) => candidate.path === key);
    if (row && !inert && !row.isRegistered) onSelect(row.path);
  };
  const zone = useFocusZone({
    orientation: "vertical",
    wrap: false,
    activeKey: activeRow,
    onActiveKeyChange: roveTo,
  });
  const { focusItem } = zone;

  const firstRowPath = view.rows[0]?.path ?? null;
  const currentPath = view.currentPath;
  // Re-seed the rove only when the LEVEL changes (filter/hidden re-renders of
  // the same level keep the operator's roving position; the zone tolerates a
  // filtered-away active key by falling back to the first row's tab stop).
  const seededLevel = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (seededLevel.current === currentPath) return;
    seededLevel.current = currentPath;
    setActiveRow(firstRowPath);
    // A landed navigation consumes the owner's focus intent. The
    // first row of the new level takes focus so the keyboard flow survives
    // the activated control (row, crumb, or place) unmounting.
    if (focusIntent?.current && firstRowPath !== null) {
      focusIntent.current = false;
      focusItem(firstRowPath);
    }
  }, [currentPath, firstRowPath, focusIntent, focusItem]);

  const navigateFromList = (path: string | null, registered = false) => {
    if (inert || registered) return;
    onSelect(null);
    onNavigate(path);
  };

  const parentCrumb =
    view.breadcrumbs.length > 1 ? view.breadcrumbs[view.breadcrumbs.length - 2] : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-folder-browser>
      <div className="flex shrink-0 items-center gap-fg-2 px-fg-3 pt-fg-2 pb-fg-1-5">
        <Breadcrumb
          className="min-w-0 flex-1"
          items={view.breadcrumbs.map((crumb, index) => ({
            label: crumbLabel(crumb.label),
            disabled: inert,
            onSelect:
              index === view.breadcrumbs.length - 1
                ? undefined
                : () => {
                    if (inert) return;
                    onSelect(null);
                    onNavigate(crumb.path);
                  },
          }))}
        />
      </div>
      <div className="flex shrink-0 items-center gap-fg-3 px-fg-3 pb-fg-2">
        <div className="min-w-0 flex-1">
          <SearchField
            value={query}
            disabled={inert}
            onChange={onQueryChange}
            onClear={() => onQueryChange("")}
            placeholder={message(FOLDER_BROWSER_MESSAGES.filterFoldersPlaceholder)}
            ariaLabel={message(FOLDER_BROWSER_MESSAGES.filterFoldersAria)}
          />
        </div>
        <label className="flex shrink-0 items-center gap-fg-1-5 text-meta text-ink-muted">
          {message(FOLDER_BROWSER_MESSAGES.hiddenToggle)}
          <Switch
            checked={showHidden}
            disabled={inert}
            onChange={onShowHiddenChange}
            label={message(FOLDER_BROWSER_MESSAGES.showHiddenFolders)}
          />
        </label>
      </div>
      <div
        role="listbox"
        aria-label={message(FOLDER_BROWSER_MESSAGES.folders)}
        className="min-h-0 flex-1 overflow-y-auto border-t border-rule px-fg-2 py-fg-1"
      >
        {view.state === "loading" && (
          <Skeleton label={message(FOLDER_BROWSER_MESSAGES.loading)} className="p-fg-2">
            <SkeletonRow width="w-2/3" />
            <SkeletonRow width="w-1/2" />
          </Skeleton>
        )}
        {view.state === "error" && (
          <div className="flex flex-col items-center gap-fg-1 py-fg-4">
            <StateBlock
              mode="degraded"
              layout="inline"
              message={message(FOLDER_BROWSER_MESSAGES.readFailed)}
            />
            <p className="text-caption text-ink-faint">
              {message(FOLDER_BROWSER_MESSAGES.readFailedHint)}
            </p>
          </div>
        )}
        {view.state === "ready" && view.emptyMessage !== null && (
          <StateBlock
            mode="empty"
            layout="inline"
            message={message(view.emptyMessage)}
          />
        )}
        {view.state === "ready" &&
          view.rows.map((row) => {
            const isSelected = selectedPath !== null && row.path === selectedPath;
            const ariaMessage = folderBrowserRowAriaMessage(row);
            const badgeMessage = folderBrowserBadgeMessage(row.badge);
            const badgeTone = row.badge === "project" ? "accent" : "neutral";
            const zoneProps = zone.rove(row.path, {
              // In the vertical zone, horizontal arrows navigate into a row or to its parent.
              onCrossNext: () => navigateFromList(row.path, row.isRegistered),
              onCrossPrev: () => {
                if (parentCrumb) navigateFromList(parentCrumb.path);
              },
            });
            return (
              <button
                key={row.key}
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-disabled={row.isRegistered || inert || undefined}
                disabled={inert}
                ref={zoneProps.ref}
                tabIndex={zoneProps.tabIndex}
                onKeyDown={(event) => {
                  // Enter/Backspace are activation keys the zone does not own;
                  // consumed here so they never reach the global dispatcher.
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    navigateFromList(row.path, row.isRegistered);
                    return;
                  }
                  if (event.key === "Backspace") {
                    event.preventDefault();
                    event.stopPropagation();
                    if (parentCrumb) navigateFromList(parentCrumb.path);
                    return;
                  }
                  zoneProps.onKeyDown(event);
                }}
                onFocus={() => setActiveRow(row.path)}
                onClick={() => {
                  if (!row.isRegistered) onSelect(row.path);
                }}
                onDoubleClick={() => navigateFromList(row.path, row.isRegistered)}
                aria-label={ariaMessage ? message(ariaMessage) : row.label}
                title={row.path}
                className={`flex w-full items-center gap-fg-2 rounded-fg-xs px-fg-2 py-fg-1-5 text-left text-label transition-colors duration-ui-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                  isSelected
                    ? "bg-accent-subtle text-ink"
                    : "text-ink hover:bg-paper-sunken"
                } ${row.isHidden || row.isRegistered ? "text-ink-faint" : ""}`}
              >
                <FolderMark
                  aria-hidden
                  size={GLYPH_PX}
                  className="shrink-0 text-ink-faint"
                />
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                {badgeMessage && (
                  <Badge tone={badgeTone}>{message(badgeMessage)}</Badge>
                )}
                <CaretRight
                  aria-hidden
                  size={GLYPH_PX}
                  className="shrink-0 text-ink-faint"
                />
              </button>
            );
          })}
      </div>
      {view.truncated && (
        <p
          className="shrink-0 px-fg-3 py-fg-1 text-caption text-ink-faint"
          role="status"
        >
          {message(folderBrowserTruncatedMessage())}
        </p>
      )}
    </div>
  );
}
