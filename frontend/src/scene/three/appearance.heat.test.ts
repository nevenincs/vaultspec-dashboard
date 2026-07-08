// Guard suite for the recency heat ramp (code-graph-heat ADR): the ranked node
// colour is a gradient BETWEEN two theme roles — the receded muted ink (cold) and
// the accent (hot) — via the tested sRGB mixer; nodes without a served rank paint
// the cold end, and category mode is untouched. Runs on the node-env token
// fallbacks (the same deterministic path the other appearance suites use).

import { describe, expect, it } from "vitest";

import {
  accentColor,
  canvasBackground,
  categoryPaletteHue,
  inkMutedColor,
  mixHexToward,
  nodeColorNumber,
  recencyHeatColor,
  APPEARANCE_DEFAULTS,
  type AppearanceParams,
} from "./appearance";
import type { SceneNodeData } from "../sceneController";

const recencyParams: AppearanceParams = {
  ...APPEARANCE_DEFAULTS,
  nodeColorMode: "recency",
};

const node = (over: Partial<SceneNodeData>): SceneNodeData =>
  ({ id: "code:a.ts", kind: "code-artifact", ...over }) as SceneNodeData;

const cold = mixHexToward(inkMutedColor(), canvasBackground(), 0.35);

describe("recency heat ramp", () => {
  it("maps rank 1 to the accent and rank 0 to the receded cold neutral", () => {
    expect(recencyHeatColor(1)).toBe(accentColor());
    expect(recencyHeatColor(0)).toBe(cold);
  });

  it("paints the cold end for a node with no served rank (honest absence)", () => {
    expect(recencyHeatColor(undefined)).toBe(cold);
    expect(recencyHeatColor(Number.NaN)).toBe(cold);
  });

  it("interpolates strictly between the two theme stops mid-ramp", () => {
    const mid = recencyHeatColor(0.5);
    expect(mid).not.toBe(cold);
    expect(mid).not.toBe(accentColor());
    // Each channel sits between the corresponding stop channels (a true mix,
    // never an out-of-gamut invention).
    for (const shift of [16, 8, 0]) {
      const c = (cold >> shift) & 0xff;
      const a = (accentColor() >> shift) & 0xff;
      const m = (mid >> shift) & 0xff;
      expect(m).toBeGreaterThanOrEqual(Math.min(c, a));
      expect(m).toBeLessThanOrEqual(Math.max(c, a));
    }
  });

  it("nodeColorNumber uses the ramp in recency mode and clamps the rank", () => {
    expect(nodeColorNumber(node({ recencyRank: 1 }), recencyParams)).toBe(
      accentColor(),
    );
    expect(nodeColorNumber(node({ recencyRank: 5 }), recencyParams)).toBe(
      accentColor(),
    );
    expect(nodeColorNumber(node({}), recencyParams)).toBe(cold);
  });

  it("category mode is untouched: a code node still paints its module palette", () => {
    const withHue = node({ moduleHue: 2, depth: 0, recencyRank: 1 });
    expect(nodeColorNumber(withHue, APPEARANCE_DEFAULTS)).toBe(categoryPaletteHue(2));
  });
});
