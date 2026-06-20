// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  beginCommandPaletteOpsFeedback,
  canResetCommandPaletteFeedbackBoundary,
  openCommandPalette,
  resetCommandPalette,
  resetCommandPaletteOpsFeedback,
  setCommandPaletteOpsFeedbackForEpoch,
  useCommandPaletteOpsFeedbackBoundary,
  useCommandPaletteStore,
} from "./commandPalette";

describe("command palette ops feedback seam", () => {
  beforeEach(() => resetCommandPalette());

  it("distinguishes explicit null feedback context from malformed runtime scope", () => {
    expect(canResetCommandPaletteFeedbackBoundary(null)).toBe(true);
    expect(canResetCommandPaletteFeedbackBoundary(" scope-a ")).toBe(true);
    expect(canResetCommandPaletteFeedbackBoundary({ scope: "scope-a" })).toBe(false);
    expect(canResetCommandPaletteFeedbackBoundary("   ")).toBe(false);
  });

  it("accepts only feedback for the current open palette epoch", () => {
    openCommandPalette();
    const epoch = beginCommandPaletteOpsFeedback("vault-check: running...");
    setCommandPaletteOpsFeedbackForEpoch(epoch, "vault-check: completed");

    expect(useCommandPaletteStore.getState().opsMessage).toBe("vault-check: completed");

    resetCommandPaletteOpsFeedback();
    setCommandPaletteOpsFeedbackForEpoch(epoch, "vault-check: stale");

    expect(useCommandPaletteStore.getState().opsMessage).toBeNull();
  });

  it("preserves current feedback when a matching epoch carries malformed text", () => {
    openCommandPalette();
    const epoch = beginCommandPaletteOpsFeedback("vault-check: running...");

    setCommandPaletteOpsFeedbackForEpoch(epoch, "   ");

    expect(useCommandPaletteStore.getState().opsMessage).toBe(
      "vault-check: running...",
    );
  });

  it("drops late feedback after the palette closes", () => {
    openCommandPalette();
    const epoch = beginCommandPaletteOpsFeedback("reindex: running...");
    resetCommandPalette();
    setCommandPaletteOpsFeedbackForEpoch(epoch, "reindex: completed");

    expect(useCommandPaletteStore.getState().opsMessage).toBeNull();
  });

  it("drops late feedback after the scope or operation mode changes", () => {
    const { rerender } = renderHook(
      ({ scope, timeTravel }: { scope: string; timeTravel: boolean }) =>
        useCommandPaletteOpsFeedbackBoundary(scope, timeTravel),
      { initialProps: { scope: "scope-a", timeTravel: false } },
    );
    openCommandPalette();
    const epoch = beginCommandPaletteOpsFeedback("vault-stats: running...");
    expect(useCommandPaletteStore.getState().opsMessage).toBe(
      "vault-stats: running...",
    );

    act(() => rerender({ scope: "scope-b", timeTravel: false }));
    setCommandPaletteOpsFeedbackForEpoch(epoch, "vault-stats: stale completed");
    expect(useCommandPaletteStore.getState().opsMessage).toBeNull();

    const nextEpoch = beginCommandPaletteOpsFeedback("vault-check: running...");
    act(() => rerender({ scope: "scope-b", timeTravel: true }));
    setCommandPaletteOpsFeedbackForEpoch(nextEpoch, "vault-check: stale completed");
    expect(useCommandPaletteStore.getState().opsMessage).toBeNull();
  });

  it("keeps malformed runtime scope inert at the feedback boundary", () => {
    openCommandPalette();
    const epoch = beginCommandPaletteOpsFeedback("vault-check: running...");

    renderHook(() =>
      useCommandPaletteOpsFeedbackBoundary({ scope: "scope-a" }, false),
    );

    expect(useCommandPaletteStore.getState().opsMessage).toBe(
      "vault-check: running...",
    );
    setCommandPaletteOpsFeedbackForEpoch(epoch, "vault-check: completed");
    expect(useCommandPaletteStore.getState().opsMessage).toBe(
      "vault-check: completed",
    );
  });

  it("keeps explicit null scope as a resettable no-scope feedback context", () => {
    openCommandPalette();
    const epoch = beginCommandPaletteOpsFeedback("vault-check: running...");

    renderHook(() => useCommandPaletteOpsFeedbackBoundary(null, false));

    expect(useCommandPaletteStore.getState().opsMessage).toBeNull();
    setCommandPaletteOpsFeedbackForEpoch(epoch, "vault-check: stale completed");
    expect(useCommandPaletteStore.getState().opsMessage).toBeNull();
  });
});
