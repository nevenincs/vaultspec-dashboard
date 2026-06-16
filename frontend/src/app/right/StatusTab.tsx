// The Status overview — the rail's primary informational surface
// (status-overview ADR): a snapshot answering the three operator questions at a
// glance — "Where are we?" (the location anchor header), "What is being worked
// on?" (the plan-derived open-work list with the step-tree dropdown), and "What
// has been committed?" (the recent-commit list with subjects). Where the prior
// Work + Changes pillars split these, this consolidates them as the headline
// surface and fixes their data sources to the plan-derived model the ADR pins.
//
// Layer ownership (dashboard-layer-ownership / views-are-projections): this is a
// DUMB app-chrome view. It consumes stores selectors EXCLUSIVELY
// (`useLocationAnchor`, `usePipelineStatusView`, `usePlanInteriorView`,
// `useHistoryView`) — it fetches nothing, never inspects the raw `tiers` block,
// and defines no node model. Open/in-flight work is read from the plan-step
// projection, NEVER from graph connectivity or transport state
// (open-work-is-read-from-plan-steps candidate; the deliberately-dropped
// "connections" section is a non-goal). Degradation is read from the tiers truth
// the selectors interpret (degradation-is-read-from-tiers-not-guessed-from-errors).
//
// Plan rows OPEN the plan document in the markdown reader via the existing
// `openInViewer` intent (review-rail-viewers viewers) and EXPAND into their open
// steps via the existing plan step-tree dropdown — reuse, not new UI. Recent
// commits cross-link to the vault docs the commit touched through the existing
// selection seam.
//
// Design language: warmth lives in the tokens — every color is a `--color-*`
// semantic token (light / dark / high-contrast), no raw hex, no third icon
// family. Structural chrome is Lucide; the domain plane is Phosphor. Status
// carriers read by shape + text first, hue as redundant reinforcement.

import {
  ChevronDown,
  ChevronRight,
  CircleSlash,
  FolderGit2,
  GitBranch,
} from "lucide-react";
import { GitCommit, ListChecks } from "@phosphor-icons/react";
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
import { PlanStepTree, ProgressRing } from "./WorkTab";

// Icon sizing — 14px is the iconography ADR's grayscale-by-shape gate; the
// disclosure chevron + structural chrome read one density step smaller so they
// stay attenuated relative to the domain plane (design-language ADR layer 4).
const DOMAIN_PX = 16;
const GATE_PX = 14;
const CHROME_PX = 13;
const SMALL_PX = 13;

// How many recent commits the rail renders (the stores query is bounded; this
// trims the rendered list to the ADR's short snapshot).
const RECENT_COMMITS = 12;

// ---------------------------------------------------------------------------
// Section header — the shared uppercase label idiom the rail already uses.
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-vs-1 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// Location anchor — "Where are we?" (absolute path · worktree · branch).
// ---------------------------------------------------------------------------

function LocationAnchor({ scope }: { scope: string | null }) {
  const anchor = useLocationAnchor(scope);
  const hasUpstream = anchor.ahead !== undefined || anchor.behind !== undefined;
  const aheadN = anchor.ahead ?? 0;
  const behindN = anchor.behind ?? 0;

  if (!anchor.path) {
    return (
      <section aria-label="location" data-location-anchor data-location-state="empty">
        <p className="text-label text-ink-faint">no scope — pick a worktree first</p>
      </section>
    );
  }

  return (
    <section
      aria-label="location"
      data-location-anchor
      data-location-state="located"
      className="space-y-vs-1 rounded-vs-md border border-rule bg-paper-raised px-vs-2 py-vs-1-5 shadow-card"
    >
      {/* Absolute path — identity, so monospace per the typography law; forward
          slashes already canonical from the scope token. */}
      <div className="flex items-center gap-vs-1-5">
        <span className="shrink-0 text-ink-faint" aria-hidden>
          <FolderGit2 size={DOMAIN_PX} />
        </span>
        <span
          className="min-w-0 flex-1 truncate font-mono text-label text-ink-muted"
          data-location-path
          title={anchor.path}
        >
          {anchor.path}
        </span>
        {anchor.isMain && (
          <span
            className="shrink-0 rounded-vs-sm border border-rule px-vs-1 text-2xs font-medium text-ink-muted"
            data-location-main
            aria-label="main worktree"
          >
            main
          </span>
        )}
      </div>

      {/* Branch + divergence + dirty chips. */}
      <div className="flex items-center gap-vs-1-5 text-label">
        <span className="shrink-0 text-ink-faint" aria-hidden>
          <GitBranch size={GATE_PX} />
        </span>
        <span
          className="min-w-0 flex-1 truncate font-mono text-ink-muted"
          data-location-branch
        >
          {anchor.branch ?? "—"}
        </span>
        {hasUpstream && (aheadN > 0 || behindN > 0) && (
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
        {anchor.dirty ? (
          <span className="shrink-0 rounded-full bg-accent-subtle px-vs-1-5 py-vs-0-5 text-2xs text-accent-text">
            changes
          </span>
        ) : (
          <span className="shrink-0 text-2xs text-state-active">clean</span>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Open-plan row — the plan-derived open-work model: progress + tier + phase,
// expandable into its open steps (the reused step-tree dropdown), opening the
// plan document in the markdown reader on activation.
// ---------------------------------------------------------------------------

interface OpenPlanRowProps {
  artifact: PipelineArtifact;
  now: number;
  expanded: boolean;
  onToggle: () => void;
}

function OpenPlanRow({ artifact, now, expanded, onToggle }: OpenPlanRowProps) {
  const openInViewer = useViewStore((s) => s.openInViewer);
  const progress = artifact.progress;
  const fresh = freshnessLabel(artifact.dates?.modified, now);
  const treeId = `status-tree-${artifact.node_id}`;
  // Lazily fetch the interior ONLY while expanded (graph-queries-are-bounded).
  const interior = usePlanInteriorView(expanded ? artifact.node_id : null);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  // A plan node is a `doc:<stem>` id → the markdown reader surface.
  const openPlan = () => {
    selectNode(artifact.node_id);
    openInViewer(artifact.node_id, "markdown");
  };

  return (
    <li className="space-y-vs-0-5" data-open-plan data-node-id={artifact.node_id}>
      <div className="flex items-stretch gap-vs-0-5">
        {/* Expand/collapse — an accessible disclosure; lazily enables the
            interior query for THIS plan only. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={treeId}
          aria-label={`${expanded ? "collapse" : "expand"} steps for ${artifact.title ?? artifact.stem}`}
          data-open-plan-toggle
          className="flex shrink-0 items-center rounded-vs-sm px-vs-0-5 text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          <Chevron size={SMALL_PX} aria-hidden />
        </button>
        {/* The plan row body — activating it opens the plan document in the
            markdown reader (review-rail-viewers viewer) AND selects it. */}
        <button
          type="button"
          onClick={openPlan}
          data-open-plan-row
          aria-label={`open plan ${artifact.title ?? artifact.stem} in the reader`}
          className="flex min-w-0 flex-1 items-center gap-vs-1-5 rounded-vs-sm border border-rule px-vs-2 py-vs-1 text-left transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          {progress && <ProgressRing done={progress.done} total={progress.total} />}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-vs-1-5">
              <span className="min-w-0 truncate text-body text-ink">
                {artifact.title ?? artifact.stem}
              </span>
              {artifact.tier && (
                <span
                  className="shrink-0 rounded-vs-sm border border-rule px-vs-1 text-2xs font-medium text-ink-muted"
                  data-plan-tier
                  aria-label={`tier ${artifact.tier}`}
                >
                  {artifact.tier}
                </span>
              )}
            </span>
            <span className="mt-px flex items-center gap-vs-1-5 text-2xs text-ink-faint">
              <span data-pipeline-phase>{artifact.phase}</span>
              {fresh && (
                <span data-tabular data-freshness>
                  {fresh}
                </span>
              )}
            </span>
          </span>
        </button>
      </div>
      {/* The reused step-tree dropdown (lazily-loaded interior). */}
      {expanded && (
        <div id={treeId} className="pl-vs-4">
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
      <SectionHeading>In flight</SectionHeading>

      {/* Designed DEGRADED state, read from the tiers truth — never a transport
          guess (degradation-is-read-from-tiers-not-guessed-from-errors). */}
      {view.degraded ? (
        <p
          className="flex items-start gap-vs-1-5 rounded-vs-sm bg-paper-sunken px-vs-2 py-vs-1 text-label text-ink-muted"
          data-open-plans-state="degraded"
        >
          <span className="mt-px shrink-0 text-ink-faint" aria-hidden>
            <CircleSlash size={CHROME_PX} />
          </span>
          <span>pipeline status unavailable</span>
        </p>
      ) : view.loading ? (
        <p
          className="animate-pulse-live text-label text-ink-faint motion-reduce:animate-none"
          data-open-plans-state="loading"
          role="status"
        >
          reading in-flight work…
        </p>
      ) : plans.length === 0 ? (
        <p
          className="flex items-start gap-vs-1-5 px-vs-1 py-vs-1 text-label text-ink-faint"
          data-open-plans-state="empty"
        >
          <span className="mt-px shrink-0" aria-hidden>
            <ListChecks size={CHROME_PX} />
          </span>
          <span>no plans in flight on this branch</span>
        </p>
      ) : (
        <ul className="space-y-vs-1" role="list" data-open-plans-list>
          {plans.map((artifact) => (
            <OpenPlanRow
              key={artifact.node_id}
              artifact={artifact}
              now={now}
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
// Recent commits — "What has been committed?" (subject + short hash + age),
// cross-linking to the vault docs the commit touched.
// ---------------------------------------------------------------------------

function RecentCommits({ scope }: { scope: string | null }) {
  const view = useHistoryView(scope);
  const selectEntity = useViewStore((s) => s.selectEntity);
  const now = Date.now();

  return (
    <section aria-label="recent commits" data-recent-commits>
      <SectionHeading>Committed</SectionHeading>

      {view.degraded ? (
        <p
          className="flex items-start gap-vs-1-5 rounded-vs-sm bg-paper-sunken px-vs-2 py-vs-1 text-label text-ink-muted"
          data-recent-commits-state="degraded"
        >
          <span className="mt-px shrink-0 text-ink-faint" aria-hidden>
            <CircleSlash size={CHROME_PX} />
          </span>
          <span>recent history unavailable</span>
        </p>
      ) : view.errored ? (
        <p
          className="text-label text-state-broken"
          data-recent-commits-state="error"
          role="status"
        >
          recent history unavailable
        </p>
      ) : view.loading ? (
        <p
          className="animate-pulse-live text-label text-ink-faint motion-reduce:animate-none"
          data-recent-commits-state="loading"
          role="status"
        >
          reading recent commits…
        </p>
      ) : view.commits.length === 0 ? (
        <p
          className="px-vs-1 py-vs-1 text-label text-ink-faint"
          data-recent-commits-state="empty"
        >
          no commits yet on this branch.
        </p>
      ) : (
        <ul className="space-y-vs-0-5" role="list" data-recent-commits-list>
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
                <button
                  type="button"
                  onClick={select}
                  disabled={touched.length === 0}
                  aria-label={`commit ${commit.short_hash}: ${commit.subject}${
                    touched.length ? `, ${touched.length} touched nodes` : ""
                  }`}
                  className={`flex w-full items-center gap-vs-1-5 rounded-vs-sm px-vs-1 py-vs-0-5 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                    touched.length
                      ? "hover:bg-paper-sunken"
                      : "cursor-default opacity-90"
                  }`}
                >
                  <span className="shrink-0 text-ink-faint" aria-hidden>
                    <GitCommit size={GATE_PX} />
                  </span>
                  {/* Subject is the primary, grayscale-safe carrier. */}
                  <span className="min-w-0 flex-1 truncate text-label text-ink-muted">
                    {commit.subject || "(no subject)"}
                  </span>
                  {/* Short hash is identity → mono. */}
                  <span
                    className="shrink-0 font-mono text-2xs text-ink-faint"
                    data-tabular
                    data-short-hash
                  >
                    {commit.short_hash}
                  </span>
                  <span className="shrink-0 text-2xs text-ink-faint" data-tabular>
                    {relativeTs(new Date(commit.ts).toISOString(), now)}
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
    <div className="space-y-vs-3 text-body" data-status-tab>
      <LocationAnchor scope={scope} />
      <OpenPlans scope={scope} />
      <RecentCommits scope={scope} />
    </div>
  );
}
