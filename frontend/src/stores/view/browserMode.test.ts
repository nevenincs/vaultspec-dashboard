// @vitest-environment happy-dom
//
// Unit tests for the per-scope browser-mode store (dashboard-left-rail ADR
// "Browser"): the chosen mode is view-local state that the wholesale
// scope/workspace reset clears, so it does not bleed across a swap. Text filters
// are canonical dashboard-state and are not owned here.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import {
  BROWSER_MODE_OPTIONS,
  DEFAULT_BROWSER_MODE,
  cycleBrowserMode,
  isBrowserMode,
  nextBrowserMode,
  normalizeBrowserMode,
  resetBrowserMode,
  setBrowserMode,
  useBrowserModeIntent,
  useBrowserModeStore,
} from "./browserMode";

describe("browserMode store (left-rail per-scope mode)", () => {
  beforeEach(() => {
    useBrowserModeStore.getState().resetForScope();
  });
  afterEach(() => {
    useBrowserModeStore.getState().resetForScope();
  });

  it("defaults to the vault mode (the corpus the product is about)", () => {
    expect(DEFAULT_BROWSER_MODE).toBe("vault");
    expect(useBrowserModeStore.getState().mode).toBe("vault");
  });

  it("declares the browser-mode option domain once for left-rail consumers", () => {
    expect(BROWSER_MODE_OPTIONS).toEqual([
      { id: "vault", label: "Vault" },
      { id: "code", label: "Code" },
    ]);
    expect(BROWSER_MODE_OPTIONS.map((option) => option.id)).toContain(
      DEFAULT_BROWSER_MODE,
    );
  });

  it("validates browser-mode intent at the store seam", () => {
    expect(isBrowserMode("vault")).toBe(true);
    expect(isBrowserMode("code")).toBe(true);
    expect(isBrowserMode(" code ")).toBe(true);
    expect(isBrowserMode("tree")).toBe(false);
    expect(normalizeBrowserMode(" code ")).toBe("code");
    expect(normalizeBrowserMode("   ")).toBeNull();
  });

  it("setMode switches the mode", () => {
    useBrowserModeStore.getState().setMode("code");
    expect(useBrowserModeStore.getState().mode).toBe("code");
  });

  it("setMode rejects malformed runtime values at the store seam", () => {
    useBrowserModeStore.getState().setMode("code");
    useBrowserModeStore.getState().setMode("tree");
    useBrowserModeStore.getState().setMode(null);

    expect(useBrowserModeStore.getState().mode).toBe("code");
  });

  it("setMode commits normalized browser-mode values only", () => {
    useBrowserModeStore.getState().setMode(" code ");

    expect(useBrowserModeStore.getState().mode).toBe("code");
  });

  it("setMode to the SAME mode is a no-op", () => {
    useBrowserModeStore.getState().setMode("code");
    useBrowserModeStore.getState().setMode("code");
    expect(useBrowserModeStore.getState().mode).toBe("code");
  });

  it("projects and applies browser-mode cycling behind the store seam", () => {
    expect(nextBrowserMode("vault")).toBe("code");
    expect(nextBrowserMode("code")).toBe("vault");

    cycleBrowserMode();
    expect(useBrowserModeStore.getState().mode).toBe("code");
    cycleBrowserMode();
    expect(useBrowserModeStore.getState().mode).toBe("vault");
  });

  it("resetForScope returns to the default mode", () => {
    useBrowserModeStore.getState().setMode("code");
    useBrowserModeStore.getState().resetForScope();
    expect(useBrowserModeStore.getState().mode).toBe(DEFAULT_BROWSER_MODE);
  });

  it("resetBrowserMode() (the imperative seam the view store calls) resets mode", () => {
    useBrowserModeStore.getState().setMode("code");
    resetBrowserMode();
    expect(useBrowserModeStore.getState().mode).toBe("vault");
  });

  it("exposes named browser-mode helpers for app-layer consumers", () => {
    setBrowserMode("code");
    expect(useBrowserModeStore.getState().mode).toBe("code");

    setBrowserMode("vault");
    expect(useBrowserModeStore.getState().mode).toBe("vault");
  });

  it("ignores unknown browser-mode intent instead of letting app chrome assert it", () => {
    setBrowserMode("code");
    setBrowserMode("tree");
    expect(useBrowserModeStore.getState().mode).toBe("code");
  });

  it("exposes a hook intent for React chrome", () => {
    const { result } = renderHook(() => useBrowserModeIntent());

    act(() => result.current("code"));

    expect(useBrowserModeStore.getState().mode).toBe("code");
  });

  it("ignores unknown hook intent values from generic controls", () => {
    const { result } = renderHook(() => useBrowserModeIntent());

    act(() => result.current("code"));
    act(() => result.current("tree"));

    expect(useBrowserModeStore.getState().mode).toBe("code");
  });
});
