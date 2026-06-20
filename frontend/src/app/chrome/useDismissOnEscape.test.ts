// @vitest-environment happy-dom
//
// The shared Escape-to-dismiss listener hook (codebase-centralisation F-S2).
// Exercises the listener-wiring contract this hook owns and nothing more: Escape
// fires the callback, the `enabled` gate suppresses the listener, the optional
// `target`/`preventDefault` are honoured, and the listener is removed on unmount.
// Uses core vitest matchers only (no jest-dom in this project).

import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  normalizeDismissOnEscapeEnabled,
  normalizeDismissOnEscapePreventDefault,
  useDismissOnEscape,
} from "./useDismissOnEscape";

// Each renderHook mounts a real listener on the shared window/document; unmount
// between tests so a prior test's listener cannot fire on the next test's event.
afterEach(cleanup);

describe("useDismissOnEscape", () => {
  it("normalizes the listener gate from runtime values", () => {
    expect(normalizeDismissOnEscapeEnabled(undefined)).toBe(true);
    expect(normalizeDismissOnEscapeEnabled(true)).toBe(true);
    expect(normalizeDismissOnEscapeEnabled(false)).toBe(false);
    expect(normalizeDismissOnEscapeEnabled("true")).toBe(false);
    expect(normalizeDismissOnEscapeEnabled(1)).toBe(false);
  });

  it("normalizes preventDefault from runtime values", () => {
    expect(normalizeDismissOnEscapePreventDefault(true)).toBe(true);
    expect(normalizeDismissOnEscapePreventDefault(false)).toBe(false);
    expect(normalizeDismissOnEscapePreventDefault("true")).toBe(false);
    expect(normalizeDismissOnEscapePreventDefault(1)).toBe(false);
    expect(normalizeDismissOnEscapePreventDefault(undefined)).toBe(false);
  });

  it("calls onDismiss when Escape is pressed", () => {
    const onDismiss = vi.fn();
    renderHook(() => useDismissOnEscape(onDismiss));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("ignores non-Escape keys", () => {
    const onDismiss = vi.fn();
    renderHook(() => useDismissOnEscape(onDismiss));
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "a" });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("attaches no listener when disabled", () => {
    const onDismiss = vi.fn();
    renderHook(() => useDismissOnEscape(onDismiss, { enabled: false }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("attaches no listener for malformed truthy enabled values", () => {
    let dismissCount = 0;
    renderHook(() =>
      useDismissOnEscape(
        () => {
          dismissCount += 1;
        },
        { enabled: "true" },
      ),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dismissCount).toBe(0);
  });

  it("re-attaches when enabled flips from false to true", () => {
    const onDismiss = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useDismissOnEscape(onDismiss, { enabled }),
      { initialProps: { enabled: false } },
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();

    rerender({ enabled: true });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("listens on a supplied target (document) instead of window", () => {
    const onDismiss = vi.fn();
    renderHook(() => useDismissOnEscape(onDismiss, { target: document }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("calls preventDefault on the Escape event when asked", () => {
    const onDismiss = vi.fn();
    renderHook(() => useDismissOnEscape(onDismiss, { preventDefault: true }));
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not preventDefault for malformed truthy preventDefault values", () => {
    let dismissCount = 0;
    renderHook(() =>
      useDismissOnEscape(
        () => {
          dismissCount += 1;
        },
        { preventDefault: "true" },
      ),
    );
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(dismissCount).toBe(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not preventDefault by default", () => {
    const onDismiss = vi.fn();
    renderHook(() => useDismissOnEscape(onDismiss));
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it("removes the listener on unmount", () => {
    const onDismiss = vi.fn();
    const { unmount } = renderHook(() => useDismissOnEscape(onDismiss));
    unmount();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
