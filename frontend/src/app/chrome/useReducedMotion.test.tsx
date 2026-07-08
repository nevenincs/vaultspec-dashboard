// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useReducedMotion } from "./useReducedMotion";
import { ENGINE_WAIT } from "../../testing/timing";

describe("useReducedMotion", () => {
  afterEach(() => {
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
