// The code-module legend rollup is a pure presentation of the
// engine's served `module_hue` classification (no re-classification).

import { describe, expect, it } from "vitest";

import type { EngineNode } from "../server/engine";
import { deriveCodeModuleLegend, graphLegendDegraded } from "./codeModuleLegend";

const node = (over: Partial<EngineNode>): EngineNode => ({
  id: over.id ?? "code:x",
  kind: over.kind ?? "code-artifact",
  ...over,
});

describe("deriveCodeModuleLegend", () => {
  it("is empty for a vault slice (no node carries module_hue)", () => {
    expect(
      deriveCodeModuleLegend([
        node({ kind: "adr", doc_type: "adr" }),
        node({ kind: "plan", doc_type: "plan" }),
      ]),
    ).toEqual([]);
  });

  it("is empty for undefined nodes", () => {
    expect(deriveCodeModuleLegend(undefined)).toEqual([]);
  });

  it("lists distinct hued modules ordered by hue index", () => {
    const rows = deriveCodeModuleLegend([
      node({ id: "code:a", module: "scene", module_hue: 1 }),
      node({ id: "code:b", module: "engine", module_hue: 0 }),
      node({ id: "code:c", module: "scene", module_hue: 1 }), // same module → deduped
      node({ id: "code:d", module: "stores", module_hue: 2 }),
    ]);
    expect(rows).toEqual([
      { module: "engine", moduleHue: 0 },
      { module: "scene", moduleHue: 1 },
      { module: "stores", moduleHue: 2 },
    ]);
  });

  it("skips long-tail modules (module_hue null) and unhued/blank entries", () => {
    const rows = deriveCodeModuleLegend([
      node({ id: "code:a", module: "engine", module_hue: 0 }),
      node({ id: "code:b", module: "longtail", module_hue: null }),
      node({ id: "code:c", module: "", module_hue: 3 }),
      node({ id: "code:d", module_hue: 4 }), // no module key
    ]);
    expect(rows).toEqual([{ module: "engine", moduleHue: 0 }]);
  });
});

describe("graphLegendDegraded", () => {
  it("is false for a healthy slice", () => {
    expect(graphLegendDegraded([])).toBe(false);
  });

  it("ignores a semantic-only outage (search's concern, not the corpus narrowing)", () => {
    expect(graphLegendDegraded(["semantic"])).toBe(false);
  });

  it("is true for any corpus-bearing tier the engine reports down", () => {
    expect(
      graphLegendDegraded(["structural"], { structural: "core unreachable" }),
    ).toBe(true);
    expect(graphLegendDegraded(["semantic", "declared"], {})).toBe(true);
    expect(graphLegendDegraded(["temporal"])).toBe(true);
  });

  it("treats a still-building or refreshing tier as loading, not degradation", () => {
    expect(
      graphLegendDegraded(["declared"], { declared: "declared tier building" }),
    ).toBe(false);
    expect(
      graphLegendDegraded(["structural"], {
        structural: "structural index refreshing",
      }),
    ).toBe(false);
    // A second tier that is genuinely down still degrades the legend.
    expect(
      graphLegendDegraded(["declared", "temporal"], {
        declared: "declared tier building",
        temporal: "index not built",
      }),
    ).toBe(true);
  });
});
