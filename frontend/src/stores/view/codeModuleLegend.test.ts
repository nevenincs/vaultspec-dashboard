// CGR-002 P02.S08: the code-module legend rollup is a pure presentation of the
// engine's served `module_hue` classification (no re-classification).

import { describe, expect, it } from "vitest";

import type { EngineNode } from "../server/engine";
import { deriveCodeModuleLegend } from "./codeModuleLegend";

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
