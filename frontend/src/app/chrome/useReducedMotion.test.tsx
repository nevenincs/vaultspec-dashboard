// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useReducedMotion } from "./useReducedMotion";
import { ENGINE_WAIT } from "../../testing/timing";

describe("useReducedMotion", () => {
  afterEach(() => {
    // Unmount explicitly: this suite runs without `globals: true`, so
    // @testing-library/react never registers its auto-cleanup. Without this a
    // hook mounted by one test stays subscribed through the next, leaving two
    // live MutationObserver subscriptions racing over the same attribute.
    cleanup();
    document.documentElement.removeAttribute("data-reduce-motion");
  });

  it("reads the setting-owned document reduced-motion floor on mount", () => {
    document.documentElement.dataset.reduceMotion = "true";

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(true);
  });

  it("reacts when settingsEffects updates the document reduced-motion floor", async () => {
    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);

    act(() => {
      document.documentElement.dataset.reduceMotion = "true";
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    }, ENGINE_WAIT);

    act(() => {
      document.documentElement.dataset.reduceMotion = "false";
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    }, ENGINE_WAIT);
  });
});
