// Linkage-coverage figure (graph-node-representation ADR D6, W02.P07.S35).
//
// "Semantic linkage" completeness made observable: how many nodes in a slice carry
// a real embedding, and how many edges carry a non-null derivation label. The ADR
// (D6) surfaces this as a coverage figure the scorecard reports per slice, so a
// regression in linkage density is visible rather than silent.
//
// This is a pure, deterministic read over the served slice — no wire, no engine, no
// layout coordinates (graph-compute-is-CPU, engine-read-and-infer). It reads the
// honest absences D1/D3 establish: a node WITHOUT an embedding is an honest subset
// omission (the node_id join carries no vector for it), and an edge WITHOUT a
// derivation label is an honest null (no real framework-derivation meaning). The
// coverage figure counts only the PRESENT side of each, so a slice rich in
// embeddings and labelled edges scores high and a sparse one scores low.

import type { SceneEdgeData, SceneNodeData } from "../../sceneController";

/**
 * A slice's linkage-coverage figure. Both fractions are in [0,1] (1 = every node /
 * edge carries the linkage datum). `embeddingPresence` is the fraction of nodes
 * carrying a real (non-empty) embedding vector; `derivationLabel` is the fraction
 * of edges carrying a non-null, non-empty derivation label. The raw counts are
 * carried alongside so the scorecard can report "N of M" without re-deriving them.
 * Empty node/edge sets yield a fraction of 1 (vacuously complete — there is nothing
 * un-covered), mirroring the vacuous-pass convention in the scorecard vector.
 */
export interface LinkageCoverage {
  /** Fraction of nodes carrying a real embedding vector, in [0,1]. */
  embeddingPresence: number;
  /** Nodes carrying a real embedding vector. */
  nodesWithEmbedding: number;
  /** Total nodes in the slice. */
  nodeCount: number;
  /** Fraction of edges carrying a non-null derivation label, in [0,1]. */
  derivationLabel: number;
  /** Edges carrying a non-null derivation label. */
  edgesWithDerivation: number;
  /** Total edges in the slice. */
  edgeCount: number;
}

/** A node carries a real embedding when its vector is present and non-empty. */
function hasEmbedding(node: SceneNodeData): boolean {
  return Array.isArray(node.embedding) && node.embedding.length > 0;
}

/** An edge carries a derivation label when it is present and non-empty. */
function hasDerivation(edge: SceneEdgeData): boolean {
  return typeof edge.derivation === "string" && edge.derivation.length > 0;
}

/**
 * Compute the linkage-coverage figure for one slice. Pure and deterministic: the
 * same nodes/edges always yield the same figure, independent of array order. An
 * empty node or edge set reports a fraction of 1 (nothing un-covered).
 */
export function linkageCoverage(
  nodes: readonly SceneNodeData[],
  edges: readonly SceneEdgeData[],
): LinkageCoverage {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;

  let nodesWithEmbedding = 0;
  for (const node of nodes) if (hasEmbedding(node)) nodesWithEmbedding += 1;

  let edgesWithDerivation = 0;
  for (const edge of edges) if (hasDerivation(edge)) edgesWithDerivation += 1;

  const embeddingPresence = nodeCount === 0 ? 1 : nodesWithEmbedding / nodeCount;
  const derivationLabel = edgeCount === 0 ? 1 : edgesWithDerivation / edgeCount;

  return {
    embeddingPresence,
    nodesWithEmbedding,
    nodeCount,
    derivationLabel,
    edgesWithDerivation,
    edgeCount,
  };
}
