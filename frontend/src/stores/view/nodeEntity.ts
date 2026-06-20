import type { NodeEntity } from "../../platform/actions/entity";
import { normalizeNodeId } from "../nodeIds";
import { isPinnedNode } from "./pins";
import { isNodeIslandOpen, normalizeSelectionScope } from "./selection";
import { isInWorkingSet } from "./workingSet";

export interface NodeEntityViewInput {
  id: unknown;
  scope?: unknown;
  title?: unknown;
}

function isNodeEntityViewInput(value: unknown): value is NodeEntityViewInput {
  return value !== null && typeof value === "object" && "id" in value;
}

function normalizeNodeEntityTitle(title: unknown): string | undefined {
  if (typeof title !== "string") return undefined;
  const normalized = title.trim();
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Build the canonical node context-menu descriptor. Surfaces know the node id and
 * optional title; open/pin/working-set membership is read here so every publisher
 * sends the same action context.
 */
export function nodeEntityView(input: unknown): NodeEntity | null {
  if (!isNodeEntityViewInput(input)) return null;
  const id = normalizeNodeId(input.id);
  if (id === null) return null;
  const scope = "scope" in input ? normalizeSelectionScope(input.scope) : undefined;
  const title = normalizeNodeEntityTitle(input.title);
  return {
    kind: "node",
    id,
    scope,
    title,
    isOpen: isNodeIslandOpen(id),
    isPinned: isPinnedNode(id),
    inWorkingSet: isInWorkingSet(id),
  };
}
