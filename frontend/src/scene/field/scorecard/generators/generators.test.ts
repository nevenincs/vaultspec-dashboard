// Determinism + shape contract for the scorecard ground-truth generators
// (graph-viz-scorecard ADR, W01.P01.S06).
//
// The scorecard's whole gate rests on byte-reproducible fixtures (ADR
// "Determinism for CI"): if a generator drifts run-to-run, every metric scored
// against it is noise. This suite proves each generator emits IDENTICAL output
// across two fresh runs at a fixed seed (deep-equal), and that the planted ground
// truth is well-formed: the partition covers every node, the layered `layerOf` is
// monotone along every tree edge, and the blob vectors/labels are the declared
// dimensionality and length.

import { describe, expect, it } from "vitest";

import { makePrng, shuffle, stableTieBreak } from "../prng";
import { generateBlobs } from "./blobs";
import { generateLfr } from "./lfr";
import { generateLayeredDag, generateLayeredTree } from "./layered";
import { generateSbm } from "./sbm";

const SBM = { sizes: [12, 12, 12], pIntra: 0.4, pInter: 0.02, seed: 7 } as const;
const LFR = {
  n: 80,
  mu: 0.2,
  degExp: 2.5,
  minDegree: 2,
  maxDegree: 12,
  commExp: 1.5,
  minCommunity: 6,
  maxCommunity: 20,
  seed: 11,
} as const;
const TREE = { depth: 4, minFanout: 2, maxFanout: 3, seed: 13 } as const;
const DAG = {
  layers: 5,
  nodesPerLayer: 6,
  edgeProb: 0.25,
  maxSpan: 2,
  seed: 17,
} as const;
const BLOBS = {
  count: 120,
  dims: 8,
  clusters: 4,
  clusterStd: 0.6,
  seed: 19,
} as const;

describe("prng (mulberry32 + helpers)", () => {
  it("replays an identical stream from the same seed", () => {
    const a = makePrng(42);
    const b = makePrng(42);
    const seqA = Array.from({ length: 16 }, () => a.next());
    const seqB = Array.from({ length: 16 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces a different stream from a different seed", () => {
    const a = Array.from({ length: 8 }, makePrng(1).next);
    const b = Array.from({ length: 8 }, makePrng(2).next);
    expect(a).not.toEqual(b);
  });

  it("draws deterministic Gaussian samples that vary around the mean", () => {
    const a = makePrng(5);
    const b = makePrng(5);
    const seqA = Array.from({ length: 32 }, () => a.gaussian(0, 1));
    const seqB = Array.from({ length: 32 }, () => b.gaussian(0, 1));
    expect(seqA).toEqual(seqB);
    const mean = seqA.reduce((s, x) => s + x, 0) / seqA.length;
    expect(Math.abs(mean)).toBeLessThan(1); // roughly centred, not constant
    expect(new Set(seqA).size).toBeGreaterThan(1);
  });

  it("shuffles deterministically and preserves membership", () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const a = shuffle(input, makePrng(9));
    const b = shuffle(input, makePrng(9));
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(input);
    expect(a).not.toEqual(input); // actually permuted at this seed
  });

  it("breaks float ties by index", () => {
    const items = [
      { value: 1, index: 2 },
      { value: 1, index: 0 },
      { value: 0.5, index: 5 },
      { value: 1, index: 1 },
    ];
    const sorted = [...items].sort(stableTieBreak);
    expect(sorted.map((i) => i.index)).toEqual([5, 0, 1, 2]);
  });
});

describe("generator determinism (byte-reproducible across runs)", () => {
  it("SBM reproduces identically", () => {
    expect(generateSbm({ ...SBM })).toEqual(generateSbm({ ...SBM }));
  });

  it("LFR reproduces identically", () => {
    expect(generateLfr({ ...LFR })).toEqual(generateLfr({ ...LFR }));
  });

  it("layered tree reproduces identically", () => {
    expect(generateLayeredTree({ ...TREE })).toEqual(generateLayeredTree({ ...TREE }));
  });

  it("layered DAG reproduces identically", () => {
    expect(generateLayeredDag({ ...DAG })).toEqual(generateLayeredDag({ ...DAG }));
  });

  it("blobs reproduce identically", () => {
    expect(generateBlobs({ ...BLOBS })).toEqual(generateBlobs({ ...BLOBS }));
  });

  it("a different seed yields a different SBM graph", () => {
    const a = generateSbm({ ...SBM });
    const b = generateSbm({ ...SBM, seed: SBM.seed + 1 });
    expect(a.edges).not.toEqual(b.edges);
  });
});

describe("SBM shape sanity", () => {
  const fixture = generateSbm({ ...SBM });

  it("partition covers every node with a valid block index", () => {
    expect(fixture.partition.size).toBe(fixture.nodes.length);
    expect(fixture.nodes.length).toBe(SBM.sizes.reduce((s, x) => s + x, 0));
    for (const node of fixture.nodes) {
      const block = fixture.partition.get(node.id);
      expect(block).toBeGreaterThanOrEqual(0);
      expect(block).toBeLessThan(SBM.sizes.length);
    }
  });

  it("edges reference only known nodes and carry no self-loops", () => {
    const ids = new Set(fixture.nodes.map((n) => n.id));
    for (const e of fixture.edges) {
      expect(ids.has(e.src)).toBe(true);
      expect(ids.has(e.dst)).toBe(true);
      expect(e.src).not.toBe(e.dst);
    }
  });

  it("plants more intra-community than inter-community edges", () => {
    let intra = 0;
    let inter = 0;
    for (const e of fixture.edges) {
      const sameBlock = fixture.partition.get(e.src) === fixture.partition.get(e.dst);
      if (sameBlock) intra++;
      else inter++;
    }
    expect(intra).toBeGreaterThan(inter);
  });
});

describe("LFR shape sanity", () => {
  const fixture = generateLfr({ ...LFR });

  it("partition covers every node", () => {
    expect(fixture.partition.size).toBe(fixture.nodes.length);
    expect(fixture.nodes.length).toBe(LFR.n);
  });

  it("edges reference only known nodes, no self-loops, no duplicates", () => {
    const ids = new Set(fixture.nodes.map((n) => n.id));
    const seen = new Set<string>();
    for (const e of fixture.edges) {
      expect(ids.has(e.src)).toBe(true);
      expect(ids.has(e.dst)).toBe(true);
      expect(e.src).not.toBe(e.dst);
      const key = [e.src, e.dst].sort().join("|");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("plants a community signal (more intra than inter edges at low mu)", () => {
    let intra = 0;
    let inter = 0;
    for (const e of fixture.edges) {
      if (fixture.partition.get(e.src) === fixture.partition.get(e.dst)) intra++;
      else inter++;
    }
    expect(intra).toBeGreaterThan(inter);
  });
});

describe("layered tree shape sanity", () => {
  const fixture = generateLayeredTree({ ...TREE });

  it("layerOf covers every node and the root is layer 0", () => {
    expect(fixture.layerOf.size).toBe(fixture.nodes.length);
    expect(fixture.layerOf.get(fixture.root)).toBe(0);
  });

  it("every tree edge increases depth by exactly one (monotone layering)", () => {
    for (const e of fixture.edges) {
      const ls = fixture.layerOf.get(e.src);
      const ld = fixture.layerOf.get(e.dst);
      expect(ls).not.toBeUndefined();
      expect(ld).not.toBeUndefined();
      expect((ld as number) - (ls as number)).toBe(1);
    }
  });

  it("every non-root node has exactly one parent edge (true tree)", () => {
    const inDegree = new Map<string, number>();
    for (const e of fixture.edges) {
      inDegree.set(e.dst, (inDegree.get(e.dst) ?? 0) + 1);
    }
    for (const node of fixture.nodes) {
      if (node.id === fixture.root) {
        expect(inDegree.get(node.id) ?? 0).toBe(0);
      } else {
        expect(inDegree.get(node.id)).toBe(1);
      }
    }
  });
});

describe("layered DAG shape sanity", () => {
  const fixture = generateLayeredDag({ ...DAG });

  it("layerOf covers every node across the declared layers", () => {
    expect(fixture.layerOf.size).toBe(fixture.nodes.length);
    expect(fixture.nodes.length).toBe(DAG.layers * DAG.nodesPerLayer);
  });

  it("every edge runs strictly downward (lower layer to higher)", () => {
    for (const e of fixture.edges) {
      const ls = fixture.layerOf.get(e.src) as number;
      const ld = fixture.layerOf.get(e.dst) as number;
      expect(ld).toBeGreaterThan(ls);
      expect(ld - ls).toBeLessThanOrEqual(DAG.maxSpan);
    }
  });

  it("every non-source node has at least one incoming edge", () => {
    const hasIncoming = new Set(fixture.edges.map((e) => e.dst));
    for (const node of fixture.nodes) {
      if (fixture.layerOf.get(node.id) === 0) continue;
      expect(hasIncoming.has(node.id)).toBe(true);
    }
  });
});

describe("blobs shape sanity", () => {
  const fixture = generateBlobs({ ...BLOBS });

  it("emits count vectors of the declared dimensionality with labels", () => {
    expect(fixture.vectors.length).toBe(BLOBS.count);
    expect(fixture.labels.length).toBe(BLOBS.count);
    for (const v of fixture.vectors) {
      expect(v.length).toBe(BLOBS.dims);
      for (const x of v) expect(Number.isFinite(x)).toBe(true);
    }
  });

  it("labels are valid cluster indices covering every declared cluster", () => {
    const used = new Set(fixture.labels);
    expect(used.size).toBe(BLOBS.clusters);
    for (const l of fixture.labels) {
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThan(BLOBS.clusters);
    }
  });
});
