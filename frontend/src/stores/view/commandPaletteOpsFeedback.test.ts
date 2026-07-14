// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  beginCommandPaletteOpsFeedback,
  canResetCommandPaletteFeedbackBoundary,
  commandPaletteOpsFeedback,
  openCommandPalette,
  resetCommandPalette,
  resetCommandPaletteOpsFeedback,
  setCommandPaletteOpsFeedbackForEpoch,
  useCommandPaletteOpsFeedbackBoundary,
  useCommandPaletteStore,
} from "./commandPalette";

const running = commandPaletteOpsFeedback({
  concept: "check-workspace",
  condition: "running",
});
const succeeded = commandPaletteOpsFeedback({
  concept: "check-workspace",
  condition: "succeeded",
});

describe("command palette ops feedback seam", () => {
  beforeEach(() => resetCommandPalette());

  it("distinguishes explicit null feedback context from malformed runtime scope", () => {
    expect(canResetCommandPaletteFeedbackBoundary(null)).toBe(true);
    expect(canResetCommandPaletteFeedbackBoundary(" scope-a ")).toBe(true);
    expect(canResetCommandPaletteFeedbackBoundary({ scope: "scope-a" })).toBe(false);
    expect(canResetCommandPaletteFeedbackBoundary("   ")).toBe(false);
  });

  it("accepts only typed feedback for the current open palette epoch", () => {
    openCommandPalette();
    const epoch = beginCommandPaletteOpsFeedback(running);
    setCommandPaletteOpsFeedbackForEpoch(epoch, succeeded);

    expect(useCommandPaletteStore.getState().opsFeedback).toBe(succeeded);

    resetCommandPaletteOpsFeedback();
    setCommandPaletteOpsFeedbackForEpoch(epoch, running);

    expect(useCommandPaletteStore.getState().opsFeedback).toBeNull();
  });

  it("preserves current feedback when a matching epoch carries arbitrary text", () => {
    openCommandPalette();
    const epoch = beginCommandPaletteOpsFeedback(running);

    setCommandPaletteOpsFeedbackForEpoch(epoch, "vault-check: completed");

    expect(useCommandPaletteStore.getState().opsFeedback).toBe(running);
  });

  it("drops late feedback after the palette closes", () => {
    openCommandPalette();
    const epoch = beginCommandPaletteOpsFeedback(running);
    resetCommandPalette();
    setCommandPaletteOpsFeedbackForEpoch(epoch, succeeded);

    expect(useCommandPaletteStore.getState().opsFeedback).toBeNull();
  });

  it("drops late feedback after the scope or operation mode changes", () => {
    const { rerender } = renderHook(
      ({ scope, timeTravel }: { scope: string; timeTravel: boolean }) =>
        useCommandPaletteOpsFeedbackBoundary(scope, timeTravel),
      { initialProps: { scope: "scope-a", timeTravel: false } },
    );
    openCommandPalette();
    const epoch = beginCommandPaletteOpsFeedback(running);
    expect(useCommandPaletteStore.getState().opsFeedback).toBe(running);

    act(() => rerender({ scope: "scope-b", timeTravel: false }));
    setCommandPaletteOpsFeedbackForEpoch(epoch, succeeded);
    expect(useCommandPaletteStore.getState().opsFeedback).toBeNull();

    const nextEpoch = beginCommandPaletteOpsFeedback(running);
    act(() => rerender({ scope: "scope-b", timeTravel: true }));
    setCommandPaletteOpsFeedbackForEpoch(nextEpoch, succeeded);
    expect(useCommandPaletteStore.getState().opsFeedback).toBeNull();
  });

  it("keeps malformed runtime scope inert at the feedback boundary", () => {
    openCommandPalette();
    const epoch = beginCommandPaletteOpsFeedback(running);

    renderHook(() => useCommandPaletteOpsFeedbackBoundary({ scope: "scope-a" }, false));

    expect(useCommandPaletteStore.getState().opsFeedback).toBe(running);
    setCommandPaletteOpsFeedbackForEpoch(epoch, succeeded);
    expect(useCommandPaletteStore.getState().opsFeedback).toBe(succeeded);
  });

  it("keeps explicit null scope as a resettable no-scope feedback context", () => {
    openCommandPalette();
    const epoch = beginCommandPaletteOpsFeedback(running);

    renderHook(() => useCommandPaletteOpsFeedbackBoundary(null, false));

    expect(useCommandPaletteStore.getState().opsFeedback).toBeNull();
    setCommandPaletteOpsFeedbackForEpoch(epoch, succeeded);
    expect(useCommandPaletteStore.getState().opsFeedback).toBeNull();
  });
});
