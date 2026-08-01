// The system-status console Settings ▸ Advanced hosts (advanced-service-console
// ADR D6), rebuilt against the owner's "cryptic / unrelatable" review note.
//
// Advanced is the troubleshooting home, so this console is for whoever is
// troubleshooting: it says which programs the app runs on, how each one is doing,
// and — the part that was missing — enough identity to point at the actual
// process. A port and a process id do that; "Search: Available" never could.
//
// Two groups, because the old six-row list mixed two different kinds of thing.
// PROGRAMS are things with a version, an address, a process. AVAILABLE DATA is
// what the app's own server can currently answer — reads, not programs. The split
// and every value in it come from `useSystemPrograms`; this file is leaf chrome
// and derives nothing (architecture-boundaries), including never reading `tiers`.
//
// Where a program reports nothing, its row says so in its own words rather than
// leaving a blank or borrowing a neighbouring value.

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { SystemStatusTone } from "../../stores/server/queries";
import {
  useSystemPrograms,
  type ProgramRow,
  type ReadRow,
  type SystemProgramsView,
} from "../../stores/server/systemPrograms";
import { SectionLabel } from "../kit";

const TONE_DOT_CLASS: Record<SystemStatusTone, string> = {
  ok: "bg-state-active",
  down: "bg-state-broken",
  unknown: "bg-ink-faint",
};

const TONE_TEXT_CLASS: Record<SystemStatusTone, string> = {
  ok: "text-state-active",
  down: "text-state-broken",
  unknown: "text-ink-faint",
};

function StatusDot({ tone }: { tone: SystemStatusTone }) {
  return (
    <span
      aria-hidden
      className={`size-fg-2 shrink-0 rounded-full ${TONE_DOT_CLASS[tone]}`}
    />
  );
}

/** One program: name and state on the first line, then what it is, then the
 *  identity facts it reports, then what it does not report. */
function ProgramEntry({ row }: { row: ProgramRow }) {
  const resolve = useLocalizedMessageResolver();
  return (
    <div className="flex flex-col gap-fg-1" data-program={row.key}>
      <div className="flex items-center gap-fg-2">
        <StatusDot tone={row.tone} />
        <span className="min-w-0 flex-1 truncate text-body text-ink">
          {resolve(row.name).message}
        </span>
        <span
          className={`shrink-0 text-meta ${TONE_TEXT_CLASS[row.tone]}`}
          data-program-status
        >
          {resolve(row.status).message}
        </span>
      </div>
      <p className="pl-fg-4 text-caption text-ink-muted">
        {resolve(row.summary).message}
      </p>
      {row.facts.length > 0 && (
        <dl className="flex flex-wrap gap-x-fg-3 gap-y-fg-1 pl-fg-4" data-program-facts>
          {row.facts.map((fact) => (
            <div className="flex items-baseline gap-fg-1" key={fact.key}>
              <dt className="text-caption text-ink-faint">
                {resolve(fact.label).message}
              </dt>
              <dd className="text-caption tabular-nums text-ink" data-fact={fact.key}>
                {fact.word === undefined ? fact.value : resolve(fact.word).message}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {row.gap !== null && (
        <p className="pl-fg-4 text-caption text-ink-faint" data-program-gap>
          {resolve(row.gap).message}
        </p>
      )}
    </div>
  );
}

/** One read the app's own server either can or cannot answer. */
function ReadEntry({ row }: { row: ReadRow }) {
  const resolve = useLocalizedMessageResolver();
  return (
    <div className="flex items-center gap-fg-2" data-backend-row={row.key}>
      <StatusDot tone={row.tone} />
      <span className="min-w-0 flex-1 truncate text-body text-ink">
        {resolve(row.label).message}
      </span>
      <span
        className={`shrink-0 text-meta ${TONE_TEXT_CLASS[row.tone]}`}
        data-backend-status
      >
        {resolve(row.status).message}
      </span>
    </div>
  );
}

export interface BackendHealthPanelBodyProps {
  /** The resolved console view — programs and reads, already derived. */
  view: SystemProgramsView;
}

/** The wire-free body. It receives the resolved view as a normal required prop,
 *  so the review desk renders every tone and every reported/unreported
 *  combination without the panel ever growing a harness affordance
 *  (production-dev-separation). */
export function BackendHealthPanelBody({ view }: BackendHealthPanelBodyProps) {
  const resolve = useLocalizedMessageResolver();
  return (
    <div className="flex flex-col gap-fg-4 px-fg-4 py-fg-3" data-backend-health-panel>
      <p className="text-caption text-ink-faint">
        {resolve({ key: "common:systemStatus.description" }).message}
      </p>
      <section className="flex flex-col gap-fg-3">
        <SectionLabel>
          {resolve({ key: "common:systemStatus.sections.programs" }).message}
        </SectionLabel>
        {view.programs.map((row) => (
          <ProgramEntry key={row.key} row={row} />
        ))}
      </section>
      <section className="flex flex-col gap-fg-2">
        <SectionLabel>
          {resolve({ key: "common:systemStatus.sections.data" }).message}
        </SectionLabel>
        {view.reads.map((row) => (
          <ReadEntry key={row.key} row={row} />
        ))}
      </section>
    </div>
  );
}

/** The container: reads the one stores projection and renders the body. */
export function BackendHealthPanel() {
  return <BackendHealthPanelBody view={useSystemPrograms()} />;
}
