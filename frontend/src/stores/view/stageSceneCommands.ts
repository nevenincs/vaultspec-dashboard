import { sliceToScene } from "../../scene/sceneMapping";
import type { SceneCommand } from "../../scene/sceneController";
import {
  normalizeDashboardGraphBounds,
  normalizeDashboardRepresentationMode,
} from "../server/dashboardStateNormalization";
import { normalizeGraphOverlays } from "./graphOverlays";

export function stageSetDataCommand(
  slice: unknown,
  opts?: { reflow?: boolean },
): SceneCommand {
  const mapped = sliceToScene(slice);
  return {
    kind: "set-data",
    nodes: mapped.nodes,
    edges: mapped.edges,
    // Only carry the flag when set (reflow mode) so a normal set-data stays
    // byte-identical to before — additive seam, existing callers unaffected.
    ...(opts?.reflow ? { reflow: true } : {}),
  };
}

export function stageRepresentationCommand(mode: unknown): SceneCommand {
  return {
    kind: "set-representation-mode",
    mode: normalizeDashboardRepresentationMode(mode),
  };
}

export function stageBoundsCommand(bounds: unknown): SceneCommand | null {
  if (bounds === undefined) return null;
  const normalized = normalizeDashboardGraphBounds(bounds);
  return {
    kind: "set-bounds",
    shape: normalized.shape,
    size: normalized.shape === "free" ? undefined : normalized.size,
  };
}

export function stageOverlaysCommand(overlays: unknown): SceneCommand {
  const normalized = normalizeGraphOverlays(overlays);
  return {
    kind: "set-overlays",
    featureCountries: normalized.featureCountries,
    featureHulls: normalized.featureHulls,
  };
}
