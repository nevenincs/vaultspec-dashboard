// The codebase file browser (dashboard-code-tree ADR "The rail's code mode"): a
// read-only, lazy, collapsible DIRECTORY HIERARCHY over the active worktree,
// beside the vault browser. It consumes the `/file-tree` projection ONLY through
// the stores' query hook (`useFileTree`), reads degradation ONLY through a stores
// selector (`useFileTreeAvailability`, never the raw `tiers` block), and joins
// selection on the contract's stable `code:<path>` node id — the same
// bidirectional join the vault browser realizes for `doc:<stem>`. It fetches
// nothing itself and defines no model (dashboard-layer-ownership): chrome over the
// one projection.
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
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useState } from "react";

import type { CodeFileEntity } from "../../platform/actions/entity";
import type { FileTreeEntry } from "../../stores/server/engine";
import { useFileTree, useFileTreeAvailability } from "../../stores/server/queries";
import { openContextMenu } from "../../stores/view/contextMenu";
import { useActiveScope } from "../stage/Stage";
import { handleCodeEntryClick, useHighlightedCodePath } from "./browserSelection";
// Self-registering left-rail context-menu resolver (W03.P07): importing the
// module runs its `registerResolver("code-file", …)` side effect once.
import "./menus/codeFileMenu";

/** Build the code-file context-menu entity from a tree row's data. A directory
 *  carries no graph node, so its `nodeId` is left undefined. */
function codeFileEntity(entry: FileTreeEntry): CodeFileEntity {
  const isDir = entry.kind === "dir";
  return {
    kind: "code-file",
    id: entry.node_id,
    path: entry.path,
    isDir,
    nodeId: isDir ? undefined : entry.node_id || undefined,
  };
}

// --- pure helpers (unit-tested) ---------------------------------------------------

/** Display name for a row: the path's final segment (monospace path identity).
 *  The full repo-relative path rides the row's `title` for hover. */
export function basename(path: string): string {
  return path.replace(/\/+$/, "").replace(/^.*\//, "");
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
  const rootLevel = useFileTree(scope);
  const availability = useFileTreeAvailability(scope);
  const clickHandler = onEntryClick ?? handleCodeEntryClick;
  const normalizedFilter = (filter ?? "").trim().toLowerCase();

  if (rootLevel.isPending) {
    // Loading: a quiet, copy-toned pending line — no spinner theatre (ADR
    // "States"). The subtle liveness pulse is tied to genuine in-flight work.
    return (
      <p
        className="animate-pulse-live px-vs-1 py-vs-0-5 text-label text-ink-faint"
        role="status"
        aria-live="polite"
      >
        reading the worktree…
      </p>
    );
  }

  if (rootLevel.isError && !availability.degraded) {
    // Error: a genuine /file-tree failure — contained, region-scoped, with retry,
    // distinguished from degradation so the user can tell "this read failed" from
    // "a backend is down" (ADR "States"). A tiers-bearing failure (a backend tier
    // reported down) is degradation, not a transport error, so it falls through to
    // the designed degraded state below — only a tiers-less transport fault renders
    // this error state (degradation-is-read-from-tiers).
    return (
      <div
        className="space-y-vs-1 px-vs-1 py-vs-0-5"
        role="status"
        aria-live="polite"
        data-code-error
      >
        <p className="text-label text-state-broken">code tree unavailable</p>
        <button
          type="button"
          onClick={() => void rootLevel.refetch()}
          className="rounded-vs-sm text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          try again
        </button>
      </div>
    );
  }

  // Degraded: a worktree-only capability with no working tree (a remote-ref
  // scope) or an absent structural tier renders as a DESIGNED degraded state
  // explaining the absence, distinct from empty; read through the stores
  // selector, never the raw tiers block (ADR "Structural-tier degradation").
  if (availability.degraded) {
    const reason =
      availability.degradedTiers.map((t) => availability.reasons[t]).find(Boolean) ??
      "";
    return (
      <p
        className="mx-vs-1 my-vs-1 rounded-vs-sm bg-accent-subtle/40 px-vs-1 py-vs-0-5 text-2xs text-ink-muted"
        role="status"
        aria-live="polite"
        data-code-degraded
      >
        this scope has no code tree
        {reason ? ` — ${reason}` : ""}. the vault browser remains available.
      </p>
    );
  }

  const entries = rootLevel.data?.entries ?? [];

  if (entries.length === 0) {
    // Empty: an approachable empty state — a worktree that resolves to no
    // listable source is a real condition, not a fault (ADR "States").
    return (
      <p className="px-vs-1 py-vs-0-5 text-label text-ink-faint" data-code-empty>
        no source files in this scope yet.
      </p>
    );
  }

  return (
    <nav className="text-label" aria-label="code browser" data-code-browser>
      <ul className="space-y-vs-0-5">
        {entries.map((entry) => (
          <DirectoryRow
            key={entry.path}
            entry={entry}
            scope={scope}
            depth={0}
            clickHandler={clickHandler}
            linkedNodeIds={linkedNodeIds}
            filter={normalizedFilter}
            truncated={rootLevel.data?.truncated ?? null}
          />
        ))}
      </ul>
      {/* Bounded-read honesty at the root level: a capped level reads as "more
          here", never a silent partial result (graph-queries-are-bounded). */}
      {rootLevel.data?.truncated && (
        <TruncatedNote total={rootLevel.data.truncated.total_children} />
      )}
    </nav>
  );
}

/** The "more here — expand a subdirectory" note for a capped level. */
function TruncatedNote({ total }: { total: number }) {
  return (
    <p
      className="px-vs-1 py-vs-0-5 text-2xs text-ink-faint"
      role="status"
      data-code-truncated
    >
      more here ({total}) — expand a subdirectory to narrow.
    </p>
  );
}

interface RowProps {
  entry: FileTreeEntry;
  scope: string | null;
  depth: number;
  clickHandler: (entry: FileTreeEntry) => void;
  linkedNodeIds?: ReadonlySet<string>;
  filter: string;
  truncated: { total_children: number } | null;
}

/**
 * One row in the hierarchy. A directory is a disclosure (Lucide chevron + Phosphor
 * folder mark) that LAZILY fetches and renders its children on first expansion; a
 * file is a leaf that joins selection to its `code:` node. The whole subtree is
 * built recursively, one level per `useFileTree` call — the bounded, lazy grammar.
 */
function DirectoryRow({
  entry,
  scope,
  depth,
  clickHandler,
  linkedNodeIds,
  filter,
}: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const highlight = useHighlightedCodePath([entry]);
  const isDir = entry.kind === "dir";
  const name = basename(entry.path);

  // In-rail filter: a client-side narrowing of the visible tree. A file row is
  // hidden when it does not match; a directory always stays visible (its match
  // may live in an unfetched descendant), so the filter never hides a path to a
  // possible match. Empty filter shows everything.
  if (filter.length > 0 && !isDir && !entry.path.toLowerCase().includes(filter)) {
    return null;
  }

  // The quiet linkage marker (ADR "The interlink"): present only when this file's
  // `code:` node exists in the host-supplied linkage set. A file with no node is
  // the quiet ABSENT state — no marker, still listed and selectable, never an
  // error. Directories never carry the marker (they are not graph nodes).
  const linked = !isDir && (linkedNodeIds?.has(entry.node_id) ?? false);
  const highlighted = entry.path === highlight;
  const Mark = rowMark(entry.kind);
  const indent = { paddingLeft: `${0.25 + depth * 0.75}rem` };

  return (
    <li>
      <button
        type="button"
        title={entry.path}
        aria-current={highlighted ? "page" : undefined}
        aria-expanded={isDir ? expanded : undefined}
        data-code-row
        data-code-dir={isDir ? "" : undefined}
        data-code-linked={linked ? "" : undefined}
        onClick={() => {
          if (isDir) {
            setExpanded((prev) => !prev);
          } else {
            clickHandler(entry);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(codeFileEntity(entry), { x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e) => {
          // Keyboard menu entry (ContextMenu key / Shift+F10): anchor at the
          // row's bottom-left, then fall through to the directory disclosure
          // keyboard contract for everything else (ArrowRight/Left expand/
          // collapse, Enter/Space activate).
          if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            openContextMenu(codeFileEntity(entry), { x: r.left, y: r.bottom });
            return;
          }
          onRowKeyDown(isDir, expanded, setExpanded)(e);
        }}
        style={indent}
        className={`flex w-full items-center gap-vs-1 truncate rounded-vs-sm py-vs-0-5 pr-vs-1 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
          highlighted
            ? "bg-accent-subtle font-medium text-ink"
            : "text-ink-muted hover:bg-paper-sunken hover:text-ink"
        }`}
      >
        {/* Grayscale-safe selection: a leading accent bar marks the active row so
            the cue survives without hue (matching the vault browser). */}
        <span
          aria-hidden
          className={`h-3 w-0.5 shrink-0 rounded-full ${
            highlighted ? "bg-accent" : "bg-transparent"
          }`}
        />
        {/* Lucide disclosure chevron for a directory; a fixed gap keeps file rows
            aligned under their siblings' names. */}
        <span className="shrink-0 text-ink-faint" aria-hidden>
          {isDir ? (
            expanded ? (
              <ChevronDown size={CHEVRON_PX} />
            ) : (
              <ChevronRight size={CHEVRON_PX} />
            )
          ) : (
            <span style={{ display: "inline-block", width: CHEVRON_PX }} />
          )}
        </span>
        <span className="shrink-0 text-ink-faint">
          <Mark size={ROW_MARK_PX} />
        </span>
        <span className="min-w-0 truncate font-mono">{name}</span>
        {/* Quiet right-aligned linkage marker: this file has a graph node, so it
            is one click from the stage. Absent files carry nothing (the quiet
            absent-interlink state). */}
        {linked && (
          <span
            aria-label="has graph linkage"
            className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70"
          />
        )}
      </button>

      {/* Lazily-fetched children: mounted only once the directory is expanded, so
          its `useFileTree(scope, path)` query fires on first expansion and is
          cached per scope thereafter — the one-level-per-call lazy grammar. */}
      {isDir && expanded && (
        <ChildLevel
          path={entry.path}
          scope={scope}
          depth={depth + 1}
          clickHandler={clickHandler}
          linkedNodeIds={linkedNodeIds}
          filter={filter}
        />
      )}
    </li>
  );
}

/** Keyboard contract for a row (ADR "Keyboard and a11y"): on a directory,
 *  ArrowRight expands and ArrowLeft collapses; Enter/Space toggles. Files leave
 *  the default button activation (Enter/Space selects via onClick). */
function onRowKeyDown(
  isDir: boolean,
  expanded: boolean,
  setExpanded: (fn: (prev: boolean) => boolean) => void,
) {
  return (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!isDir) return;
    if (e.key === "ArrowRight" && !expanded) {
      e.preventDefault();
      setExpanded(() => true);
    } else if (e.key === "ArrowLeft" && expanded) {
      e.preventDefault();
      setExpanded(() => false);
    }
  };
}

interface ChildLevelProps {
  path: string;
  scope: string | null;
  depth: number;
  clickHandler: (entry: FileTreeEntry) => void;
  linkedNodeIds?: ReadonlySet<string>;
  filter: string;
}

/**
 * One lazily-fetched directory level. Mounting this component IS the lazy fetch:
 * `useFileTree(scope, path, true)` fires for `path`'s children only when the
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
}: ChildLevelProps) {
  const level = useFileTree(scope, path);

  if (level.isPending) {
    return (
      <p
        className="animate-pulse-live px-vs-1 py-vs-0-5 text-2xs text-ink-faint"
        style={{ paddingLeft: `${0.25 + depth * 0.75}rem` }}
        role="status"
        aria-live="polite"
        data-code-level-loading
      >
        …
      </p>
    );
  }

  if (level.isError) {
    return (
      <p
        className="px-vs-1 py-vs-0-5 text-2xs text-state-broken"
        style={{ paddingLeft: `${0.25 + depth * 0.75}rem` }}
        role="status"
        data-code-level-error
      >
        could not list this directory.
      </p>
    );
  }

  const entries = level.data?.entries ?? [];
  if (entries.length === 0) return null;

  return (
    <ul className="space-y-vs-0-5">
      {entries.map((entry) => (
        <DirectoryRow
          key={entry.path}
          entry={entry}
          scope={scope}
          depth={depth}
          clickHandler={clickHandler}
          linkedNodeIds={linkedNodeIds}
          filter={filter}
          truncated={level.data?.truncated ?? null}
        />
      ))}
      {level.data?.truncated && (
        <TruncatedNote total={level.data.truncated.total_children} />
      )}
    </ul>
  );
}
