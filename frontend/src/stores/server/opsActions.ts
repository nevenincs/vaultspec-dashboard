// Ops dispatch terminal effect (dashboard-layer-ownership): the engine call that
// realizes a whitelisted ops intent lives in the stores layer — the SOLE wire
// client — and is registered onto the ONE platform dispatch seam so it stays
// logged, traced, and centrally guardable. The app layer triggers intents via
// `dispatchOps` and reads the allowed ops list from this module; it never owns
// the whitelist and never touches the engine client itself.

import { appDispatcher } from "../../platform/dispatch/middleware";
import {
  engineClient,
  type OpsArchiveBody,
  type OpsCreateBody,
  type OpsAutofixBody,
  type OpsLinkBody,
  type OpsResult,
  type OpsWriteBody,
} from "./engine";

export const OPS_ACTION = "ops:run";
export const OPS_VERB_MAX_CHARS = 128;
export const OPS_BODY_STRING_MAX_CHARS = 4096;
export const OPS_BODY_CONTENT_MAX_CHARS = 512 * 1024;
export const OPS_BODY_STRING_LIST_MAX_ITEMS = 256;

export interface OpsPayload {
  target: "core" | "rag";
  verb: string;
  /**
   * The dispatch mode for a `core` target (document-editor backend): `control`
   * (default) runs the argument-free `opsCore` control verb; `write` runs a
   * document mutation (`set-body` | `set-frontmatter` | `edit` | `rename`) against
   * `/ops/core/{verb}/write`; `create` runs `/ops/core/create`; `archive` runs
   * `/ops/core/archive` (feature-scoped `vault feature archive`); `link` runs
   * `/ops/core/link` (`vault link add <src> <dst>`). The write/create/archive/link
   * modes carry their payload in `body`. A `rag` target ignores `mode` (it always
   * forwards `body` to the brokered control verb).
   */
  mode?: "control" | "write" | "create" | "archive" | "link" | "autofix";
  /** Optional validated args. For a `rag` control verb: the reindex/watcher/evict
   *  args (rag-control-plane). For a `core` `write`/`create` mode: the
   *  `OpsWriteBody` / `OpsCreateBody` document-mutation payload. Absent for an
   *  argument-free control verb. */
  body?: unknown;
}

export interface OpsWhitelistEntry {
  target: OpsPayload["target"];
  verb: string;
  label: string;
}

/** The R1 app-exposed ops whitelist, owned with the dispatch seam. */
export const OPS_WHITELIST: readonly OpsWhitelistEntry[] = [
  { target: "core", verb: "vault-check", label: "vault check" },
  { target: "core", verb: "vault-stats", label: "vault stats" },
  { target: "rag", verb: "server-start", label: "start rag" },
  { target: "rag", verb: "server-stop", label: "stop rag" },
  { target: "rag", verb: "reindex", label: "reindex" },
  { target: "rag", verb: "watcher-reconfigure", label: "watcher tuning" },
];

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

const OPS_CORE_WRITE_VERBS = new Set(["set-body", "set-frontmatter", "edit", "rename"]);
const OPS_CORE_CREATE_VERB = "create";
const OPS_CORE_ARCHIVE_VERB = "feature-archive";
const OPS_CORE_LINK_VERB = "link-add";
const OPS_CORE_AUTOFIX_VERB = "autofix";

export function isOpsWhitelistIntent(
  payload: Pick<OpsPayload, "target" | "verb">,
): boolean {
  return OPS_WHITELIST.some(
    (entry) => entry.target === payload.target && entry.verb === payload.verb,
  );
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

export function normalizeOpsWhitelistIntent(
  payload: unknown,
): Pick<OpsPayload, "target" | "verb"> | null {
  if (!isRecord(payload)) return null;
  const target = normalizeOpsTarget(payload.target);
  const verb = normalizeOpsVerb(payload.verb);
  if (target === null || verb === null) return null;
  const intent = { target, verb };
  return isOpsWhitelistIntent(intent) ? intent : null;
}

function isOpsTarget(value: unknown): value is OpsPayload["target"] {
  return normalizeOpsTarget(value) === value;
}

function isOpsMode(value: unknown): value is NonNullable<OpsPayload["mode"]> {
  return (
    value === "control" ||
    value === "write" ||
    value === "create" ||
    value === "archive" ||
    value === "link" ||
    value === "autofix"
  );
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

function isOptionalStringArray(value: unknown): value is string[] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= OPS_BODY_STRING_LIST_MAX_ITEMS &&
      value.every((entry) => isBoundedString(entry)))
  );
}

function isOpsWriteBodyForVerb(verb: string, body: unknown): body is OpsWriteBody {
  if (!isRecord(body)) return false;
  if (!isNonEmptyString(body.ref)) return false;
  if (
    !isOptionalString(body.scope) ||
    !isOptionalString(body.body, OPS_BODY_CONTENT_MAX_CHARS) ||
    !isOptionalString(body.expected_blob_hash) ||
    !isOptionalString(body.date) ||
    !isOptionalString(body.to) ||
    !isOptionalStringArray(body.tags) ||
    !isOptionalStringArray(body.related)
  ) {
    return false;
  }
  if (verb === "set-body" || verb === "edit") {
    return isBoundedString(body.body, OPS_BODY_CONTENT_MAX_CHARS);
  }
  if (verb === "rename") return isNonEmptyString(body.to);
  return verb === "set-frontmatter";
}

function isOpsCreateBody(body: unknown): body is OpsCreateBody {
  if (!isRecord(body)) return false;
  return (
    isNonEmptyString(body.doc_type) &&
    isNonEmptyString(body.feature) &&
    isOptionalString(body.scope) &&
    isOptionalString(body.title) &&
    isOptionalStringArray(body.related)
  );
}

function isOpsArchiveBody(body: unknown): body is OpsArchiveBody {
  if (!isRecord(body)) return false;
  return isNonEmptyString(body.feature) && isOptionalString(body.scope);
}

function isOpsLinkBody(body: unknown): body is OpsLinkBody {
  if (!isRecord(body)) return false;
  return (
    isNonEmptyString(body.src) &&
    isNonEmptyString(body.dst) &&
    isOptionalString(body.scope)
  );
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
    if (mode === "write") {
      return (
        OPS_CORE_WRITE_VERBS.has(verb) && isOpsWriteBodyForVerb(verb, payload.body)
      );
    }
    if (mode === "create") {
      return verb === OPS_CORE_CREATE_VERB && isOpsCreateBody(payload.body);
    }
    if (mode === "archive") {
      return verb === OPS_CORE_ARCHIVE_VERB && isOpsArchiveBody(payload.body);
    }
    if (mode === "link") {
      return verb === OPS_CORE_LINK_VERB && isOpsLinkBody(payload.body);
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
// handler is a pure manipulation effect. Document write/create (document-editor
// backend) routes through the same seam so vault mutations stay logged, traced,
// and centrally guardable — the app layer never reaches the engine client itself.
appDispatcher.register<OpsPayload>(OPS_ACTION, (action) => {
  const payload = action.payload as unknown;
  if (!payload) throw new Error("ops:run dispatched without a payload");
  assertOpsDispatchIntent(payload);
  if (payload.target === "rag") {
    return engineClient.opsRag(payload.verb, payload.body ?? {});
  }
  switch (payload.mode) {
    case "write":
      return engineClient.opsCoreWrite(payload.verb, payload.body as OpsWriteBody);
    case "create":
      return engineClient.opsCoreCreate(payload.body as OpsCreateBody);
    case "archive":
      return engineClient.opsCoreArchive(payload.body as OpsArchiveBody);
    case "link":
      return engineClient.opsCoreLink(payload.body as OpsLinkBody);
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
