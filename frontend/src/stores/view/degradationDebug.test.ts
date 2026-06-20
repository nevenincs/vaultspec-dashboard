import { beforeEach, describe, expect, it } from "vitest";

import {
  clearDegradationOverrides,
  closeDegradationDebug,
  normalizeDegradationDebugOpen,
  normalizeDegradationOverrideKey,
  normalizeDegradationOverrideValue,
  openDegradationDebug,
  setDegradationOverride,
  useDegradationStore,
} from "./degradationDebug";

describe("degradation debug store", () => {
  beforeEach(() => {
    clearDegradationOverrides();
    closeDegradationDebug();
  });

  it("owns the dev switch panel chrome behind named helpers", () => {
    expect(useDegradationStore.getState().open).toBe(false);

    openDegradationDebug();
    expect(useDegradationStore.getState().open).toBe(true);

    closeDegradationDebug();
    expect(useDegradationStore.getState().open).toBe(false);
  });

  it("normalizes malformed panel open writes at the store seam", () => {
    expect(normalizeDegradationDebugOpen(true)).toBe(true);
    expect(normalizeDegradationDebugOpen(false)).toBe(false);
    expect(normalizeDegradationDebugOpen("true")).toBeNull();

    useDegradationStore.getState().setOpen(true);
    useDegradationStore.getState().setOpen("false");

    expect(useDegradationStore.getState().open).toBe(true);
  });

  it("keeps override values independent from panel chrome", () => {
    openDegradationDebug();
    setDegradationOverride("streamLost", true);

    expect(useDegradationStore.getState()).toMatchObject({
      open: true,
      overrides: { streamLost: true },
    });

    clearDegradationOverrides();
    expect(useDegradationStore.getState()).toMatchObject({
      open: true,
      overrides: null,
    });
  });

  it("normalizes degradation override keys and values at the store seam", () => {
    expect(normalizeDegradationOverrideKey("streamLost")).toBe("streamLost");
    expect(normalizeDegradationOverrideKey("unknown")).toBeNull();
    expect(normalizeDegradationOverrideValue("streamLost", true)).toBe(true);
    expect(normalizeDegradationOverrideValue("streamLost", 1)).toBeUndefined();
    expect(normalizeDegradationOverrideValue("brokenLinkCount", 2.8)).toBe(2);
    expect(normalizeDegradationOverrideValue("brokenLinkCount", -4)).toBe(0);
    expect(
      normalizeDegradationOverrideValue("brokenLinkCount", Number.NaN),
    ).toBeUndefined();

    setDegradationOverride("streamLost", true);
    setDegradationOverride("unknown", true);
    setDegradationOverride("noVault", 1);
    setDegradationOverride("brokenLinkCount", 3.7);

    expect(useDegradationStore.getState().overrides).toEqual({
      streamLost: true,
      brokenLinkCount: 3,
    });

    setDegradationOverride("streamLost", null);
    expect(useDegradationStore.getState().overrides).toEqual({
      brokenLinkCount: 3,
    });
  });
});
