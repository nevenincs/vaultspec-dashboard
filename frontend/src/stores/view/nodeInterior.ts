import type { StateKey } from "../../scene/field/marks";
import type { EngineNode, NodeDetail } from "../server/engine";
import type { NodeDetailView } from "../server/queries";
import { featureTagFromNodeId } from "../server/liveAdapters";

export interface InteriorStep {
  id: string;
  title: string;
  done: boolean;
}

export type NodeInteriorView =
  | { state: "feature" }
  | { state: "loading"; message: string; messageClassName: string }
  | {
      state: "unavailable";
      message: string;
      messageClassName: string;
      iconSize: number;
    }
  | { state: "plan"; detail: NodeDetail }
  | { state: "summary"; node: EngineNode };

const INTERIOR_LOADING_CLASS = "mt-fg-1 text-label text-ink-faint";
const INTERIOR_UNAVAILABLE_CLASS =
  "mt-fg-1 flex items-center gap-fg-1 text-label text-state-broken";

/** The plan interior's tiered rows, in canonical identifier order. */
export function interiorSteps(interior: NodeDetail["interior"]): InteriorStep[] {
  if (!interior) return [];
  return interior.nodes
    .filter((n) => n.kind === "step")
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((n) => ({
      id: n.id,
      title: n.title ?? n.id,
      done: n.lifecycle?.state === "complete",
    }));
}

/** The five canonical lifecycle states that carry a StateMark, else null. */
const STATE_KEYS = new Set<StateKey>([
  "active",
  "complete",
  "archived",
  "broken",
  "stale",
]);

export function stateMarkKey(state: string | undefined): StateKey | null {
  return state && STATE_KEYS.has(state as StateKey) ? (state as StateKey) : null;
}

export function deriveNodeInteriorView(
  id: string,
  detail: NodeDetailView,
): NodeInteriorView {
  if (featureTagFromNodeId(id) !== null) return { state: "feature" };
  if (detail.state === "loading") {
    return {
      state: "loading",
      message: "unfolding…",
      messageClassName: INTERIOR_LOADING_CLASS,
    };
  }
  if (detail.state === "unavailable" || detail.detail === null) {
    return {
      state: "unavailable",
      message: "interior unavailable",
      messageClassName: INTERIOR_UNAVAILABLE_CLASS,
      iconSize: 14,
    };
  }
  if (detail.node?.kind === "plan") {
    return { state: "plan", detail: detail.detail };
  }
  return { state: "summary", node: detail.detail.node };
}
