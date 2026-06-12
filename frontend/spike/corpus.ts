// Synthetic vault-like corpus for the renderer spike (gui-spec §6.1).
// Deterministic (seeded PRNG) so runs are comparable; preferential
// attachment gives the scale-free degree distribution ForceAtlas2 is
// designed for (Jacomy et al. 2014).

export interface CorpusNode {
  id: string;
  /** 0..5 — maps to the six doc-type glyph slots + feature. */
  kind: number;
}

export interface CorpusEdge {
  source: string;
  target: string;
  /** 0..3 — the four provenance tiers, for line-treatment variety. */
  tier: number;
}

export interface Corpus {
  nodes: CorpusNode[];
  edges: CorpusEdge[];
}

/** mulberry32 — tiny deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a synthetic corpus with `nodeCount` nodes and ~`edgeCount` edges.
 * Preferential attachment: early nodes accumulate degree, like feature
 * convergences do.
 */
export function generateCorpus(
  nodeCount: number,
  edgeCount: number,
  seed = 42,
): Corpus {
  const rand = mulberry32(seed);
  const nodes: CorpusNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({ id: `n${i}`, kind: i % 6 });
  }

  const edges: CorpusEdge[] = [];
  const seen = new Set<string>();
  // Power-biased endpoint pick: rand()^2 skews toward low indices.
  const pick = () => Math.floor(rand() ** 2 * nodeCount);
  let attempts = 0;
  while (edges.length < edgeCount && attempts < edgeCount * 20) {
    attempts++;
    const a = pick();
    const b = Math.floor(rand() * nodeCount);
    if (a === b) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      source: `n${a}`,
      target: `n${b}`,
      tier: Math.floor(rand() * 4),
    });
  }
  return { nodes, edges };
}
