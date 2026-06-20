import type { SceneNodeData } from "../sceneController";
import { SALIENCE_RADIUS_MAX } from "../three/appearance";
import { FEATURE_LEVEL_SCALE } from "./cameraCore";
import { cssColorNumber } from "./tokenReads";

export { SALIENCE_RADIUS_MAX };

function readStateColors(): Record<string, number> {
  return {
    active: cssColorNumber("--color-state-active", 0x2f7d4f),
    complete: cssColorNumber("--color-state-complete", 0x4a4137),
    archived: cssColorNumber("--color-state-archived", 0x9a938a),
    broken: cssColorNumber("--color-state-broken", 0xb3502d),
    stale: cssColorNumber("--color-state-stale", 0xa07520),
  };
}

export function stateColor(lifecycle?: SceneNodeData["lifecycle"]): number {
  const defaultColor = cssColorNumber("--color-ink-muted", 0x6a6258);
  if (!lifecycle) return defaultColor;
  return readStateColors()[lifecycle.state] ?? defaultColor;
}

export function labelPriority(node: SceneNodeData): number {
  if (typeof node.salience === "number") {
    return Math.max(0, Math.min(1, node.salience));
  }
  if (node.kind === "feature" && node.memberCount && node.memberCount > 0) {
    return Math.min(1, 0.5 + Math.log2(1 + node.memberCount) * 0.1);
  }
  return 0.2;
}

export function ambientLabelFloor(scale: number): number {
  if (scale >= 1.6) return 0;
  if (scale <= FEATURE_LEVEL_SCALE) return 0.6;
  const t = (scale - FEATURE_LEVEL_SCALE) / (1.6 - FEATURE_LEVEL_SCALE);
  return 0.6 * (1 - t);
}
