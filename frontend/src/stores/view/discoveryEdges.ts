import type { EngineEdge } from "../server/engine";
import { normalizeNodeId } from "../nodeIds";

export const DISCOVERY_EDGE_ID_MAX_CHARS = 512;

const DISCOVERY_EDGE_TIERS = new Set<EngineEdge["tier"]>([
  "declared",
  "structural",
  "temporal",
]);

export function normalizeDiscoveryEdgeId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const normalized = id.trim();
  return normalized.length > 0 && normalized.length <= DISCOVERY_EDGE_ID_MAX_CHARS
    ? normalized
    : null;
}

export function normalizeDiscoveryConfidence(confidence: unknown): number {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return 0;
  return Math.min(1, Math.max(0, confidence));
}

export function normalizeDiscoveryEdge(edge: unknown): EngineEdge | null {
  if (!edge || typeof edge !== "object") return null;
  const candidate = edge as Partial<EngineEdge>;
  const id = normalizeDiscoveryEdgeId(candidate.id);
  const src = normalizeNodeId(candidate.src);
  const dst = normalizeNodeId(candidate.dst);
  if (
    id === null ||
    src === null ||
    dst === null ||
    typeof candidate.relation !== "string" ||
    candidate.relation.trim().length === 0 ||
    !DISCOVERY_EDGE_TIERS.has(candidate.tier as EngineEdge["tier"])
  ) {
    return null;
  }
  return {
    ...candidate,
    id,
    src,
    dst,
    relation: candidate.relation.trim(),
    tier: candidate.tier as EngineEdge["tier"],
    confidence: normalizeDiscoveryConfidence(candidate.confidence),
  };
}

export function normalizeDiscoveryEdges(
  edges: readonly unknown[],
  limit: number,
): EngineEdge[] {
  const normalized: EngineEdge[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    if (normalized.length >= limit) break;
    const normalizedEdge = normalizeDiscoveryEdge(edge);
    if (normalizedEdge === null || seen.has(normalizedEdge.id)) continue;
    seen.add(normalizedEdge.id);
    normalized.push(normalizedEdge);
  }
  return normalized;
}

export function normalizePinnedDiscoveryEdges(
  edges: readonly unknown[],
  limit: number,
): EngineEdge[] {
  return normalizeDiscoveryEdges([...edges].reverse(), limit).reverse();
}
