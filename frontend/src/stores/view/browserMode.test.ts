// Unit tests for the per-scope browser-mode store (dashboard-left-rail ADR
// "Browser" + "In-rail filter"): the chosen mode and the in-rail filter are
// view-local state that the wholesale scope/workspace reset clears, so neither
// bleeds across a swap. These tests exercise the store's own contract in
// isolation (the reset wiring into viewStore is proved by the adversarial
// cross-scope-bleed test).

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_BROWSER_MODE,
  resetBrowserMode,
  useBrowserModeStore,
} from "./browserMode";

describe("browserMode store (left-rail per-scope mode + filter)", () => {
  beforeEach(() => {
    useBrowserModeStore.getState().resetForScope();
  });
  afterEach(() => {
    useBrowserModeStore.getState().resetForScope();
  });

  it("defaults to the vault mode with an empty filter (the corpus the product is about)", () => {
    expect(DEFAULT_BROWSER_MODE).toBe("vault");
    expect(useBrowserModeStore.getState().mode).toBe("vault");
    expect(useBrowserModeStore.getState().filter).toBe("");
  });

  it("setMode switches the mode and CLEARS the filter (a filter is scoped to its mode)", () => {
    useBrowserModeStore.getState().setFilter("plan");
    expect(useBrowserModeStore.getState().filter).toBe("plan");
    useBrowserModeStore.getState().setMode("code");
    expect(useBrowserModeStore.getState().mode).toBe("code");
    // The vault filter is meaningless against the code listing — cleared.
    expect(useBrowserModeStore.getState().filter).toBe("");
  });

  it("setMode to the SAME mode is a no-op that preserves the filter", () => {
    useBrowserModeStore.getState().setMode("code");
    useBrowserModeStore.getState().setFilter("mod.rs");
    useBrowserModeStore.getState().setMode("code");
    expect(useBrowserModeStore.getState().mode).toBe("code");
    expect(useBrowserModeStore.getState().filter).toBe("mod.rs");
  });

  it("resetForScope returns to the default mode and clears the filter", () => {
    useBrowserModeStore.getState().setMode("code");
    useBrowserModeStore.getState().setFilter("editor");
    useBrowserModeStore.getState().resetForScope();
    expect(useBrowserModeStore.getState().mode).toBe(DEFAULT_BROWSER_MODE);
    expect(useBrowserModeStore.getState().filter).toBe("");
  });

  it("resetBrowserMode() (the imperative seam the view store calls) resets both", () => {
    useBrowserModeStore.getState().setMode("code");
    useBrowserModeStore.getState().setFilter("editor");
    resetBrowserMode();
    expect(useBrowserModeStore.getState().mode).toBe("vault");
    expect(useBrowserModeStore.getState().filter).toBe("");
  });
});
