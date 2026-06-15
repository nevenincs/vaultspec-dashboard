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
  FilePlus,
  GitBranch,
  GitCommit,
  PencilSimple,
  type Icon,
} from "@phosphor-icons/react";
import { useState } from "react";

import type { EngineEvent } from "../../stores/server/engine";
import { useEngineEvents, useGitStatus } from "../../stores/server/queries";
import { openContextMenu } from "../../stores/view/contextMenu";
import type { Selection } from "../../stores/view/viewStore";
import { useViewStore } from "../../stores/view/viewStore";
import { useActiveScope } from "../stage/Stage";
import { DiffView } from "./DiffView";

// The "event" resolver (shared with the timeline) is registered centrally via
// `app/menus/registerAll`; an activity/commit row only needs to publish an
// EventEntity to openContextMenu. The change resolver (per-file / hunk rows) is
// registered by DiffView, the surface that holds a concrete hunk path.

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

const MAX_EVENTS = 30;

// ---------------------------------------------------------------------------
// Git status header
// ---------------------------------------------------------------------------

interface GitStatusProps {
  branch: string;
  ahead?: number;
  behind?: number;
  /** Live `dirty: boolean` — clean vs. dirty (NO per-file count; engine-blocked). */
  dirty: boolean;
}

function GitStatusHeader({ branch, ahead, behind, dirty }: GitStatusProps) {
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
      {/* Status pill — colour reinforced by a label so "clean" / "changes" read
          in grayscale (never colour-only). The live wire serves a dirty BOOLEAN,
          not a count, so the pill states clean vs. "changes" without a number. */}
      {dirty ? (
        <span className="shrink-0 rounded-full bg-accent-subtle px-vs-1-5 py-vs-0-5 text-2xs text-accent-text">
          changes
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

// ---------------------------------------------------------------------------
// Working-tree changes — the HONEST engine-blocked panel
// ---------------------------------------------------------------------------
//
// The live engine serves only a dirty BOOLEAN, not a per-file changed list, so
// there is NO fabricated per-file list here. When the tree is dirty this panel
// states that plainly and offers a single disclosure that reveals the DiffView's
// honest engine-blocked detail — keeping the diff chrome (and its a11y) wired and
// exercised end-to-end against the engine-blocked path, without inventing data
// the wire does not serve. The per-file changed list and the read-only diff body
// are documented forward proposals (a future contract amendment), not live data.

function WorkingTreeChanges() {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <section aria-label="working tree changes" data-working-changes>
      <h3 className="mb-vs-1 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
        Changes
      </h3>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-vs-1-5 rounded-vs-sm bg-paper-sunken px-vs-2 py-vs-1 text-left text-label text-ink-muted transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        <span className="mt-px shrink-0 text-ink-faint" aria-hidden>
          <Chevron size={CHROME_PX} />
        </span>
        <span className="mt-px shrink-0 text-ink-faint" aria-hidden>
          <FileDashed size={DOMAIN_PX} />
        </span>
        <span className="min-w-0 flex-1">
          working tree has changes — per-file detail not yet served by the engine
        </span>
      </button>
      {open && (
        <div className="ml-vs-4 mt-vs-0-5 animate-fade-in motion-reduce:animate-none">
          {/* The diff capability is engine-blocked (no /ops/git/* route lives);
              DiffView renders the honest "capability pending" state — the
              engine-blocked path exercised end-to-end. */}
          <DiffView engineBlocked />
        </div>
      )}
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

  // The EventEntity this row publishes to the context-menu host (carries the
  // touched node ids the resolver's "show touched nodes" needs).
  const eventEntity = () => ({
    kind: "event" as const,
    id: ev.id,
    nodeIds: ev.node_ids,
    truncatedNodeIds: ev.truncated_node_ids,
  });

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
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(eventEntity(), { x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e) => {
          if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            openContextMenu(eventEntity(), { x: r.left, y: r.bottom });
          }
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
          dirty={gitView.dirty}
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

      {/* Degraded: the engine answered but carried no git payload — a DESIGNED
          "no repository state", distinct from an error, never a failure, with
          the rest of the chrome unaffected (git-diff-browser ADR States). */}
      {gitView.degraded && (
        <p
          className="flex items-start gap-vs-1-5 rounded-vs-sm bg-paper-sunken px-vs-2 py-vs-1 text-label text-ink-muted"
          data-git-degraded
        >
          <span className="mt-px shrink-0 text-ink-faint" aria-hidden>
            <GitBranch size={CHROME_PX} />
          </span>
          <span>repository state unavailable</span>
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
          {/* Retry the STATUS query — the source of git state (not the events
              query, which is a separate surface). */}
          <button
            type="button"
            onClick={gitView.retry}
            className="rounded-vs-sm text-2xs text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            retry
          </button>
        </div>
      )}

      {/* Working-tree changes — the honest engine-blocked panel when the tree is
          dirty (live `dirty: boolean`; no fabricated per-file list). */}
      {gitView.git && gitView.dirty && <WorkingTreeChanges />}

      {/* Empty / clean working tree: an approachable state in the warm copy tone
          (the header above still shows branch + divergence). */}
      {gitView.git && !gitView.dirty && (
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
