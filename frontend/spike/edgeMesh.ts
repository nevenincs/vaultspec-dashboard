// Mesh-based edge rendering for the renderer spike (W01.P01.S01, ADR G6.b).
//
// The foundation spike's per-frame `Graphics` re-tessellation was the named
// 10k/50k bottleneck (foundation audit §2): rebuilding a 50k-segment path
// re-runs stroke tessellation on the CPU every frame. The standard fix is a
// static line-list mesh whose position buffer is re-uploaded in place —
// geometry topology is built once, per-frame cost is one typed-array write
// pass plus one GPU buffer upload per tier.
//
// One mesh per provenance tier keeps the four line treatments as four draw
// calls with per-mesh tint/alpha; vertices sample the shared white texel so
// the default mesh shader (and its transform handling) applies unchanged.

import { Mesh, MeshGeometry, Texture } from "pixi.js";

import type { CorpusEdge } from "./corpus";

/** Per-tier edge endpoints, resolved to node indices: [src0, dst0, src1, …]. */
export function partitionEdgesByTier(
  edges: readonly CorpusEdge[],
  nodeIndex: ReadonlyMap<string, number>,
  tierCount: number,
): Uint32Array[] {
  const endpoints: number[][] = Array.from({ length: tierCount }, () => []);
  for (const e of edges) {
    const src = nodeIndex.get(e.source);
    const dst = nodeIndex.get(e.target);
    if (src === undefined || dst === undefined) continue;
    endpoints[e.tier % tierCount].push(src, dst);
  }
  return endpoints.map((eps) => Uint32Array.from(eps));
}

/**
 * Write segment vertex positions for one tier into `out` (4 floats per
 * segment) from the shared node-position array (2 floats per node index).
 */
export function writeSegmentPositions(
  endpoints: Uint32Array,
  nodePositions: Float32Array,
  out: Float32Array,
): void {
  for (let i = 0, j = 0; i < endpoints.length; i += 2, j += 4) {
    const a = endpoints[i] * 2;
    const b = endpoints[i + 1] * 2;
    out[j] = nodePositions[a];
    out[j + 1] = nodePositions[a + 1];
    out[j + 2] = nodePositions[b];
    out[j + 3] = nodePositions[b + 1];
  }
}

export interface EdgeMeshField {
  /** One mesh per tier, in tier order — add these to the world container. */
  meshes: Mesh[];
  /** Total line segments across all tiers. */
  segmentCount: number;
  /** Re-upload all segment positions from the node-position array. */
  update(nodePositions: Float32Array): void;
}

export function createEdgeMeshField(
  edges: readonly CorpusEdge[],
  nodeIndex: ReadonlyMap<string, number>,
  tierColors: readonly number[],
  alpha = 0.35,
): EdgeMeshField {
  const perTier = partitionEdgesByTier(edges, nodeIndex, tierColors.length);
  const fields = perTier.map((endpoints, tier) => {
    const segments = endpoints.length / 2;
    const positions = new Float32Array(segments * 4);
    // All vertices sample the white texel at (0,0); tint carries tier color.
    const uvs = new Float32Array(segments * 4);
    const indices = new Uint32Array(segments * 2);
    for (let i = 0; i < indices.length; i++) indices[i] = i;
    const geometry = new MeshGeometry({
      positions,
      uvs,
      indices,
      topology: "line-list",
    });
    const mesh = new Mesh({ geometry, texture: Texture.WHITE });
    mesh.tint = tierColors[tier];
    mesh.alpha = alpha;
    return { endpoints, positions, geometry, mesh };
  });

  return {
    meshes: fields.map((f) => f.mesh),
    segmentCount: fields.reduce((s, f) => s + f.endpoints.length / 2, 0),
    update(nodePositions: Float32Array) {
      for (const f of fields) {
        writeSegmentPositions(f.endpoints, nodePositions, f.positions);
        f.geometry.getBuffer("aPosition").update();
      }
    },
  };
}
