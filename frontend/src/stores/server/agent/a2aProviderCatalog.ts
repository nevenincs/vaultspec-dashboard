// The provider-catalog HALF of the a2a team client (split from `a2aTeam.ts`
// under the module-size gate — a move, not a re-decision; `a2aTeam` re-exports
// everything here, so every consumer keeps its one import path).
//
// This module is PURE: the A2A-owned provider/model catalog's served shapes, the
// tolerant adapters over the pass-through envelope, and the selection algebra
// that can only ever mint a selection from a CURRENT, selectable catalog record.
// The client, query keys, and hooks that fetch this data stay in `a2aTeam.ts` —
// this half has no wire access of its own.

import { asStr, isRec, type Rec } from "../authoring";
import type { TiersBlock } from "../engine";

/** The engine's `/ops/a2a/*` pass-through unwrap: the sibling envelope verbatim,
 * the sibling HTTP status when it refused, and the engine's tiers block. */
export interface PassThrough {
  readonly envelope: unknown;
  readonly siblingStatus?: number;
  readonly tiers?: TiersBlock;
}

/** States remain A2A-owned rather than being inferred from an id, a vendor name,
 * or an optimistic browser probe. */
export type ProviderHealthState = "available" | "unavailable" | "unknown";
export type ProviderAuthenticationState =
  | "authenticated"
  | "unauthenticated"
  | "unknown"
  | "not_applicable";
export type ProviderAdmissionState = "admitted" | "not_admitted" | "unknown";
export type ProviderCatalogStatus = "available" | "unavailable" | "stale" | "unknown";

/** A2A's independent health evidence for one provider execution lane. `selectable`
 * is deliberately fail-closed: only an explicit `true` permits a new selection. */
export interface ProviderHealth {
  readonly configured: ProviderHealthState;
  readonly transport: ProviderHealthState;
  readonly authentication: ProviderAuthenticationState;
  readonly catalog: ProviderCatalogStatus;
  readonly admission: ProviderAdmissionState;
  readonly selectable: boolean;
  readonly reasons: string[];
  readonly checked_at?: string;
}

/** The freshness and provenance of one provider-owned model catalog. */
export interface ProviderCatalogState {
  readonly status: ProviderCatalogStatus;
  readonly checked_at?: string;
  readonly revision?: string;
  readonly expires_at?: string;
  readonly reason?: string;
}

/** One opaque catalog entry. It is addressed by `entry_id`; the provider's exact
 * execution value remains A2A-local until the run is frozen. */
export interface ProviderCatalogEntry {
  readonly entry_id: string;
  readonly display_name?: string;
  readonly description?: string;
  readonly capabilities: string[];
  /** Provider-issued control ids applicable to this model only. An omitted value
   * remains an empty set; Dashboard never promotes lane-wide controls to a model. */
  readonly native_control_ids?: readonly string[];
}

/** A provider-native control and its provider-issued option ids. There is no
 * Dashboard enum for effort, speed, service tier, or any other control kind. */
export interface ProviderNativeControlOption {
  readonly option_id: string;
  readonly display_name?: string;
  readonly description?: string;
}

export interface ProviderNativeControl {
  readonly control_id: string;
  readonly kind?: string;
  readonly display_name?: string;
  readonly options: ProviderNativeControlOption[];
  readonly default_option_id?: string;
  readonly description?: string;
}

export interface ProviderCatalog {
  readonly state: ProviderCatalogState;
  readonly models: ProviderCatalogEntry[];
  readonly native_controls: ProviderNativeControl[];
}

/** One provider/execution-mode lane as A2A currently serves it. Unavailable lanes
 * are retained so the panel can disclose the actual health evidence, but cannot
 * mint a selection. */
export interface ProviderCatalogRecord {
  readonly provider_id: string;
  readonly display_name?: string;
  readonly execution_mode: string;
  readonly health: ProviderHealth;
  readonly catalog: ProviderCatalog;
}

export interface ProviderCatalogResult {
  readonly providers: ProviderCatalogRecord[];
  readonly tiers?: TiersBlock;
}

/** The only selection shape a new product run may send. Every string originates
 * in one current A2A catalog response; callers never send a raw model value. */
export interface ProviderCatalogSelection {
  readonly provider_id: string;
  readonly execution_mode: string;
  readonly catalog_revision: string;
  readonly entry_id: string;
  readonly controls: Readonly<Record<string, string>>;
}

// --- tolerant adapters ----------------------------------------------------------

/** Shared string-array tolerance (also consumed by the run/preset adapters that
 * stayed in `a2aTeam.ts`). */
export const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

const providerHealthStates = new Set<ProviderHealthState>([
  "available",
  "unavailable",
  "unknown",
]);
const authenticationStates = new Set<ProviderAuthenticationState>([
  "authenticated",
  "unauthenticated",
  "unknown",
  "not_applicable",
]);
const admissionStates = new Set<ProviderAdmissionState>([
  "admitted",
  "not_admitted",
  "unknown",
]);
const catalogStates = new Set<ProviderCatalogStatus>([
  "available",
  "unavailable",
  "stale",
  "unknown",
]);

function knownState<T extends string>(
  raw: unknown,
  values: ReadonlySet<T>,
  fallback: T,
): T {
  return typeof raw === "string" && values.has(raw as T) ? (raw as T) : fallback;
}

function strRecord(raw: unknown): Record<string, string> | null {
  if (!isRec(raw)) return null;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key || typeof value !== "string" || !value) return null;
    result[key] = value;
  }
  return result;
}

function adaptCatalogEntry(raw: unknown): ProviderCatalogEntry | null {
  if (!isRec(raw)) return null;
  const entryId = asStr(raw.entry_id);
  if (!entryId) return null;
  return {
    entry_id: entryId,
    display_name: asStr(raw.display_name),
    description: asStr(raw.description),
    capabilities: strArr(raw.capabilities),
    native_control_ids: strArr(raw.native_control_ids).filter((controlId) => controlId),
  };
}

function adaptNativeControlOption(raw: unknown): ProviderNativeControlOption | null {
  if (!isRec(raw)) return null;
  const optionId = asStr(raw.option_id);
  if (!optionId) return null;
  return {
    option_id: optionId,
    display_name: asStr(raw.display_name),
    description: asStr(raw.description),
  };
}

function adaptNativeControl(raw: unknown): ProviderNativeControl | null {
  if (!isRec(raw)) return null;
  const controlId = asStr(raw.control_id);
  if (!controlId) return null;
  const options = Array.isArray(raw.options)
    ? raw.options
        .map(adaptNativeControlOption)
        .filter((option): option is ProviderNativeControlOption => option !== null)
    : [];
  const defaultOptionId = asStr(raw.default_option_id);
  return {
    control_id: controlId,
    kind: asStr(raw.kind),
    display_name: asStr(raw.display_name),
    options,
    ...(defaultOptionId !== undefined &&
    options.some((option) => option.option_id === defaultOptionId)
      ? { default_option_id: defaultOptionId }
      : {}),
    description: asStr(raw.description),
  };
}

function adaptProviderHealth(raw: unknown): ProviderHealth {
  const health: Rec = isRec(raw) ? raw : {};
  const configured = knownState(health.configured, providerHealthStates, "unknown");
  const transport = knownState(health.transport, providerHealthStates, "unknown");
  const authentication = knownState(
    health.authentication,
    authenticationStates,
    "unknown",
  );
  const catalog = knownState(health.catalog, catalogStates, "unknown");
  const admission = knownState(health.admission, admissionStates, "unknown");
  return {
    configured,
    transport,
    authentication,
    catalog,
    admission,
    // Omitted or internally inconsistent selectability is not permission to
    // start a run. A2A derives this field too; the browser verifies all served
    // axes before presenting a current entry as a selectable default.
    selectable:
      health.selectable === true &&
      configured === "available" &&
      transport === "available" &&
      (authentication === "authenticated" || authentication === "not_applicable") &&
      catalog === "available" &&
      admission === "admitted",
    reasons: strArr(health.reasons),
    checked_at: asStr(health.checked_at),
  };
}

function adaptCatalog(raw: unknown): ProviderCatalog {
  const catalog: Rec = isRec(raw) ? raw : {};
  const state: Rec = isRec(catalog.state) ? catalog.state : {};
  const models = Array.isArray(catalog.models)
    ? catalog.models
        .map(adaptCatalogEntry)
        .filter((entry): entry is ProviderCatalogEntry => entry !== null)
    : [];
  const nativeControls = Array.isArray(catalog.native_controls)
    ? catalog.native_controls
        .map(adaptNativeControl)
        .filter((control): control is ProviderNativeControl => control !== null)
    : [];
  return {
    state: {
      status: knownState(state.status, catalogStates, "unknown"),
      checked_at: asStr(state.checked_at),
      revision: asStr(state.revision),
      expires_at: asStr(state.expires_at),
      reason: asStr(state.reason),
    },
    models,
    native_controls: nativeControls,
  };
}

function adaptProviderCatalogRecord(raw: unknown): ProviderCatalogRecord | null {
  if (!isRec(raw)) return null;
  const providerId = asStr(raw.provider_id);
  const executionMode = asStr(raw.execution_mode);
  if (!providerId || !executionMode) return null;
  return {
    provider_id: providerId,
    display_name: asStr(raw.display_name),
    execution_mode: executionMode,
    health: adaptProviderHealth(raw.health),
    catalog: adaptCatalog(raw.catalog),
  };
}

/** Adapt the A2A-owned current provider catalog. Sparse or future records remain
 * visible with `unknown` health, but no missing value can create a selectable row. */
export function adaptProviderCatalog(pass: PassThrough): ProviderCatalogResult {
  const env = pass.envelope;
  const rawProviders = isRec(env) && Array.isArray(env.providers) ? env.providers : [];
  return {
    providers: rawProviders
      .map(adaptProviderCatalogRecord)
      .filter((record): record is ProviderCatalogRecord => record !== null),
    tiers: pass.tiers,
  };
}

/** Adapt one complete, A2A-issued selection; an incomplete row stays absent
 * rather than being dressed up as a choice. (Also consumed by the frozen-role
 * adapter that stayed in `a2aTeam.ts`.) */
export function adaptSelection(raw: unknown): ProviderCatalogSelection | null {
  if (!isRec(raw)) return null;
  const providerId = asStr(raw.provider_id);
  const executionMode = asStr(raw.execution_mode);
  const revision = asStr(raw.catalog_revision);
  const entryId = asStr(raw.entry_id);
  const controls = strRecord(raw.controls);
  if (!providerId || !executionMode || !revision || !entryId || controls === null) {
    return null;
  }
  return {
    provider_id: providerId,
    execution_mode: executionMode,
    catalog_revision: revision,
    entry_id: entryId,
    controls,
  };
}

// --- the selection algebra ------------------------------------------------------

/** Whether one served lane can currently mint a new run selection. This is more
 * restrictive than merely rendering a catalog record: stale, unknown, or omitted
 * selectability must never become a browser-side default. */
export function isProviderCatalogSelectable(record: ProviderCatalogRecord): boolean {
  return (
    record.health.selectable &&
    record.catalog.state.status === "available" &&
    typeof record.catalog.state.revision === "string" &&
    record.catalog.state.revision.length > 0
  );
}

function nativeControlsForEntry(
  record: ProviderCatalogRecord,
  entryId: string,
): readonly ProviderNativeControl[] | null {
  const entry = record.catalog.models.find((candidate) => candidate.entry_id === entryId);
  if (entry === undefined) return null;
  const controlIds = entry.native_control_ids ?? [];
  if (new Set(controlIds).size !== controlIds.length) return null;
  const controls = controlIds.map((controlId) =>
    record.catalog.native_controls.find((candidate) => candidate.control_id === controlId),
  );
  return controls.every(
    (control): control is ProviderNativeControl => control !== undefined,
  )
    ? controls
    : null;
}

/** Returns only the controls A2A attached to one current model entry. A malformed
 * control reference remains unavailable instead of falling back to lane controls. */
export function nativeControlsForCatalogEntry(
  record: ProviderCatalogRecord,
  entryId: string,
): readonly ProviderNativeControl[] {
  return nativeControlsForEntry(record, entryId) ?? [];
}

/** Construct a selection only from a current provider record and entry. Native
 * control defaults are included only when A2A advertised them; an absent default
 * remains absent rather than becoming an invented level. */
export function selectionFromCatalogEntry(
  record: ProviderCatalogRecord,
  entryId: string,
): ProviderCatalogSelection | null {
  if (!isProviderCatalogSelectable(record)) return null;
  const nativeControls = nativeControlsForEntry(record, entryId);
  if (nativeControls === null) return null;
  const controls: Record<string, string> = {};
  for (const control of nativeControls) {
    if (control.default_option_id !== undefined) {
      controls[control.control_id] = control.default_option_id;
    }
  }
  return {
    provider_id: record.provider_id,
    execution_mode: record.execution_mode,
    catalog_revision: record.catalog.state.revision!,
    entry_id: entryId,
    controls,
  };
}

/** Update one provider-native control only when its option is still advertised by
 * the exact lane and revision selected. The input is bounded again at the Rust and
 * A2A boundaries; this browser check prevents a stale popover from inventing one. */
export function selectionWithCatalogControl(
  record: ProviderCatalogRecord,
  selection: ProviderCatalogSelection,
  controlId: string,
  optionId: string,
): ProviderCatalogSelection | null {
  if (!isCurrentCatalogSelection(record, selection)) return null;
  const control = nativeControlsForEntry(record, selection.entry_id)?.find(
    (candidate) => candidate.control_id === controlId,
  );
  if (!control?.options.some((option) => option.option_id === optionId)) return null;
  return { ...selection, controls: { ...selection.controls, [controlId]: optionId } };
}

/** Revalidate a retained UI selection against a just-refreshed catalog. Any drift
 * is a closed gate, left for A2A to explain through its current health/revision. */
export function isCurrentCatalogSelection(
  record: ProviderCatalogRecord,
  selection: ProviderCatalogSelection | null,
): selection is ProviderCatalogSelection {
  if (!selection || !isProviderCatalogSelectable(record)) return false;
  if (
    selection.provider_id !== record.provider_id ||
    selection.execution_mode !== record.execution_mode ||
    selection.catalog_revision !== record.catalog.state.revision ||
    !record.catalog.models.some((entry) => entry.entry_id === selection.entry_id)
  ) {
    return false;
  }
  const nativeControls = nativeControlsForEntry(record, selection.entry_id);
  if (nativeControls === null) return false;
  return Object.entries(selection.controls).every(([controlId, optionId]) => {
    const control = nativeControls.find(
      (candidate) => candidate.control_id === controlId,
    );
    return control?.options.some((option) => option.option_id === optionId) ?? false;
  });
}
