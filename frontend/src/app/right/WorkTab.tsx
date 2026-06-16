// The work tab content surface (figma-parity-reconciliation W02.P05.S30; binding
// WorkTab Kit primitive, Figma node 137:40): the right rail's in-flight pipeline
// pillar — "what work is in flight" — the live ADR/plan projection with the
// progress ring, status pill, pipeline arc, and the lazily-loaded plan step tree.
// Rebuilt onto the NEW Figma role-named token foundation
// (figma-parity-reconciliation ADR): the `caption` type role for dense counts and
// metadata, canonical radius (`rounded-fg-xs`, `rounded-fg-pill`) for the rows,
// pills, and status badges. No legacy radius or px-purpose type scale.
//
// Layer ownership (dashboard-layer-ownership / views-are-projections): this is a
// DUMB app-chrome view. It consumes the stores pipeline-status selectors
// (`usePipelineStatusView`, `usePlanInteriorView`) EXCLUSIVELY — it fetches
// nothing, never inspects the raw `tiers` block, and defines no node model. It
// emits selection and navigation intent ONLY through the existing `selectNode`
// seam (the SearchTab result-activation path). Degradation is read from the
// tiers truth the selector interprets, never guessed from a transport error
// (degradation-is-read-from-tiers-not-guessed-from-errors).
//
// Bounded by default (graph-queries-are-bounded-by-default): the expandable step
// tree lazily fetches a plan's bounded interior only on expand, and renders the
// engine's honest truncation when a large plan exceeds the node ceiling.
//
// Design language (inherited base design-language / iconography / motion ADRs):
// no new token, no third icon family, no new motion grammar. Structural chrome
// is Lucide; the expressive domain plane is Phosphor. Every status carrier — the
// ProgressRing, the StatusPill, the step check mark — is GRAYSCALE-SAFE: meaning
// is carried by shape + text FIRST, with token hue as redundant reinforcement
// only, legible at the iconography ADR's 14px gate.

import { CircleSlash, FileText } from "lucide-react";
import { ListChecks } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

// Centralized kit primitives (design-system-is-centralized): the tier badge and
// the chrome chevrons resolve to one shared definition. The ProgressRing,
// StatusPill, and StepCheckMark stay bespoke — they encode semantic STATE hue +
// grayscale-by-shape meaning the neutral kit Badge does not model.
import { Badge, ChevronDown, ChevronRight } from "../kit";

import type { PipelineArtifact, PipelinePhase } from "../../stores/server/engine";
import {
  ADR_STATUS_SERVED,
  PLAN_INTERIOR_SERVED,
  usePipelineStatusView,
  usePlanInteriorView,
  type InteriorPhaseView,
  type InteriorRollup,
  type InteriorStepView,
  type InteriorWaveView,
  type PlanInteriorView,
} from "../../stores/server/queries";
import { selectNode } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";
import { useActiveScope } from "../stage/Stage";
import { freshnessLabel } from "../left/VaultBrowser";

// Icon sizing — 14px is the iconography ADR's grayscale-by-shape gate; the
// disclosure chevron + structural chrome read one density step smaller so they
// stay attenuated relative to the domain plane (design-language ADR layer 4).
const DOMAIN_PX = 18;
const CHROME_PX = 16;
const GATE_PX = 14;
const SMALL_PX = 13;

// The canonical pipeline arc the ADR names (research → adr → plan → execute →
// review → codify). `codify` is the discretionary sixth phase: it has no
// in-flight artifact today (it produces rules), but it positions the arc's tail.
const PIPELINE_ARC: readonly (PipelinePhase | "codify")[] = [
  "research",
  "adr",
  "plan",
  "execute",
  "review",
  "codify",
];

// --- grayscale-safe progress ring (W02.P04.S19) -----------------------------------
//
// The ring reads as a FRACTION (tabular-numeral done/total text) FIRST and a fill
// arc as redundant reinforcement; the arc hue is the structural state token, never
// the identity channel. Legible at the 14px gate: the text alone carries the value
// when hue is removed. An absent total (an ADR has no steps) renders no ring.

interface ProgressRingProps {
  done: number;
  total: number;
}

function ringGeometry(done: number, total: number) {
  const radius = (GATE_PX - 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  const dash = circumference * fraction;
  return { radius, circumference, dash, center: GATE_PX / 2 };
}

export function ProgressRing({ done, total }: ProgressRingProps) {
  const { radius, circumference, dash, center } = ringGeometry(done, total);
  const complete = total > 0 && done >= total;
  const label = `${done} of ${total} steps complete`;
  return (
    <span
      className="flex shrink-0 items-center gap-fg-1"
      role="img"
      aria-label={label}
      data-progress-ring
      data-progress-done={done}
      data-progress-total={total}
    >
      <svg
        width={GATE_PX}
        height={GATE_PX}
        viewBox={`0 0 ${GATE_PX} ${GATE_PX}`}
        aria-hidden
        className="shrink-0"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={2}
          className="stroke-rule"
        />
        {dash > 0 && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={2}
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
            // Hue is redundant reinforcement: completed work reads in the
            // structural-state-complete token, in-progress in the active token.
            className={complete ? "stroke-state-complete" : "stroke-state-active"}
          />
        )}
      </svg>
      {/* The fraction is the primary, grayscale-safe carrier — tabular numerals. */}
      <span className="text-caption text-ink-muted" data-tabular data-progress-text>
        {done}/{total}
      </span>
    </span>
  );
}

// --- grayscale-safe status pill (W02.P05.S22) -------------------------------------
//
// The ADR status reads as a WORD first (proposed / accepted / deprecated), with hue
// as redundant reinforcement only. A border + token ink distinguish the states in
// grayscale; the word alone is the identity when hue is removed.

const STATUS_INK: Record<string, string> = {
  proposed: "border-state-stale/50 text-state-stale",
  accepted: "border-state-active/50 text-state-active",
  deprecated: "border-state-archived/60 text-ink-muted",
  rejected: "border-state-broken/50 text-state-broken",
};

interface StatusPillProps {
  status: string;
}

function StatusPill({ status }: StatusPillProps) {
  const ink = STATUS_INK[status] ?? "border-rule text-ink-muted";
  return (
    <span
      className={`shrink-0 rounded-fg-pill border px-fg-1-5 py-px text-caption font-medium ${ink}`}
      data-status-pill
      data-status={status}
      aria-label={`status ${status}`}
    >
      {status}
    </span>
  );
}

// --- grayscale-safe step check mark (W03.P06.S30) ---------------------------------
//
// A step's completion reads by SHAPE: a filled mark when done, a hollow mark when
// open, distinct at 14px with hue redundant. The accessible name states the word.

interface StepCheckMarkProps {
  done: boolean;
}

function StepCheckMark({ done }: StepCheckMarkProps) {
  return (
    <span
      role="img"
      aria-label={done ? "complete" : "open"}
      data-step-check
      data-done={done}
      className={`inline-flex shrink-0 items-center justify-center ${
        done ? "text-state-complete" : "text-ink-faint"
      }`}
    >
      <svg width={GATE_PX} height={GATE_PX} viewBox="0 0 14 14" aria-hidden>
        <circle
          cx={7}
          cy={7}
          r={5.5}
          // Filled disc vs hollow ring is the grayscale-by-shape identity.
          fill={done ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={done ? 0 : 1.4}
        />
        {done && (
          <path
            d="M4.3 7.2 6.1 9 9.7 5"
            fill="none"
            stroke="var(--color-paper-raised)"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </span>
  );
}

// --- compact pipeline arc (W03.P08.S35) -------------------------------------------
//
// The research → adr → plan → execute → review → codify arc, with the phases the
// current in-flight artifacts occupy marked. Grayscale-safe: an occupied phase is
// marked by a filled dot + bold ink + an accessible name, never hue alone.

interface PipelineArcProps {
  occupied: ReadonlySet<string>;
}

function PipelineArc({ occupied }: PipelineArcProps) {
  return (
    <ol
      className="flex items-center gap-fg-0-5 px-fg-1 py-fg-1 text-caption text-ink-faint"
      aria-label="pipeline phases"
      data-pipeline-arc
    >
      {PIPELINE_ARC.map((phase, i) => {
        const on = occupied.has(phase);
        return (
          <li key={phase} className="flex items-center gap-fg-0-5">
            <span
              className={`inline-flex items-center gap-fg-0-5 ${
                on ? "font-medium text-ink" : ""
              }`}
              data-arc-phase={phase}
              data-arc-occupied={on}
              aria-label={on ? `${phase} (in flight)` : phase}
            >
              <span
                aria-hidden
                className={`inline-block size-fg-1 rounded-fg-pill ${
                  on ? "bg-accent" : "bg-rule"
                }`}
              />
              {phase}
            </span>
            {i < PIPELINE_ARC.length - 1 && (
              <span aria-hidden className="text-ink-faint">
                ›
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// --- step tree (W03.P06) ----------------------------------------------------------

function RollupFraction({ rollup }: { rollup: InteriorRollup }) {
  return (
    <span className="shrink-0 text-caption text-ink-faint" data-tabular data-rollup>
      {rollup.done}/{rollup.total}
    </span>
  );
}

interface StepRowProps {
  step: InteriorStepView;
}

function StepRow({ step }: StepRowProps) {
  // A step jumps to its bound exec record through the same selection seam; with no
  // exec record it is inert (the work has no record node to open yet).
  const target = step.exec_node_id ?? null;
  const heading = step.action ?? step.id;
  return (
    <li>
      <button
        type="button"
        data-work-row="step"
        disabled={target === null}
        tabIndex={-1}
        onClick={() => target && selectNode(target)}
        aria-label={`step ${step.id}${target ? ", open exec record" : ", no exec record"}`}
        className={`flex w-full items-center gap-fg-1-5 rounded-fg-xs px-fg-1 py-fg-0-5 text-left text-label transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
          target ? "hover:bg-paper-sunken" : "cursor-default opacity-80"
        }`}
      >
        <StepCheckMark done={step.done} />
        <span className="shrink-0 font-mono text-caption text-ink-faint" data-tabular>
          {step.id}
        </span>
        <span className="min-w-0 truncate text-ink-muted">{heading}</span>
      </button>
    </li>
  );
}

function PhaseGroup({ phase }: { phase: InteriorPhaseView }) {
  return (
    <li className="space-y-fg-0-5">
      <p className="flex items-center gap-fg-1-5 px-fg-1 text-caption text-ink-faint">
        <span className="font-mono">{phase.id}</span>
        {phase.heading && <span className="min-w-0 truncate">{phase.heading}</span>}
        <RollupFraction rollup={phase.rollup} />
      </p>
      <ul className="space-y-px pl-fg-2" role="list">
        {phase.steps.map((s) => (
          <StepRow key={s.node_id} step={s} />
        ))}
      </ul>
    </li>
  );
}

function WaveGroup({ wave }: { wave: InteriorWaveView }) {
  return (
    <li className="space-y-fg-0-5">
      <p className="flex items-center gap-fg-1-5 px-fg-1 text-caption font-medium text-ink-muted">
        <span className="font-mono">{wave.id}</span>
        {wave.heading && <span className="min-w-0 truncate">{wave.heading}</span>}
        <RollupFraction rollup={wave.rollup} />
      </p>
      <ul className="space-y-fg-1 pl-fg-2" role="list">
        {wave.phases.map((p) => (
          <PhaseGroup key={p.node_id} phase={p} />
        ))}
      </ul>
    </li>
  );
}

/** The lazily-loaded interior tree for an expanded plan (W03.P06.S29/S31).
 *  Exported so the Status overview (status-overview ADR) reuses the SAME
 *  step-tree dropdown rather than inventing a new disclosure. */
export function PlanStepTree({ view }: { view: PlanInteriorView }) {
  if (view.loading) {
    // The purposeful liveness cue tied to real pending work, the repo's
    // text-pulse idiom (SearchTab); goes static under prefers-reduced-motion.
    return (
      <p
        className="animate-pulse-live px-fg-2 py-fg-1 text-label text-ink-faint"
        data-step-tree-loading
        role="status"
      >
        loading steps…
      </p>
    );
  }

  // Placeholder when the interior capability is not served by the wire (staged
  // capability degradation): a designed message, never a broken control.
  if (!PLAN_INTERIOR_SERVED) {
    return (
      <p
        className="px-fg-2 py-fg-1 text-label text-ink-faint"
        data-step-tree-placeholder
      >
        step tree pending — the plan interior is not yet served.
      </p>
    );
  }

  const empty =
    view.waves.length === 0 && view.phases.length === 0 && view.steps.length === 0;
  if (empty) {
    return (
      <p className="px-fg-2 py-fg-1 text-label text-ink-faint" data-step-tree-empty>
        no steps in this plan yet.
      </p>
    );
  }

  return (
    <div className="space-y-fg-1 border-l border-rule pl-fg-2" data-step-tree>
      <ul className="space-y-fg-1" role="list" aria-label="plan steps">
        {view.waves.map((w) => (
          <WaveGroup key={w.node_id} wave={w} />
        ))}
        {view.phases.map((p) => (
          <PhaseGroup key={p.node_id} phase={p} />
        ))}
        {view.steps.length > 0 && (
          <li>
            <ul className="space-y-px" role="list">
              {view.steps.map((s) => (
                <StepRow key={s.node_id} step={s} />
              ))}
            </ul>
          </li>
        )}
      </ul>
      {/* Honest bounded-interior truncation (graph-queries-are-bounded-by-default):
          a designed "narrowed — refine" state, never a silent partial tree. */}
      {view.truncated && (
        <p
          className="flex items-start gap-fg-1-5 rounded-fg-xs border border-state-stale/40 bg-paper-sunken px-fg-2 py-fg-1 text-caption text-ink-muted"
          data-step-tree-truncated
          role="status"
        >
          <span className="mt-px shrink-0 text-state-stale" aria-hidden>
            <CircleSlash size={SMALL_PX} />
          </span>
          <span>
            showing {view.truncated.returned_nodes} of {view.truncated.total_nodes}{" "}
            nodes — this plan exceeds the interior ceiling; open it on the stage to see
            the full tree.
          </span>
        </p>
      )}
    </div>
  );
}

// --- rows -------------------------------------------------------------------------

/** Roving-tabindex focus order, derived from the DOM at EVENT time (the in-repo
 *  pattern shared with SearchTab/NavToolbar): read the top-level rows at the
 *  moment an arrow key fires rather than tracking a render-phase ref array. Only
 *  the top-level plan/ADR rows rove; step rows are reached by Tab once expanded. */
const ROVING_ATTR = "data-work-roving";

function rovingRows(from: HTMLElement): HTMLButtonElement[] {
  const list = from.closest("[data-work-list]");
  if (!list) return [];
  return Array.from(
    list.querySelectorAll<HTMLButtonElement>(`button[${ROVING_ATTR}]:not(:disabled)`),
  );
}

function moveRowFocus(from: HTMLButtonElement, delta: number): void {
  const rows = rovingRows(from);
  const at = rows.indexOf(from);
  if (at === -1) return;
  rows[Math.min(rows.length - 1, Math.max(0, at + delta))]?.focus();
}

function onRowKeyDown(e: React.KeyboardEvent<HTMLButtonElement>): void {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    moveRowFocus(e.currentTarget, 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    moveRowFocus(e.currentTarget, -1);
  }
}

interface PlanRowProps {
  artifact: PipelineArtifact;
  now: number;
  tabbable: boolean;
  expanded: boolean;
  onToggle: () => void;
}

function PlanRow({ artifact, now, tabbable, expanded, onToggle }: PlanRowProps) {
  // The plan-level progress reads the in-flight projection's progress when served,
  // falling back to nothing (the ADR's derivable-today lifecycle.progress arrives
  // on the same `progress` field, so the ring lights up before the full tree lands).
  const progress = artifact.progress;
  const fresh = freshnessLabel(artifact.dates?.modified, now);
  const treeId = `work-tree-${artifact.node_id}`;
  // Lazily fetch the interior ONLY while expanded (graph-queries-are-bounded).
  const interior = usePlanInteriorView(expanded ? artifact.node_id : null);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <li className="space-y-fg-0-5">
      <div className="flex items-stretch gap-fg-0-5">
        {/* Expand/collapse — an accessible disclosure with aria-expanded +
            aria-controls; lazily enables the interior query for THIS plan only. */}
        <button
          type="button"
          {...{ [ROVING_ATTR]: "" }}
          tabIndex={tabbable ? 0 : -1}
          onClick={onToggle}
          onKeyDown={onRowKeyDown}
          aria-expanded={expanded}
          aria-controls={treeId}
          aria-label={`${expanded ? "collapse" : "expand"} steps for ${artifact.title ?? artifact.stem}`}
          data-work-row="plan-toggle"
          className="flex shrink-0 items-center rounded-fg-xs px-fg-0-5 text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          <Chevron size={SMALL_PX} aria-hidden />
        </button>
        {/* The plan row body — activating it selects the plan node on the stage. */}
        <button
          type="button"
          {...{ [ROVING_ATTR]: "" }}
          tabIndex={-1}
          onClick={() => selectNode(artifact.node_id)}
          onKeyDown={onRowKeyDown}
          data-work-row="plan"
          data-node-id={artifact.node_id}
          className="flex min-w-0 flex-1 items-center gap-fg-1-5 rounded-fg-xs border border-rule px-fg-2 py-fg-1 text-left transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          {progress && <ProgressRing done={progress.done} total={progress.total} />}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-fg-1-5">
              <span className="min-w-0 truncate text-body text-ink">
                {artifact.title ?? artifact.stem}
              </span>
              {artifact.tier && (
                <span
                  className="shrink-0"
                  data-plan-tier
                  aria-label={`tier ${artifact.tier}`}
                >
                  <Badge>{artifact.tier}</Badge>
                </span>
              )}
            </span>
            <span className="mt-px flex items-center gap-fg-1-5 text-caption text-ink-faint">
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
      {/* The expandable step tree (lazily loaded interior). */}
      {expanded && (
        <div id={treeId} className="pl-fg-4">
          <PlanStepTree view={interior} />
        </div>
      )}
    </li>
  );
}

interface AdrRowProps {
  artifact: PipelineArtifact;
  now: number;
  tabbable: boolean;
}

function AdrRow({ artifact, now, tabbable }: AdrRowProps) {
  const fresh = freshnessLabel(artifact.dates?.modified, now);
  const feature = artifact.feature_tags?.[0];
  return (
    <li>
      <button
        type="button"
        {...{ [ROVING_ATTR]: "" }}
        tabIndex={tabbable ? 0 : -1}
        onClick={() => selectNode(artifact.node_id)}
        onKeyDown={onRowKeyDown}
        data-work-row="adr"
        data-node-id={artifact.node_id}
        aria-label={`ADR ${artifact.title ?? artifact.stem}${artifact.status ? `, status ${artifact.status}` : ""}`}
        className="flex w-full items-center gap-fg-1-5 rounded-fg-xs border border-rule px-fg-2 py-fg-1 text-left transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        <span className="shrink-0 text-ink-faint" aria-hidden>
          <FileText size={GATE_PX} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-fg-1-5">
            <span className="min-w-0 truncate text-body text-ink">
              {artifact.title ?? artifact.stem}
            </span>
            {/* The real ADR status (W02.P05.S23); a designed placeholder when the
                status facet is not served (staged capability). */}
            {artifact.status ? (
              <StatusPill status={artifact.status} />
            ) : (
              !ADR_STATUS_SERVED && (
                <span
                  className="shrink-0 rounded-fg-pill border border-rule px-fg-1-5 py-px text-caption text-ink-faint"
                  data-status-placeholder
                >
                  status pending
                </span>
              )
            )}
          </span>
          <span className="mt-px flex items-center gap-fg-1-5 text-caption text-ink-faint">
            {feature && <span data-feature>{feature}</span>}
            {fresh && (
              <span data-tabular data-freshness>
                {fresh}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

// --- the surface ------------------------------------------------------------------

export function WorkTab() {
  const scope = useActiveScope();
  // Time-travel reflection (W03.P08.S36): under a past playhead the surface reads
  // the historical pipeline as-of that time; live otherwise (dashboard-timeline).
  const timelineMode = useViewStore((s) => s.timelineMode);
  const asOf = timelineMode.kind === "time-travel" ? timelineMode.at : undefined;
  const view = usePipelineStatusView(scope, asOf);

  // Which plan rows are expanded (ephemeral view state, keyed on stable node id
  // for object constancy across re-renders / live re-rank).
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Recompute "now" once per render for the freshness stamps (stable enough; the
  // labels bucket coarsely so a per-render now never thrashes the text).
  const now = Date.now();

  const plans = view.artifacts.filter((a) => a.doc_type === "plan");
  const adrs = view.artifacts.filter((a) => a.doc_type === "adr");
  const occupied = useMemo(
    () => new Set(view.artifacts.map((a) => a.phase as string)),
    [view.artifacts],
  );
  // The single roving Tab entry: the first top-level row (a plan toggle, then ADRs).
  const firstPlan = plans[0]?.node_id;
  const firstAdr = adrs[0]?.node_id;

  // The settled outcome for the single polite live region (W04.P09.S38).
  const count = view.artifacts.length;
  const liveMessage = view.degraded
    ? "pipeline status unavailable"
    : view.loading
      ? "loading in-flight work"
      : count === 0
        ? "no in-flight work"
        : `${count} in-flight item${count === 1 ? "" : "s"}`;

  // Designed DEGRADED state (degradation-is-read-from-tiers-not-guessed-from-errors):
  // shown ONLY when the selector reports the pipeline tier unavailable from the
  // served tiers truth — never from a bare transport error.
  if (view.degraded) {
    const reason = view.reasons.structural;
    return (
      <section
        className="flex flex-col items-center gap-fg-2 px-fg-2 py-fg-6 text-center text-label text-ink-muted"
        aria-label="work pipeline status"
        data-work-tab
        data-work-state="degraded"
      >
        <p className="sr-only" role="status" aria-live="polite">
          {liveMessage}
        </p>
        <span className="text-ink-faint" aria-hidden>
          <CircleSlash size={DOMAIN_PX} />
        </span>
        <p className="font-medium text-ink">pipeline status unavailable</p>
        <p className="text-ink-faint">
          {reason
            ? `the pipeline read is degraded — ${reason}`
            : "the pipeline read is degraded; in-flight work will appear here once it recovers"}
        </p>
      </section>
    );
  }

  // Loading: a real pending state tied to the query, never a perpetual spinner;
  // the repo's text-pulse liveness cue goes static under prefers-reduced-motion.
  if (view.loading) {
    return (
      <section
        className="flex flex-col items-center gap-fg-2 px-fg-2 py-fg-6 text-center text-label text-ink-faint"
        aria-label="work pipeline status"
        data-work-tab
        data-work-state="loading"
      >
        <p className="sr-only" role="status" aria-live="polite">
          {liveMessage}
        </p>
        <p className="animate-pulse-live">reading in-flight work…</p>
      </section>
    );
  }

  // Designed EMPTY state: the pillar is available but carries no in-flight work.
  if (count === 0) {
    return (
      <section
        className="flex flex-col items-center gap-fg-2 px-fg-2 py-fg-6 text-center text-label text-ink-muted"
        aria-label="work pipeline status"
        data-work-tab
        data-work-state="empty"
      >
        <p className="sr-only" role="status" aria-live="polite">
          {liveMessage}
        </p>
        <span className="text-ink-faint" aria-hidden>
          <ListChecks size={CHROME_PX} />
        </span>
        <p className="font-medium text-ink">no work in flight on this branch</p>
        <p className="text-ink-faint">
          no in-flight pipeline work in the current scope; active ADRs and plans will
          appear here as they advance.
        </p>
      </section>
    );
  }

  // The standing in-flight list (W02.P04.S18): plan rows then ADR rows, the
  // pipeline-arc cue, and the single polite live region.
  return (
    <section
      className="space-y-fg-2 text-body"
      aria-label="work pipeline status"
      data-work-tab
      data-work-state="list"
    >
      <p className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </p>

      <PipelineArc occupied={occupied} />

      <ul
        className="space-y-fg-1"
        role="list"
        aria-label="in-flight pipeline work"
        data-work-list
      >
        {plans.map((artifact) => (
          <PlanRow
            key={artifact.node_id}
            artifact={artifact}
            now={now}
            tabbable={artifact.node_id === firstPlan}
            expanded={expanded.has(artifact.node_id)}
            onToggle={() => toggle(artifact.node_id)}
          />
        ))}
        {adrs.map((artifact) => (
          <AdrRow
            key={artifact.node_id}
            artifact={artifact}
            now={now}
            // The ADR rows' Tab entry is the first ADR ONLY when there are no plans.
            tabbable={!firstPlan && artifact.node_id === firstAdr}
          />
        ))}
      </ul>
    </section>
  );
}
