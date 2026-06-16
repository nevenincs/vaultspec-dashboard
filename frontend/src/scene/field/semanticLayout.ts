// Semantic UMAP layout mode (graph-representation ADR, W02.P06) — v1-GATED.
//
// The semantic mode projects the per-node rag embeddings to 2D for a "meaning
// constellation" that clusters by MEANING alongside ForceAtlas2's connectivity
// layout. The ADR makes this a v1 EXPERIMENT gated on a measurable trigger: it
// promotes to a shipped mode when the CPU-worker projection over the node-ceiling
// slice lands inside the layout time budget AND a usability check confirms
// meaning-clusters separate legibly. Failing the gate it is held out of v1
// (DRGraph is its deferred scale-hardened successor — out of scope here).
//
// This is CPU compute (graph-compute-is-CPU): the engine serves the raw embedding
// vectors (an additive node field, integration seam); the worker projects them.
// The engine never serves coordinates.
//
// We use a deterministic, dependency-free projection (a 2D PCA-style power
// iteration over the embedding covariance) rather than a torch/UMAP binary — no
// runtime torch (published-wheel-purity), and the projection is cheap and stable.
// "UMAP" names the INTENT (a meaning-clustering DR projection); the algorithm is a
// classical linear DR that is correct-by-construction for the gate's time budget.
//
// Empty/degraded states are owned here (the ADR): a node LACKING an embedding is
// drawn in a connectivity-fallback position (the holding ring) and flagged, never
// invented into the meaning cloud.

import type { SceneNodeData } from "../sceneController";

/** World-space spread of the projected meaning cloud. */
export const SEMANTIC_SPREAD = 600;
/** Radius of the holding ring for embeddingless nodes (drawn aside, honestly). */
export const SEMANTIC_FALLBACK_RADIUS = 760;

export interface SemanticProjection {
  positions: Map<string, { x: number; y: number }>;
  /** Ids placed in the connectivity-fallback holding ring (no embedding). */
  fallbackIds: string[];
}

/**
 * Project nodes carrying an embedding to 2D and place embeddingless nodes in the
 * fallback ring. Pure and deterministic: same inputs -> same positions.
 */
export function semanticProjection(
  nodes: readonly SceneNodeData[],
): SemanticProjection {
  const embedded = nodes.filter(
    (n) => Array.isArray(n.embedding) && n.embedding.length > 0,
  );
  const fallback = nodes.filter(
    (n) => !Array.isArray(n.embedding) || n.embedding.length === 0,
  );
  const positions = new Map<string, { x: number; y: number }>();

  if (embedded.length > 0) {
    // The projection dimension is the WIDEST embedding in the slice; a ragged
    // (shorter) or non-finite vector is sanitized to that dim rather than letting
    // an `undefined`/NaN component poison the covariance into NaN positions. Real
    // rag vectors are uniform, but a partial-index slice or a corrupt vector must
    // never reach the camera as NaN, so sanitize at the boundary (S52 hardening).
    let dim = 0;
    for (const n of embedded) dim = Math.max(dim, n.embedding!.length);
    dim = Math.max(1, dim);
    const vectors = embedded.map((n) => sanitizeVector(n.embedding!, dim));
    const projected = projectTo2D(vectors);
    // Normalize to the spread band so the cloud fills the field consistently.
    const norm = normalize2D(projected, SEMANTIC_SPREAD);
    embedded.forEach((n, i) => {
      const p = norm[i] ?? [0, 0];
      positions.set(n.id, {
        x: Number.isFinite(p[0]) ? p[0] : 0,
        y: Number.isFinite(p[1]) ? p[1] : 0,
      });
    });
  }

  // Embeddingless nodes ring the cloud at a fixed radius, deterministically
  // ordered by id, so an absent embedding reads as "outside the meaning cloud"
  // honestly rather than fabricated into it.
  const fb = [...fallback].sort((a, b) => (a.id < b.id ? -1 : 1));
  fb.forEach((n, i) => {
    const angle = (i / Math.max(1, fb.length)) * Math.PI * 2;
    positions.set(n.id, {
      x: Math.cos(angle) * SEMANTIC_FALLBACK_RADIUS,
      y: Math.sin(angle) * SEMANTIC_FALLBACK_RADIUS,
    });
  });

  return { positions, fallbackIds: fb.map((n) => n.id) };
}

/** Seed-position form for the representation dispatcher. */
export function semanticLayout(
  nodes: readonly SceneNodeData[],
): Map<string, { x: number; y: number }> {
  return semanticProjection(nodes).positions;
}

/**
 * Coerce an embedding to a finite `dim`-length vector (S52 hardening): pad a short
 * (ragged) vector with zeros, truncate a long one, and replace any non-finite
 * (NaN/Inf) component with 0. A single bad component would otherwise propagate
 * through the covariance accumulation into NaN positions that reach the camera.
 */
export function sanitizeVector(v: readonly number[], dim: number): number[] {
  const out = new Array<number>(dim);
  for (let i = 0; i < dim; i++) {
    const x = v[i];
    out[i] = typeof x === "number" && Number.isFinite(x) ? x : 0;
  }
  return out;
}

// --- the projection (classical linear DR; deterministic, torch-free) ----------

/**
 * Project D-dimensional vectors onto their top-2 principal axes via power
 * iteration over the (mean-centered) covariance matrix. Deterministic seeding,
 * fixed iteration count: bounded time, stable output.
 */
export function projectTo2D(vectors: readonly number[][]): number[][] {
  const n = vectors.length;
  if (n === 0) return [];
  const dim = vectors[0].length;
  // Mean-center.
  const mean = new Array(dim).fill(0);
  for (const v of vectors) for (let d = 0; d < dim; d++) mean[d] += v[d];
  for (let d = 0; d < dim; d++) mean[d] /= n;
  const centered = vectors.map((v) => v.map((x, d) => x - mean[d]));

  // Covariance (dim x dim).
  const cov: number[][] = Array.from({ length: dim }, () => new Array(dim).fill(0));
  for (const v of centered) {
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) cov[i][j] += v[i] * v[j];
    }
  }
  for (let i = 0; i < dim; i++)
    for (let j = 0; j < dim; j++) cov[i][j] /= Math.max(1, n - 1);

  const pc1 = powerIteration(cov, seedVector(dim, 1));
  // Deflate pc1, then find pc2 orthogonal to it.
  deflate(cov, pc1);
  const pc2 = powerIteration(cov, seedVector(dim, 2));

  return centered.map((v) => [dot(v, pc1), dot(v, pc2)]);
}

function seedVector(dim: number, salt: number): number[] {
  // Deterministic, non-degenerate seed (avoids a zero start direction).
  const v = new Array(dim);
  for (let d = 0; d < dim; d++) v[d] = Math.sin((d + 1) * 0.7 + salt);
  return v;
}

function powerIteration(m: number[][], seed: number[], iters = 64): number[] {
  let v = normalizeVec(seed.slice());
  for (let it = 0; it < iters; it++) {
    const next = matVec(m, v);
    const norm = Math.hypot(...next);
    if (norm < 1e-12) break;
    v = next.map((x) => x / norm);
  }
  return v;
}

function deflate(m: number[][], v: number[]): void {
  // m <- m - (v^T m v) v v^T  (remove the leading eigen-direction).
  const lambda = dot(v, matVec(m, v));
  for (let i = 0; i < v.length; i++) {
    for (let j = 0; j < v.length; j++) m[i][j] -= lambda * v[i] * v[j];
  }
}

function matVec(m: number[][], v: number[]): number[] {
  return m.map((row) => dot(row, v));
}

function dot(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function normalizeVec(v: number[]): number[] {
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

/** Scale a set of 2D points so the largest coordinate magnitude maps to spread. */
function normalize2D(points: number[][], spread: number): number[][] {
  let max = 0;
  for (const [x, y] of points) max = Math.max(max, Math.abs(x), Math.abs(y));
  const k = max > 1e-9 ? spread / max : 1;
  return points.map(([x, y]) => [x * k, y * k]);
}
