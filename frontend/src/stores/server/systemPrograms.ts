// The system-status console's PROGRAM projection (advanced-service-console ADR
// D6, as revised by the owner's "cryptic / unrelatable" review note).
//
// The console used to list six rows — Application, Project tools, Documents,
// Links, History, Search — each a bare available/unavailable word. Two things
// were wrong with that, and this module fixes both.
//
// 1. THE ROWS CONFLATED TWO DIFFERENT KINDS OF THING. Documents, Links and
//    History are not programs at all; they are reads the app's own server either
//    can or cannot answer. Only three rows named a real process, and one of those
//    ("Search") named a capability rather than the program providing it. So the
//    projection now returns TWO lists: `programs` (things with a version, an
//    address, a process — something you could find in a task manager) and `reads`
//    (what the app's server can currently answer). A row you cannot point at a
//    process for is not a program, and is no longer drawn as one.
//
// 2. A ROW STATED NO IDENTITY. "Search: Available" cannot be related to anything.
//    A port and a process id can: they name exactly one process on this machine.
//    So every program row carries the identity facts the wire actually serves.
//
// WHAT IS SERVED, per program, and where it comes from — all of it already on the
// status envelope, none of it a new read:
//   - the indexing program: `backends.rag.port` / `.pid` (its own listening port
//     and process id, served verbatim) plus the installed version from the served
//     provisioning projection, and its floor from `tiers.semantic.component`;
//   - the project tools: version and required floor from
//     `tiers.declared.component` — a command the server runs per request, so it
//     has no address, no process of its own to report, and no running time;
//   - the agent program: `tiers.agent.component.gateway` carries `endpoint`,
//     `pid` and `ownership` once a gateway is discovered, and `release_set`
//     carries the installed version and active generation;
//   - the app's own server: only its round trip, which this client MEASURES (see
//     `observedRoundTripMs`) because no route can serve it.
//
// WHAT IS NOT SERVED, stated as a gap rather than papered over. The app's own
// server reports no version, no listening address and no running time on any
// route it exposes (`/health` answers `{ok, service, status}` and nothing more),
// and neither the indexing program nor the agent program reports a start time.
// Every one of those is rendered as a named gap. Nothing is ever substituted
// under a neighbouring label — the same discipline the index console's identity
// header settled on when it hit this exact problem, and the reason its header
// states the STORE's address as the store's own rather than the tool's.
// Serving a running time and the app server's own listening identity is an
// engine-side ask, not a gap to fill from here.

import { useMemo } from "react";

import type { MessageDescriptor } from "../../platform/localization/message";
import type { TierComponent } from "./engine";
import { readTierAvailability, tiersFromQuery } from "./engine";
import { useProvisionStatus } from "./provisionControl";
import { useEngineStatus } from "./queries/internal";
import { deriveCoreStatusView, deriveRagStatusView } from "./queries/status";
import type { SystemStatusTone } from "./queries/status";

/** Longest served identity string a row will render — a bound on every free-form
 *  value another program hands us (bounded-by-default). */
export const PROGRAM_IDENTITY_MAX_CHARS = 128;

/** One frozen empty list, so an absent `degradations` block keeps a stable
 *  identity across snapshots instead of minting a new array per render. */
const NO_DEGRADATIONS: readonly string[] = Object.freeze([]);

/** The programs the console lists, in rendered order. */
export type ProgramKey = "app" | "projectTools" | "index" | "agents";

/** The reads the app's own server answers, in rendered order. */
export type ReadKey = "documents" | "links" | "history";

/** One identity fact about a program. Most facts are served LITERALS (a port, a
 *  process id, a version, an address) and carry `value`; a fact whose wire form
 *  is a token instead carries `word`, the plain-language rendering of that token.
 *  A fact with neither is one the wire did not carry, and is dropped rather than
 *  printed as a placeholder. */
export interface ProgramFact {
  key: string;
  label: MessageDescriptor;
  value: string | null;
  word?: MessageDescriptor;
}

/** One program row: what it is, how it is doing, and how to find it. */
export interface ProgramRow {
  key: ProgramKey;
  /** The program's name. */
  name: MessageDescriptor;
  /** One plain sentence saying what this program IS, so the row is relatable
   *  without knowing the codebase. */
  summary: MessageDescriptor;
  status: MessageDescriptor;
  tone: SystemStatusTone;
  /** The served identity facts, already narrowed to the ones that carried a
   *  value. Empty when the wire carried none. */
  facts: ProgramFact[];
  /** What this program does not report, named precisely. `null` when there is
   *  nothing outstanding for it. */
  gap: MessageDescriptor | null;
}

/** One read the app's own server either can or cannot answer. */
export interface ReadRow {
  key: ReadKey;
  label: MessageDescriptor;
  status: MessageDescriptor;
  tone: SystemStatusTone;
}

/** The whole console view. */
export interface SystemProgramsView {
  programs: ProgramRow[];
  reads: ReadRow[];
}

const PROGRAM_NAMES = {
  app: { key: "common:systemStatus.programs.app.name" },
  projectTools: { key: "common:systemStatus.programs.projectTools.name" },
  index: { key: "common:systemStatus.programs.index.name" },
  agents: { key: "common:systemStatus.programs.agents.name" },
} as const satisfies Record<ProgramKey, MessageDescriptor>;

const PROGRAM_SUMMARIES = {
  app: { key: "common:systemStatus.programs.app.summary" },
  projectTools: { key: "common:systemStatus.programs.projectTools.summary" },
  index: { key: "common:systemStatus.programs.index.summary" },
  agents: { key: "common:systemStatus.programs.agents.summary" },
} as const satisfies Record<ProgramKey, MessageDescriptor>;

/** The unreported facts, per program. Each names exactly what is missing, so the
 *  gap is a statement rather than a shrug. */
const PROGRAM_GAPS = {
  app: { key: "common:systemStatus.gaps.app" },
  projectTools: { key: "common:systemStatus.gaps.projectTools" },
  index: { key: "common:systemStatus.gaps.index" },
  agents: { key: "common:systemStatus.gaps.agents" },
} as const satisfies Record<ProgramKey, MessageDescriptor>;

const FACT_LABELS = {
  responseTime: { key: "common:systemStatus.facts.responseTime" },
  version: { key: "common:systemStatus.facts.version" },
  requires: { key: "common:systemStatus.facts.requires" },
  port: { key: "common:systemStatus.facts.port" },
  process: { key: "common:systemStatus.facts.process" },
  address: { key: "common:systemStatus.facts.address" },
  managedBy: { key: "common:systemStatus.facts.managedBy" },
} as const;

const READ_LABELS = {
  documents: { key: "common:systemStatus.labels.documents" },
  links: { key: "common:systemStatus.labels.links" },
  history: { key: "common:systemStatus.labels.history" },
} as const satisfies Record<ReadKey, MessageDescriptor>;

const OWNERSHIP_LABELS: Readonly<Record<string, MessageDescriptor>> = Object.freeze({
  owned: { key: "common:systemStatus.ownership.thisApp" },
  "owned-stale": { key: "common:systemStatus.ownership.thisApp" },
  "owned-incompatible": { key: "common:systemStatus.ownership.thisApp" },
  "foreign-attachable": { key: "common:systemStatus.ownership.elsewhere" },
  "foreign-immutable": { key: "common:systemStatus.ownership.elsewhere" },
});

function statusWord(tone: SystemStatusTone): MessageDescriptor {
  return tone === "ok"
    ? { key: "common:systemStatus.states.available" }
    : tone === "unknown"
      ? { key: "common:systemStatus.states.checking" }
      : { key: "common:systemStatus.states.unavailable" };
}

/** A served free-form string, bounded and trimmed, or `null`. */
function identityText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= PROGRAM_IDENTITY_MAX_CHARS
    ? trimmed
    : null;
}

/** A served integer rendered verbatim. Ports and process ids are identifiers, not
 *  quantities, so they are never group-separated or locale-formatted. */
function identityNumber(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : null;
}

function block(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/** Keep only the facts the wire actually carried. */
function carried(facts: ProgramFact[]): ProgramFact[] {
  return facts.filter((fact) => fact.value !== null || fact.word !== undefined);
}

/** The installed version of a sibling program, as the provisioning projection
 *  reports it. That projection prefixes the package name onto the version
 *  string (`"vaultspec-rag v0.4.1"`); the package name is exactly what the labels
 *  law keeps off screen, so only the version is kept. */
export function readInstalledVersion(value: unknown): string | null {
  const text = identityText(value);
  if (text === null) return null;
  const match = /v?(\d+[\w.+-]*)\s*$/u.exec(text);
  return match?.[1] ?? text;
}

/** Everything the projection needs, already read. Passing the inputs in keeps the
 *  derivation pure so it is testable without a query client and memoizable by its
 *  reader (frontend-store-selectors: derive outside the reactive read). */
export interface SystemProgramsInput {
  engineUnreachable: boolean;
  /** Round trip of the status read, in milliseconds, as this client measured it. */
  observedRoundTripMs: number | null;
  /** Tier names the engine reports degraded. */
  degradations: readonly string[];
  coreLoading: boolean;
  coreErrored: boolean;
  coreReachable: boolean;
  ragLoading: boolean;
  ragDegraded: boolean;
  ragErrored: boolean;
  /** The indexing program's own served port and process id. */
  ragPort: number | undefined;
  ragPid: number | undefined;
  /** The installed indexing-program version, from the provisioning projection. */
  ragInstalledVersion: unknown;
  /** The served component handshakes, per tier. */
  declaredComponent: TierComponent | undefined;
  agentComponent: TierComponent | undefined;
  agentAvailable: boolean;
}

function appRow(input: SystemProgramsInput): ProgramRow {
  const tone: SystemStatusTone = input.engineUnreachable
    ? "down"
    : input.coreLoading
      ? "unknown"
      : "ok";
  // Rounded to whole milliseconds: sub-millisecond precision on a browser round
  // trip is noise, and the fact is meant to be read at a glance.
  const roundTrip =
    input.observedRoundTripMs === null || !Number.isFinite(input.observedRoundTripMs)
      ? null
      : String(Math.round(input.observedRoundTripMs));
  return {
    key: "app",
    name: PROGRAM_NAMES.app,
    summary: PROGRAM_SUMMARIES.app,
    status: statusWord(tone),
    tone,
    facts: carried([
      { key: "responseTime", label: FACT_LABELS.responseTime, value: roundTrip },
    ]),
    gap: PROGRAM_GAPS.app,
  };
}

function projectToolsRow(input: SystemProgramsInput): ProgramRow {
  const tone: SystemStatusTone = input.engineUnreachable
    ? "down"
    : input.coreLoading
      ? "unknown"
      : input.coreErrored || !input.coreReachable
        ? "down"
        : "ok";
  return {
    key: "projectTools",
    name: PROGRAM_NAMES.projectTools,
    summary: PROGRAM_SUMMARIES.projectTools,
    status: statusWord(tone),
    tone,
    facts: carried([
      {
        key: "version",
        label: FACT_LABELS.version,
        value: identityText(input.declaredComponent?.version),
      },
      {
        key: "requires",
        label: FACT_LABELS.requires,
        value: identityText(input.declaredComponent?.floor),
      },
    ]),
    // Not a gap in the wire: this one runs as a command whenever the app needs
    // it, so there is no address, no resident process and no running time to
    // report. Saying so is more useful than listing them as missing.
    gap: PROGRAM_GAPS.projectTools,
  };
}

function indexRow(input: SystemProgramsInput): ProgramRow {
  const tone: SystemStatusTone = input.engineUnreachable
    ? "down"
    : input.ragLoading
      ? "unknown"
      : input.ragErrored || input.ragDegraded
        ? "down"
        : "ok";
  return {
    key: "index",
    name: PROGRAM_NAMES.index,
    summary: PROGRAM_SUMMARIES.index,
    status: statusWord(tone),
    tone,
    facts: carried([
      {
        key: "version",
        label: FACT_LABELS.version,
        value: readInstalledVersion(input.ragInstalledVersion),
      },
      { key: "port", label: FACT_LABELS.port, value: identityNumber(input.ragPort) },
      {
        key: "process",
        label: FACT_LABELS.process,
        value: identityNumber(input.ragPid),
      },
    ]),
    gap: PROGRAM_GAPS.index,
  };
}

function agentsRow(input: SystemProgramsInput): ProgramRow {
  // The agent handshake carries more than the narrow `TierComponent` type models
  // (a discovered gateway and an installed release set), so it is read
  // tolerantly: a shape change drops the fields it renamed rather than throwing.
  const component = block(input.agentComponent);
  const gateway = block(component?.gateway);
  const releaseSet = block(component?.release_set);
  const installed = component?.installed;
  const notInstalled = installed === false;
  // Before the first status read settles nothing is known about this program, so
  // it CHECKS like every other row rather than asserting a failure it has not
  // observed. Claiming "Unavailable" during startup is the same class of lie as
  // inventing a field.
  const tone: SystemStatusTone = input.engineUnreachable
    ? "down"
    : input.coreLoading
      ? "unknown"
      : notInstalled || !input.agentAvailable
        ? "down"
        : "ok";
  const ownership = identityText(gateway?.ownership);
  return {
    key: "agents",
    name: PROGRAM_NAMES.agents,
    summary: PROGRAM_SUMMARIES.agents,
    // An absent install is not a fault to report as "Unavailable" — it is a
    // program that was never set up. The two read very differently to anyone
    // troubleshooting, so they stay distinct words. A still-checking read is
    // neither, so the checking word wins until the snapshot settles.
    status:
      notInstalled && tone !== "unknown"
        ? { key: "common:systemStatus.states.notInstalled" }
        : statusWord(tone),
    tone,
    facts: carried([
      {
        key: "version",
        label: FACT_LABELS.version,
        value: identityText(releaseSet?.version),
      },
      {
        key: "address",
        label: FACT_LABELS.address,
        value: identityText(gateway?.endpoint),
      },
      {
        key: "process",
        label: FACT_LABELS.process,
        value: identityNumber(gateway?.pid),
      },
      {
        key: "managedBy",
        label: FACT_LABELS.managedBy,
        value: null,
        // The ownership word is a served token mapped to plain language here. An
        // unrecognised token yields no fact at all rather than putting a raw wire
        // word on screen, so a newer engine cannot make this client print one.
        word: ownership === null ? undefined : OWNERSHIP_LABELS[ownership],
      },
    ]),
    gap: PROGRAM_GAPS.agents,
  };
}

/** Build the console view from already-read inputs. Pure. */
export function deriveSystemPrograms(input: SystemProgramsInput): SystemProgramsView {
  const readTone = (tier: string): SystemStatusTone => {
    if (input.engineUnreachable) return "down";
    if (input.coreLoading) return "unknown";
    return input.degradations.includes(tier) ? "down" : "ok";
  };
  const reads: Array<[ReadKey, string]> = [
    ["documents", "structural"],
    ["links", "declared"],
    ["history", "temporal"],
  ];
  return {
    programs: [
      appRow(input),
      projectToolsRow(input),
      indexRow(input),
      agentsRow(input),
    ],
    reads: reads.map(([key, tier]) => {
      const tone = readTone(tier);
      return { key, label: READ_LABELS[key], status: statusWord(tone), tone };
    }),
  };
}

/**
 * Stores hook: the system-status console view. Mount-gated with the console it
 * serves, and derived in one `useMemo` over the raw slices it reads
 * (frontend-store-selectors: a selector returns raw state, derivation happens
 * outside it). Adds no read of its own — every input rides the status snapshot
 * and the provisioning projection the app already holds.
 */
export function useSystemPrograms(): SystemProgramsView {
  const status = useEngineStatus();
  const provision = useProvisionStatus();

  const core = deriveCoreStatusView(status.data, status.error, status.isPending);
  const rag = deriveRagStatusView(status.data, status.error, status.isPending);
  const tiers = tiersFromQuery(status);
  const availability = readTierAvailability(tiers, ["declared", "agent"]);
  const declaredComponent = availability.components?.declared;
  const agentComponent = availability.components?.agent;
  const agentAvailable = tiers?.agent?.available === true;

  const engineUnreachable = status.isError;
  const observedRoundTripMs = status.data?.observedRoundTripMs ?? null;
  // The raw served array, never a fresh `?? []` fallback: a new literal per render
  // would change identity every snapshot and defeat the memo below
  // (frontend-store-selectors).
  const degradations = status.data?.degradations ?? NO_DEGRADATIONS;
  const ragPort = status.data?.rag?.port;
  const ragPid = status.data?.rag?.pid;
  const ragInstalledVersion = provision.data?.rag.tool_version ?? null;

  return useMemo(
    () =>
      deriveSystemPrograms({
        engineUnreachable,
        observedRoundTripMs,
        degradations,
        coreLoading: core.loading,
        coreErrored: core.errored,
        coreReachable: core.reachable,
        ragLoading: rag.loading,
        ragDegraded: rag.degraded,
        ragErrored: rag.errored,
        ragPort,
        ragPid,
        ragInstalledVersion,
        declaredComponent,
        agentComponent,
        agentAvailable,
      }),
    [
      engineUnreachable,
      observedRoundTripMs,
      degradations,
      core.loading,
      core.errored,
      core.reachable,
      rag.loading,
      rag.degraded,
      rag.errored,
      ragPort,
      ragPid,
      ragInstalledVersion,
      declaredComponent,
      agentComponent,
      agentAvailable,
    ],
  );
}
