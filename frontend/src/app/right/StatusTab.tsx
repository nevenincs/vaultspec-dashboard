// The Status overview — the rail's primary informational surface (status-overview
// ADR), rebuilt to the binding Figma board EXACTLY (ActivityRail Status state, node
// 238:601). The board answers the three operator questions at a glance:
//   • "Where are we?"        → the context Card: the absolute path (mono) plus a
//     "worktree <name>" chip and a "branch <name>" chip, both on the accent-subtle
//     ground (board nodes 112:15–112:23).
//   • "What is being worked on?" → "OPEN PLANS — N" then the plan tree: each plan
//     row is a twisty + StatusDot + title + a "done/total" count + a tier Badge,
//     the selected row carrying the accent-subtle ground and a trailing accent
//     selection bar; expanded children are the open step rows (board 112:24–112:57).
//   • "What has been committed?" → "RECENT COMMITS" then commit rows: a mono short
//     hash in accent-text and the subject in muted ink (board 112:58–112:70).
//
// Layer ownership (dashboard-layer-ownership / views-are-projections): this is a
// DUMB app-chrome view. It consumes stores selectors EXCLUSIVELY
// (`useLocationAnchor`, `usePipelineStatusView`, `usePlanInteriorView`,
// `useHistoryView`) — it fetches nothing, never inspects the raw `tiers` block, and
// defines no node model. Open/in-flight work is read from the plan-step projection,
// NEVER from graph connectivity or transport state. Degradation is read from the
// tiers truth the selectors interpret
// (degradation-is-read-from-tiers-not-guessed-from-errors).
//
// Plan rows OPEN the plan document in the markdown reader via the existing
// `openInViewer` intent (review-rail-viewers viewers) and EXPAND into their open
// steps via the existing plan step-tree dropdown — reuse, not new UI. Recent
// commits cross-link to the vault docs the commit touched through the existing
// selection seam.
//
// Design system (design-system-is-centralized): the context surface is the kit
// Card, the eyebrows the kit SectionLabel, the category mark the kit StatusDot, the
// tier the kit Badge; chrome chevrons come from the centralized kit glyphs. No raw
// hex, no loose font-size — every color and size resolves to a bound token.

import type { HTMLAttributes } from "react";
import { useState } from "react";

import type { PipelineArtifact } from "../../stores/server/engine";
import {
  useHistoryView,
  useLocationAnchor,
  usePipelineStatusView,
  usePlanInteriorView,
} from "../../stores/server/queries";
import { selectNode } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";
import { useActiveScope } from "../stage/Stage";
import { freshnessLabel } from "../left/VaultBrowser";
import { relativeTs } from "./ChangesOverview";
import { PlanStepTree } from "./WorkTab";
// Centralized kit primitives (design-system-is-centralized).
import {
  Badge,
  Card,
  ChevronDown,
  ChevronRight,
  ProgressBar,
  SectionLabel,
  StatusDot,
} from "../kit";

// Disclosure chevron sizing — the board paints a 10px twisty on the plan row.
const TWISTY_PX = 10;

// How many recent commits the rail renders (the stores query is bounded; this
// trims the rendered list to the board's short snapshot).
const RECENT_COMMITS = 12;

// ---------------------------------------------------------------------------
// Location anchor — "Where are we?" (path · worktree chip · branch chip).
// ---------------------------------------------------------------------------

/** A "label value" key/value chip on the accent-subtle ground (board 112:18).
 *  The `valueProps` ride the value span so a caller can hang a data-attr on the
 *  value text alone (e.g. the branch name) without the label leaking into it. */
function ContextChip({
  label,
  value,
  valueProps,
}: {
  label: string;
  value: string;
  valueProps?: HTMLAttributes<HTMLSpanElement>;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-fg-1 rounded-fg-pill bg-accent-subtle px-fg-2 py-px text-caption">
      <span className="font-normal text-ink-faint">{label}</span>
      <span className="truncate font-medium text-accent-text" {...valueProps}>
        {value}
      </span>
    </span>
  );
}

function LocationAnchor({ scope }: { scope: string | null }) {
  const anchor = useLocationAnchor(scope);

  if (!anchor.path) {
    return (
      <section aria-label="location" data-location-anchor data-location-state="empty">
        <p className="text-label text-ink-faint">no scope — pick a worktree first</p>
      </section>
    );
  }

  return (
    <Card
      elevation="flat"
      padded={false}
      aria-label="location"
      data-location-anchor
      data-location-state="located"
      className="space-y-fg-2 bg-paper-sunken px-fg-3 py-fg-2"
    >
      {/* Absolute path — identity, so monospace per the typography law; forward
          slashes already canonical from the scope token. */}
      <p
        className="w-full break-all font-mono text-mono text-ink"
        data-location-path
        title={anchor.path}
      >
        {anchor.path}
      </p>
      {/* Worktree + branch chips on the accent-subtle ground, wrapping. */}
      <div className="flex flex-wrap items-center gap-fg-1-5">
        {anchor.isMain ? (
          <span data-location-main>
            <ContextChip label="worktree" value="main" />
          </span>
        ) : null}
        {anchor.branch && (
          <ContextChip
            label="branch"
            value={anchor.branch}
            valueProps={
              { "data-location-branch": "" } as HTMLAttributes<HTMLSpanElement>
            }
          />
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Open-plan row — the plan-derived open-work model: StatusDot + title + count +
// tier, expandable into its open steps (the reused step-tree dropdown), opening
// the plan document in the markdown reader on activation.
// ---------------------------------------------------------------------------

interface OpenPlanRowProps {
  artifact: PipelineArtifact;
  now: number;
  selected: boolean;
  expanded: boolean;
  onToggle: () => void;
}

function OpenPlanRow({
  artifact,
  now,
  selected,
  expanded,
  onToggle,
}: OpenPlanRowProps) {
  const openInViewer = useViewStore((s) => s.openInViewer);
  const progress = artifact.progress;
  const total = progress?.total ?? 0;
  const done = progress?.done ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : null;
  const fresh = freshnessLabel(artifact.dates?.modified, now);
  const treeId = `status-tree-${artifact.node_id}`;
  // Lazily fetch the interior ONLY while expanded (graph-queries-are-bounded).
  const interior = usePlanInteriorView(expanded ? artifact.node_id : null);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const title = artifact.title ?? artifact.stem;

  // A plan node is a `doc:<stem>` id → the markdown reader surface.
  const openPlan = () => {
    selectNode(artifact.node_id);
    openInViewer(artifact.node_id, "markdown");
  };

  return (
    <li data-open-plan data-node-id={artifact.node_id}>
      {/* A proper two-line in-flight plan row: a TITLE line (twisty · dot · title ·
          tier badge) over a PROGRESS line (a real completion bar + done/total + %
          + freshness). The whole row opens the plan; the twisty toggles the step
          tree; the selected row carries the accent-subtle ground + accent sel-bar. */}
      <div
        className={`flex flex-col gap-fg-1-5 rounded-fg-md px-fg-2 py-fg-2 transition-colors duration-ui-fast ease-settle ${
          selected ? "bg-accent-subtle" : "hover:bg-paper-sunken"
        }`}
        data-open-plan-selected={selected ? "" : undefined}
      >
        {/* Title line. */}
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
          <StatusDot category="plan" />
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
          {selected && (
            <span
              aria-hidden
              data-open-plan-sel-bar
              className="h-4 w-[2.5px] shrink-0 rounded-[1.5px] bg-accent"
            />
          )}
        </div>

        {/* Progress line — the real completion bar, indented under the title. */}
        {total > 0 && (
          <div className="flex items-center gap-fg-2 pl-fg-6">
            <ProgressBar
              value={done}
              max={total}
              label={`${title} completion`}
              className="flex-1"
            />
            <span
              className="shrink-0 text-meta tabular-nums text-ink-muted"
              data-tabular
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
      {/* The reused step-tree dropdown (lazily-loaded interior). */}
      {expanded && (
        <div id={treeId} className="mt-fg-1 pl-fg-6">
          <PlanStepTree view={interior} />
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Open-plans section — the plan-derived open-work list.
// ---------------------------------------------------------------------------

function OpenPlans({ scope }: { scope: string | null }) {
  const timelineMode = useViewStore((s) => s.timelineMode);
  const asOf = timelineMode.kind === "time-travel" ? timelineMode.at : undefined;
  const view = usePipelineStatusView(scope, asOf);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const now = Date.now();
  const plans = view.artifacts.filter((a) => a.doc_type === "plan");

  return (
    <section aria-label="open plans" data-open-plans>
      {/* Board 238:601: "OPEN PLANS — N" uppercase eyebrow (kit SectionLabel). */}
      <SectionLabel count={plans.length > 0 ? plans.length : undefined}>
        Open plans
      </SectionLabel>

      {/* Designed DEGRADED state, read from the tiers truth — never a transport
          guess (degradation-is-read-from-tiers-not-guessed-from-errors). */}
      {view.degraded ? (
        <p
          className="mt-fg-1-5 rounded-fg-md bg-paper-sunken px-fg-3 py-fg-2 text-label text-ink-muted"
          data-open-plans-state="degraded"
        >
          pipeline status unavailable
        </p>
      ) : view.loading ? (
        <p
          className="mt-fg-1-5 animate-pulse-live text-label text-ink-faint motion-reduce:animate-none"
          data-open-plans-state="loading"
          role="status"
        >
          reading in-flight work…
        </p>
      ) : plans.length === 0 ? (
        <p
          className="mt-fg-1-5 text-label text-ink-faint"
          data-open-plans-state="empty"
        >
          no plans in flight on this branch
        </p>
      ) : (
        <ul className="mt-fg-1-5 space-y-fg-0-5" role="list" data-open-plans-list>
          {plans.map((artifact, i) => (
            <OpenPlanRow
              key={artifact.node_id}
              artifact={artifact}
              now={now}
              // The board paints the FIRST open plan as the selected row; the
              // selection reflects the plan currently expanded by the operator,
              // defaulting to the leading plan (the board's resting state).
              selected={expanded.size === 0 ? i === 0 : expanded.has(artifact.node_id)}
              expanded={expanded.has(artifact.node_id)}
              onToggle={() => toggle(artifact.node_id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Recent commits — "What has been committed?" (mono short hash + subject),
// cross-linking to the vault docs the commit touched.
// ---------------------------------------------------------------------------

function RecentCommits({ scope }: { scope: string | null }) {
  const view = useHistoryView(scope);
  const selectEntity = useViewStore((s) => s.selectEntity);
  const now = Date.now();

  return (
    <section aria-label="recent commits" data-recent-commits>
      <SectionLabel className="px-fg-0 py-fg-0">Recent commits</SectionLabel>

      {view.degraded ? (
        <p
          className="mt-fg-1-5 rounded-fg-md bg-paper-sunken px-fg-3 py-fg-2 text-label text-ink-muted"
          data-recent-commits-state="degraded"
        >
          recent history unavailable
        </p>
      ) : view.errored ? (
        <p
          className="mt-fg-1-5 text-label text-state-broken"
          data-recent-commits-state="error"
          role="status"
        >
          recent history unavailable
        </p>
      ) : view.loading ? (
        <p
          className="mt-fg-1-5 animate-pulse-live text-label text-ink-faint motion-reduce:animate-none"
          data-recent-commits-state="loading"
          role="status"
        >
          reading recent commits…
        </p>
      ) : view.commits.length === 0 ? (
        <p
          className="mt-fg-1-5 text-label text-ink-faint"
          data-recent-commits-state="empty"
        >
          no commits yet on this branch.
        </p>
      ) : (
        <ul className="mt-fg-1-5 space-y-fg-0-5" role="list" data-recent-commits-list>
          {view.commits.slice(0, RECENT_COMMITS).map((commit) => {
            const touched = commit.node_ids.filter((id) => !id.startsWith("commit:"));
            const select = () => {
              if (touched.length === 0) return;
              selectEntity({
                kind: "event",
                id: `commit:${commit.hash}`,
                nodeIds: touched,
              });
            };
            return (
              <li key={commit.hash} data-recent-commit data-hash={commit.hash}>
                {/* Message-first two-line commit row: the SUBJECT is the primary
                    carrier (the actual commit message, readable, no longer hidden
                    behind a hash), over a meta line — short hash · relative time ·
                    touched-file count. */}
                <button
                  type="button"
                  onClick={select}
                  disabled={touched.length === 0}
                  aria-label={`commit ${commit.short_hash}: ${commit.subject}${
                    touched.length ? `, ${touched.length} touched nodes` : ""
                  }`}
                  className={`flex w-full flex-col gap-fg-0-5 rounded-fg-md px-fg-2 py-fg-1-5 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                    touched.length
                      ? "hover:bg-paper-sunken"
                      : "cursor-default opacity-90"
                  }`}
                >
                  <span className="w-full truncate text-label text-ink">
                    {commit.subject || "(no subject)"}
                  </span>
                  <span className="flex items-center gap-fg-1-5 text-meta text-ink-faint">
                    {/* Short hash is identity → mono, in the accent-text ink. */}
                    <span
                      className="shrink-0 font-mono text-accent-text"
                      data-tabular
                      data-short-hash
                    >
                      {commit.short_hash}
                    </span>
                    <span aria-hidden>·</span>
                    <span data-tabular>
                      {relativeTs(new Date(commit.ts).toISOString(), now)}
                    </span>
                    {touched.length > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span data-tabular>
                          {touched.length} file{touched.length === 1 ? "" : "s"}
                        </span>
                      </>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The Status overview surface.
// ---------------------------------------------------------------------------

export function StatusTab() {
  const scope = useActiveScope();
  return (
    <div className="space-y-fg-4 text-body" data-status-tab>
      <LocationAnchor scope={scope} />
      <OpenPlans scope={scope} />
      <RecentCommits scope={scope} />
    </div>
  );
}
