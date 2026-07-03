// Session-intent freshness (dashboard-state field lifetimes ADR, global-state-review
// 2026-07-03): a view-local, per-scope ACTIVITY STAMP that gates the stale-session-
// intent boot heal. Dashboard-state fields classify into durable preferences (persist
// forever) and SESSION INTENT (the canonical selection): a boot within the freshness
// window resumes the selection, a boot after a genuine absence clears it through the
// ordinary selection seam. The stamp is client knowledge by design (the engine cannot
// observe "a client was active here"), never read by any display surface, and bounded
// (one storage key, per-scope map, oldest-evicted cap) with guarded storage access —
// the established view-local persistence discipline.

import { normalizeViewStoreSessionString } from "./scopeIdentity";

const STORAGE_KEY = "vaultspec:session-intent-touch";
/** Scopes retained in the stamp map — oldest-stamp evicted beyond this. */
const SESSION_INTENT_SCOPE_CAP = 64;
/** The session freshness window: a mid-day reload resumes the working selection; a
 *  boot after a genuine absence (next morning) starts clean. A behavioural constant
 *  per the ADR — deliberately NOT a registry setting (nothing would sensibly tune it). */
export const SESSION_INTENT_TTL_MS = 8 * 60 * 60 * 1000;

type SessionIntentTouchMap = Record<string, number>;

function guardedStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Parse the stored map, dropping any corrupt/foreign entries (corrupt-blob-safe). */
function readTouchMap(): SessionIntentTouchMap {
  const storage = guardedStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: SessionIntentTouchMap = {};
    for (const [scope, ts] of Object.entries(parsed)) {
      if (typeof ts === "number" && Number.isFinite(ts) && ts > 0) out[scope] = ts;
    }
    return out;
  } catch {
    return {};
  }
}

function writeTouchMap(map: SessionIntentTouchMap): void {
  const storage = guardedStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Best-effort by design (quota, privacy mode): a missing stamp only means the
    // next boot heals — the safe default.
  }
}

/** The scope's last recorded activity stamp (ms epoch), or null when unknown. */
export function readSessionIntentTouch(scope: unknown): number | null {
  const normalized = normalizeViewStoreSessionString(scope);
  if (normalized === null) return null;
  return readTouchMap()[normalized] ?? null;
}

/** Record activity on the scope at `now`, evicting oldest stamps beyond the cap. */
export function stampSessionIntentTouch(scope: unknown, now: number): void {
  const normalized = normalizeViewStoreSessionString(scope);
  if (normalized === null || !Number.isFinite(now) || now <= 0) return;
  const map = readTouchMap();
  map[normalized] = now;
  const entries = Object.entries(map);
  if (entries.length > SESSION_INTENT_SCOPE_CAP) {
    entries.sort((a, b) => b[1] - a[1]);
    writeTouchMap(Object.fromEntries(entries.slice(0, SESSION_INTENT_SCOPE_CAP)));
    return;
  }
  writeTouchMap(map);
}

/** Pure staleness derivation: unknown (no stamp) counts as stale — a clean start. */
export function isSessionIntentStale(
  lastTouch: number | null,
  now: number,
  ttlMs: number = SESSION_INTENT_TTL_MS,
): boolean {
  if (lastTouch === null) return true;
  return now - lastTouch >= ttlMs;
}

export interface SessionIntentBootHealInput {
  scope: string | null;
  stateLoaded: boolean;
  hasSelection: boolean;
  stale: boolean;
  alreadyHealed: boolean;
}

/** Whether the boot heal should CLEAR the scope's canonical selection: the scope is
 *  known, its dashboard state has loaded, it has not been healed this app lifetime,
 *  the activity stamp is stale (or absent), and there is a selection to clear.
 *  Mirrors `deriveTimelineBootHealIntent`'s shape (the codified TTR-005 precedent). */
export function deriveSessionIntentBootHealIntent({
  scope,
  stateLoaded,
  hasSelection,
  stale,
  alreadyHealed,
}: SessionIntentBootHealInput): boolean {
  if (scope === null) return false;
  if (!stateLoaded) return false;
  if (alreadyHealed) return false;
  if (!stale) return false;
  return hasSelection;
}
