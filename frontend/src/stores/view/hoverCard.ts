import { nodeCategory, type NodeCategory } from "../../scene/field/categoryColor";
import type { MessageDescriptor } from "../../platform/localization/message";
import { normalizeNodeId } from "../nodeIds";
import type { EngineNode, NodeEvidence } from "../server/engine";
import { docTypePresentation } from "../server/docTypeVocabulary";
import {
  useGraphNodeFromActiveSlice,
  useNodeDetailView,
  useNodeEvidence,
} from "../server/queries";
import {
  deriveHoverEvidenceSummary,
  type HoverEvidenceSummary,
} from "./hoverCardEvidence";
import { normalizeSelectionScope } from "./selection";

/** The transient hover card's render model. */
export interface HoverCardModel {
  /** Stable node id retained only for the open callback; never rendered. */
  readonly id: string;
  readonly markKind: string;
  readonly typeLabel: MessageDescriptor;
  readonly title: string;
  /** The scene category the node belongs to; drives tokenized accent styling. */
  readonly category?: NodeCategory;
  /** A one-line headline summary of the document (node-detail route-fill: the
   *  doc body's first prose line). Present only for content-bearing DOC nodes;
   *  synthesized feature/constellation nodes have no body, so it is absent there
   *  (honest absence — the card simply omits the line). */
  readonly summary?: string;
  readonly evidence: HoverEvidenceSummary;
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
 * Project safe authored copy plus semantic evidence into the binding hover-card
 * view model. When evidence is absent, the card renders authored copy only.
 */
export function cardModelFromEvidence(
  node: EngineNode,
  evidence: NodeEvidence | undefined,
  summary?: string,
): HoverCardModel | null {
  const title = node.title;
  if (typeof title !== "string" || title.trim().length === 0 || title === node.id)
    return null;
  const documentType = docTypePresentation(node.doc_type ?? node.kind);
  const feature = node.kind === "feature";
  if (documentType === null && !feature) return null;
  return {
    id: node.id,
    markKind: feature ? "feature" : documentType!.id,
    typeLabel: feature ? { key: "graph:hover.types.feature" } : documentType!.label,
    title,
    category: nodeCategory(node.kind),
    summary:
      typeof summary === "string" && summary.trim().length > 0 ? summary : undefined,
    evidence: deriveHoverEvidenceSummary(evidence),
  };
}

export function deriveHoverCardView(
  requestedId: unknown,
  node: EngineNode | null,
  evidence: NodeEvidence | undefined,
  summary?: string,
): HoverCardView {
  const nodeId = normalizeNodeId(requestedId);
  return {
    model:
      nodeId === null || node === null || node.id !== nodeId
        ? null
        : cardModelFromEvidence(node, evidence, summary),
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
  // Identity source: the `/nodes/{id}` detail when the node is addressable (doc
  // nodes — it carries the richer payload the evidence fold needs), else the
  // in-memory active graph slice node. Constellation FEATURE nodes are NOT
  // detail-addressable (the route 404s), so without the slice fallback their card
  // model was null and no card rendered — only the scene's bare canvas label
  // showed. Evidence is ADDITIVE and only present for addressable nodes; a feature
  // node renders an identity-only card (it has no `/evidence`).
  const sliceNode = useGraphNodeFromActiveSlice(nodeId, scope);
  return deriveHoverCardView(
    nodeId,
    detail.node ?? sliceNode,
    evidence.data,
    detail.detail?.summary,
  );
}
