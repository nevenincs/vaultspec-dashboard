// The docked RUN HEADER region (research C5; agent-panel-shell-integration D4d).
// Live run metadata — phase and the agent roster — pins beside the conversation
// instead of being interleaved into it. Both reference products dock this state
// (Claude's progress checklist, ChatGPT's Environment/Subagents/Sources); neither
// scrolls it away inside the message flow, and neither do we.
//
// It is collapsible and collapsed-by-default-once-terminal, because a settled run's
// metadata is reference material, not something to keep occupying the panel.
//
// The roster is a compact read-only projection. The frozen execution evidence is
// read separately from authoritative `run-status.frozen_assignment`, never
// re-resolved through the current catalog or the composer. Elapsed is real when
// the sibling serves a start time and is OMITTED when it does not: measuring from
// when this panel started watching is not the run's elapsed time and would read
// as a lie on a reloaded panel.
//
// "Sources" remains genuinely unserved by any surface and is therefore absent — a
// named gap, not an oversight.
//
// Layer ownership: dumb app chrome over the run-progress context. No fetch.

import { useEffect, useState } from "react";

import {
  useActiveLocale,
  useLocalizedMessageResolver,
} from "../../platform/localization/LocalizationProvider";
import { formatDuration } from "../../platform/localization/formatters";
import { authoredDisplayText } from "../../platform/localization/displayText";
import { FoldSection, SectionLabel } from "../kit";
import type {
  FrozenTeamExecutionSnapshot,
  FrozenTeamNativeControl,
  FrozenTeamRoleAssignment,
  FrozenTeamRoleProvenance,
} from "../../stores/server/agent/a2aTeam";
import type { TeamRosterMember } from "./teamRun";
import { useTeamRunProgress } from "./TeamRunProgressContext";

const MSG = {
  region: "common:agent.runHeader.region",
  phase: "common:agent.runHeader.phase",
  roster: "common:agent.runHeader.roster",
  elapsed: "common:agent.runHeader.elapsed",
  mixedProvider: "common:agent.runHeader.mixedProvider",
  frozenAssignment: "common:agent.runHeader.frozenAssignment",
  frozenAssignmentInvalid: "common:agent.runHeader.frozenAssignmentInvalid",
  schemaVersion: "common:agent.runHeader.schemaVersion",
  role: "common:agent.runHeader.role",
  provider: "common:agent.runHeader.provider",
  providerIdentity: "common:agent.runHeader.providerIdentity",
  executionMode: "common:agent.runHeader.executionMode",
  model: "common:agent.runHeader.model",
  modelValue: "common:agent.runHeader.modelValue",
  entryId: "common:agent.runHeader.entryId",
  catalogRevision: "common:agent.runHeader.catalogRevision",
  nativeControls: "common:agent.runHeader.nativeControls",
  fallbackPlan: "common:agent.runHeader.fallbackPlan",
  selectionSource: "common:agent.runHeader.selectionSource",
  teamSelection: "common:agent.runHeader.teamSelection",
  roleOverride: "common:agent.runHeader.roleOverride",
  digest: "common:agent.runHeader.digest",
  labeledValue: "common:agent.runHeader.labeledValue",
  controlValue: "common:agent.runHeader.controlValue",
  degraded: "common:agent.transcript.team.degraded",
} as const;

interface FrozenEvidenceLabels {
  readonly role: string;
  readonly provider: string;
  readonly providerIdentity: string;
  readonly executionMode: string;
  readonly model: string;
  readonly modelValue: string;
  readonly entryId: string;
  readonly catalogRevision: string;
  readonly nativeControls: string;
  readonly fallbackPlan: string;
  readonly selectionSource: string;
  readonly labeledValue: (label: string, value: string) => string;
  readonly controlValue: (control: FrozenTeamNativeControl) => string;
  readonly selectionSourceLabels: Record<
    FrozenTeamRoleProvenance["selection_source"],
    string
  >;
}

function FrozenFact({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <>
      <dt className="text-caption text-ink-faint">{label}</dt>
      <dd className="min-w-0 truncate text-caption text-ink" data-frozen-value={testId}>
        {authoredDisplayText(value)}
      </dd>
    </>
  );
}

/** Render only control ids and option ids that the frozen record itself contains.
 * This deliberately does not consult the current provider catalog for labels or
 * defaults: either can have changed since this historical run was admitted. */
function FrozenControls({
  controls,
  label,
  controlValue,
}: {
  controls: readonly FrozenTeamNativeControl[];
  label: string;
  controlValue: (control: FrozenTeamNativeControl) => string;
}) {
  if (controls.length === 0) return null;
  return (
    <>
      <dt className="text-caption text-ink-faint">{label}</dt>
      <dd>
        <ul className="flex flex-col gap-fg-0-5" data-frozen-controls>
          {controls.map((control) => (
            <li
              className="min-w-0 truncate text-caption text-ink"
              key={control.control_id}
            >
              <span data-frozen-control>{controlValue(control)}</span>
            </li>
          ))}
        </ul>
      </dd>
    </>
  );
}

function FrozenSelectionFacts({
  selection,
  labels,
}: {
  selection: FrozenTeamExecutionSnapshot;
  labels: FrozenEvidenceLabels;
}) {
  return (
    <>
      {selection.provider_display_name !== undefined && (
        <FrozenFact
          label={labels.provider}
          value={selection.provider_display_name}
          testId="provider"
        />
      )}
      <FrozenFact
        label={labels.providerIdentity}
        value={selection.provider_id}
        testId="provider-identity"
      />
      <FrozenFact
        label={labels.executionMode}
        value={selection.execution_mode}
        testId="execution-mode"
      />
      <FrozenFact label={labels.entryId} value={selection.entry_id} testId="entry-id" />
      {selection.model_display_name !== undefined && (
        <FrozenFact
          label={labels.model}
          value={selection.model_display_name}
          testId="model"
        />
      )}
      <FrozenFact
        label={labels.modelValue}
        value={selection.model_name}
        testId="model-value"
      />
      <FrozenFact
        label={labels.catalogRevision}
        value={selection.catalog_revision}
        testId="catalog-revision"
      />
      <FrozenControls
        controls={selection.controls}
        label={labels.nativeControls}
        controlValue={labels.controlValue}
      />
    </>
  );
}

function FrozenRoleEvidence({
  assignment,
  labels,
}: {
  assignment: FrozenTeamRoleAssignment;
  labels: FrozenEvidenceLabels;
}) {
  const selectionSource =
    labels.selectionSourceLabels[assignment.provenance.selection_source];
  return (
    <li className="flex min-w-0 flex-col gap-fg-1" data-frozen-role>
      <p className="min-w-0 truncate text-meta text-ink" data-frozen-role-id>
        {labels.labeledValue(labels.role, assignment.role_id)}
      </p>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-fg-2 gap-y-fg-0-5">
        <FrozenSelectionFacts selection={assignment} labels={labels} />
        <FrozenFact
          label={labels.selectionSource}
          value={selectionSource}
          testId="selection-source"
        />
      </dl>
      {assignment.fallbacks.length > 0 && (
        <div className="flex min-w-0 flex-col gap-fg-0-5" data-frozen-fallback-plan>
          <SectionLabel>{labels.fallbackPlan}</SectionLabel>
          <ol className="flex flex-col gap-fg-1">
            {assignment.fallbacks.map((fallback, index) => (
              <li key={`${fallback.provider_id}:${fallback.entry_id}:${index}`}>
                <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-fg-2 gap-y-fg-0-5">
                  <FrozenSelectionFacts selection={fallback} labels={labels} />
                </dl>
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  );
}

function RosterRow({ member }: { member: TeamRosterMember }) {
  // Per-role provider and model, both served. They are shown TOGETHER on the role's
  // own row precisely because a profile may route different roles to different
  // providers — collapsing them into one label for the run would be a fabrication.
  const binding = [member.providerId, member.model]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join(" · ");
  return (
    <li className="flex min-w-0 items-baseline justify-between gap-fg-2">
      <span className="min-w-0 flex-1 truncate text-meta text-ink">
        {authoredDisplayText(member.agentId)}
      </span>
      {binding.length > 0 && (
        <span
          className="min-w-0 shrink truncate text-caption text-ink-muted"
          data-roster-binding
        >
          {authoredDisplayText(binding)}
        </span>
      )}
      {/* The state token passes through verbatim — served vocabulary, never
          re-classified into a word of our own. */}
      {member.state.length > 0 && (
        <span className="shrink-0 text-caption text-ink-faint" data-roster-state>
          {authoredDisplayText(member.state)}
        </span>
      )}
    </li>
  );
}

/**
 * The run header. Renders nothing when there is no run metadata to dock — an empty
 * header band would be chrome claiming a run that is not there.
 */
export function TeamRunHeader({ roster }: { roster: readonly TeamRosterMember[] }) {
  const resolveMessage = useLocalizedMessageResolver();
  const locale = useActiveLocale();
  const progress = useTeamRunProgress();
  const terminal = progress.terminal;
  const [open, setOpen] = useState(true);
  // A ticking clock only while the run is live AND the sibling has actually served
  // a start time, so an in-flight elapsed reading is not frozen at first paint. It
  // stops the moment the run settles.
  //
  // The second condition is not defensive padding. a2a's `RunStatusResponse` serves
  // no start time at all — no `started_at_ms`, no `started_at`, no `created_at` —
  // so `startedAtMs` is undefined on every real response and the elapsed branch
  // below is never taken. Gated only on `terminal`, this interval re-rendered the
  // header, and therefore the whole roster, once a second for the entire life of
  // every active run, to recompute a value nothing could read. Gating on the value
  // that DRIVES the clock means the timer exists only once there is a clock to
  // drive it.
  const startedAtMs = progress.status?.started_at_ms;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (terminal || startedAtMs === undefined) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [terminal, startedAtMs]);

  // Collapse when the run settles: a finished run's metadata is reference, and the
  // transcript should get the room back.
  useEffect(() => {
    if (terminal) setOpen(false);
  }, [terminal]);

  // The SERVED phase, verbatim — `semantic_phase` when the sibling names one, else
  // the bounded run status. Never client-classified.
  const phase = progress.status?.semantic_phase ?? progress.status?.status ?? null;
  if (phase === null && roster.length === 0) return null;

  // Elapsed is real or absent. a2a does NOT serve a start time today, so this is
  // undefined in practice and the header says nothing about time — the honest
  // reading, kept ready for a sibling that starts serving one. The alternative,
  // measuring from when the panel began watching, would report the age of the
  // subscription and call it the age of the run.
  const elapsed =
    startedAtMs === undefined
      ? null
      : formatDuration(locale, Math.max(0, nowMs - startedAtMs), {
          maxUnits: 2,
          style: "short",
        });

  const region = resolveMessage({ key: MSG.region });
  const phaseLabel = resolveMessage({ key: MSG.phase });
  const rosterLabel = resolveMessage({ key: MSG.roster });
  const frozenAssignmentLabel = resolveMessage({ key: MSG.frozenAssignment });
  const frozenAssignmentInvalid = resolveMessage({ key: MSG.frozenAssignmentInvalid });
  const schemaVersionLabel = resolveMessage({ key: MSG.schemaVersion });
  const digestLabel = resolveMessage({ key: MSG.digest });
  const frozenEvidenceLabels: FrozenEvidenceLabels = {
    role: resolveMessage({ key: MSG.role }).message,
    provider: resolveMessage({ key: MSG.provider }).message,
    providerIdentity: resolveMessage({ key: MSG.providerIdentity }).message,
    executionMode: resolveMessage({ key: MSG.executionMode }).message,
    model: resolveMessage({ key: MSG.model }).message,
    modelValue: resolveMessage({ key: MSG.modelValue }).message,
    entryId: resolveMessage({ key: MSG.entryId }).message,
    catalogRevision: resolveMessage({ key: MSG.catalogRevision }).message,
    nativeControls: resolveMessage({ key: MSG.nativeControls }).message,
    fallbackPlan: resolveMessage({ key: MSG.fallbackPlan }).message,
    selectionSource: resolveMessage({ key: MSG.selectionSource }).message,
    labeledValue: (label, value) =>
      resolveMessage({
        key: MSG.labeledValue,
        values: { label, value: authoredDisplayText(value) },
      }).message,
    controlValue: (control) =>
      resolveMessage({
        key: MSG.controlValue,
        values: {
          control: authoredDisplayText(control.display_name ?? control.control_id),
          controlId: authoredDisplayText(control.control_id),
          value: authoredDisplayText(control.provider_value),
          option: authoredDisplayText(control.option_display_name ?? control.option_id),
          optionId: authoredDisplayText(control.option_id),
        },
      }).message,
    selectionSourceLabels: {
      team_selection: resolveMessage({ key: MSG.teamSelection }).message,
      role_override: resolveMessage({ key: MSG.roleOverride }).message,
    },
  };
  if (region.usedFallback) return null;

  return (
    <section
      className="shrink-0 border-b border-rule px-fg-2 py-fg-1"
      aria-label={region.message}
      data-agent-run-header
    >
      <FoldSection
        open={open}
        onToggle={() => setOpen((value) => !value)}
        label={
          <span className="truncate text-meta text-ink-muted" data-run-header-phase>
            {phase === null
              ? region.message
              : phaseLabel.usedFallback
                ? authoredDisplayText(phase)
                : resolveMessage({
                    key: MSG.phase,
                    values: { phase: authoredDisplayText(phase) },
                  }).message}
          </span>
        }
        trailing={
          elapsed !== null ? (
            <span
              className="shrink-0 text-caption tabular-nums text-ink-faint"
              data-run-header-elapsed
            >
              {resolveMessage({ key: MSG.elapsed, values: { elapsed } }).message}
            </span>
          ) : progress.degraded ? (
            <span
              className="shrink-0 text-caption text-ink-faint"
              data-run-header-degraded
            >
              {resolveMessage({ key: MSG.degraded }).message}
            </span>
          ) : undefined
        }
        bodyClassName="px-fg-1 py-fg-1"
      >
        {roster.length > 0 && !rosterLabel.usedFallback && (
          <>
            <SectionLabel>{rosterLabel.message}</SectionLabel>
            <ul className="flex flex-col gap-fg-0-5" data-run-header-roster>
              {roster.map((member) => (
                <RosterRow key={member.agentId} member={member} />
              ))}
            </ul>
          </>
        )}
        {progress.status?.frozen_assignment !== undefined &&
          !frozenAssignmentLabel.usedFallback && (
            <div
              className="mt-fg-2 flex min-w-0 flex-col gap-fg-1"
              data-frozen-assignment
            >
              <SectionLabel>{frozenAssignmentLabel.message}</SectionLabel>
              {!schemaVersionLabel.usedFallback && (
                <p className="text-caption text-ink-muted" data-frozen-schema-version>
                  {frozenEvidenceLabels.labeledValue(
                    schemaVersionLabel.message,
                    String(progress.status.frozen_assignment.schema_version),
                  )}
                </p>
              )}
              {!digestLabel.usedFallback && (
                <p
                  className="min-w-0 truncate text-caption text-ink-muted"
                  data-frozen-digest
                >
                  {frozenEvidenceLabels.labeledValue(
                    digestLabel.message,
                    progress.status.frozen_assignment.digest,
                  )}
                </p>
              )}
              <ul className="flex flex-col gap-fg-2">
                {progress.status.frozen_assignment.assignments.map((assignment) => (
                  <FrozenRoleEvidence
                    assignment={assignment}
                    key={assignment.role_id}
                    labels={frozenEvidenceLabels}
                  />
                ))}
              </ul>
            </div>
          )}
        {progress.status?.frozen_assignment === undefined &&
          progress.status?.frozen_assignment_invalid === true &&
          !frozenAssignmentLabel.usedFallback &&
          !frozenAssignmentInvalid.usedFallback && (
            <div
              className="mt-fg-2 flex min-w-0 flex-col gap-fg-1"
              data-frozen-assignment-invalid
            >
              <SectionLabel>{frozenAssignmentLabel.message}</SectionLabel>
              <p className="text-caption text-ink-muted">
                {frozenAssignmentInvalid.message}
              </p>
            </div>
          )}
      </FoldSection>
    </section>
  );
}
