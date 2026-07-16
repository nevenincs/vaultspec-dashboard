// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PRESET_NAME,
  FORCE_PARAMS_STORAGE_KEY,
  FORCE_PARAMS_URL_MAX_CHARS,
  FORCE_PRESETS_MAX_ITEMS,
  FORCE_PRESETS_STORAGE_KEY,
  deletePreset,
  decodeParamsFromUrl,
  encodeParamsToUrl,
  normalizeForcePresets,
  normalizePresetName,
  presetNames,
  readPresets,
  readStoredParams,
  savePreset,
  sanitizeParams,
  writeStoredParams,
} from "./forcePresets";
import { FORCE_CONTROL_DEFAULTS } from "../scene/three/forceControls";

afterEach(() => {
  localStorage.clear();
});

describe("three-lab force preset persistence", () => {
  it("sanitizes params through the force-control schema", () => {
    const sanitized = sanitizeParams({
      linkDistance: 10_000,
      charge: -10_000,
      collideIterations: Number.NaN,
      unknown: 123,
    });

    expect(sanitized.linkDistance).toBe(200);
    expect(sanitized.charge).toBe(-600);
    expect(sanitized.collideIterations).toBe(FORCE_CONTROL_DEFAULTS.collideIterations);
    expect("unknown" in sanitized).toBe(false);
  });

  it("normalizes names and caps stored preset maps", () => {
    expect(normalizePresetName(" Custom ")).toBe("Custom");
    expect(normalizePresetName(DEFAULT_PRESET_NAME)).toBeNull();
    expect(normalizePresetName("x".repeat(65))).toBeNull();

    const raw = Object.fromEntries(
      Array.from({ length: FORCE_PRESETS_MAX_ITEMS + 3 }, (_, index) => [
        `preset-${index}`,
        { linkDistance: 5 + index },
      ]),
    );
    const normalized = normalizeForcePresets({
      [DEFAULT_PRESET_NAME]: { linkDistance: 99 },
      "   ": { linkDistance: 88 },
      ...raw,
    });

    expect(Object.keys(normalized)).toHaveLength(FORCE_PRESETS_MAX_ITEMS);
    expect(normalized["preset-0"].linkDistance).toBe(5);
    expect(normalized[`preset-${FORCE_PRESETS_MAX_ITEMS}`]).toBeUndefined();
  });

  it("keeps saved presets bounded and drops the oldest entry when full", () => {
    let presets = {};
    for (let index = 0; index < FORCE_PRESETS_MAX_ITEMS; index += 1) {
      presets = savePreset(presets, `preset-${index}`, {
        ...FORCE_CONTROL_DEFAULTS,
        linkDistance: 5 + index,
      });
    }

    presets = savePreset(presets, "newest", {
      ...FORCE_CONTROL_DEFAULTS,
      linkDistance: 42,
    });

    expect(Object.keys(presets)).toHaveLength(FORCE_PRESETS_MAX_ITEMS);
    expect(presets).not.toHaveProperty("preset-0");
    expect(presets).toHaveProperty("newest");
    expect(readPresets()).toEqual(presets);

    const deleted = deletePreset(presets, " newest ");
    expect(deleted).not.toHaveProperty("newest");
    expect(readPresets()).toEqual(deleted);
  });

  it("bounds localStorage reads and writes for params and presets", () => {
    localStorage.setItem(FORCE_PARAMS_STORAGE_KEY, "x".repeat(9000));
    expect(readStoredParams()).toBeNull();

    writeStoredParams({
      ...FORCE_CONTROL_DEFAULTS,
      linkDistance: 10_000,
    });
    expect(readStoredParams()?.linkDistance).toBe(200);

    localStorage.setItem(FORCE_PRESETS_STORAGE_KEY, "x".repeat(65 * 1024));
    expect(readPresets()).toEqual({});
  });

  it("bounds shareable URL payloads", () => {
    const encoded = encodeParamsToUrl({
      ...FORCE_CONTROL_DEFAULTS,
      linkDistance: 42,
    });

    expect(encoded).not.toBeNull();
    expect(decodeParamsFromUrl(encoded)?.linkDistance).toBe(42);
    expect(decodeParamsFromUrl("x".repeat(FORCE_PARAMS_URL_MAX_CHARS + 1))).toBeNull();
  });

  it("keeps preset names exact and sorts them for the active locale", () => {
    const presets = {
      Zebra: { ...FORCE_CONTROL_DEFAULTS },
      Ångström: { ...FORCE_CONTROL_DEFAULTS },
      Alpha: { ...FORCE_CONTROL_DEFAULTS },
    };

    expect(presetNames(presets, "sv")).toEqual([
      DEFAULT_PRESET_NAME,
      "Alpha",
      "Zebra",
      "Ångström",
    ]);
    expect(Object.keys(presets)).toEqual(["Zebra", "Ångström", "Alpha"]);
  });
});
