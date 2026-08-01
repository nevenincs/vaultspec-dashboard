import { useMemo } from "react";

import type { EngineNode } from "../server/engine";
import {
  isTierBuildingReason,
  isTierRefreshingReason,
  useDashboardStageSceneView,
  useGraphSlice,
  useGraphSliceAvailability,
} from "../server/queries";

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

export interface GraphLegendView {
  /** Module rows when the active corpus is code; empty for the vault corpus. */
  codeModules: CodeModuleLegendRow[];
  /** The graph slice the legend keys off is degraded (read from the slice's OWN
   *  served tiers block, never guessed): the corpus behind the legend is not
   *  trustworthy, so the legend's filter affordances are offered disabled rather
   *  than writing a facet against a partial corpus. Same query key the legend
   *  already reads, so this costs no extra request.
   *
   *  The `semantic` tier is excluded for the same reason the canvas overlay
   *  excludes it: rag being down is search's concern and says nothing about
   *  whether the doc-type facet still narrows the corpus correctly. */
  degraded: boolean;
}

const LEGEND_IRRELEVANT_TIERS = new Set(["semantic"]);

/** Whether a served set of degraded tiers makes the legend's corpus narrowing
 *  untrustworthy. Pure, so the rule is provable without a degraded backend.
 *
 *  Two exclusions, both matching the canvas overlay's reading of the same block:
 *  `semantic` is search's concern, and a tier that is still BUILDING or
 *  REFRESHING its index is loading rather than down — its corpus is incomplete
 *  only momentarily, and locking the legend for the whole first index build would
 *  disable the toolbar on every cold start. */
export function graphLegendDegraded(
  degradedTiers: readonly string[],
  reasons: Readonly<Record<string, string>> = {},
): boolean {
  return degradedTiers.some(
    (tier) =>
      !LEGEND_IRRELEVANT_TIERS.has(tier) &&
      !isTierBuildingReason(reasons[tier]) &&
      !isTierRefreshingReason(reasons[tier]),
  );
}

export function useGraphLegendView(scope: unknown): GraphLegendView {
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
  const { degradedTiers, reasons } = useGraphSliceAvailability(
    slice,
    (gq?.scope ?? null) !== null,
  );
  const codeModules = useMemo(() => deriveCodeModuleLegend(nodes), [nodes]);
  const degraded = graphLegendDegraded(degradedTiers, reasons);
  return useMemo(() => ({ codeModules, degraded }), [codeModules, degraded]);
}
