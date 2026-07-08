// Code-corpus module legend rollup (codebase-graphing CGR-002 P02.S08).
//
// A CLIENT-SIDE presentation ROLLUP of the engine's per-node `module_hue`
// classification: the engine assigns the top-seven top-level modules a hue index
// 0..6 (member-count ranked, memoized per generation); this lists the distinct
// modules it hued, ordered by that index, for the graph legend. It re-classifies
// NOTHING — it only lists what the backend already assigned
// (display-state-is-backend-served). Empty for a vault corpus (no node carries a
// `module_hue`), so the legend falls back to the doc-type key. Derivation is a pure
// function tested in isolation; the hook wraps it in a `useMemo` over the RAW
// served slice (stable-selectors — never inside a store selector).

import { useMemo } from "react";

import type { EngineNode } from "../server/engine";
import { useDashboardStageSceneView, useGraphSlice } from "../server/queries";

export interface CodeModuleLegendRow {
  /** The owning top-level module key the engine hued. */
  module: string;
  /** The engine-assigned 0..6 palette index (its rank among the top modules). */
  moduleHue: number;
}

/** The distinct hued modules in the served slice, ordered by hue index. The engine
 *  gives each top module a UNIQUE 0..6 index, so keying by hue de-dupes to the
 *  top-seven; a vault slice (no `module_hue`) yields an empty list. */
export function deriveCodeModuleLegend(
  nodes: readonly EngineNode[] | undefined,
): CodeModuleLegendRow[] {
  if (!nodes) return [];
  const byHue = new Map<number, string>();
  for (const node of nodes) {
    const hue = node.module_hue;
    const mod = node.module;
    if (typeof hue !== "number" || !Number.isInteger(hue) || hue < 0) continue;
    if (typeof mod !== "string" || mod.length === 0) continue;
    if (!byHue.has(hue)) byHue.set(hue, mod);
  }
  return [...byHue.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([moduleHue, module]) => ({ module, moduleHue }));
}

/** The code-module legend rows for the active graph. Reads the SAME cached graph
 *  slice the stage renders (TanStack dedupes on the query key — no extra fetch) and
 *  rolls up its hued modules. Empty when the corpus is vault or the engine has not
 *  yet served `module_hue` (safe fallback to the doc-type legend). */
export function useCodeModuleLegend(scope: unknown): CodeModuleLegendRow[] {
  const view = useDashboardStageSceneView(scope);
  const gq = view.graphQuery;
  const slice = useGraphSlice(
    gq?.scope ?? null,
    gq?.filter,
    gq?.asOf,
    gq?.granularity,
    gq?.lens,
    gq?.focus,
  );
  const nodes = slice.data?.nodes;
  return useMemo(() => deriveCodeModuleLegend(nodes), [nodes]);
}
