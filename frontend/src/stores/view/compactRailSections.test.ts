// @vitest-environment happy-dom
//
// Unit test for the compact unified rail's two-section fold store (mobile-unified-rail
// ADR): the `home` pane splits into an independently foldable STATUS section and BROWSE
// tree section, both defaulting to OPEN. Each toggle flips only its own flag; the other
// is untouched. `renderHook` subscriptions read the reactive booleans after each
// imperative toggle so the assertions observe real store behaviour.

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  resetCompactRailSections,
  toggleCompactRailBrowse,
  toggleCompactRailStatus,
  useCompactRailBrowseOpen,
  useCompactRailStatusOpen,
} from "./compactRailSections";

afterEach(() => resetCompactRailSections());

describe("compact rail sections store", () => {
  it("defaults both sections to open", () => {
    const status = renderHook(() => useCompactRailStatusOpen());
    const browse = renderHook(() => useCompactRailBrowseOpen());
    expect(status.result.current).toBe(true);
    expect(browse.result.current).toBe(true);
  });

  it("toggling status flips only the status flag, and back again", () => {
    const status = renderHook(() => useCompactRailStatusOpen());
    const browse = renderHook(() => useCompactRailBrowseOpen());

    act(() => toggleCompactRailStatus());
    expect(status.result.current).toBe(false);
    expect(browse.result.current).toBe(true);

    act(() => toggleCompactRailStatus());
    expect(status.result.current).toBe(true);
    expect(browse.result.current).toBe(true);
  });

  it("toggling browse flips only the browse flag", () => {
    const status = renderHook(() => useCompactRailStatusOpen());
    const browse = renderHook(() => useCompactRailBrowseOpen());

    act(() => toggleCompactRailBrowse());
    expect(browse.result.current).toBe(false);
    expect(status.result.current).toBe(true);
  });

  it("resetCompactRailSections restores both to open", () => {
    const status = renderHook(() => useCompactRailStatusOpen());
    const browse = renderHook(() => useCompactRailBrowseOpen());

    act(() => toggleCompactRailStatus());
    act(() => toggleCompactRailBrowse());
    expect(status.result.current).toBe(false);
    expect(browse.result.current).toBe(false);

    act(() => resetCompactRailSections());
    expect(status.result.current).toBe(true);
    expect(browse.result.current).toBe(true);
  });
});
