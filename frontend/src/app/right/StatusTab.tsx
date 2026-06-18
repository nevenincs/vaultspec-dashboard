// The Status overview — the rail's primary informational surface, rebuilt to the
// binding Figma redesign (ActivityRail · Status, node 353:1027). The rail answers
// the operator's "where / what's in flight / what's open / what just changed"
// questions through a stack of COLLAPSIBLE SECTION CARDS, each a thin-outlined
// card that takes a slightly darker (paper-sunken) ground while open so the
// section being browsed is identifiable:
//   • a slim LOCATION strip (worktree · branch over a faint path),
//   • OPEN PLANS — plan trackers as contained pills foregrounding a real progress
//     bar, expandable into the standardized step tree,
//   • OPEN PRS / OPEN ISSUES / RECENT PRS — GitHub work items,
//   • RECENT COMMITS — expandable commit rows that reveal the full message body,
//     with a "Show more" control.
//
// Layer ownership (dashboard-layer-ownership / views-are-projections): this is a
// DUMB app-chrome view. It consumes stores selectors EXCLUSIVELY
// (`useLocationAnchor`, `usePipelineStatusView`, `usePlanInteriorView`,
// `useHistoryView`, `usePRsView`, `useIssuesView`) — it fetches nothing, never
// inspects the raw `tiers` block, and defines no node model. Degradation is read
// from the interpreted views (the tiers truth they carry, or the engine's
// capability-local `available`/`reason` for the gh-brokered sections), never
// guessed from a transport error
// (degradation-is-read-from-tiers-not-guessed-from-errors). Section collapse is
// LOCAL chrome state (not shared dashboard intent), so it lives in component
// `useState` per the local-chrome carve-out in `views-are-projections-of-one-model`.
//
// Design system (design-system-is-centralized): section grounds, pills, the
// progress bar, badges, and the disclosure chevrons resolve to centralized kit
// primitives and bound tokens — no raw hex, no loose font-size.

import { useState, type ReactNode } from "react";

import { CircleDot, GitBranch, GitMerge, GitPullRequest } from "lucide-react";

import type { Issue, PipelineArtifact, PullRequest } from "../../stores/server/engine";
import {
  DEFAULT_HISTORY_LIMIT,
  useActiveScope,
  useDashboardTimelineModeView,
  useHistoryView,
  useIssuesView,
  useLocationAnchor,
  usePipelineStatusView,
  usePlanInteriorView,
  usePRsView,
} from "../../stores/server/queries";
import { usePipelineExpansion } from "../../stores/view/pipelineExpansion";
import { selectEventNodes } from "../../stores/view/selection";
import { openDocTab } from "../../stores/view/tabs";
import { freshnessLabel } from "../presentation/freshness";
import { PlanStepTree } from "./PlanStepTree";
// Centralized kit primitives (design-system-is-centralized).
import { Badge, ChevronDown, ChevronRight, ProgressBar, SectionLabel } from "../kit";

const TWISTY_PX = 10;
const ICON_PX = 13;
const HISTORY_PAGE = DEFAULT_HISTORY_LIMIT;

// ---------------------------------------------------------------------------
// Collapsible section card — the cohesive container for every rail section.
// ---------------------------------------------------------------------------

interface SectionCardProps {
  title: string;
  count?: number;
  /** Resting open/closed state; sections default open (the everything-expanded
   *  light rail). */
  defaultOpen?: boolean;
  children: ReactNode;
}

function SectionCard({ title, count, defaultOpen = true, children }: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <section
      className={`overflow-hidden rounded-fg-md border border-rule transition-colors duration-ui-fast ease-settle ${
        open ? "bg-paper-sunken" : "bg-paper-raised"
      }`}
      data-section
      data-section-open={open}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-fg-2 px-fg-3 py-fg-2 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        data-section-toggle
      >
        <Chevron size={TWISTY_PX} aria-hidden className="shrink-0 text-ink-faint" />
        <SectionLabel count={count}>{title}</SectionLabel>
      </button>
      {open && (
        <div className="px-fg-3 pb-fg-3 pt-fg-0-5" data-section-body>
          {children}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Location strip — slim "where are we" (worktree · branch over a faint path).
// ---------------------------------------------------------------------------

function LocationStrip({ scope }: { scope: string | null }) {
  const anchor = useLocationAnchor(scope);
  if (!anchor.path) {
    return (
      <p
        className="px-fg-1 text-label text-ink-faint"
        data-location-strip
        data-location-state="empty"
      >
        no scope — pick a worktree first
      </p>
    );
  }
  return (
    <div
      className="space-y-fg-0-5 px-fg-1"
      data-location-strip
      data-location-state="located"
    >
      <div className="flex items-center gap-fg-1-5 text-label">
        <GitBranch size={ICON_PX} aria-hidden className="shrink-0 text-ink-faint" />
        {anchor.isMain && (
          <span className="shrink-0 font-medium text-ink" data-location-main>
            main
          </span>
        )}
        {anchor.branch && (
          <>
            <span aria-hidden className="text-ink-faint">
              ·
            </span>
            <span
              className="min-w-0 truncate font-medium text-accent-text"
              data-location-branch
              title={anchor.branch}
            >
              {anchor.branch}
            </span>
          </>
        )}
      </div>
      <p
        className="truncate font-mono text-meta text-ink-faint"
        data-location-path
        title={anchor.path}
      >
        {anchor.path}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan pill — a contained tracker foregrounding its progress bar, expandable
// into the step tree, opening the plan in the reader on click.
// ---------------------------------------------------------------------------

interface PlanPillProps {
  artifact: PipelineArtifact;
  now: number;
  expanded: boolean;
  onToggle: () => void;
}

function PlanPill({ artifact, now, expanded, onToggle }: PlanPillProps) {
  const scope = useActiveScope();
  const progress = artifact.progress;
  const total = progress?.total ?? 0;
  const done = progress?.done ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : null;
  const fresh = freshnessLabel(artifact.dates?.modified, now);
  const treeId = `status-tree-${artifact.node_id}`;
  const interior = usePlanInteriorView(expanded ? artifact.node_id : null, scope);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const title = (artifact.title ?? artifact.stem).replace(/`/g, "");

  const openPlan = () => {
    void openDocTab(artifact.node_id, "markdown", scope).catch(() => undefined);
  };

  return (
    <li
      className={`overflow-hidden rounded-fg-md border border-rule bg-paper-raised ${
        expanded ? "ring-1 ring-accent/30" : ""
      }`}
      data-open-plan
      data-node-id={artifact.node_id}
      data-open-plan-selected={expanded ? "" : undefined}
    >
      <div className="flex flex-col gap-fg-1-5 px-fg-2 py-fg-2">
        <div className="flex items-center gap-fg-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={treeId}
            aria-label={`${expanded ? "collapse" : "expand"} steps for ${title}`}
            data-open-plan-toggle
            className="flex shrink-0 items-center rounded-fg-xs text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <Chevron size={TWISTY_PX} aria-hidden />
          </button>
          <button
            type="button"
            onClick={openPlan}
            data-open-plan-row
            aria-label={`open plan ${title} in the reader`}
            className="min-w-0 flex-1 truncate text-left text-body font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            title={title}
          >
            {title}
          </button>
          {artifact.tier && (
            <span data-plan-tier aria-label={`tier ${artifact.tier}`}>
              <Badge>{artifact.tier}</Badge>
            </span>
          )}
        </div>
        {total > 0 && (
          <div className="flex items-center gap-fg-2">
            <ProgressBar
              value={done}
              max={total}
              label={`${title} completion`}
              className="flex-1"
            />
            <span
              className="shrink-0 text-meta tabular-nums text-ink-muted"
              data-plan-progress
            >
              {done}/{total}
            </span>
            {pct !== null && (
              <span className="shrink-0 text-meta tabular-nums text-ink-faint">
                {pct}%
              </span>
            )}
            {fresh && (
              <span className="shrink-0 text-meta text-ink-faint" data-freshness>
                · {fresh}
              </span>
            )}
          </div>
        )}
      </div>
      {expanded && (
        <div id={treeId} className="px-fg-2 pb-fg-2">
          <PlanStepTree view={interior} />
        </div>
      )}
    </li>
  );
}

function OpenPlansBody({ scope }: { scope: string | null }) {
  const timeline = useDashboardTimelineModeView(scope);
  const asOf = timeline.asOf;
  const view = usePipelineStatusView(scope, asOf);
  const now = Date.now();
  const { expanded, toggle } = usePipelineExpansion(scope, asOf, view.planIds);

  if (view.degraded) {
    return (
      <p className="text-label text-ink-muted" data-open-plans-state="degraded">
        pipeline status unavailable
      </p>
    );
  }
  if (view.loading) {
    return (
      <p
        className="animate-pulse-live text-label text-ink-faint motion-reduce:animate-none"
        data-open-plans-state="loading"
        role="status"
      >
        reading in-flight work…
      </p>
    );
  }
  if (view.plans.length === 0) {
    return (
      <p className="text-label text-ink-faint" data-open-plans-state="empty">
        no plans in flight on this branch
      </p>
    );
  }
  return (
    <ul className="space-y-fg-1-5" role="list" data-open-plans-list>
      {view.plans.map((artifact) => (
        <PlanPill
          key={artifact.node_id}
          artifact={artifact}
          now={now}
          expanded={expanded.has(artifact.node_id)}
          onToggle={() => toggle(artifact.node_id)}
        />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// GitHub work items — PR + issue rows; gh-brokered, capability-local degraded.
// ---------------------------------------------------------------------------

/** A small token-tier check summary chip for a PR row. */
function ChecksTag({ pr }: { pr: PullRequest }) {
  if (!pr.checks || pr.checks.total === 0) return null;
  const { passed, failing, total } = pr.checks;
  const ok = failing === 0 && passed === total;
  return (
    <span
      className={`shrink-0 text-meta ${ok ? "text-state-active" : failing > 0 ? "text-state-broken" : "text-ink-faint"}`}
      data-pr-checks
    >
      {ok ? "✓ checks" : failing > 0 ? `${failing} failing` : "checks pending"}
    </span>
  );
}

function PrRow({ pr, merged }: { pr: PullRequest; merged?: boolean }) {
  const Icon = merged ? GitMerge : GitPullRequest;
  const iconClass = merged
    ? "text-ink-muted"
    : pr.is_draft
      ? "text-ink-faint"
      : "text-accent";
  const stateLabel = merged ? "merged" : pr.is_draft ? "draft" : "open";
  return (
    <li
      className="flex flex-col gap-fg-0-5 rounded-fg-xs px-fg-1 py-fg-1"
      data-pr
      data-pr-number={pr.number}
    >
      <div className="flex items-center gap-fg-1-5">
        <Icon size={ICON_PX} aria-hidden className={`shrink-0 ${iconClass}`} />
        <span className="shrink-0 font-mono text-meta text-accent-text" data-tabular>
          #{pr.number}
        </span>
        <span className="min-w-0 flex-1 truncate text-label text-ink" title={pr.title}>
          {pr.title}
        </span>
        <Badge tone={merged || pr.is_draft ? "neutral" : "accent"}>{stateLabel}</Badge>
      </div>
      <div className="flex items-center gap-fg-1-5 pl-fg-4 text-meta text-ink-faint">
        {pr.author && <span>{pr.author}</span>}
        {!merged && <ChecksTag pr={pr} />}
        {merged && pr.merged_at && <span data-tabular>merged</span>}
      </div>
    </li>
  );
}

function unavailableNote(reason: string | null, what: string) {
  return (
    <p className="text-label text-ink-faint" data-state="unavailable">
      {reason ?? `${what} unavailable — GitHub not reachable`}
    </p>
  );
}

function OpenPrsBody({ scope }: { scope: string | null }) {
  const view = usePRsView(scope, "open");
  if (view.loading) {
    return (
      <p
        className="animate-pulse-live text-label text-ink-faint motion-reduce:animate-none"
        role="status"
      >
        reading open PRs…
      </p>
    );
  }
  if (!view.available) return unavailableNote(view.reason, "pull requests");
  if (view.prs.length === 0) {
    return <p className="text-label text-ink-faint">no open pull requests</p>;
  }
  return (
    <ul className="space-y-fg-0-5" role="list" data-prs-list>
      {view.prs.map((pr) => (
        <PrRow key={pr.number} pr={pr} />
      ))}
    </ul>
  );
}

function RecentPrsBody({ scope }: { scope: string | null }) {
  const view = usePRsView(scope, "merged");
  if (view.loading) {
    return (
      <p
        className="animate-pulse-live text-label text-ink-faint motion-reduce:animate-none"
        role="status"
      >
        reading recent PRs…
      </p>
    );
  }
  if (!view.available) return unavailableNote(view.reason, "pull requests");
  if (view.prs.length === 0) {
    return (
      <p className="text-label text-ink-faint">no recently-merged pull requests</p>
    );
  }
  return (
    <ul className="space-y-fg-0-5" role="list" data-recent-prs-list>
      {view.prs.map((pr) => (
        <PrRow key={pr.number} pr={pr} merged />
      ))}
    </ul>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  return (
    <li
      className="flex flex-col gap-fg-0-5 rounded-fg-xs px-fg-1 py-fg-1"
      data-issue
      data-issue-number={issue.number}
    >
      <div className="flex items-center gap-fg-1-5">
        <CircleDot size={ICON_PX} aria-hidden className="shrink-0 text-accent" />
        <span className="shrink-0 font-mono text-meta text-accent-text" data-tabular>
          #{issue.number}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-label text-ink"
          title={issue.title}
        >
          {issue.title}
        </span>
      </div>
      {(issue.labels.length > 0 || issue.author) && (
        <div className="flex flex-wrap items-center gap-fg-1 pl-fg-4 text-meta text-ink-faint">
          {issue.labels.slice(0, 3).map((label) => (
            <Badge key={label} tone="neutral">
              {label}
            </Badge>
          ))}
          {issue.author && <span>· {issue.author}</span>}
        </div>
      )}
    </li>
  );
}

function OpenIssuesBody({ scope }: { scope: string | null }) {
  const view = useIssuesView(scope, "open");
  if (view.loading) {
    return (
      <p
        className="animate-pulse-live text-label text-ink-faint motion-reduce:animate-none"
        role="status"
      >
        reading open issues…
      </p>
    );
  }
  if (!view.available) return unavailableNote(view.reason, "issues");
  if (view.issues.length === 0) {
    return <p className="text-label text-ink-faint">no open issues</p>;
  }
  return (
    <ul className="space-y-fg-0-5" role="list" data-issues-list>
      {view.issues.map((issue) => (
        <IssueRow key={issue.number} issue={issue} />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Recent commits — expandable rows revealing the full message body + show-more.
// ---------------------------------------------------------------------------

function RecentCommitsBody({ scope }: { scope: string | null }) {
  const [limit, setLimit] = useState(HISTORY_PAGE);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const view = useHistoryView(scope, limit);

  if (view.degraded || view.errored) {
    return (
      <p className="text-label text-ink-muted" data-recent-commits-state="degraded">
        recent history unavailable
      </p>
    );
  }
  if (view.loading) {
    return (
      <p
        className="animate-pulse-live text-label text-ink-faint motion-reduce:animate-none"
        data-recent-commits-state="loading"
        role="status"
      >
        reading recent commits…
      </p>
    );
  }
  if (view.recentCommitRows.length === 0) {
    return (
      <p className="text-label text-ink-faint" data-recent-commits-state="empty">
        no commits yet on this branch.
      </p>
    );
  }

  const toggle = (hash: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });

  return (
    <div className="space-y-fg-0-5" data-recent-commits-list>
      <ul className="space-y-fg-0-5" role="list">
        {view.recentCommitRows.map((row) => {
          const { commit } = row;
          const expanded = open.has(commit.hash);
          const Chevron = expanded ? ChevronDown : ChevronRight;
          return (
            <li key={commit.hash} data-recent-commit data-hash={commit.hash}>
              <div className="flex items-center gap-fg-1-5 rounded-fg-xs px-fg-1 py-fg-1">
                <button
                  type="button"
                  onClick={() => toggle(commit.hash)}
                  disabled={!row.hasBody}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "collapse" : "expand"} message for ${commit.short_hash}`}
                  className={`flex shrink-0 items-center rounded-fg-xs text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                    row.hasBody ? "" : "opacity-40"
                  }`}
                  data-commit-toggle
                >
                  <Chevron size={TWISTY_PX} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (row.selectable)
                      void selectEventNodes(
                        row.eventId,
                        row.touchedNodeIds,
                        scope,
                      ).catch(() => undefined);
                  }}
                  disabled={!row.selectable}
                  className="flex min-w-0 flex-1 items-center gap-fg-1-5 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                  aria-label={`commit ${commit.short_hash}: ${commit.subject}`}
                >
                  <span
                    className="shrink-0 font-mono text-meta text-accent-text"
                    data-short-hash
                    data-tabular
                  >
                    {commit.short_hash}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-label text-ink-muted"
                    title={commit.subject}
                  >
                    {commit.subject || "(no subject)"}
                  </span>
                  <span className="shrink-0 text-meta text-ink-faint" data-tabular>
                    {row.ageLabel}
                  </span>
                </button>
              </div>
              {expanded && row.hasBody && (
                <div
                  className="ml-fg-5 mt-fg-0-5 whitespace-pre-wrap rounded-fg-xs border border-rule bg-paper-raised px-fg-2 py-fg-1-5 text-label text-ink-muted"
                  data-commit-body
                >
                  {commit.body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {view.canShowMore && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + HISTORY_PAGE)}
          className="w-full rounded-fg-xs px-fg-2 py-fg-1 text-center text-label text-ink-muted transition-colors duration-ui-fast hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          data-show-more-commits
        >
          Show more
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Status overview surface.
// ---------------------------------------------------------------------------

export function StatusTab() {
  const scope = useActiveScope();
  // Section-header counts mirror the binding board ("OPEN PLANS — N"). They read
  // the same interpreted views the bodies consume; TanStack dedupes the shared
  // query keys, so a count and its body never double-fetch.
  const timeline = useDashboardTimelineModeView(scope);
  const plansView = usePipelineStatusView(scope, timeline.asOf);
  const openPrs = usePRsView(scope, "open");
  const openIssues = useIssuesView(scope, "open");
  const count = (n: number) => (n > 0 ? n : undefined);
  return (
    <div className="space-y-fg-2 text-body" data-status-tab>
      <LocationStrip scope={scope} />
      <SectionCard title="Open plans" count={count(plansView.plans.length)}>
        <OpenPlansBody scope={scope} />
      </SectionCard>
      <SectionCard title="Open PRs" count={count(openPrs.prs.length)}>
        <OpenPrsBody scope={scope} />
      </SectionCard>
      <SectionCard title="Open issues" count={count(openIssues.issues.length)}>
        <OpenIssuesBody scope={scope} />
      </SectionCard>
      <SectionCard title="Recent PRs">
        <RecentPrsBody scope={scope} />
      </SectionCard>
      <SectionCard title="Recent commits">
        <RecentCommitsBody scope={scope} />
      </SectionCard>
    </div>
  );
}
