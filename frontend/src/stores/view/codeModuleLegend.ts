import { useMemo } from "react";

import type { EngineNode } from "../server/engine";
import { useDashboardStageSceneView, useGraphSlice } from "../server/queries";

export interface CodeModuleLegendRow {
  module: string;
  moduleHue: number;
}

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
    gq?.corpus,
  );
  const nodes = slice.data?.nodes;
  return useMemo(() => deriveCodeModuleLegend(nodes), [nodes]);
}
