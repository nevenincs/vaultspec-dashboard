// The Status overview — the rail's primary informational surface, rebuilt to the
// binding Figma redesign (ActivityRail · Status, node 353:1027). The rail answers
// the operator's "where / what's in flight / what's open / what just changed"
// questions through a stack of flush COLLAPSIBLE SECTIONS — the one canonical
// fold (a twisty + SectionLabel over a collapsible body, NO border, NO card
// background; the kit `FoldSection` primitive, shared identically with the left
// rail). Location identity (project / worktree / branch / path) lives ONLY in
// the left rail's switcher trigger (worktree-switcher-identity ADR) — this rail
// states no location of its own:
//   • OPEN PLANS — flush plan trackers foregrounding a real progress bar,
//     expandable into the standardized step tree,
//   • PULL REQUESTS / OPEN ISSUES — GitHub work items (one PR fold: open items
//     lead, recently merged follow — 2026-07-12 IA simplification),
//   • RECENT COMMITS — expandable commit rows that reveal the full message body,
//     with a "Show more" control.
//
// EMPTY IS EMPTY: a section whose content is SERVED and known to be zero is not
// rendered at all — no fold header offering a disclosure onto nothing. The
// predicate is the stores layer's (`deriveStatusTabSectionVisibility`) and is
// bounded to the reads the rail already holds: a loading, degraded, or
// gh-unavailable section always renders, because an absent section must read as
// "there are none", never as "we could not look", and a section whose content is
// unknown until its body mounts (Commits) is never judged at all.
//
// Layer ownership (dashboard-layer-ownership / views-are-projections): this is a
// DUMB app-chrome view. It consumes stores selectors EXCLUSIVELY
// (`usePipelineStatusView`, `usePlanInteriorView`,
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

import { CircleDot, ExternalLink, GitMerge, GitPullRequest } from "lucide-react";

import { useFocusZone } from "../chrome/useFocusZone";

import {
  DEFAULT_HISTORY_LIMIT,
  derivePullRequestsSectionView,
  deriveStatusTabSectionsView,
  deriveStatusTabSectionVisibility,
  type IssueRowView,
  type PipelinePlanRowView,
  type PullRequestRowView,
  type RecentCommitRow,
  useActiveScope,
  useDashboardTimelineModeView,
  useHistoryView,
  useIssuesView,
  usePipelineStatusView,
  usePlanInteriorView,
  usePRsView,
} from "../../stores/server/queries";
import {
  derivePipelineExpansionRows,
  usePipelineExpansion,
} from "../../stores/view/pipelineExpansion";
import { openContextMenu } from "../../stores/view/contextMenu";
import { authoredDisplayText } from "../../platform/localization/displayText";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { handleKeyboardContextMenu } from "../chrome/keyboardContextMenu";
import { guardedContextMenu } from "../menus/guardedContextMenu";
import { RowMenuDisclosure } from "../chrome/RowMenuDisclosure";
import type { FocusZoneItemOptions, FocusZoneItemProps } from "../chrome/useFocusZone";
import { selectEventNodes } from "../../stores/view/selection";
import {
  deriveStatusSectionChromeView,
  deriveRecentCommitChromeRows,
  type RecentCommitChromeRowView,
  showMoreRecentCommits,
  type StatusSectionId,
  toggleRecentCommit,
  toggleStatusSection,
  useRecentCommitsChrome,
  useStatusSectionOpen,
} from "../../stores/view/statusTabChrome";
import { activateEntity } from "../../stores/view/activateEntity";
import { freshness } from "../presentation/freshness";
import { ChangesOverview } from "./ChangesOverview";
import { PlanStepTree } from "./PlanStepTree";
import { RailDegraded, RailEmpty, RailLoading, type RailState } from "./railStates";
// Centralized kit primitives (design-system-is-centralized).
import {
  Badge,
  DecorativeGlyph,
  ChevronDown,
  ChevronRight,
  ProgressBar,
  SectionLabel,
  Skeleton,
  SkeletonRow,
  StateBlock,
} from "../kit";
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
  /** Resting open/closed state when the user has no saved preference. Sections
   *  default COLLAPSED (the user opens what they want; the choice persists). */
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
  defaultOpen = false,
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
// Plan pill — a contained tracker foregrounding its progress bar, expandable
// into the step tree, opening the plan in the reader on click.
// ---------------------------------------------------------------------------

interface PlanPillProps {
  row: PipelinePlanRowView;
  now: number;
  expanded: boolean;
  className: string;
  selectedValue: "" | undefined;
  isTimeTravel: boolean;
  onToggle: () => void;
  nav?: RowNav;
}

export function PlanPill({
  row,
  now,
  expanded,
  className,
  selectedValue,
  isTimeTravel,
  onToggle,
  nav,
}: PlanPillProps) {
  const scope = useActiveScope();
  const resolveMessage = useLocalizedMessageResolver();
  const fresh = freshness(row.modifiedAt, now);
  const treeId = `status-tree-${row.nodeId}`;
  const interior = usePlanInteriorView(expanded ? row.nodeId : null, scope);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const toggleAriaLabel = resolveMessage(row.toggleLabel(expanded)).message;
  const openAriaLabel = resolveMessage(row.openAriaLabel).message;
  const tierAriaLabel =
    row.tierAriaLabel === null ? null : resolveMessage(row.tierAriaLabel).message;
  const progressLabel = resolveMessage(row.progressLabel).message;

  const openPlan = () => {
    // Read-mode open through the ONE `activateEntity` seam with `frame: true`: the
    // activity rail is off-canvas, so opening a plan PREVIEWS it in the single
    // provisional tab (#15) AND materializes + CENTERS the graph on that plan node
    // (the missing (c); unified-selection plane).
    void activateEntity(row.nodeId, scope, { permanent: false, frame: true }).catch(
      () => undefined,
    );
  };

  // The plan list is ONE tab stop: the pill's own disclosure row roves, ArrowUp/Down
  // move between plans, and cross-axis ArrowRight/ArrowLeft expand/collapse the step
  // tree (the disclosure-row model, like the vault tree). ArrowRight on an ALREADY
  // expanded row opens the plan — the same cross-axis "descend into the thing" the
  // step rows use to open an exec record, so opening stays reachable from the
  // keyboard now that the row itself toggles
  // (keyboard-navigation; every-composite-navigates-through-the-one-focuszone).
  const item = nav?.rove(row.nodeId, {
    onCrossNext: () => {
      if (expanded) openPlan();
      else onToggle();
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
          {/* The WHOLE pill row is the disclosure: twisty + title in one button, so a
              click anywhere along the row opens or closes the step tree rather than
              hunting a chevron the size of a full stop. It holds the row's single tab
              stop and carries the disclosure semantics (aria-expanded/-controls);
              opening the plan moved to the explicit affordance beside it. */}
          <button
            type="button"
            ref={item?.ref}
            tabIndex={item ? item.tabIndex : undefined}
            onKeyDown={item?.onKeyDown}
            onFocus={() => nav?.setActive(row.nodeId)}
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={treeId}
            aria-label={toggleAriaLabel}
            data-open-plan-toggle
            data-open-plan-row
            className="flex min-w-0 flex-1 items-center gap-fg-2 rounded-fg-xs text-left transition-colors duration-ui-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            title={row.titleLabel}
          >
            <Chevron size={TWISTY_PX} aria-hidden className="shrink-0 text-ink-faint" />
            <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">
              {row.titleLabel}
            </span>
          </button>
          {row.tierLabel && tierAriaLabel && (
            <span data-plan-tier aria-label={tierAriaLabel}>
              <Badge>{row.tierLabel}</Badge>
            </span>
          )}
          {/* Open the plan in the reader (and centre the graph on it). Pointer-reachable
              and named; it drops out of the tab ring because the row is ONE tab stop —
              the keyboard reaches it through the roving cross-axis ArrowRight above. */}
          <button
            type="button"
            tabIndex={-1}
            onClick={openPlan}
            aria-label={openAriaLabel}
            data-open-plan-open
            className="flex shrink-0 items-center rounded-fg-xs p-fg-0-5 text-ink-faint transition-colors duration-ui-fast hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <ExternalLink size={ICON_PX} aria-hidden />
          </button>
        </div>
        {row.showProgress && (
          <div className="flex items-center gap-fg-2">
            <ProgressBar
              value={row.progressDone}
              max={row.progressTotal}
              label={progressLabel}
              className="flex-1"
            />
            <span
              className="shrink-0 text-meta tabular-nums text-ink-muted"
              data-plan-progress
            >
              {row.progressTextLabel}
            </span>
            {row.progressPercentLabel !== null && (
              <span className="shrink-0 text-meta tabular-nums text-ink-muted">
                {row.progressPercentLabel}
              </span>
            )}
            {fresh && (
              <span className="shrink-0 text-meta text-ink-muted" data-freshness>
                <DecorativeGlyph name="middleDot" />{" "}
                {resolveMessage(fresh.descriptor).message}
              </span>
            )}
          </div>
        )}
      </div>
      {expanded && (
        <div id={treeId} className="px-fg-2 pb-fg-2">
          <PlanStepTree
            view={interior}
            planNodeId={row.nodeId}
            scope={scope}
            isTimeTravel={isTimeTravel}
          />
        </div>
      )}
    </li>
  );
}

function OpenPlansBody({ scope }: { scope: unknown }) {
  const resolveMessage = useLocalizedMessageResolver();
  const timeline = useDashboardTimelineModeView(scope);
  const asOf = timeline.asOf;
  const isTimeTravel = timeline.timeTravel;
  const view = usePipelineStatusView(scope, asOf);
  const now = Date.now();
  const { expanded, toggle } = usePipelineExpansion(scope, asOf, view.planIds);
  const planRows = derivePipelineExpansionRows(view.planRows, expanded);
  // One roving zone over the plan rows: the list is a single tab stop and arrows
  // move between plans (the open button holds the stop; the chevron rides along).
  const nav = useRowZone();
  const statusLabel = resolveMessage(view.openPlansStatusLabel).message;

  if (view.degraded) {
    return <StateBlock mode="degraded" layout="inline" message={statusLabel} />;
  }
  if (view.loading) {
    return (
      <Skeleton label={statusLabel}>
        <SkeletonRow width="w-2/3" />
        <SkeletonRow width="w-1/2" />
      </Skeleton>
    );
  }
  if (view.planRows.length === 0) {
    return <StateBlock mode="empty" message={statusLabel} />;
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
            isTimeTravel={isTimeTravel}
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
  const resolveMessage = useLocalizedMessageResolver();
  const { pr } = row;
  const Icon = row.icon === "merged" ? GitMerge : GitPullRequest;
  const key = `pr:${pr.number}`;
  const item = nav ? nav.rove(key) : null;
  const prEntity = {
    kind: "pull-request" as const,
    id: String(pr.number),
    title: pr.title,
    url: pr.url,
  };
  const openMenuAt = (anchor: { x: number; y: number }) =>
    openContextMenu(prEntity, anchor);
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
      onContextMenu={guardedContextMenu((e) => {
        e.preventDefault();
        openMenuAt({ x: e.clientX, y: e.clientY });
      })}
    >
      <div className="flex items-center gap-fg-1-5">
        <Icon size={ICON_PX} aria-hidden className={`shrink-0 ${row.iconToneClass}`} />
        <span className="shrink-0 font-mono text-meta text-accent-text" data-tabular>
          {row.numberLabel}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-label text-ink"
          title={authoredDisplayText(pr.title)}
        >
          {row.titleLabel}
        </span>
        <Badge tone={row.stateTone}>{row.stateLabel}</Badge>
        {/* Go to the pull request on its remote. The href is the engine-SERVED
            `url` — never composed here — and the affordance simply disappears when
            the wire carries none. It leaves the tab ring because the row is ONE tab
            stop; the keyboard reaches the same navigation through the row menu. */}
        {pr.url && (
          <a
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={-1}
            aria-label={
              resolveMessage({ key: "projects:actions.openPullRequest" }).message
            }
            data-pr-link
            className="flex shrink-0 items-center rounded-fg-xs p-fg-0-5 text-ink-faint transition-colors duration-ui-fast hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <ExternalLink size={ICON_PX} aria-hidden />
          </a>
        )}
        <RowMenuDisclosure
          entity={prEntity}
          label={
            resolveMessage({
              key: "common:accessibility.actionsForItem",
              values: { item: authoredDisplayText(row.titleLabel) },
            }).message
          }
        />
      </div>
      <div className="flex items-center gap-fg-1-5 pl-fg-4 text-meta text-ink-muted">
        {row.authorLabel && <span>{row.authorLabel}</span>}
        {row.icon !== "merged" && <ChecksTag row={row} />}
        {row.mergedLabel && <span data-tabular>{row.mergedLabel}</span>}
      </div>
    </li>
  );
}

/** The ONE pull-request body (2026-07-12 IA simplification): open PRs lead,
 *  recently merged follow under a quiet sub-label — one fold instead of the
 *  former OPEN PRS / RECENT PRS pair. One roving zone spans both lists so the
 *  section stays a single tab stop; the state rows carry the Open/Merged badge
 *  so mixed rows stay unambiguous. */
function PullRequestsBody({ scope }: { scope: unknown }) {
  const resolveMessage = useLocalizedMessageResolver();
  const open = usePRsView(scope, "open");
  const merged = usePRsView(scope, "merged");
  const view = derivePullRequestsSectionView(open, merged);
  const nav = useRowZone();
  if (view.showLoading) {
    return (
      <Skeleton label={resolveMessage(view.loadingLabel).message}>
        <SkeletonRow width="w-2/3" />
        <SkeletonRow width="w-1/2" />
      </Skeleton>
    );
  }
  if (view.showUnavailable) {
    return (
      <StateBlock mode="degraded" layout="inline" message={view.unavailableLabel} />
    );
  }
  if (view.showEmpty) {
    return (
      <StateBlock mode="empty" message={resolveMessage(view.emptyLabel).message} />
    );
  }
  return (
    <div className="flex flex-col gap-fg-2">
      {view.openRows.length > 0 && (
        <ul className={view.listClassName} role="list" data-prs-list>
          {view.openRows.map((row) => (
            <PrRow key={row.pr.number} row={row} nav={nav} />
          ))}
        </ul>
      )}
      {view.mergedRows.length > 0 && (
        <div className="flex flex-col gap-fg-1-5" data-recent-prs-list>
          <SectionLabel>{resolveMessage(view.mergedLabel).message}</SectionLabel>
          <ul className={view.listClassName} role="list">
            {view.mergedRows.map((row) => (
              <PrRow key={row.pr.number} row={row} nav={nav} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function IssueRow({ row }: { row: IssueRowView }) {
  const resolveMessage = useLocalizedMessageResolver();
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
          title={authoredDisplayText(issue.title)}
        >
          {row.titleLabel}
        </span>
        {/* Go to the issue on its remote — the engine-SERVED `url`, never composed
            here, and absent entirely when the wire carries none. An issue row is not
            enrolled in a roving zone, so this stays an ordinary tab stop. */}
        {issue.url && (
          <a
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={resolveMessage({ key: "projects:actions.openIssue" }).message}
            data-issue-link
            className="flex shrink-0 items-center rounded-fg-xs p-fg-0-5 text-ink-faint transition-colors duration-ui-fast hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <ExternalLink size={ICON_PX} aria-hidden />
          </a>
        )}
      </div>
      {(row.labels.length > 0 || row.authorLabel) && (
        <div className="flex flex-wrap items-center gap-fg-1 pl-fg-4 text-meta text-ink-muted">
          {row.labels.map((label) => (
            <Badge key={label} tone="neutral">
              {label}
            </Badge>
          ))}
          {row.authorLabel && (
            <span>
              <DecorativeGlyph name="middleDot" /> {row.authorLabel}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

function OpenIssuesBody({ scope }: { scope: unknown }) {
  const resolveMessage = useLocalizedMessageResolver();
  const view = useIssuesView(scope, "open");
  if (view.showLoading) {
    return (
      <Skeleton label={resolveMessage(view.loadingLabel).message}>
        <SkeletonRow width="w-2/3" />
        <SkeletonRow width="w-1/2" />
      </Skeleton>
    );
  }
  if (view.showUnavailable) {
    return (
      <StateBlock mode="degraded" layout="inline" message={view.unavailableLabel} />
    );
  }
  if (view.showEmpty) {
    return (
      <StateBlock mode="empty" message={resolveMessage(view.emptyLabel).message} />
    );
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

export function RecentCommitItem({
  chromeRow,
  commitBodyClassName,
  scope,
}: {
  chromeRow: RecentCommitChromeRowView<RecentCommitRow>;
  commitBodyClassName: string;
  scope: unknown;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const { row, expanded, showBody } = chromeRow;
  const { commit } = row;
  const subjectLabel =
    typeof row.subjectLabel === "string"
      ? row.subjectLabel
      : resolveMessage(row.subjectLabel).message;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const commitEntity = {
    kind: "commit" as const,
    id: commit.hash,
    shortHash: commit.short_hash,
    subject: commit.subject,
    ts: commit.ts,
  };

  return (
    <li
      className={chromeRow.rootClassName}
      data-recent-commit
      data-hash={commit.hash}
      onContextMenu={guardedContextMenu((e) => {
        e.preventDefault();
        openContextMenu(commitEntity, { x: e.clientX, y: e.clientY });
      })}
    >
      <div className={chromeRow.headerClassName}>
        <button
          type="button"
          onClick={() => toggleRecentCommit(commit.hash)}
          disabled={!row.hasBody}
          aria-expanded={expanded}
          aria-label={
            resolveMessage({
              key: expanded
                ? "common:finalWave.history.collapseMessage"
                : "common:finalWave.history.expandMessage",
              values: { commit: authoredDisplayText(subjectLabel) },
            }).message
          }
          className={chromeRow.toggleClassName}
          data-commit-toggle
        >
          <Chevron size={TWISTY_PX} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            if (row.selectable)
              void selectEventNodes(row.eventId, row.touchedNodeIds, scope).catch(
                () => undefined,
              );
          }}
          disabled={!row.selectable}
          className={chromeRow.rowButtonClassName}
          aria-label={
            resolveMessage({
              key: "common:finalWave.history.openCommit",
              values: { commit: authoredDisplayText(subjectLabel) },
            }).message
          }
        >
          <span
            className={`${chromeRow.subjectClassName} select-text`}
            title={commit.subject ? authoredDisplayText(commit.subject) : undefined}
          >
            {subjectLabel}
          </span>
          <span className={`${chromeRow.ageClassName} select-text`} data-tabular>
            {row.ageLabel}
          </span>
        </button>
        <RowMenuDisclosure
          entity={commitEntity}
          label={
            resolveMessage({
              key: "common:accessibility.actionsForItem",
              values: { item: authoredDisplayText(subjectLabel) },
            }).message
          }
        />
      </div>
      {showBody && (
        <div className={commitBodyClassName} data-commit-body>
          {commit.body}
        </div>
      )}
    </li>
  );
}

function RecentCommitsBody({ scope }: { scope: unknown }) {
  const resolveMessage = useLocalizedMessageResolver();
  const chrome = useRecentCommitsChrome(HISTORY_PAGE);
  const view = useHistoryView(scope, chrome.limit);

  if (view.showUnavailable) {
    return (
      <StateBlock
        mode="degraded"
        layout="inline"
        message={resolveMessage(view.unavailableLabel).message}
      />
    );
  }
  if (view.showLoading) {
    return (
      <Skeleton label={resolveMessage(view.loadingLabel).message}>
        <SkeletonRow width="w-2/3" />
        <SkeletonRow width="w-1/2" />
      </Skeleton>
    );
  }
  if (view.showEmpty) {
    return (
      <StateBlock mode="empty" message={resolveMessage(view.emptyLabel).message} />
    );
  }

  const chromeRows = deriveRecentCommitChromeRows(
    view.recentCommitRows,
    chrome.openHashes,
  );

  return (
    <div className={view.listRootClassName} data-recent-commits-list>
      <ul className={view.listClassName} role="list">
        {chromeRows.map((chromeRow) => (
          <RecentCommitItem
            key={chromeRow.row.commit.hash}
            chromeRow={chromeRow}
            commitBodyClassName={view.commitBodyClassName}
            scope={scope}
          />
        ))}
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
 * open across plans / PRs / issues → the empty medallion; otherwise the typical
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
  return "typical";
}

/**
 * The rail's MODE presentation — a wire-free view over an already-resolved state
 * (visual-review-harness ADR D2). It fetches nothing and derives nothing: the four
 * canonical modes are chosen by the `railState` prop, and the typical body arrives
 * as children.
 *
 * The split is what lets the review harness render every mode by simply passing one,
 * with no engine, no fixture, and no seeded wire — and it is why this component
 * carries no preview/override affordance. A container derives; a view renders.
 */
export function StatusTabView({
  railState,
  children,
}: {
  railState: RailState;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-fg-4 text-body" data-status-tab data-rail-state={railState}>
      {railState === "loading" && <RailLoading />}
      {railState === "degraded" && <RailDegraded />}
      {railState === "empty" && <RailEmpty />}
      {railState === "typical" && children}
    </div>
  );
}

export function StatusTab() {
  const resolveMessage = useLocalizedMessageResolver();
  const scope = useActiveScope();
  // Section-header counts mirror the binding board ("OPEN PLANS — N"). They read
  // the same interpreted views the bodies consume; TanStack dedupes the shared
  // query keys, so a count and its body never double-fetch.
  const timeline = useDashboardTimelineModeView(scope);
  const plansView = usePipelineStatusView(scope, timeline.asOf);
  const openPrs = usePRsView(scope, "open");
  const openIssues = useIssuesView(scope, "open");
  // The merged read rides along at rail level for ONE reason: whether the pull-request
  // section exists at all is the SECTION's emptiness (both lists settled empty), and
  // the stores layer owns that predicate. Judging it on the open count alone would
  // hide a settled recently-merged list behind a repository with no open PRs. It is
  // the same bounded gh-brokered list the open count already reads, and TanStack
  // dedupes the key with the section body's own call, so expanding costs nothing more.
  const mergedPrs = usePRsView(scope, "merged");
  const sections = deriveStatusTabSectionsView({
    openPlans: plansView.plans.length,
    openPrs: openPrs.prs.length,
    openIssues: openIssues.issues.length,
  });
  // Empty is empty: a section whose content is served and known-zero is not rendered
  // at all. Loading / degraded / gh-unavailable sections always render — an absent
  // section must mean "there are none", never "the read failed".
  const visible = deriveStatusTabSectionVisibility({
    openPlans: {
      loading: plansView.loading,
      degraded: plansView.degraded,
      count: plansView.plans.length,
    },
    pullRequests: derivePullRequestsSectionView(openPrs, mergedPrs),
    openIssues,
  });
  const railState = deriveRailState(plansView, openPrs, openIssues);
  // The rail's five fold headers are ONE tab stop: arrows rove between sections via
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
    <StatusTabView railState={railState}>
      <ChangesOverview {...headerNav("changes")} />
      {/* A suppressed section calls no `headerNav`, so it leaves the rail's roving
          header order entirely — the FocusZone rebuilds that order from the rove
          calls each render makes, exactly as a collapsed tree node does. */}
      {visible.openPlans && (
        <SectionCard
          {...headerNav(sections.openPlans.id)}
          id={sections.openPlans.id}
          title={resolveMessage(sections.openPlans.title).message}
          count={sections.openPlans.count}
        >
          <OpenPlansBody scope={scope} />
        </SectionCard>
      )}
      {visible.pullRequests && (
        <SectionCard
          {...headerNav(sections.pullRequests.id)}
          id={sections.pullRequests.id}
          title={resolveMessage(sections.pullRequests.title).message}
          count={sections.pullRequests.count}
        >
          <PullRequestsBody scope={scope} />
        </SectionCard>
      )}
      {visible.openIssues && (
        <SectionCard
          {...headerNav(sections.openIssues.id)}
          id={sections.openIssues.id}
          title={resolveMessage(sections.openIssues.title).message}
          count={sections.openIssues.count}
        >
          <OpenIssuesBody scope={scope} />
        </SectionCard>
      )}
      <SectionCard
        {...headerNav(sections.recentCommits.id)}
        id={sections.recentCommits.id}
        title={resolveMessage(sections.recentCommits.title).message}
      >
        <RecentCommitsBody scope={scope} />
      </SectionCard>
      {/* The two admin consoles (Search service, Approvals) were evicted from the
          rail into modal control panels (activity-rail-realignment ADR D1/D3);
          the rail is status-only. They are reached from the rail-footer framework
          status cluster now. */}
    </StatusTabView>
  );
}
