// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { liveTransport } from "../../../testing/liveClient";
import { engineClient } from "../engine";
import { deriveTimelineBootHealIntent } from "./index";

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

describe("deriveTimelineBootHealIntent (TTR-005 cold-start heal to live)", () => {
  const base = {
    scope: "wt:main",
    stateLoaded: true,
    isLive: false,
    alreadyHealed: false,
  };

  it("heals a loaded, non-live, not-yet-healed scope", () => {
    // A returning scope whose persisted timeline_mode is time-travel must boot
    // live — with entry retired there is otherwise no exit.
    expect(deriveTimelineBootHealIntent(base)).toBe(true);
  });

  it("does not heal until the scope's dashboard state has loaded", () => {
    expect(deriveTimelineBootHealIntent({ ...base, stateLoaded: false })).toBe(false);
  });

  it("does not heal a scope already live (no needless write)", () => {
    expect(deriveTimelineBootHealIntent({ ...base, isLive: true })).toBe(false);
  });

  it("heals each scope at most once (idempotent with activateWorktreeScope)", () => {
    expect(deriveTimelineBootHealIntent({ ...base, alreadyHealed: true })).toBe(false);
  });

  it("does not heal when there is no active scope", () => {
    expect(deriveTimelineBootHealIntent({ ...base, scope: null })).toBe(false);
  });
});
