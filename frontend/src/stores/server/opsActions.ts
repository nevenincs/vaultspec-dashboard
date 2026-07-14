// Ops dispatch terminal effect (dashboard-layer-ownership): the engine call that
// realizes a whitelisted ops intent lives in the stores layer — the SOLE wire
// client — and is registered onto the ONE platform dispatch seam so it stays
// logged, traced, and centrally guardable. The app layer triggers intents via
// `dispatchOps` and reads the allowed ops list from this module; it never owns
// the whitelist and never touches the engine client itself.

import { appDispatcher } from "../../platform/dispatch/middleware";
import type { MessageDescriptor } from "../../platform/localization/message";
import {
  engineClient,
  type OpsArchiveBody,
  type OpsAutofixBody,
  type OpsResult,
} from "./engine";

export const OPS_ACTION = "ops:run";
export const OPS_VERB_MAX_CHARS = 128;
export const OPS_BODY_STRING_MAX_CHARS = 4096;

export interface OpsPayload {
  target: "core" | "rag";
  verb: string;
  /**
   * The dispatch mode for a `core` target (document-editor backend): `control`
   * (default) runs the argument-free `opsCore` control verb; `archive` runs
   * `/ops/core/archive` (feature-scoped `vault feature archive`); `autofix` runs
   * `/ops/core/autofix` (feature-scoped `vault check all --fix`). These are the
   * two RETAINED vault-maintenance operations (ledgered-edit-migration ADR — a
   * multi-document/bulk op with no single target does not fit the per-document
   * ledger). Every genuine content edit (set-body/set-frontmatter/rename/create/
   * relate-link) is ledgered instead (`stores/server/authoring.ts`
   * `directWrite()`), so the legacy `write`/`create`/`link` modes this seam used
   * to carry are RETIRED (ledgered-edit-migration W04.P12) — this dispatcher
   * whitelists only `archive`/`autofix`/argument-free control verbs now. A `rag`
   * target ignores `mode` (it always forwards `body` to the brokered control
   * verb).
   */
  mode?: "control" | "archive" | "autofix";
  /** Optional validated args. For a `rag` control verb: the reindex/watcher/evict
   *  args (rag-control-plane). For a `core` `archive`/`autofix` mode: the
   *  `OpsArchiveBody` / `OpsAutofixBody` maintenance payload. Absent for an
   *  argument-free control verb. */
  body?: unknown;
}

export interface OpsWhitelistEntry {
  readonly target: OpsPayload["target"];
  readonly verb: string;
  readonly concept: OperationConcept;
  readonly label: MessageDescriptor;
}

export type OperationConcept =
  | "check-workspace"
  | "show-workspace-details"
  | "enable-search"
  | "disable-search"
  | "refresh-search"
  | "apply-search-settings";

/** The R1 app-exposed ops whitelist, owned with the dispatch seam. */
export const OPS_WHITELIST = Object.freeze([
  Object.freeze({
    target: "core",
    verb: "vault-check",
    concept: "check-workspace",
    label: Object.freeze({ key: "operations:actions.checkWorkspace" } as const),
  }),
  Object.freeze({
    target: "core",
    verb: "vault-stats",
    concept: "show-workspace-details",
    label: Object.freeze({
      key: "operations:actions.showWorkspaceDetails",
    } as const),
  }),
  Object.freeze({
    target: "rag",
    verb: "server-start",
    concept: "enable-search",
    label: Object.freeze({ key: "operations:actions.enableSearch" } as const),
  }),
  Object.freeze({
    target: "rag",
    verb: "server-stop",
    concept: "disable-search",
    label: Object.freeze({ key: "operations:actions.disableSearch" } as const),
  }),
  Object.freeze({
    target: "rag",
    verb: "reindex",
    concept: "refresh-search",
    label: Object.freeze({ key: "operations:actions.refreshSearch" } as const),
  }),
  Object.freeze({
    target: "rag",
    verb: "watcher-reconfigure",
    concept: "apply-search-settings",
    label: Object.freeze({
      key: "operations:actions.applySearchSettings",
    } as const),
  }),
] as const satisfies readonly OpsWhitelistEntry[]);

const OPS_WHITELIST_BY_ROUTE: ReadonlyMap<string, OpsWhitelistEntry> = new Map(
  OPS_WHITELIST.map((entry) => [`${entry.target}:${entry.verb}`, entry]),
);

const OPS_RAG_CONTROL_VERBS = new Set([
  "server-start",
  "server-stop",
  "server-doctor",
  "server-install",
  "reindex",
  "watcher-start",
  "watcher-stop",
  "watcher-reconfigure",
  "project-evict",
]);

const OPS_CORE_ARCHIVE_VERB = "feature-archive";
const OPS_CORE_AUTOFIX_VERB = "autofix";

export function isOpsWhitelistIntent(
  payload: Pick<OpsPayload, "target" | "verb">,
): boolean {
  return lookupOpsWhitelistEntry(payload.target, payload.verb) !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeOpsTarget(value: unknown): OpsPayload["target"] | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized === "core" || normalized === "rag" ? normalized : null;
}

export function normalizeOpsVerb(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= OPS_VERB_MAX_CHARS
    ? normalized
    : null;
}

/** Resolve a normalized operation route to its one immutable whitelist entry. */
export function lookupOpsWhitelistEntry(
  targetValue: unknown,
  verbValue: unknown,
): OpsWhitelistEntry | null {
  const target = normalizeOpsTarget(targetValue);
  const verb = normalizeOpsVerb(verbValue);
  return target === null || verb === null
    ? null
    : (OPS_WHITELIST_BY_ROUTE.get(`${target}:${verb}`) ?? null);
}

export function normalizeOpsWhitelistIntent(
  payload: unknown,
): Pick<OpsPayload, "target" | "verb"> | null {
  if (!isRecord(payload)) return null;
  const entry = lookupOpsWhitelistEntry(payload.target, payload.verb);
  return entry === null ? null : { target: entry.target, verb: entry.verb };
}

function isOpsTarget(value: unknown): value is OpsPayload["target"] {
  return normalizeOpsTarget(value) === value;
}

function isOpsMode(value: unknown): value is NonNullable<OpsPayload["mode"]> {
  return value === "control" || value === "archive" || value === "autofix";
}

function isBoundedString(
  value: unknown,
  maxChars = OPS_BODY_STRING_MAX_CHARS,
): value is string {
  return typeof value === "string" && value.length <= maxChars;
}

function isNonEmptyString(
  value: unknown,
  maxChars = OPS_BODY_STRING_MAX_CHARS,
): value is string {
  return isBoundedString(value, maxChars) && value.length > 0;
}

function isOptionalString(
  value: unknown,
  maxChars = OPS_BODY_STRING_MAX_CHARS,
): value is string | undefined {
  return value === undefined || isBoundedString(value, maxChars);
}

function isOpsArchiveBody(body: unknown): body is OpsArchiveBody {
  if (!isRecord(body)) return false;
  return isNonEmptyString(body.feature) && isOptionalString(body.scope);
}

function isOpsAutofixBody(body: unknown): body is OpsAutofixBody {
  if (!isRecord(body)) return false;
  return isNonEmptyString(body.feature) && isOptionalString(body.scope);
}

function isEmptyOpsBody(body: unknown): boolean {
  return body === undefined || (isRecord(body) && Object.keys(body).length === 0);
}

function hasOnlyKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(body).every((key) => allowedKeys.has(key));
}

function isOpsRagControlBodyForVerb(verb: string, body: unknown): boolean {
  // `server-start` carries an optional bounded start-flag body (D5 arg
  // pass-through): local_only / port / qdrant_auto_provision, validated again on
  // the engine. Empty is also valid.
  if (verb === "server-start") {
    if (isEmptyOpsBody(body)) return true;
    if (!isRecord(body)) return false;
    if (!hasOnlyKeys(body, ["local_only", "port", "qdrant_auto_provision"]))
      return false;
    return (
      (body.local_only === undefined || typeof body.local_only === "boolean") &&
      (body.port === undefined ||
        (typeof body.port === "number" && Number.isInteger(body.port))) &&
      (body.qdrant_auto_provision === undefined ||
        typeof body.qdrant_auto_provision === "boolean")
    );
  }
  if (
    verb === "server-stop" ||
    verb === "server-doctor" ||
    verb === "server-install" ||
    verb === "watcher-start" ||
    verb === "watcher-stop"
  ) {
    return isEmptyOpsBody(body);
  }
  if (!isRecord(body)) return false;
  if (verb === "reindex") {
    if (!hasOnlyKeys(body, ["type", "clean"])) return false;
    return (
      (body.type === undefined || body.type === "vault" || body.type === "code") &&
      (body.clean === undefined || typeof body.clean === "boolean")
    );
  }
  if (verb === "watcher-reconfigure") {
    if (!hasOnlyKeys(body, ["debounce_ms", "cooldown_s"])) return false;
    return (
      (body.debounce_ms === undefined ||
        (typeof body.debounce_ms === "number" && Number.isFinite(body.debounce_ms))) &&
      (body.cooldown_s === undefined ||
        (typeof body.cooldown_s === "number" && Number.isFinite(body.cooldown_s)))
    );
  }
  if (verb === "project-evict") {
    return hasOnlyKeys(body, ["root"]) && isNonEmptyString(body.root);
  }
  return false;
}

export function isOpsDispatchIntent(payload: unknown): payload is OpsPayload {
  if (!isRecord(payload)) return false;
  if (!isOpsTarget(payload.target)) return false;
  const normalizedVerb = normalizeOpsVerb(payload.verb);
  if (normalizedVerb === null || normalizedVerb !== payload.verb) return false;
  if (payload.mode !== undefined && !isOpsMode(payload.mode)) return false;
  const target = payload.target;
  const verb = normalizedVerb;
  const mode = payload.mode;
  if (target === "core") {
    if (mode === "archive") {
      return verb === OPS_CORE_ARCHIVE_VERB && isOpsArchiveBody(payload.body);
    }
    if (mode === "autofix") {
      return verb === OPS_CORE_AUTOFIX_VERB && isOpsAutofixBody(payload.body);
    }
    return isOpsWhitelistIntent({ target, verb });
  }
  return (
    mode === undefined &&
    OPS_RAG_CONTROL_VERBS.has(verb) &&
    isOpsRagControlBodyForVerb(verb, payload.body)
  );
}

function opsDispatchError(payload: unknown): Error {
  const target = isRecord(payload) ? payload.target : undefined;
  const verb = isRecord(payload) ? payload.verb : undefined;
  return new Error(
    `operation is not dispatch-whitelisted: ${String(target)}:${String(verb)}`,
  );
}

function assertOpsDispatchIntent(payload: unknown): asserts payload is OpsPayload {
  if (!isOpsDispatchIntent(payload)) throw opsDispatchError(payload);
}

// Register the terminal effect once (module load): run the whitelisted verb
// against the engine ops proxy. Cache invalidation stays with the caller so the
// handler is a pure manipulation effect. The RETAINED vault-maintenance ops
// (archive/autofix) route through this seam so their mutations stay logged,
// traced, and centrally guardable — the app layer never reaches the engine
// client itself. Every genuine content edit is ledgered instead
// (ledgered-edit-migration W04.P12 retired the `write`/`create`/`link` modes
// this seam used to carry).
appDispatcher.register<OpsPayload>(OPS_ACTION, (action) => {
  const payload = action.payload as unknown;
  if (!payload) throw new Error("ops:run dispatched without a payload");
  assertOpsDispatchIntent(payload);
  if (payload.target === "rag") {
    return engineClient.opsRag(payload.verb, payload.body ?? {});
  }
  switch (payload.mode) {
    case "archive":
      return engineClient.opsCoreArchive(payload.body as OpsArchiveBody);
    case "autofix":
      return engineClient.opsCoreAutofix(payload.body as OpsAutofixBody);
    default:
      return engineClient.opsCore(payload.verb);
  }
});

/** Dispatch an ops intent through the seam; resolves with the ops envelope. */
export function dispatchOps(payload: unknown): Promise<OpsResult> {
  assertOpsDispatchIntent(payload);
  return appDispatcher.dispatch({
    type: OPS_ACTION,
    payload,
  }) as Promise<OpsResult>;
}
