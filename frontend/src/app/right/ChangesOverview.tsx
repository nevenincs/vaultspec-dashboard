// Git diff browser (right-rail surface adoption, W02.P13.S29): the active
// worktree's working-tree state and its changes — a repository status header, a
// changed-files list with status marks, expand/collapse disclosure rows revealing
// a read-only diff view inline, plus recent commit + vault-activity context.
//
// Re-skinned onto the OKLCH token layer and the two sanctioned icon families per
// the git-diff-browser surface ADR: structural chrome from Lucide (chevrons), the
// domain plane from Phosphor (git-branch, git-commit, file marks). The retired
// hand-drawn / ad-hoc Unicode glyphs leave.
//
// Data sources, both from the stores layer (chrome reads selectors, never the
// engine, never the raw `tiers` block — dashboard-layer-ownership):
//   • useGitStatus()    → the derived git working-tree view (branch / ahead /
//                          behind / dirty), with loading / degraded / errored
//                          interpreted in the stores layer.
//   • useGitFileDiff()  → the read-only structured diff for a selected file.
//   • useEngineEvents() → commits + doc-created / doc-modified / step-checked.
//
// DIFF LEGIBILITY IS SACRED and COLOUR IS NEVER THE SOLE SIGNAL: the diff body
// (DiffView) keeps high-contrast green/red and carries +/- glyphs and labels; the
// changed-files rows carry a status letter so status is never colour-only.
//
// ENGINE BOUNDARY: this surface NEVER writes git — no stage, unstage, commit,
// discard, or checkout affordance exists or is accepted here (engine-read-and-
// infer). The browser observes git state; it never changes it.

import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import {
  File as FileMark,
  FileDashed,
  FileMinus,
  FilePlus,
  GitBranch,
  GitCommit,
  PencilSimple,
  type Icon,
} from "@phosphor-icons/react";
import { useState } from "react";

import { pathToNodeId } from "../left/browserSelection";
import type { EngineEvent } from "../../stores/server/engine";
import {
  useEngineEvents,
  useGitFileDiff,
  useGitStatus,
} from "../../stores/server/queries";
import { selectNode } from "../../stores/view/selection";
import type { Selection } from "../../stores/view/viewStore";
import { useViewStore } from "../../stores/view/viewStore";
import { useActiveScope } from "../stage/Stage";
import { DiffView } from "./DiffView";

// Icon sizing — the iconography ADR's grayscale-by-shape gate is 14px; the
// structural chrome (chevrons) reads one density step smaller so it stays
// attenuated relative to the expressive domain marks.
const DOMAIN_PX = 14;
const CHROME_PX = 13;

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable) — retained as the data-to-display pipeline.
// ---------------------------------------------------------------------------

/**
 * Phosphor domain mark for each event kind (replaces the retired Unicode
 * glyphs). git-commit directly; file-plus / pencil for doc-created / modified;
 * a generic file for step-checked; a dashed-file fallback for an unknown kind.
 */
export const KIND_MARK: Record<string, Icon> = {
  commit: GitCommit,
  "doc-created": FilePlus,
  "doc-modified": PencilSimple,
  "step-checked": FileMark,
};

export function eventMark(kind: string): Icon {
  return KIND_MARK[kind] ?? FileDashed;
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

/**
 * Classify a dirty entry's git status from a leading status token when the wire
 * carries one (e.g. `"M path"`, `"A path"`, `"?? path"`), falling back to
 * "modified" for the v1 flat-path shape that carries no per-file status. This is
 * the honest interim until the wire serves a status per entry (git-diff-browser
 * ADR: the grouping is the target shape, the flat list the interim). Returns the
 * status key plus the bare path with any status token stripped.
 */
export interface DirtyEntry {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
}

const STATUS_TOKEN: Record<string, DirtyEntry["status"]> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  "??": "untracked",
};

export function classifyDirty(raw: string): DirtyEntry {
  const m = /^([A-Z?]{1,2})\s+(.+)$/.exec(raw);
  if (m && STATUS_TOKEN[m[1]]) {
    return { path: m[2], status: STATUS_TOKEN[m[1]] };
  }
  return { path: raw, status: "modified" };
}

/** The status letter shown on a changed-file row — non-colour status identity. */
export function statusLetter(status: DirtyEntry["status"]): string {
  return status === "untracked" ? "?" : status.charAt(0).toUpperCase();
}

/** Phosphor file mark per status (shape carries status, not colour alone). */
function statusMark(status: DirtyEntry["status"]): Icon {
  if (status === "added" || status === "untracked") return FilePlus;
  if (status === "deleted") return FileMinus;
  if (status === "modified") return PencilSimple;
  return FileMark;
}

const MAX_EVENTS = 30;
const MAX_DIRTY = 20;

// ---------------------------------------------------------------------------
// Git status header
// ---------------------------------------------------------------------------

interface GitStatusProps {
  branch: string;
  ahead?: number;
  behind?: number;
  dirtyCount: number;
}

function GitStatusHeader({ branch, ahead, behind, dirtyCount }: GitStatusProps) {
  // Divergence shows only when an upstream is configured (absent ahead/behind
  // means "no upstream", not "zero") — ahead/behind are optional on the wire.
  const hasUpstream = ahead !== undefined || behind !== undefined;
  const aheadN = ahead ?? 0;
  const behindN = behind ?? 0;
  return (
    <div
      className="flex items-center gap-vs-1-5 rounded-vs-md border border-rule bg-paper-raised px-vs-2 py-vs-1 text-label shadow-card"
      aria-label="git status"
    >
      <span className="shrink-0 text-ink-faint" aria-hidden>
        <GitBranch size={DOMAIN_PX} />
      </span>
      {/* Branch name is identity → mono per the typography law. */}
      <span className="min-w-0 flex-1 truncate font-mono text-ink-muted">{branch}</span>
      {hasUpstream && (aheadN > 0 || behindN > 0) && (
        // Divergence counts are data-bearing → tabular numerals, with an
        // explicit up/down label so the divergence reads in grayscale.
        <span
          className="flex shrink-0 items-center gap-vs-1 text-ink-faint"
          data-tabular
        >
          {aheadN > 0 && (
            <span aria-label={`${aheadN} ahead`}>
              <span aria-hidden>↑</span>
              {aheadN}
            </span>
          )}
          {behindN > 0 && (
            <span aria-label={`${behindN} behind`}>
              <span aria-hidden>↓</span>
              {behindN}
            </span>
          )}
        </span>
      )}
      {/* Status pill — colour reinforced by a label so "clean" / "N changed"
          read in grayscale (never colour-only). */}
      {dirtyCount > 0 ? (
        <span
          className="shrink-0 rounded-full bg-accent-subtle px-vs-1-5 py-vs-0-5 text-2xs text-accent-text"
          data-tabular
        >
          {dirtyCount} changed
        </span>
      ) : (
        <span className="shrink-0 text-2xs text-state-active">clean</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Changed-files list — disclosure rows revealing the inline diff view
// ---------------------------------------------------------------------------

interface ChangedFileRowProps {
  entry: DirtyEntry;
  scope: string;
  /** Roving-tabindex: only the active row is in the file-list tab order. */
  tabbable: boolean;
}

function ChangedFileRow({ entry, scope, tabbable }: ChangedFileRowProps) {
  const [open, setOpen] = useState(false);
  const vault = isVaultPath(entry.path);
  const Mark = statusMark(entry.status);
  const Chevron = open ? ChevronDown : ChevronRight;
  // The inline diff is fetched only while the row is open (bounded by default —
  // no eager fetch of every file's diff). The stores hook interprets the tiers
  // seam so this surface never reads the raw block.
  const diff = useGitFileDiff(scope, open ? entry.path : null);

  const onSelect = () => {
    // Emit select intent into the shared selection: a vault file cross-highlights
    // its document node on the stage (the one model, by stable id). A non-vault
    // path has no graph node — selecting it only toggles the local disclosure.
    if (vault) selectNode(pathToNodeId(entry.path));
    setOpen((v) => !v);
  };

  return (
    <li>
      <button
        {...{ "data-changed-file": "" }}
        type="button"
        tabIndex={tabbable ? 0 : -1}
        aria-expanded={open}
        aria-label={`${entry.status} ${entry.path}${vault ? " (vault)" : ""}`}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            moveFileFocus(e.currentTarget, 1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            moveFileFocus(e.currentTarget, -1);
          }
        }}
        className="flex w-full items-center gap-vs-1 rounded-vs-sm px-vs-1 py-vs-0-5 text-left text-label transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        title={entry.path}
      >
        <span className="shrink-0 text-ink-faint" aria-hidden>
          <Chevron size={CHROME_PX} />
        </span>
        <span className="shrink-0 text-ink-faint" aria-hidden>
          <Mark size={DOMAIN_PX} />
        </span>
        {/* Status letter — non-colour status identity, read by the SR via the
            row's aria-label. */}
        <span
          className="w-3 shrink-0 select-none text-center font-mono text-2xs text-ink-faint"
          aria-hidden
        >
          {statusLetter(entry.status)}
        </span>
        {/* Path identity → mono; basename shown, full path on hover + to AT. */}
        <span
          className={`min-w-0 flex-1 truncate font-mono ${vault ? "text-ink-muted" : "text-ink-faint"}`}
        >
          {basename(entry.path)}
        </span>
        {vault && <span className="shrink-0 text-2xs text-ink-faint">vault</span>}
      </button>
      {open && (
        <div className="ml-vs-4 mt-vs-0-5 animate-fade-in motion-reduce:animate-none">
          <DiffView
            diff={diff.diff}
            loading={diff.loading}
            degraded={diff.degraded}
            errored={diff.errored}
            onRetry={diff.retry}
          />
        </div>
      )}
    </li>
  );
}

// Roving-tabindex focus order, derived from the DOM at EVENT time (the in-repo
// `NavToolbar.rovingButtons` / SearchTab pattern): read the file-list rows at
// the moment an arrow key fires, so memoization or a re-render can never desync
// focus order from what is painted.
function moveFileFocus(from: HTMLButtonElement, delta: number): void {
  const list = from.closest("ul");
  if (!list) return;
  const rows = Array.from(
    list.querySelectorAll<HTMLButtonElement>("button[data-changed-file]"),
  );
  const at = rows.indexOf(from);
  if (at === -1) return;
  rows[Math.min(rows.length - 1, Math.max(0, at + delta))]?.focus();
}

interface ChangedFilesProps {
  entries: DirtyEntry[];
  scope: string;
}

function ChangedFiles({ entries, scope }: ChangedFilesProps) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? entries : entries.slice(0, MAX_DIRTY);
  const overflow = entries.length - MAX_DIRTY;

  return (
    <section aria-label="changed files">
      <h3 className="mb-vs-1 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
        Changed files
      </h3>
      <ul className="space-y-vs-0-5" role="list" aria-label="changed files">
        {shown.map((entry, i) => (
          <ChangedFileRow
            key={entry.path}
            entry={entry}
            scope={scope}
            // The list's single Tab-stop is the first row; arrows rove within.
            tabbable={i === 0}
          />
        ))}
        {overflow > 0 && !showAll && (
          <li>
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="rounded-vs-sm px-vs-1 text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              data-tabular
            >
              +{overflow} more
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Event row (commit / vault-activity context)
// ---------------------------------------------------------------------------

interface EventRowProps {
  ev: EngineEvent;
  now: number;
  onSelect: (sel: Selection) => void;
}

function EventRow({ ev, now, onSelect }: EventRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasNodes = ev.node_ids.length > 0;
  const Mark = eventMark(ev.kind);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <li>
      <button
        type="button"
        aria-expanded={hasNodes ? expanded : undefined}
        onClick={() => {
          onSelect({
            kind: "event",
            id: ev.id,
            nodeIds: ev.node_ids,
            truncatedNodeIds: ev.truncated_node_ids,
          });
          if (hasNodes) setExpanded((v) => !v);
        }}
        className="flex w-full items-center gap-vs-1 rounded-vs-sm px-vs-1 py-vs-0-5 text-left transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        title={
          hasNodes
            ? `${ev.kind} · ${ev.node_ids.length} node${ev.node_ids.length !== 1 ? "s" : ""}${ev.truncated_node_ids ? ` (+${ev.truncated_node_ids} more)` : ""}`
            : ev.kind
        }
      >
        <span className="shrink-0 text-ink-faint" aria-hidden>
          <Mark size={DOMAIN_PX} />
        </span>
        {/* Commit/ref label is identity → mono. */}
        <span className="min-w-0 flex-1 truncate font-mono text-ink-muted">
          {eventLabel(ev)}
        </span>
        {hasNodes && (
          <span className="shrink-0 text-2xs text-ink-faint" data-tabular>
            {ev.node_ids.length}
            {ev.truncated_node_ids ? "+" : ""}
          </span>
        )}
        <span className="shrink-0 text-2xs text-ink-faint" data-tabular>
          {relativeTs(ev.ts, now)}
        </span>
        {hasNodes && (
          <span className="shrink-0 text-ink-faint" aria-hidden>
            <Chevron size={CHROME_PX} />
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
                className="w-full truncate rounded-vs-sm px-vs-1 py-vs-0-5 text-left font-mono text-2xs text-ink-faint hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                title={id}
              >
                {id.split(":").pop() ?? id}
              </button>
            </li>
          ))}
          {ev.truncated_node_ids && ev.truncated_node_ids > 0 && (
            <li className="px-vs-1 text-2xs text-ink-faint" data-tabular>
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
  const gitView = useGitStatus();
  const selectEntity = useViewStore((s) => s.selectEntity);

  if (!scope) {
    return (
      <p className="text-label text-ink-faint">no scope — pick a worktree first</p>
    );
  }

  const dirtyEntries = (gitView.git?.dirty ?? []).map(classifyDirty);

  const evList = events.data?.events ?? [];
  const commits = evList.filter((e) => e.kind === "commit");
  const docActivity = evList.filter((e) => e.kind !== "commit").slice(0, MAX_EVENTS);

  const now = Date.now();

  return (
    <div className="space-y-vs-3 text-label" data-changes-overview>
      {/* Repository status header (shown whenever git state is available, even on
          a clean tree). */}
      {gitView.git && (
        <GitStatusHeader
          branch={gitView.git.branch}
          ahead={gitView.git.ahead}
          behind={gitView.git.behind}
          dirtyCount={dirtyEntries.length}
        />
      )}

      {/* Loading: a liveness cue tied to the in-flight status snapshot. */}
      {gitView.loading && (
        <p
          className="animate-pulse-live text-label text-ink-faint motion-reduce:animate-none"
          data-git-loading
        >
          reading git status…
        </p>
      )}

      {/* Degraded per tiers (git tier absent / unavailable): a DESIGNED
          "no repository state" — distinct from an error, never a failure, with
          the rest of the chrome unaffected (git-diff-browser ADR States). */}
      {gitView.degraded && (
        <p
          className="flex items-start gap-vs-1-5 rounded-vs-sm bg-paper-sunken px-vs-2 py-vs-1 text-label text-ink-muted"
          data-git-degraded
        >
          <span className="mt-px shrink-0 text-ink-faint" aria-hidden>
            <GitBranch size={CHROME_PX} />
          </span>
          <span>
            repository state unavailable
            {gitView.reason ? ` — ${gitView.reason}` : ""}
          </span>
        </p>
      )}

      {/* Error: a genuine transport failure (no tiers envelope), kept distinct
          from degradation, with a retry affordance. */}
      {gitView.errored && (
        <div
          className="flex items-center gap-vs-1-5 rounded-vs-sm border border-state-broken/40 px-vs-2 py-vs-1"
          data-git-error
        >
          <span className="shrink-0 text-state-broken" aria-hidden>
            <RefreshCw size={CHROME_PX} />
          </span>
          <p className="flex-1 text-label text-state-broken">git status unavailable</p>
          <button
            type="button"
            onClick={() => void events.refetch()}
            className="rounded-vs-sm text-2xs text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            retry
          </button>
        </div>
      )}

      {/* Changed files — the disclosure list revealing the inline diff. */}
      {dirtyEntries.length > 0 && <ChangedFiles entries={dirtyEntries} scope={scope} />}

      {/* Empty / clean working tree: an approachable state in the warm copy tone
          (the header above still shows branch + divergence). */}
      {gitView.git && dirtyEntries.length === 0 && (
        <p className="px-vs-1 py-vs-1 text-label text-ink-faint" data-git-clean>
          working tree clean — no changes to review.
        </p>
      )}

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

      {/* Activity loading / error / empty states. */}
      {events.isPending && (
        <p className="text-label text-ink-faint">loading activity…</p>
      )}
      {events.isError && (
        <div className="space-y-vs-1">
          <p className="text-label text-state-broken">activity unavailable</p>
          <button
            type="button"
            onClick={() => void events.refetch()}
            className="rounded-vs-sm text-2xs text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            retry
          </button>
        </div>
      )}
    </div>
  );
}
