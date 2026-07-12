// @vitest-environment happy-dom
//
// Unit test for the compact surface store (mobile-unified-rail ADR): the bottom tab
// bar's single active pane. It rests only on a real pane (`home` | `timeline`) —
// `search` is a momentary pseudo-surface and is not a settable pane — and defaults to
// `home`. A `renderHook` subscription reads the reactive value after each imperative
// mutation so the assertions observe real store behaviour, not the setter's return.

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  resetCompactSurface,
  setCompactSurface,
  useCompactSurface,
} from "./compactSurface";

afterEach(() => resetCompactSurface());

describe("compact surface store", () => {
  it("defaults to the unified home pane", () => {
    const { result } = renderHook(() => useCompactSurface());
    expect(result.current).toBe("home");
  });

  it("moves to the timeline pane on setCompactSurface('timeline')", () => {
    const { result } = renderHook(() => useCompactSurface());
    act(() => setCompactSurface("timeline"));
    expect(result.current).toBe("timeline");
  });

  it("returns to home on resetCompactSurface()", () => {
    const { result } = renderHook(() => useCompactSurface());
    act(() => setCompactSurface("timeline"));
    expect(result.current).toBe("timeline");
    act(() => resetCompactSurface());
    expect(result.current).toBe("home");
  });
});
