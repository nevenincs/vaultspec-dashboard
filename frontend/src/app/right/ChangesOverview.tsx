// Changes overview (task-7 right-rail): git working-tree state and recent
// vault activity for the active scope. Two data sources, both from the
// stores layer:
//   • useEngineStatus() → git.branch / ahead / behind / dirty (changed files)
//   • useEngineEvents()  → commits + doc-created / doc-modified / step-checked
//
// When a commit is selected, its associated vault node_ids cross-highlight
// on the stage via selectEntity (G2.b). The dirty-file section shows the
// raw git working-tree without a diff body — a per-file diff endpoint is
// a future stores addition (leave TODO for fe-platform).
//
// Layer boundary: chrome reads stores hooks only; no fetch calls.

import { useState } from "react";

import type { EngineEvent } from "../../stores/server/engine";
import { useEngineStatus } from "../../stores/server/engine";
import { useEngineEvents } from "../../stores/server/queries";
import type { Selection } from "../../stores/view/viewStore";
import { useViewStore } from "../../stores/view/viewStore";
import { useActiveScope } from "../stage/Stage";

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable)
// ---------------------------------------------------------------------------

/** Unicode glyph for each event kind. */
export const KIND_GLYPH: Record<string, string> = {
  commit: "⑂",
  "doc-created": "✎",
  "doc-modified": "✏",
  "step-checked": "☑",
};

export function eventGlyph(kind: string): string {
  return KIND_GLYPH[kind] ?? "◦";
}

/**
 * Human-readable label for an event row.
 *
 * Commit SHA handling: the engine's /events `ref` field is the git ref at
 * the time of the event — often the symbolic `"HEAD"` rather than the
 * SHA itself. When `ref` is symbolic (not a hex string), we fall back to
 * the event `id`, which for commit events typically carries the SHA (or a
 * colon-namespaced form like `"commit:<sha>"`). This avoids every commit
 * row displaying the unhelpful label "HEAD".
 *
 * TODO(contract): request a dedicated `sha` + `subject` field on
 * EngineEvent so commit labels can show a short message (coordinate with
 * fe-platform / engine team if the field is missing).
 */
export function eventLabel(ev: EngineEvent): string {
  if (ev.ref) {
    // Full 40-char SHA → shorten to 8 chars
    if (/^[0-9a-f]{40}$/i.test(ev.ref)) return ev.ref.slice(0, 8);
    // Short SHA (7–12 hex chars, some git implementations)
    if (/^[0-9a-f]{7,12}$/i.test(ev.ref)) return ev.ref;
    // Symbolic refs (HEAD, refs/heads/main, …) are not useful display labels.
    // For commits, fall back to the event id which may carry the SHA.
    if (ev.kind === "commit") {
      // Handle "commit:<sha>" style ids
      const idPart = ev.id.includes(":") ? ev.id.split(":").pop()! : ev.id;
      if (/^[0-9a-f]{7,40}$/i.test(idPart)) return idPart.slice(0, 8);
      return idPart.slice(0, 8);
    }
    // Non-SHA refs (branch names, tags): show the final path segment
    return ev.ref.split(/[/\\]/).pop() ?? ev.ref;
  }
  return ev.node_ids[0] ?? ev.kind;
}

/** Compact relative timestamp: minutes → hours → days. */
export function relativeTs(ts: string, now: number): string {
  const at = Date.parse(ts);
  if (!Number.isFinite(at)) return "";
  const ageMs = now - at;
  if (ageMs < 60_000) return "just now";
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}h`;
  return `${Math.floor(ageMs / 86_400_000)}d`;
}

/** Basename of a file path. */
export function basename(p: string): string {
  return p.split(/[/\\]/).pop() ?? p;
}

/** True when the path is under the vault corpus (`.vault/`). */
export function isVaultPath(p: string): boolean {
  return p.startsWith(".vault/") || p.includes("/.vault/");
}

const MAX_EVENTS = 30;
const MAX_DIRTY = 20;

// ---------------------------------------------------------------------------
// Git status header
// ---------------------------------------------------------------------------

interface GitStatusProps {
  branch: string;
  ahead: number;
  behind: number;
  dirtyCount: number;
}

function GitStatus({ branch, ahead, behind, dirtyCount }: GitStatusProps) {
  return (
    <div
      className="flex items-center gap-vs-1-5 rounded-vs-sm border border-rule bg-paper-raised px-vs-2 py-vs-1 shadow-card text-label"
      aria-label="git status"
    >
      <span className="text-ink-faint" aria-hidden>
        ⑂
      </span>
      <span className="flex-1 truncate font-medium text-ink-muted">{branch}</span>
      {(ahead > 0 || behind > 0) && (
        <span className="text-ink-faint">
          {ahead > 0 && (
            <span title={`${ahead} commit${ahead !== 1 ? "s" : ""} ahead`}>
              ↑{ahead}
            </span>
          )}
          {ahead > 0 && behind > 0 && " "}
          {behind > 0 && (
            <span title={`${behind} commit${behind !== 1 ? "s" : ""} behind`}>
              ↓{behind}
            </span>
          )}
        </span>
      )}
      {dirtyCount > 0 && (
        <span className="rounded-full bg-accent-subtle px-vs-1-5 py-vs-0-5 text-2xs text-state-stale">
          {dirtyCount} changed
        </span>
      )}
      {dirtyCount === 0 && <span className="text-2xs text-state-active">clean</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Working changes (dirty files)
// ---------------------------------------------------------------------------

interface DirtyFilesProps {
  paths: string[];
}

function DirtyFiles({ paths }: DirtyFilesProps) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? paths : paths.slice(0, MAX_DIRTY);
  const overflow = paths.length - MAX_DIRTY;

  return (
    <section aria-label="working changes">
      <h3 className="mb-vs-1 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
        Working changes
      </h3>
      <ul className="space-y-vs-0-5">
        {shown.map((path) => {
          const vault = isVaultPath(path);
          return (
            <li key={path}>
              <div
                className="flex items-center gap-vs-1 rounded-vs-sm px-vs-1 py-vs-0-5 text-label"
                title={path}
              >
                <span className="shrink-0 text-ink-faint" aria-hidden>
                  {vault ? "✎" : "○"}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate ${
                    vault ? "text-ink-muted" : "text-ink-faint"
                  }`}
                >
                  {basename(path)}
                </span>
                {vault && (
                  <span className="shrink-0 text-2xs text-ink-faint">vault</span>
                )}
              </div>
            </li>
          );
        })}
        {overflow > 0 && !showAll && (
          <li>
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="px-vs-1 text-label text-ink-faint underline hover:text-ink-muted"
            >
              +{overflow} more
            </button>
          </li>
        )}
      </ul>
      {/* TODO(fe-platform): wire per-file diff once the stores hook lands */}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Event row
// ---------------------------------------------------------------------------

interface EventRowProps {
  ev: EngineEvent;
  now: number;
  onSelect: (sel: Selection) => void;
}

function EventRow({ ev, now, onSelect }: EventRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasNodes = ev.node_ids.length > 0;

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          onSelect({
            kind: "event",
            id: ev.id,
            nodeIds: ev.node_ids,
            truncatedNodeIds: ev.truncated_node_ids,
          });
          if (hasNodes) setExpanded((v) => !v);
        }}
        className="flex w-full items-center gap-vs-1 rounded-vs-sm px-vs-1 py-vs-0-5 text-left hover:bg-paper-sunken"
        title={
          hasNodes
            ? `${ev.kind} · ${ev.node_ids.length} node${ev.node_ids.length !== 1 ? "s" : ""}${ev.truncated_node_ids ? ` (+${ev.truncated_node_ids} more)` : ""}`
            : ev.kind
        }
      >
        <span className="shrink-0 text-ink-faint" aria-hidden>
          {eventGlyph(ev.kind)}
        </span>
        <span className="min-w-0 flex-1 truncate text-ink-muted">{eventLabel(ev)}</span>
        {hasNodes && (
          <span className="shrink-0 text-2xs text-ink-faint">
            {ev.node_ids.length}
            {ev.truncated_node_ids ? "+" : ""}
          </span>
        )}
        <span className="shrink-0 text-2xs text-ink-faint">
          {relativeTs(ev.ts, now)}
        </span>
        {hasNodes && (
          <span className="shrink-0 text-ink-faint" aria-hidden>
            {expanded ? "▾" : "▸"}
          </span>
        )}
      </button>
      {expanded && ev.node_ids.length > 0 && (
        <ul className="ml-vs-4 mt-vs-0-5 space-y-vs-0-5">
          {ev.node_ids.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect({ kind: "node", id })}
                className="w-full truncate rounded-vs-sm px-vs-1 py-vs-0-5 text-left text-2xs text-ink-faint hover:bg-paper-sunken hover:text-ink"
                title={id}
              >
                {id.split(":").pop() ?? id}
              </button>
            </li>
          ))}
          {ev.truncated_node_ids && ev.truncated_node_ids > 0 && (
            <li className="px-vs-1 text-2xs text-ink-faint">
              +{ev.truncated_node_ids} more (contract §5 cap)
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ChangesOverview() {
  const scope = useActiveScope();
  const events = useEngineEvents(scope);
  const status = useEngineStatus();
  const selectEntity = useViewStore((s) => s.selectEntity);

  if (!scope) {
    return (
      <p className="text-label text-ink-faint">no scope — pick a worktree first</p>
    );
  }

  const git = status.data?.git;
  const dirty = git?.dirty ?? [];

  const evList = events.data?.events ?? [];
  const commits = evList.filter((e) => e.kind === "commit");
  const docActivity = evList.filter((e) => e.kind !== "commit").slice(0, MAX_EVENTS);

  const now = Date.now();

  return (
    <div className="space-y-vs-3 text-label" data-changes-overview>
      {/* Git status header */}
      {git && (
        <GitStatus
          branch={git.branch}
          ahead={git.ahead}
          behind={git.behind}
          dirtyCount={dirty.length}
        />
      )}
      {!git && status.isPending && (
        <p className="text-label text-ink-faint">reading git status…</p>
      )}

      {/* Working changes (dirty files) */}
      {dirty.length > 0 && <DirtyFiles paths={dirty} />}

      {/* Recent commits */}
      {commits.length > 0 && (
        <section aria-label="recent commits">
          <h3 className="mb-vs-1 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
            Commits
          </h3>
          <ul className="space-y-vs-0-5">
            {commits.slice(0, 20).map((ev) => (
              <EventRow key={ev.id} ev={ev} now={now} onSelect={selectEntity} />
            ))}
          </ul>
        </section>
      )}

      {/* Doc + step activity */}
      {docActivity.length > 0 && (
        <section aria-label="vault activity">
          <h3 className="mb-vs-1 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
            Activity
          </h3>
          <ul className="space-y-vs-0-5">
            {docActivity.map((ev) => (
              <EventRow key={ev.id} ev={ev} now={now} onSelect={selectEntity} />
            ))}
          </ul>
        </section>
      )}

      {/* Loading and empty states */}
      {events.isPending && (
        <p className="text-label text-ink-faint">loading activity…</p>
      )}
      {events.isError && (
        <div className="space-y-vs-1">
          <p className="text-label text-state-broken">activity unavailable</p>
          <button
            type="button"
            onClick={() => void events.refetch()}
            className="text-2xs text-ink-faint underline"
          >
            retry
          </button>
        </div>
      )}
      {events.isSuccess && evList.length === 0 && dirty.length === 0 && (
        <p className="text-label text-ink-faint">no recent changes</p>
      )}
    </div>
  );
}
