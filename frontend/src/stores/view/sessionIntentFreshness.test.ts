// @vitest-environment happy-dom

// Session-intent freshness seam (dashboard-state field lifetimes ADR): the
// view-local activity stamp + pure staleness/heal derivations that gate the
// stale-selection boot heal.
import { beforeEach, describe, expect, it } from "vitest";

import {
  SESSION_INTENT_TTL_MS,
  deriveSessionIntentBootHealIntent,
  isSessionIntentStale,
  readSessionIntentTouch,
  stampSessionIntentTouch,
} from "./sessionIntentFreshness";

const STORAGE_KEY = "vaultspec:session-intent-touch";

describe("session-intent activity stamps", () => {
  beforeEach(() => window.localStorage.removeItem(STORAGE_KEY));

  it("round-trips a stamp per normalized scope; unknown scopes read null", () => {
    expect(readSessionIntentTouch("scope-a")).toBeNull();
    stampSessionIntentTouch(" scope-a ", 1000);
    expect(readSessionIntentTouch("scope-a")).toBe(1000);
    expect(readSessionIntentTouch("scope-b")).toBeNull();
    // Non-string / blank scopes are rejected at the boundary.
    stampSessionIntentTouch({ scope: "scope-b" }, 2000);
    stampSessionIntentTouch("   ", 2000);
    expect(readSessionIntentTouch("scope-b")).toBeNull();
  });

  it("rejects non-finite stamps and survives a corrupt blob", () => {
    stampSessionIntentTouch("scope-a", Number.NaN);
    expect(readSessionIntentTouch("scope-a")).toBeNull();
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readSessionIntentTouch("scope-a")).toBeNull();
    stampSessionIntentTouch("scope-a", 5);
    expect(readSessionIntentTouch("scope-a")).toBe(5);
    // Foreign value shapes inside a valid blob are dropped, kept entries survive.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ "scope-a": 7, "scope-b": "yesterday", "scope-c": -1 }),
    );
    expect(readSessionIntentTouch("scope-a")).toBe(7);
    expect(readSessionIntentTouch("scope-b")).toBeNull();
    expect(readSessionIntentTouch("scope-c")).toBeNull();
  });

  it("bounds the map: oldest stamps evict beyond the cap", () => {
    for (let i = 0; i < 70; i++) stampSessionIntentTouch(`scope-${i}`, i + 1);
    // The newest survive; the oldest were evicted (cap 64).
    expect(readSessionIntentTouch("scope-69")).toBe(70);
    expect(readSessionIntentTouch("scope-0")).toBeNull();
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(Object.keys(stored).length).toBeLessThanOrEqual(64);
  });
});

describe("staleness + boot-heal derivations", () => {
  it("no stamp counts as stale; the window boundary is inclusive", () => {
    expect(isSessionIntentStale(null, 1000)).toBe(true);
    expect(isSessionIntentStale(1000, 1000 + SESSION_INTENT_TTL_MS - 1)).toBe(false);
    expect(isSessionIntentStale(1000, 1000 + SESSION_INTENT_TTL_MS)).toBe(true);
  });

  it("heals only a loaded, un-healed, stale scope that actually has a selection", () => {
    const base = {
      scope: "scope-a",
      stateLoaded: true,
      hasSelection: true,
      stale: true,
      alreadyHealed: false,
    };
    expect(deriveSessionIntentBootHealIntent(base)).toBe(true);
    expect(deriveSessionIntentBootHealIntent({ ...base, scope: null })).toBe(false);
    expect(deriveSessionIntentBootHealIntent({ ...base, stateLoaded: false })).toBe(
      false,
    );
    expect(deriveSessionIntentBootHealIntent({ ...base, hasSelection: false })).toBe(
      false,
    );
    expect(deriveSessionIntentBootHealIntent({ ...base, stale: false })).toBe(false);
    expect(deriveSessionIntentBootHealIntent({ ...base, alreadyHealed: true })).toBe(
      false,
    );
  });
});
