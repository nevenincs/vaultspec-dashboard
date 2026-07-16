import type { StateKey } from "../../scene/field/marks";
import type {
  CountMessageDescriptor,
  MessageDescriptor,
} from "../../platform/localization/message";
import type { EngineNode, NodeDetail } from "../server/engine";
import type { NodeDetailView } from "../server/queries";
import { featureTagFromNodeId } from "../server/liveAdapters";
import {
  compareStableIdentifiers,
  stableIdentifier,
} from "../../platform/localization/displayText";

export interface InteriorStep {
  id: string;
  title: string;
  done: boolean;
}

export type NodeInteriorView =
  | { state: "feature" }
  | { state: "loading"; message: MessageDescriptor }
  | { state: "unavailable"; message: MessageDescriptor }
  | { state: "plan"; detail: NodeDetail }
  | { state: "summary"; node: EngineNode };

export const NODE_INTERIOR_MESSAGES = Object.freeze({
  loading: Object.freeze({
    key: "graph:islands.states.loading",
  } satisfies MessageDescriptor<"graph:islands.states.loading">),
  featureLoading: Object.freeze({
    key: "graph:islands.states.featureLoading",
  } satisfies MessageDescriptor<"graph:islands.states.featureLoading">),
  unavailable: Object.freeze({
    key: "graph:islands.states.unavailable",
  } satisfies MessageDescriptor<"graph:islands.states.unavailable">),
  type: Object.freeze({
    key: "graph:islands.labels.type",
  } satisfies MessageDescriptor<"graph:islands.labels.type">),
  status: Object.freeze({
    key: "graph:islands.labels.status",
  } satisfies MessageDescriptor<"graph:islands.labels.status">),
});

/** The plan interior's tiered rows, in canonical identifier order. */
export function interiorSteps(interior: NodeDetail["interior"]): InteriorStep[] {
  if (!interior) return [];
  return interior.nodes
    .filter(
      (n) =>
        n.kind === "step" &&
        typeof n.title === "string" &&
        n.title.length > 0 &&
        n.title !== n.id,
    )
    .sort((a, b) =>
      compareStableIdentifiers(stableIdentifier(a.id), stableIdentifier(b.id)),
    )
    .map((n) => ({
      id: n.id,
      title: n.title as string,
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

type InteriorStateMessageKey =
  | "graph:islands.states.active"
  | "graph:islands.states.archived"
  | "graph:islands.states.broken"
  | "graph:islands.states.complete"
  | "graph:islands.states.stale";

const INTERIOR_STATE_MESSAGES = Object.freeze({
  active: Object.freeze({ key: "graph:islands.states.active" }),
  complete: Object.freeze({ key: "graph:islands.states.complete" }),
  archived: Object.freeze({ key: "graph:islands.states.archived" }),
  broken: Object.freeze({ key: "graph:islands.states.broken" }),
  stale: Object.freeze({ key: "graph:islands.states.stale" }),
} as const satisfies Readonly<
  Record<StateKey, MessageDescriptor<InteriorStateMessageKey>>
>);

export function nodeInteriorStateMessage(state: unknown): MessageDescriptor | null {
  const key = stateMarkKey(typeof state === "string" ? state : undefined);
  return key === null ? null : INTERIOR_STATE_MESSAGES[key];
}

export function nodeInteriorProgressMessage(
  done: number,
  total: number,
): CountMessageDescriptor<"graph:islands.progress.stepsComplete"> | null {
  return Number.isSafeInteger(done) &&
    done >= 0 &&
    Number.isSafeInteger(total) &&
    total >= 0
    ? {
        key: "graph:islands.progress.stepsComplete",
        values: { count: total, done },
      }
    : null;
}

/** Preserve valid authored titles byte-for-byte; reject identity and empty copy. */
export function nodeInteriorAuthoredTitle(node: EngineNode): string | null {
  const title = node.title;
  return typeof title === "string" && title.trim().length > 0 && title !== node.id
    ? title
    : null;
}

export function deriveNodeInteriorView(
  id: string,
  detail: NodeDetailView,
): NodeInteriorView {
  if (featureTagFromNodeId(id) !== null) return { state: "feature" };
  if (detail.state === "loading") {
    return {
      state: "loading",
      message: NODE_INTERIOR_MESSAGES.loading,
    };
  }
  if (detail.state === "unavailable" || detail.detail === null) {
    return {
      state: "unavailable",
      message: NODE_INTERIOR_MESSAGES.unavailable,
    };
  }
  if (detail.detail.node.doc_type === "plan") {
    return { state: "plan", detail: detail.detail };
  }
  return { state: "summary", node: detail.detail.node };
}
