import { nodeCategory, type NodeCategory } from "../../scene/field/categoryColor";
import { normalizeNodeId } from "../nodeIds";
import type { EngineNode, NodeEvidence } from "../server/engine";
import { useNodeDetailView, useNodeEvidence } from "../server/queries";
import { deriveEvidenceGroups, type EvidenceGroup } from "./hoverCardEvidence";
import { normalizeSelectionScope } from "./selection";

/** The transient hover card's render model. */
export interface HoverCardModel {
  /** Stable node id (identity-bearing; rendered monospace). */
  readonly id: string;
  /** GLYPH_KINDS species (adr / plan / audit / rule / feature / ...). */
  readonly kind: string;
  readonly title: string;
  /** The scene category the node belongs to; drives tokenized accent styling. */
  readonly category?: NodeCategory;
  /** Bounded, grouped evidence lines folded from enriched node evidence. */
  readonly evidence: EvidenceGroup[];
}

export interface HoverCardView {
  model: HoverCardModel | null;
}

export interface HoverCardLayerView {
  targetId: string | null;
  rootClassName: string;
  cardShellClassName: string;
}

const HOVER_CARD_LAYER_ROOT_CLASS =
  "pointer-events-none absolute inset-0 overflow-hidden";
const HOVER_CARD_INSPECT_ONLY_CLASS = "pointer-events-none";

/**
 * Gate a dwelled hover id behind open suppression and project the host chrome.
 * Hover remains view-local state; the app layer should only render this view.
 */
export function deriveHoverCardLayerView(
  dwelledId: string | null,
  openedIds: readonly string[],
): HoverCardLayerView {
  return {
    targetId: dwelledId === null || openedIds.includes(dwelledId) ? null : dwelledId,
    rootClassName: HOVER_CARD_LAYER_ROOT_CLASS,
    cardShellClassName: HOVER_CARD_INSPECT_ONLY_CLASS,
  };
}

/**
 * Project a node's identity plus enriched evidence into the binding hover-card
 * view model. When evidence is absent, the card renders identity only.
 */
export function cardModelFromEvidence(
  node: EngineNode,
  evidence: NodeEvidence | undefined,
): HoverCardModel {
  return {
    id: node.id,
    kind: node.kind,
    title: node.title ?? node.id,
    category: nodeCategory(node.kind),
    evidence: evidence ? deriveEvidenceGroups(evidence) : [],
  };
}

export function deriveHoverCardView(
  requestedId: unknown,
  node: EngineNode | null,
  evidence: NodeEvidence | undefined,
): HoverCardView {
  const nodeId = normalizeNodeId(requestedId);
  return {
    model:
      nodeId === null || node === null || node.id !== nodeId
        ? null
        : cardModelFromEvidence(node, evidence),
  };
}

/**
 * Stores-view selector for the canvas hover card. The island host owns anchoring
 * and hover dwell, but query payload interpretation and evidence folding stay in
 * this stores boundary.
 */
export function useHoverCardView(id: unknown, scope: unknown): HoverCardView {
  const nodeId = normalizeNodeId(id);
  const normalizedScope = normalizeSelectionScope(scope);
  const detail = useNodeDetailView(nodeId, normalizedScope);
  const evidence = useNodeEvidence(nodeId, normalizedScope);
  return deriveHoverCardView(nodeId, detail.node, evidence.data);
}
