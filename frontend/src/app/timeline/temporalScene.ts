import type { LineageArc, LineageNode } from "../../stores/server/engine";
import type { SceneEdgeData, SceneNodeData } from "../../scene/sceneController";
import {
  temporalClusterLayout,
  type TemporalBucketMeta,
  type TemporalClusterInput,
} from "../../scene/field/temporalClusterLayout";
import {
  PHASE_LANES,
  groupIndexOf,
  laneOf as laneOfNode,
  type PhaseLane,
} from "./phaseLanes";
import {
  MAX_TIMELINE_ARCS,
  MAX_TIMELINE_MARKS,
  TIMELINE_ORIGIN_MS,
  capItems,
  isInVisibleRange,
  timeToX,
} from "./scrollStrip";

export interface TemporalSceneInput {
  nodes: readonly LineageNode[];
  arcs: readonly LineageArc[];
  range: { fromMs: number; toMs: number };
  laneVisibility: Record<PhaseLane, boolean>;
  pxPerMs: number;
  scrollOffset: number;
  width: number;
  height: number;
}

export interface TemporalSceneResult {
  nodes: SceneNodeData[];
  edges: SceneEdgeData[];
  nodeById: Map<string, LineageNode>;
  bucketById: Map<string, TemporalBucketMeta>;
  buckets: TemporalBucketMeta[];
  truncated: { total: number; returned: number } | null;
  edgeTruncated: { total: number; returned: number } | null;
  debug: TemporalSceneDebug;
}

export interface TemporalSceneDebug {
  range: { from: string; to: string };
  viewport: { width: number; height: number };
  visibleNodeCount: number;
  visibleEdgeCount: number;
  bucketCount: number;
  densestBucket: { key: string; count: number } | null;
}

function nodeInstant(node: LineageNode): number | null {
  const created = node.dates?.created;
  if (!created) return null;
  const t = Date.parse(created);
  return Number.isFinite(t) ? t : null;
}

function temporalLane(node: LineageNode): TemporalClusterInput["lane"] {
  const group = groupIndexOf(node);
  if (group === 0) return "design";
  if (group === 1) return "execution";
  return undefined;
}

export function lineageToTemporalScene(input: TemporalSceneInput): TemporalSceneResult {
  const candidates: TemporalClusterInput[] = [];
  const visible = new Map<string, LineageNode>();

  for (const node of input.nodes) {
    const t = nodeInstant(node);
    if (t == null || !isInVisibleRange(t, input.range)) continue;
    const laneIdx = laneOfNode(node);
    if (laneIdx == null || !input.laneVisibility[PHASE_LANES[laneIdx]]) continue;
    const x = timeToX(t, TIMELINE_ORIGIN_MS, input.pxPerMs, input.scrollOffset);
    candidates.push({ id: node.id, tMs: t, x, lane: temporalLane(node) });
    visible.set(node.id, node);
  }

  const capped = capItems(candidates, MAX_TIMELINE_MARKS);
  const cappedIds = new Set(capped.items.map((item) => item.id));
  for (const id of [...visible.keys()]) {
    if (!cappedIds.has(id)) visible.delete(id);
  }

  const layout = temporalClusterLayout(capped.items, { height: input.height });
  const bucketById = new Map<string, TemporalBucketMeta>();
  for (const bucket of layout.buckets) {
    for (const id of bucket.ids) bucketById.set(id, bucket);
  }
  const sceneNodes: SceneNodeData[] = [];
  for (const item of capped.items) {
    const node = visible.get(item.id);
    const seedPosition = layout.positions.get(item.id);
    if (!node || !seedPosition) continue;
    sceneNodes.push({
      id: node.id,
      kind: "document",
      docType: node.doc_type,
      title: node.title,
      dates: {
        created: node.dates.created,
        modified:
          typeof node.dates.modified === "number"
            ? new Date(node.dates.modified).toISOString()
            : undefined,
      },
      // Temporal mode uses density/position as the primary encoding. Keep node
      // dots compact so the dated clusters read against the timeline scaffold.
      salience: Math.max(0, Math.min(0.18, node.degree / 72)),
      seedPosition,
      temporal: {
        bucket: new Date(Math.floor(item.tMs / 86_400_000) * 86_400_000)
          .toISOString()
          .slice(0, 10),
      },
    });
  }

  const cappedArcs = capItems(
    input.arcs.filter((arc) => cappedIds.has(arc.src) && cappedIds.has(arc.dst)),
    MAX_TIMELINE_ARCS,
  );
  const edges: SceneEdgeData[] = cappedArcs.items.map((arc) => ({
    id: arc.id,
    src: arc.src,
    dst: arc.dst,
    relation: arc.relation,
    tier: arc.tier,
    // Connections remain present and inspectable, but the timeline's product
    // read is date density first. Lower confidence here maps to thinner/fainter
    // graph links without removing the underlying edge records.
    confidence: Math.min(0.18, arc.confidence),
    derivation: arc.derivation,
  }));

  const densestBucket =
    layout.buckets.length > 0
      ? layout.buckets.reduce((max, bucket) =>
          bucket.count > max.count ? bucket : max,
        )
      : null;
  const truncated =
    capped.dropped > 0
      ? { total: capped.items.length + capped.dropped, returned: capped.items.length }
      : null;
  const edgeTruncated =
    cappedArcs.dropped > 0
      ? {
          total: cappedArcs.items.length + cappedArcs.dropped,
          returned: cappedArcs.items.length,
        }
      : null;

  return {
    nodes: sceneNodes,
    edges,
    nodeById: visible,
    bucketById,
    buckets: layout.buckets,
    truncated,
    edgeTruncated,
    debug: {
      range: {
        from: new Date(input.range.fromMs).toISOString(),
        to: new Date(input.range.toMs).toISOString(),
      },
      viewport: {
        width: input.width,
        height: input.height,
      },
      visibleNodeCount: sceneNodes.length,
      visibleEdgeCount: edges.length,
      bucketCount: layout.buckets.length,
      densestBucket: densestBucket
        ? { key: densestBucket.key, count: densestBucket.count }
        : null,
    },
  };
}
