// The Status overview — the rail's primary informational surface, rebuilt to the
// binding Figma redesign (ActivityRail · Status, node 353:1027). The rail answers
// the operator's "where / what's in flight / what's open / what just changed"
// questions through a stack of flush COLLAPSIBLE SECTIONS — the one canonical
// fold (a twisty + SectionLabel over a collapsible body, NO border, NO card
// background; the kit `FoldSection` primitive, shared identically with the left
// rail):
//   • a slim LOCATION strip (the current branch name only — the worktree name and
//     folder picker live in the left rail's single title),
//   • OPEN PLANS — flush plan trackers foregrounding a real progress bar,
//     expandable into the standardized step tree,
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
// (degradation-is-read-from-tiers-not-guessed-from-errors). Section collapse,
// recent-commit expansion, and local paging live behind the status-tab chrome
// seam so the surface does not own ad hoc state.
//
// Design system (design-system-is-centralized): the fold, the progress bar,
// badges, and the disclosure chevrons resolve to centralized kit primitives and
// bound tokens — no raw hex, no loose font-size, no per-surface card chrome.

import type { ReactNode } from "react";

import { CircleDot, GitBranch, GitMerge, GitPullRequest } from "lucide-react";

import {
  DEFAULT_HISTORY_LIMIT,
  deriveStatusTabSectionsView,
  type IssueRowView,
  type PipelinePlanRowView,
  type PullRequestRowView,
  useActiveScope,
  useDashboardTimelineModeView,
  useHistoryView,
  useIssuesView,
  useLocationAnchor,
  usePipelineStatusView,
  usePlanInteriorView,
  usePRsView,
} from "../../stores/server/queries";
import {
  derivePipelineExpansionRows,
  usePipelineExpansion,
} from "../../stores/view/pipelineExpansion";
import { selectEventNodes } from "../../stores/view/selection";
import {
  deriveStatusSectionChromeView,
  deriveRecentCommitChromeRows,
  showMoreRecentCommits,
  type StatusSectionId,
  toggleRecentCommit,
  toggleStatusSection,
  useRecentCommitsChrome,
  useStatusSectionOpen,
} from "../../stores/view/statusTabChrome";
import { openDocTab } from "../../stores/view/tabs";
import { freshnessLabel } from "../presentation/freshness";
import { PlanStepTree } from "./PlanStepTree";
// Centralized kit primitives (design-system-is-centralized).
import {
  Badge,
  ChevronDown,
  ChevronRight,
  FoldSection,
  ProgressBar,
  SectionLabel,
} from "../kit";

const TWISTY_PX = 10;
const ICON_PX = 13;
const HISTORY_PAGE = DEFAULT_HISTORY_LIMIT;

// ---------------------------------------------------------------------------
// Collapsible section card — the cohesive container for every rail section.
// ---------------------------------------------------------------------------

interface SectionCardProps {
  id: StatusSectionId;
  title: string;
  count?: number;
  /** Resting open/closed state; sections default open (the everything-expanded
   *  light rail). */
  defaultOpen?: boolean;
  children: ReactNode;
}

function SectionCard({
  id,
  title,
  count,
  defaultOpen = true,
  children,
}: SectionCardProps) {
  const open = useStatusSectionOpen(id, defaultOpen);
  const chrome = deriveStatusSectionChromeView(id, open);
  // The canonical fold (FoldSection): a twisty + the SectionLabel eyebrow over a
  // collapsible body, flush — no border, no card background. Identical to the
  // left rail's group folds (design-system-is-centralized).
  return (
    <FoldSection
      open={open}
      onToggle={() => toggleStatusSection(id, defaultOpen)}
      bodyId={chrome.bodyId}
      twistyPx={chrome.twistyPx}
      headerClassName={chrome.headerClassName}
      bodyClassName={chrome.bodyClassName}
      label={<SectionLabel count={count}>{title}</SectionLabel>}
      data-section
    >
      {chrome.bodyVisible ? children : null}
    </FoldSection>
  );
}

// ---------------------------------------------------------------------------
// Location strip — slim "where are we" (worktree · branch over a faint path).
// ---------------------------------------------------------------------------

function LocationStrip({ scope }: { scope: unknown }) {
  const anchor = useLocationAnchor(scope);
  if (!anchor.path) {
    return (
      <p
        className={anchor.emptyClassName}
        data-location-strip
        data-location-state="empty"
      >
        {anchor.emptyLabel}
      </p>
    );
  }
  // De-duplicated location (4 displays → 2): the right rail shows ONLY the
  // current branch name. The worktree name and folder picker live in the left
  // rail's single clickable title; the absolute path and the redundant worktree
  // label are no longer repeated here.
  return (
    <div
      className="flex items-center gap-fg-1-5 px-fg-1 text-label"
      data-location-strip
      data-location-state="located"
    >
      <GitBranch size={ICON_PX} aria-hidden className="shrink-0 text-ink-faint" />
      {anchor.branch && (
        <span
          className={anchor.branchClassName}
          data-location-branch
          title={anchor.branch}
        >
          {anchor.branch}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan pill — a contained tracker foregrounding its progress bar, expandable
// into the step tree, opening the plan in the reader on click.
// ---------------------------------------------------------------------------

interface PlanPillProps {
  row: PipelinePlanRowView;
  now: number;
  expanded: boolean;
  className: string;
  selectedValue: "" | undefined;
  onToggle: () => void;
}

function PlanPill({
  row,
  now,
  expanded,
  className,
  selectedValue,
  onToggle,
}: PlanPillProps) {
  const scope = useActiveScope();
  const fresh = freshnessLabel(row.modifiedAt, now);
  const treeId = `status-tree-${row.nodeId}`;
  const interior = usePlanInteriorView(expanded ? row.nodeId : null, scope);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  const openPlan = () => {
    void openDocTab(row.nodeId, "markdown", scope).catch(() => undefined);
  };

  return (
    <li
      className={className}
      data-open-plan
      data-node-id={row.nodeId}
      data-open-plan-selected={selectedValue}
    >
      <div className="flex flex-col gap-fg-1-5 px-fg-2 py-fg-2">
        <div className="flex items-center gap-fg-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={treeId}
            aria-label={row.toggleLabel(expanded)}
            data-open-plan-toggle
            className="flex shrink-0 items-center rounded-fg-xs text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <Chevron size={TWISTY_PX} aria-hidden />
          </button>
          <button
            type="button"
            onClick={openPlan}
            data-open-plan-row
            aria-label={row.openAriaLabel}
            className="min-w-0 flex-1 truncate text-left text-body font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            title={row.titleLabel}
          >
            {row.titleLabel}
          </button>
          {row.tierLabel && row.tierAriaLabel && (
            <span data-plan-tier aria-label={row.tierAriaLabel}>
              <Badge>{row.tierLabel}</Badge>
            </span>
          )}
        </div>
        {row.showProgress && (
          <div className="flex items-center gap-fg-2">
            <ProgressBar
              value={row.progressDone}
              max={row.progressTotal}
              label={row.progressLabel}
              className="flex-1"
            />
            <span
              className="shrink-0 text-meta tabular-nums text-ink-muted"
              data-plan-progress
            >
              {row.progressTextLabel}
            </span>
            {row.progressPercentLabel !== null && (
              <span className="shrink-0 text-meta tabular-nums text-ink-faint">
                {row.progressPercentLabel}
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

function OpenPlansBody({ scope }: { scope: unknown }) {
  const timeline = useDashboardTimelineModeView(scope);
  const asOf = timeline.asOf;
  const view = usePipelineStatusView(scope, asOf);
  const now = Date.now();
  const { expanded, toggle } = usePipelineExpansion(scope, asOf, view.planIds);
  const planRows = derivePipelineExpansionRows(view.planRows, expanded);

  if (view.degraded) {
    return (
      <p className="text-label text-ink-muted" data-open-plans-state="degraded">
        {view.openPlansStatusLabel}
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
        {view.openPlansStatusLabel}
      </p>
    );
  }
  if (view.planRows.length === 0) {
    return (
      <p className="text-label text-ink-faint" data-open-plans-state="empty">
        {view.openPlansStatusLabel}
      </p>
    );
  }
  return (
    <ul className="space-y-fg-1-5" role="list" data-open-plans-list>
      {planRows.map(
        ({ row, expanded, statusPlanClassName, statusPlanSelectedValue }) => (
          <PlanPill
            key={row.nodeId}
            row={row}
            now={now}
            expanded={expanded}
            className={statusPlanClassName}
            selectedValue={statusPlanSelectedValue}
            onToggle={() => toggle(row.nodeId)}
          />
        ),
      )}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// GitHub work items — PR + issue rows; gh-brokered, capability-local degraded.
// ---------------------------------------------------------------------------

/** A small token-tier check summary chip for a PR row. */
function ChecksTag({ row }: { row: PullRequestRowView }) {
  if (!row.checksLabel || !row.checksToneClass) return null;
  return (
    <span className={`shrink-0 text-meta ${row.checksToneClass}`} data-pr-checks>
      {row.checksLabel}
    </span>
  );
}

function PrRow({ row }: { row: PullRequestRowView }) {
  const { pr } = row;
  const Icon = row.icon === "merged" ? GitMerge : GitPullRequest;
  return (
    <li
      className="flex flex-col gap-fg-0-5 rounded-fg-xs px-fg-1 py-fg-1"
      data-pr
      data-pr-number={pr.number}
    >
      <div className="flex items-center gap-fg-1-5">
        <Icon size={ICON_PX} aria-hidden className={`shrink-0 ${row.iconToneClass}`} />
        <span className="shrink-0 font-mono text-meta text-accent-text" data-tabular>
          {row.numberLabel}
        </span>
        <span className="min-w-0 flex-1 truncate text-label text-ink" title={pr.title}>
          {row.titleLabel}
        </span>
        <Badge tone={row.stateTone}>{row.stateLabel}</Badge>
      </div>
      <div className="flex items-center gap-fg-1-5 pl-fg-4 text-meta text-ink-faint">
        {row.authorLabel && <span>{row.authorLabel}</span>}
        {row.icon !== "merged" && <ChecksTag row={row} />}
        {row.mergedLabel && <span data-tabular>{row.mergedLabel}</span>}
      </div>
    </li>
  );
}

function OpenPrsBody({ scope }: { scope: unknown }) {
  const view = usePRsView(scope, "open");
  if (view.showLoading) {
    return (
      <p className={view.loadingClassName} role="status">
        {view.loadingLabel}
      </p>
    );
  }
  if (view.showUnavailable) {
    return (
      <p className={view.unavailableClassName} data-state="unavailable">
        {view.unavailableLabel}
      </p>
    );
  }
  if (view.showEmpty) {
    return <p className={view.emptyClassName}>{view.emptyLabel}</p>;
  }
  return (
    <ul className={view.listClassName} role="list" data-prs-list>
      {view.rows.map((row) => (
        <PrRow key={row.pr.number} row={row} />
      ))}
    </ul>
  );
}

function RecentPrsBody({ scope }: { scope: unknown }) {
  const view = usePRsView(scope, "merged");
  if (view.showLoading) {
    return (
      <p className={view.loadingClassName} role="status">
        {view.loadingLabel}
      </p>
    );
  }
  if (view.showUnavailable) {
    return (
      <p className={view.unavailableClassName} data-state="unavailable">
        {view.unavailableLabel}
      </p>
    );
  }
  if (view.showEmpty) {
    return <p className={view.emptyClassName}>{view.emptyLabel}</p>;
  }
  return (
    <ul className={view.listClassName} role="list" data-recent-prs-list>
      {view.rows.map((row) => (
        <PrRow key={row.pr.number} row={row} />
      ))}
    </ul>
  );
}

function IssueRow({ row }: { row: IssueRowView }) {
  const { issue } = row;
  return (
    <li
      className="flex flex-col gap-fg-0-5 rounded-fg-xs px-fg-1 py-fg-1"
      data-issue
      data-issue-number={issue.number}
    >
      <div className="flex items-center gap-fg-1-5">
        <CircleDot size={ICON_PX} aria-hidden className="shrink-0 text-accent" />
        <span className="shrink-0 font-mono text-meta text-accent-text" data-tabular>
          {row.numberLabel}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-label text-ink"
          title={issue.title}
        >
          {row.titleLabel}
        </span>
      </div>
      {(row.labels.length > 0 || row.authorLabel) && (
        <div className="flex flex-wrap items-center gap-fg-1 pl-fg-4 text-meta text-ink-faint">
          {row.labels.map((label) => (
            <Badge key={label} tone="neutral">
              {label}
            </Badge>
          ))}
          {row.authorLabel && <span>· {row.authorLabel}</span>}
        </div>
      )}
    </li>
  );
}

function OpenIssuesBody({ scope }: { scope: unknown }) {
  const view = useIssuesView(scope, "open");
  if (view.showLoading) {
    return (
      <p className={view.loadingClassName} role="status">
        {view.loadingLabel}
      </p>
    );
  }
  if (view.showUnavailable) {
    return (
      <p className={view.unavailableClassName} data-state="unavailable">
        {view.unavailableLabel}
      </p>
    );
  }
  if (view.showEmpty) {
    return <p className={view.emptyClassName}>{view.emptyLabel}</p>;
  }
  return (
    <ul className={view.listClassName} role="list" data-issues-list>
      {view.rows.map((row) => (
        <IssueRow key={row.issue.number} row={row} />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Recent commits — expandable rows revealing the full message body + show-more.
// ---------------------------------------------------------------------------

function RecentCommitsBody({ scope }: { scope: unknown }) {
  const chrome = useRecentCommitsChrome(HISTORY_PAGE);
  const view = useHistoryView(scope, chrome.limit);

  if (view.showUnavailable) {
    return (
      <p className={view.unavailableClassName} data-recent-commits-state="degraded">
        {view.unavailableLabel}
      </p>
    );
  }
  if (view.showLoading) {
    return (
      <p
        className={view.loadingClassName}
        data-recent-commits-state="loading"
        role="status"
      >
        {view.loadingLabel}
      </p>
    );
  }
  if (view.showEmpty) {
    return (
      <p className={view.emptyClassName} data-recent-commits-state="empty">
        {view.emptyLabel}
      </p>
    );
  }

  const chromeRows = deriveRecentCommitChromeRows(
    view.recentCommitRows,
    chrome.openHashes,
  );

  return (
    <div className={view.listRootClassName} data-recent-commits-list>
      <ul className={view.listClassName} role="list">
        {chromeRows.map((chromeRow) => {
          const { row, expanded, showBody } = chromeRow;
          const { commit } = row;
          const Chevron = expanded ? ChevronDown : ChevronRight;
          return (
            <li
              key={commit.hash}
              className={chromeRow.rootClassName}
              data-recent-commit
              data-hash={commit.hash}
            >
              <div className={chromeRow.headerClassName}>
                <button
                  type="button"
                  onClick={() => toggleRecentCommit(commit.hash)}
                  disabled={!row.hasBody}
                  aria-expanded={expanded}
                  aria-label={row.messageToggleLabel(expanded)}
                  className={chromeRow.toggleClassName}
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
                  className={chromeRow.rowButtonClassName}
                  aria-label={row.rowAriaLabel}
                >
                  <span
                    className={chromeRow.shortHashClassName}
                    data-short-hash
                    data-tabular
                  >
                    {commit.short_hash}
                  </span>
                  <span className={chromeRow.subjectClassName} title={commit.subject}>
                    {row.subjectLabel}
                  </span>
                  <span className={chromeRow.ageClassName} data-tabular>
                    {row.ageLabel}
                  </span>
                </button>
              </div>
              {showBody && (
                <div className={view.commitBodyClassName} data-commit-body>
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
          onClick={() => showMoreRecentCommits(HISTORY_PAGE, HISTORY_PAGE)}
          className={view.showMoreButtonClassName}
          data-show-more-commits
        >
          {view.showMoreLabel}
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
  const sections = deriveStatusTabSectionsView({
    openPlans: plansView.plans.length,
    openPrs: openPrs.prs.length,
    openIssues: openIssues.issues.length,
  });
  return (
    <div className="space-y-fg-2 text-body" data-status-tab>
      <LocationStrip scope={scope} />
      <SectionCard
        id={sections.openPlans.id}
        title={sections.openPlans.title}
        count={sections.openPlans.count}
      >
        <OpenPlansBody scope={scope} />
      </SectionCard>
      <SectionCard
        id={sections.openPrs.id}
        title={sections.openPrs.title}
        count={sections.openPrs.count}
      >
        <OpenPrsBody scope={scope} />
      </SectionCard>
      <SectionCard
        id={sections.openIssues.id}
        title={sections.openIssues.title}
        count={sections.openIssues.count}
      >
        <OpenIssuesBody scope={scope} />
      </SectionCard>
      <SectionCard id={sections.recentPrs.id} title={sections.recentPrs.title}>
        <RecentPrsBody scope={scope} />
      </SectionCard>
      <SectionCard id={sections.recentCommits.id} title={sections.recentCommits.title}>
        <RecentCommitsBody scope={scope} />
      </SectionCard>
    </div>
  );
}
