// Wire → scene mapping (W02.P06.S21). The engine serves snake_case
// contract shapes; the scene speaks the locked seam types. This is the
// only place the two vocabularies meet. Scene-layer module: framework-free.

import type { EngineEdge, EngineNode } from "../stores/server/engine";
import { nodeStatusFromWire } from "./field/statusStamp";
import type {
  SceneCommand,
  SceneDelta,
  SceneEdgeData,
  SceneNodeData,
} from "./sceneController";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeGraphDeltaOp(value: unknown): SceneDelta["op"] | null {
  return value === "add" || value === "remove" || value === "change" ? value : null;
}

function normalizeGraphDeltaNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeGraphDeltaNode(value: unknown): EngineNode | null {
  if (!isObjectRecord(value)) return null;
  return typeof value.id === "string" && value.id.trim().length > 0
    ? ({ ...value, id: value.id.trim() } as EngineNode)
    : null;
}

function normalizeGraphDeltaEdge(value: unknown): EngineEdge | null {
  if (!isObjectRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const src = typeof value.src === "string" ? value.src.trim() : "";
  const dst = typeof value.dst === "string" ? value.dst.trim() : "";
  return id.length > 0 && src.length > 0 && dst.length > 0
    ? ({ ...value, id, src, dst } as EngineEdge)
    : null;
}

export function engineNodeToScene(node: EngineNode): SceneNodeData {
  return {
    id: node.id,
    kind: node.kind,
    // The vault doc type drives the category-colour fill; `kind` is the generic
    // species, so the colour resolver prefers `docType` (see categoryColor).
    docType: node.doc_type,
    title: node.title,
    // Feature membership -> the feature overlays (countries, hulls).
    featureTags: node.feature_tags,
    lifecycle: node.lifecycle,
    degreeByTier: node.degree_by_tier,
    dates: node.dates,
    // Feature-convergence sizing input (S02 / ADR D4.1); absent on documents.
    memberCount: node.member_count,
    // CODE corpus module identity (CGR-002): owning module, 0..6 hue index, depth.
    module: node.module,
    moduleHue: node.module_hue,
    depth: node.depth,
    // Per-lens salience (graph-node-salience) -> size + label priority; the
    // embedding feeds the semantic UMAP worker (graph-representation §4).
    salience: node.salience,
    embedding: node.embedding,
    // Authority register (graph-node-semantics) -> the lineage layout suppresses
    // `manifest` (generated index) nodes from the derivation spine (W03 D5).
    authorityClass: node.authority_class,
    // Per-type lifecycle status (node-visual-richness P01/P03) -> the status
    // stamp. The ordinal magnitude is derived from the raw value by the scene's
    // pure util (never a view component); absent when the wire carries no status.
    status: nodeStatusFromWire(node.status_value, node.status_class),
  };
}

export function engineEdgeToScene(edge: EngineEdge): SceneEdgeData {
  return {
    id: edge.id,
    src: edge.src,
    dst: edge.dst,
    relation: edge.relation,
    tier: edge.tier,
    confidence: edge.confidence,
    state: edge.state,
    meta: edge.meta
      ? { count: edge.meta.count, breakdownByTier: edge.meta.breakdown_by_tier }
      : undefined,
    // Pipeline-derivation label (graph-node-semantics) -> lineage axis. The
    // wire carries `null` for "no pipeline relationship"; the scene treats that
    // as absent (undefined) so the lineage axis only sees real labels.
    derivation: edge.derivation ?? undefined,
  };
}

export function sliceToScene(slice: unknown): {
  nodes: SceneNodeData[];
  edges: SceneEdgeData[];
} {
  const record = isObjectRecord(slice) ? slice : {};
  const nodes = Array.isArray(record.nodes)
    ? record.nodes
        .map((node) => normalizeGraphDeltaNode(node))
        .filter((node): node is EngineNode => node !== null)
    : [];
  const edges = Array.isArray(record.edges)
    ? record.edges
        .map((edge) => normalizeGraphDeltaEdge(edge))
        .filter((edge): edge is EngineEdge => edge !== null)
    : [];
  return {
    nodes: nodes.map(engineNodeToScene),
    edges: edges.map(engineEdgeToScene),
  };
}

/**
 * Map one engine delta entry to a SceneDelta for `apply-deltas`.
 * Returns null for entries that carry neither a node nor an edge — the
 * caller filters nulls before routing to SceneController.
 *
 * Used by the spliceLive path (constellation-live-delta S05): Stage maps
 * feature-granularity delta entries to SceneDeltas and pushes them via
 * `SceneController.command({ kind: "apply-deltas", ... })`.
 */
export function graphDeltaToScene(delta: unknown): SceneDelta | null {
  if (!isObjectRecord(delta)) return null;
  const op = normalizeGraphDeltaOp(delta.op);
  const t = normalizeGraphDeltaNumber(delta.t);
  const seq = normalizeGraphDeltaNumber(delta.seq);
  const node = normalizeGraphDeltaNode(delta.node);
  const edge = normalizeGraphDeltaEdge(delta.edge);
  if (op === null || t === null || seq === null || (node === null && edge === null)) {
    return null;
  }
  return {
    op,
    node: node ? engineNodeToScene(node) : undefined,
    edge: edge ? engineEdgeToScene(edge) : undefined,
    t,
    seq,
  };
}

export function graphDeltasToApplyCommand(deltas: unknown): SceneCommand | null {
  if (!Array.isArray(deltas)) return null;
  const sceneDeltas = deltas
    .map((entry) => graphDeltaToScene(entry))
    .filter((delta): delta is SceneDelta => delta !== null);
  if (sceneDeltas.length === 0) return null;
  return {
    kind: "apply-deltas",
    deltas: sceneDeltas,
    seq: sceneDeltas[sceneDeltas.length - 1]!.seq,
  };
}
