// The add-project Browse affordance's drill-down folder picker (single-app-
// runtime ADR O6): a read-only OS directory browser over `GET /fs/list`, so an
// operator can navigate to a project folder instead of typing its absolute path.
// Consumes the bounded stores hook `useFsList` ONLY (dashboard-layer-ownership);
// `AddProjectDialog` owns the current path as chrome-local state and fills its
// existing path input from `onChoose` — registration itself is untouched.
//
// Split like `FirstRunOnboarding`: `deriveFolderBrowserView` is a pure resolver
// (unit-tested wire-free), `FolderBrowser` is the thin wired wrapper.

import { Folder as FolderMark } from "@phosphor-icons/react";
import { ArrowUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { FsListEntry, FsListResponse } from "../../stores/server/engine";
import { useFsList } from "../../stores/server/queries";
import { Button, Skeleton, SkeletonRow, StateBlock } from "../kit";

export interface FolderBrowserRowView {
  key: string;
  label: string;
  path: string;
  badge: string | null;
  ariaLabel: string;
  isUp: boolean;
}

export interface FolderBrowserView {
  state: "loading" | "error" | "ready";
  /** The listed directory's absolute path, or null at the filesystem-roots level
   *  ("This computer" — no single folder to choose there). */
  headerPath: string | null;
  headerLabel: string;
  canChooseCurrent: boolean;
  rows: FolderBrowserRowView[];
  emptyMessage: string | null;
  truncatedMessage: string | null;
}

const ROOTS_LABEL = "This computer";

function entryBadge(entry: FsListEntry): string | null {
  if (entry.is_managed) return "Project";
  if (entry.is_git) return "Git repository";
  return null;
}

function entryAriaLabel(entry: FsListEntry): string {
  const badge = entryBadge(entry);
  return badge ? `open ${entry.name}, ${badge.toLowerCase()}` : `open ${entry.name}`;
}

/** Pure resolver: the honest loading / error / ready states plus render-ready
 *  rows (an optional leading "up" row, then the listed subdirectories). */
export function deriveFolderBrowserView(
  data: FsListResponse | undefined,
  loading: boolean,
  errored: boolean,
): FolderBrowserView {
  if (loading) {
    return {
      state: "loading",
      headerPath: null,
      headerLabel: ROOTS_LABEL,
      canChooseCurrent: false,
      rows: [],
      emptyMessage: null,
      truncatedMessage: null,
    };
  }
  if (errored) {
    return {
      state: "error",
      headerPath: null,
      headerLabel: ROOTS_LABEL,
      canChooseCurrent: false,
      rows: [],
      emptyMessage: null,
      truncatedMessage: null,
    };
  }
  const path = data?.path ?? null;
  const parent = data?.parent ?? null;
  const rows: FolderBrowserRowView[] = [];
  if (parent !== null) {
    rows.push({
      key: "..",
      label: "..",
      path: parent,
      badge: null,
      ariaLabel: "go to the parent folder",
      isUp: true,
    });
  }
  for (const entry of data?.entries ?? []) {
    rows.push({
      key: entry.path,
      label: entry.name,
      path: entry.path,
      badge: entryBadge(entry),
      ariaLabel: entryAriaLabel(entry),
      isUp: false,
    });
  }
  return {
    state: "ready",
    headerPath: path,
    headerLabel: path ?? ROOTS_LABEL,
    canChooseCurrent: path !== null,
    rows,
    emptyMessage: rows.length === 0 ? "No subfolders here." : null,
    truncatedMessage: data?.truncated ? "Showing the first 256 folders." : null,
  };
}

export interface FolderBrowserProps {
  /** The currently-listed absolute directory; absent lists the filesystem roots. */
  path?: string;
  /** Navigate into a subdirectory, up to its parent, or (absent) back to roots. */
  onNavigate: (path: string | undefined) => void;
  /** Fill the add-project path input with the current directory and close the browser. */
  onChoose: (path: string) => void;
}

/** The wired drill-down browser: roots -> subdirectories, one level per
 *  `useFsList` call, cached per directory (mirrors the code tree's lazy grain). */
export function FolderBrowser({ path, onNavigate, onChoose }: FolderBrowserProps) {
  const query = useFsList(path);
  const view = useMemo(
    () => deriveFolderBrowserView(query.data, query.isPending, query.isError),
    [query.data, query.isPending, query.isError],
  );

  // Widget-intrinsic roving tabindex (Class-B, actions-keymap rule; the
  // FeatureSearchField listbox precedent): the row list is ONE tab stop —
  // the active row carries tabIndex 0, arrows/Home/End rove, Enter/Space
  // activate — and consumed keys stop propagating so they never reach the
  // global dispatcher. Reset to the first row whenever the level changes.
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setActiveIndex(0);
  }, [view.headerPath]);
  const rowCount = view.rows.length;
  const clampedIndex = rowCount === 0 ? -1 : Math.min(activeIndex, rowCount - 1);
  const focusRow = (index: number) => {
    setActiveIndex(index);
    const buttons =
      listRef.current?.querySelectorAll<HTMLButtonElement>("[role='option']");
    buttons?.[index]?.focus();
  };
  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (rowCount === 0) return;
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = Math.min(clampedIndex + 1, rowCount - 1);
        break;
      case "ArrowUp":
        next = Math.max(clampedIndex - 1, 0);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = rowCount - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    focusRow(next);
  };

  return (
    <div
      className="flex flex-col gap-fg-1-5 rounded-fg-xs border border-rule bg-paper-sunken p-fg-2"
      data-folder-browser
    >
      <div className="flex items-center gap-fg-2">
        <span
          className="min-w-0 flex-1 truncate font-mono text-label text-ink-muted"
          title={view.headerLabel}
        >
          {view.headerLabel}
        </span>
        <Button
          variant="ghost"
          disabled={!view.canChooseCurrent}
          onClick={() => {
            if (view.headerPath !== null) onChoose(view.headerPath);
          }}
        >
          Choose this folder
        </Button>
      </div>
      <div
        ref={listRef}
        role="listbox"
        aria-label="folders"
        onKeyDown={onListKeyDown}
        className="max-h-48 min-h-0 overflow-y-auto rounded-fg-xs border border-rule bg-paper"
      >
        {view.state === "loading" && (
          <Skeleton label="Reading folders…" className="p-fg-2">
            <SkeletonRow width="w-2/3" />
            <SkeletonRow width="w-1/2" />
          </Skeleton>
        )}
        {view.state === "error" && (
          <StateBlock
            mode="degraded"
            layout="inline"
            message="Couldn't read this folder."
          />
        )}
        {view.state === "ready" && view.rows.length === 0 && (
          <StateBlock
            mode="empty"
            layout="inline"
            message={view.emptyMessage ?? "No subfolders here."}
          />
        )}
        {view.state === "ready" &&
          view.rows.map((row, index) => (
            <button
              key={row.key}
              type="button"
              role="option"
              aria-selected={index === clampedIndex}
              tabIndex={index === clampedIndex ? 0 : -1}
              onFocus={() => setActiveIndex(index)}
              onClick={() => onNavigate(row.path)}
              aria-label={row.ariaLabel}
              className="flex w-full items-center gap-fg-1-5 px-fg-2 py-fg-1 text-left text-label text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            >
              {row.isUp ? (
                <ArrowUp aria-hidden size={14} className="shrink-0 text-ink-faint" />
              ) : (
                <FolderMark aria-hidden size={14} className="shrink-0 text-ink-faint" />
              )}
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              {row.badge && (
                <span className="shrink-0 text-caption text-ink-muted">
                  {row.badge}
                </span>
              )}
            </button>
          ))}
      </div>
      {view.truncatedMessage && (
        <p className="text-caption text-ink-muted" role="status">
          {view.truncatedMessage}
        </p>
      )}
    </div>
  );
}
