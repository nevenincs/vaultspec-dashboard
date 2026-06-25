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

import { useState } from "react";
import type { ButtonHTMLAttributes, Ref, ReactNode } from "react";

import { CircleDot, GitBranch, GitMerge, GitPullRequest } from "lucide-react";

import { useFocusZone } from "../chrome/useFocusZone";

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
import { openContextMenu } from "../../stores/view/contextMenu";
import { useViewportClass } from "../../stores/view/viewportClass";
import { handleKeyboardContextMenu } from "../chrome/keyboardContextMenu";
import type { FocusZoneItemOptions, FocusZoneItemProps } from "../chrome/useFocusZone";
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
import { ChangesOverview } from "./ChangesOverview";
import { PlanStepTree } from "./PlanStepTree";
import { RailDegraded, RailEmpty, RailLoading, type RailState } from "./railStates";
// Centralized kit primitives (design-system-is-centralized).
import { Badge, ChevronDown, ChevronRight, ProgressBar } from "../kit";
import { RailSection } from "../chrome/RailSection";

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
  /** Roving-nav header wiring (the rail's section headers are ONE tab stop). */
  headerRef?: Ref<HTMLButtonElement>;
  headerProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  children: ReactNode;
}

function SectionCard({
  id,
  title,
  count,
  defaultOpen = true,
  headerRef,
  headerProps,
  children,
}: SectionCardProps) {
  const open = useStatusSectionOpen(id, defaultOpen);
  const chrome = deriveStatusSectionChromeView(id, open);
  // The ONE shared section header (RailSection), identical to the left rail's
  // Features / Documents sections — same padding, hover, eyebrow casing, and count
  // (design-system-is-centralized; full cross-rail parity).
  return (
    <RailSection
      title={title}
      count={count}
      open={open}
      onToggle={() => toggleStatusSection(id, defaultOpen)}
      bodyId={chrome.bodyId}
      bodyVisible={chrome.bodyVisible}
      headerRef={headerRef}
      headerProps={headerProps}
      data-section
    >
      {children}
    </RailSection>
  );
}

// ---------------------------------------------------------------------------
// Location strip — slim "where are we" (worktree · branch over a faint path).
// ---------------------------------------------------------------------------

function LocationStrip({ scope }: { scope: unknown }) {
  const anchor = useLocationAnchor(scope);
  // Compact (binding compact Status frame 793:3322): the location is a bordered
  // worktree/branch CARD with NO full path (the path line is desktop-only chrome).
  const compact = useViewportClass() === "compact";
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
  // The rail header anchors "where are we" (binding redesign LocationStrip,
  // node 598:1137): a worktree · branch row over a faint mono path. Every value
  // is read from the one `useLocationAnchor` selector — no fetch, no raw tiers.
  return (
    <div
      className={
        compact
          ? "m-fg-3 flex flex-col gap-[0.1875rem] rounded-fg-md border border-rule bg-paper-raised p-fg-3"
          : "flex flex-col gap-[0.1875rem] p-fg-3"
      }
      data-location-strip
      data-location-state="located"
    >
      <div className="flex items-center gap-fg-1-5 text-label">
        <GitBranch size={ICON_PX} aria-hidden className="shrink-0 text-ink-faint" />
        {anchor.mainLabel && (
          <span className={anchor.mainClassName} data-location-worktree>
            {anchor.mainLabel}
          </span>
        )}
        {anchor.mainLabel && anchor.branch && (
          <span aria-hidden className="shrink-0 text-ink-faint">
            ·
          </span>
        )}
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
      {!compact && (
        <span className={anchor.pathClassName} data-location-path title={anchor.path}>
          {anchor.path}
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
  nav?: RowNav;
}

function PlanPill({
  row,
  now,
  expanded,
  className,
  selectedValue,
  onToggle,
  nav,
}: PlanPillProps) {
  const scope = useActiveScope();
  const fresh = freshnessLabel(row.modifiedAt, now);
  const treeId = `status-tree-${row.nodeId}`;
  const interior = usePlanInteriorView(expanded ? row.nodeId : null, scope);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  const openPlan = () => {
    void openDocTab(row.nodeId, "markdown", scope).catch(() => undefined);
  };

  // The plan list is ONE tab stop: the open (title) button roves, ArrowUp/Down
  // move between plans, and cross-axis ArrowRight/ArrowLeft expand/collapse the
  // step tree (the disclosure-row model, like the vault tree). The chevron toggle
  // is reachable by pointer but drops out of the tab ring (tabIndex -1)
  // (keyboard-navigation; every-composite-navigates-through-the-one-focuszone).
  const item = nav?.rove(row.nodeId, {
    onCrossNext: () => {
      if (!expanded) onToggle();
    },
    onCrossPrev: () => {
      if (expanded) onToggle();
    },
  });

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
            // Reachable by pointer + by ArrowRight/Left on the roving row; not its
            // own tab stop (the row is one stop — the open button below holds it).
            tabIndex={-1}
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
            ref={item?.ref}
            tabIndex={item ? item.tabIndex : undefined}
            onKeyDown={item?.onKeyDown}
            onFocus={() => nav?.setActive(row.nodeId)}
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
  // One roving zone over the plan rows: the list is a single tab stop and arrows
  // move between plans (the open button holds the stop; the chevron rides along).
  const nav = useRowZone();

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
            nav={nav}
          />
        ),
      )}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// GitHub work items — PR + issue rows; gh-brokered, capability-local degraded.
// ---------------------------------------------------------------------------

/** Roving wiring threaded to a section's content rows so the list is ONE tab stop
 *  and arrows move between rows (keyboard-navigation W04.P07.S22). */
interface RowNav {
  rove: (key: string, opts?: FocusZoneItemOptions) => FocusZoneItemProps;
  setActive: (key: string) => void;
}

/** A per-section vertical roving zone over its rows. */
function useRowZone(): RowNav {
  const [active, setActive] = useState<string | null>(null);
  const zone = useFocusZone({
    orientation: "vertical",
    wrap: false,
    activeKey: active,
    onActiveKeyChange: setActive,
  });
  return { rove: zone.rove, setActive };
}

/** A small token-tier check summary chip for a PR row. */
function ChecksTag({ row }: { row: PullRequestRowView }) {
  if (!row.checksLabel || !row.checksToneClass) return null;
  return (
    <span className={`shrink-0 text-meta ${row.checksToneClass}`} data-pr-checks>
      {row.checksLabel}
    </span>
  );
}

function PrRow({ row, nav }: { row: PullRequestRowView; nav?: RowNav }) {
  const { pr } = row;
  const Icon = row.icon === "merged" ? GitMerge : GitPullRequest;
  const key = `pr:${pr.number}`;
  const item = nav ? nav.rove(key) : null;
  const openMenuAt = (anchor: { x: number; y: number }) =>
    openContextMenu(
      { kind: "pull-request", id: String(pr.number), title: pr.title, url: pr.url },
      anchor,
    );
  return (
    <li
      // A PR row is informational; its action is the context menu. When the
      // section is enrolled it becomes a focusable, roving row reached by arrows,
      // with Enter/Space + Shift+F10 opening that menu (keyboard-navigation S22).
      ref={item?.ref}
      tabIndex={item ? item.tabIndex : undefined}
      onFocus={item ? () => nav?.setActive(key) : undefined}
      onKeyDown={
        item
          ? (e) => {
              if (handleKeyboardContextMenu(e, openMenuAt)) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                openMenuAt({ x: r.left, y: r.bottom });
                return;
              }
              item.onKeyDown(e);
            }
          : undefined
      }
      className="flex flex-col gap-fg-0-5 rounded-fg-sm border border-rule bg-paper-raised px-fg-2 py-fg-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      data-pr
      data-pr-number={pr.number}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenuAt({ x: e.clientX, y: e.clientY });
      }}
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
  const nav = useRowZone();
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
        <PrRow key={row.pr.number} row={row} nav={nav} />
      ))}
    </ul>
  );
}

function RecentPrsBody({ scope }: { scope: unknown }) {
  const view = usePRsView(scope, "merged");
  const nav = useRowZone();
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
        <PrRow key={row.pr.number} row={row} nav={nav} />
      ))}
    </ul>
  );
}

function IssueRow({ row }: { row: IssueRowView }) {
  const { issue } = row;
  return (
    <li
      className="flex flex-col gap-fg-0-5 rounded-fg-sm border border-rule bg-paper-raised px-fg-2 py-fg-2"
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
              onContextMenu={(e) => {
                e.preventDefault();
                openContextMenu(
                  {
                    kind: "commit",
                    id: commit.hash,
                    shortHash: commit.short_hash,
                    subject: commit.subject,
                  },
                  { x: e.clientX, y: e.clientY },
                );
              }}
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

/**
 * Resolve which of the four binding rail states (node 599:2099) the body shows.
 * Mutually exclusive, in priority order: still loading core work → the skeletons;
 * the pipeline view degraded (structural tier down) → the degraded notice; nothing
 * open across plans / PRs / issues → the empty medallion; otherwise the populated
 * stack. Derived purely from the interpreted stores views — never a raw transport
 * error (degradation-is-read-from-tiers-not-guessed-from-errors).
 */
export function deriveRailState(
  plans: { loading: boolean; degraded: boolean; plans: readonly unknown[] },
  openPrs: { prs: readonly unknown[] },
  openIssues: { issues: readonly unknown[] },
): RailState {
  if (plans.loading) return "loading";
  if (plans.degraded) return "degraded";
  if (
    plans.plans.length === 0 &&
    openPrs.prs.length === 0 &&
    openIssues.issues.length === 0
  )
    return "empty";
  return "populated";
}

export function StatusTab({ stateOverride }: { stateOverride?: RailState } = {}) {
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
  // `stateOverride` is a test-only seam (the /status.html parity harness drives each
  // designed state); production always derives the state from live data.
  const railState = stateOverride ?? deriveRailState(plansView, openPrs, openIssues);
  // The rail's six fold headers are ONE tab stop: arrows rove between sections via
  // the shared FocusZone, Enter/Space toggles the focused fold (the native button)
  // (keyboard-navigation W04.P07.S21). Each section's body rows remain reachable by
  // Tab from its header.
  const [activeHeader, setActiveHeader] = useState<string | null>(null);
  const zone = useFocusZone({
    orientation: "vertical",
    wrap: false,
    activeKey: activeHeader,
    onActiveKeyChange: setActiveHeader,
  });
  const headerNav = (key: string) => {
    const item = zone.rove(key);
    return {
      headerRef: item.ref as Ref<HTMLButtonElement>,
      headerProps: {
        tabIndex: item.tabIndex,
        onKeyDown: item.onKeyDown,
        onFocus: () => setActiveHeader(key),
      } satisfies ButtonHTMLAttributes<HTMLButtonElement>,
    };
  };
  return (
    <div className="space-y-fg-4 text-body" data-status-tab data-rail-state={railState}>
      <LocationStrip scope={scope} />
      {railState === "loading" && <RailLoading />}
      {railState === "degraded" && <RailDegraded />}
      {railState === "empty" && <RailEmpty />}
      {railState === "populated" && (
        <>
          <ChangesOverview {...headerNav("changes")} />
          <SectionCard
            {...headerNav(sections.openPlans.id)}
            id={sections.openPlans.id}
            title={sections.openPlans.title}
            count={sections.openPlans.count}
          >
            <OpenPlansBody scope={scope} />
          </SectionCard>
          <SectionCard
            {...headerNav(sections.openPrs.id)}
            id={sections.openPrs.id}
            title={sections.openPrs.title}
            count={sections.openPrs.count}
          >
            <OpenPrsBody scope={scope} />
          </SectionCard>
          <SectionCard
            {...headerNav(sections.openIssues.id)}
            id={sections.openIssues.id}
            title={sections.openIssues.title}
            count={sections.openIssues.count}
          >
            <OpenIssuesBody scope={scope} />
          </SectionCard>
          <SectionCard
            {...headerNav(sections.recentPrs.id)}
            id={sections.recentPrs.id}
            title={sections.recentPrs.title}
          >
            <RecentPrsBody scope={scope} />
          </SectionCard>
          <SectionCard
            {...headerNav(sections.recentCommits.id)}
            id={sections.recentCommits.id}
            title={sections.recentCommits.title}
          >
            <RecentCommitsBody scope={scope} />
          </SectionCard>
        </>
      )}
    </div>
  );
}
