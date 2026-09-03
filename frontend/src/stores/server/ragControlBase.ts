// The rag control plane's SHARED FLOOR — the pieces every rag-control submodule
// stands on: the brokered result shape, the scope/key normalizers, the one
// cache-key namespace, the tiers-gated offline readers, and the bounded request
// windows the keys fold in. Split out of `ragControl.ts` when the module-size
// gate caught the seam growing monolithic; the seam itself is unchanged —
// `ragControl.ts` re-exports this module, so consumers keep one import path.
//
// Degradation is TIERS-GATED truth, never guessed (degradation-is-read-from-
// tiers): "rag is down" is read from the `tiers.semantic` block the brokered
// envelope carries — success OR a fresh error envelope — never from a bare
// transport error.

import { readTierAvailability, tiersFromQuery, type TiersBlock } from "./engine";
import { engineKeys, normalizeGraphSliceScope } from "./queries";

/** The unwrapped brokered result: rag's value (or null when degraded) + tiers. */
export interface BrokeredResult<T> {
  envelope: T | null;
  tiers: TiersBlock;
}

// --- scope / key-part normalizers ----------------------------------------------
//
// The reads operate on the engine's ACTIVE scope (the `/ops/rag/*` surface
// carries no scope param), so the active scope folds into each key — a scope
// swap re-reads, mirroring the other per-scope read families.

export const normalizeRagControlScope = normalizeGraphSliceScope;
export const RAG_CONTROL_KEY_PART_MAX_CHARS = 2048;
export const RAG_JOB_TEXT_MAX_CHARS = 2048;

export function normalizeRagControlKeyPart(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= RAG_CONTROL_KEY_PART_MAX_CHARS
    ? normalized
    : fallback;
}

/** A bounded served text field: trimmed, non-empty, within the job-text cap. */
export function normalizeRagJobText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= RAG_JOB_TEXT_MAX_CHARS
    ? normalized
    : undefined;
}

/** A finite served number, or undefined for anything else. */
export function normalizeRagJobNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// --- bounded request windows (folded into the cache keys below) -----------------

/** Default/min/max for the log `lines` request window. 500 mirrors the engine's
 *  own server-side clamp (`MAX_RAG_LOG_LINES`) so a request never asks for more
 *  than the broker will serve. */
export const RAG_LOGS_LINES_DEFAULT = 200;
export const RAG_LOGS_LINES_MIN = 1;
export const RAG_LOGS_LINES_MAX = 500;

/** Clamp a requested `lines` window to `[MIN, MAX]`, defaulting a missing or
 *  malformed value to `RAG_LOGS_LINES_DEFAULT`. */
export function boundedRagLogLines(lines: unknown): number {
  const parsed =
    typeof lines === "number"
      ? lines
      : typeof lines === "string" && lines.trim() !== ""
        ? Number(lines)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return RAG_LOGS_LINES_DEFAULT;
  return Math.max(RAG_LOGS_LINES_MIN, Math.min(RAG_LOGS_LINES_MAX, Math.floor(parsed)));
}

export const RAG_SEARCH_ACTIVITY_LIMIT_CAP = 100;
export const RAG_SEARCH_ACTIVITY_LIMIT_DEFAULT = 25;

export function boundedRagSearchActivityLimit(limit: unknown): number {
  const parsed =
    typeof limit === "number"
      ? limit
      : typeof limit === "string" && limit.trim() !== ""
        ? Number(limit)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return RAG_SEARCH_ACTIVITY_LIMIT_DEFAULT;
  return Math.max(1, Math.min(RAG_SEARCH_ACTIVITY_LIMIT_CAP, Math.floor(parsed)));
}

// --- cache keys ----------------------------------------------------------------

export const ragControlKeys = {
  all: [...engineKeys.all, "ops-rag"] as const,
  serviceState: (scope: unknown) =>
    [
      ...ragControlKeys.all,
      "service-state",
      normalizeRagControlKeyPart(scope),
    ] as const,
  jobs: (scope: unknown, jobId?: unknown) =>
    [
      ...ragControlKeys.all,
      "jobs",
      normalizeRagControlKeyPart(scope),
      normalizeRagControlKeyPart(jobId, "all"),
    ] as const,
  logs: (scope: unknown, lines: unknown, jobId?: unknown) =>
    [
      ...ragControlKeys.all,
      "logs",
      normalizeRagControlKeyPart(scope),
      String(boundedRagLogLines(lines)),
      normalizeRagControlKeyPart(jobId, "all"),
    ] as const,
  watcher: (scope: unknown) =>
    [...ragControlKeys.all, "watcher", normalizeRagControlKeyPart(scope)] as const,
  projects: (scope: unknown) =>
    [...ragControlKeys.all, "projects", normalizeRagControlKeyPart(scope)] as const,
  readiness: (scope: unknown) =>
    [...ragControlKeys.all, "readiness", normalizeRagControlKeyPart(scope)] as const,
  opsState: (scope: unknown) =>
    [...ragControlKeys.all, "ops-state", normalizeRagControlKeyPart(scope)] as const,
  searchActivity: (scope: unknown, limit: unknown) =>
    [
      ...ragControlKeys.all,
      "search-activity",
      normalizeRagControlKeyPart(scope),
      String(boundedRagSearchActivityLimit(limit)),
    ] as const,
  collectionHealth: (scope: unknown, collection: unknown) =>
    [
      ...ragControlKeys.all,
      "collection-health",
      normalizeRagControlKeyPart(scope),
      normalizeRagControlKeyPart(collection),
    ] as const,
};

// --- tiers-gated offline readers ------------------------------------------------

/** The semantic tier is unavailable in a brokered rag response. */
export function ragSemanticOffline(data: BrokeredResult<unknown> | undefined): boolean {
  return data !== undefined && readTierAvailability(data.tiers, ["semantic"]).degraded;
}

/** The semantic tier is unavailable, reading BOTH a successful envelope's tiers AND
 *  a fresh error envelope's tiers — never a bare transport fault (this module's own
 *  documented contract: "success OR a fresh error envelope", never guessed). A
 *  component holding a LIVE query result (not just its settled `.data`) must read
 *  through this, not `ragSemanticOffline(query.data)` alone: `query.data` goes
 *  `undefined` on a genuine fetch failure, so a query-error-only check for the tier
 *  is invisible to that call and the surface silently falls through to "empty"
 *  instead of degraded (`tiersFromQuery` is the shared precedence: a fresh error's
 *  tiers win over a stale held-success block). */
export function ragQuerySemanticOffline(query: {
  data?: BrokeredResult<unknown> | undefined;
  error?: unknown;
}): boolean {
  return readTierAvailability(tiersFromQuery(query), ["semantic"]).degraded;
}

/** Whether any brokered rag control read reports the semantic tier unavailable. */
export function ragControlSemanticOffline(
  ...reads: Array<BrokeredResult<unknown> | undefined>
): boolean {
  return reads.some(ragSemanticOffline);
}

/** Query GC window shared by the bounded rag-control reads. */
export const RAG_CONTROL_READ_GC_MS = 30_000;
