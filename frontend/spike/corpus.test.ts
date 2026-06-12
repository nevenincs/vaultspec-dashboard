import { describe, expect, it } from "vitest";

import { generateCorpus } from "./corpus";

describe("synthetic corpus", () => {
  it("is deterministic for a given seed", () => {
    const a = generateCorpus(100, 300, 7);
    const b = generateCorpus(100, 300, 7);
    expect(a).toEqual(b);
  });

  it("produces the requested sizes without self-loops or duplicates", () => {
    const { nodes, edges } = generateCorpus(1000, 5000);
    expect(nodes).toHaveLength(1000);
    expect(edges).toHaveLength(5000);
    const keys = new Set(
      edges.map((e) =>
        e.source < e.target ? `${e.source}-${e.target}` : `${e.target}-${e.source}`,
      ),
    );
    expect(keys.size).toBe(edges.length);
    expect(edges.every((e) => e.source !== e.target)).toBe(true);
  });

  it("skews degree toward early nodes (scale-free-ish)", () => {
    const { edges } = generateCorpus(1000, 5000);
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    const early = [...degree.entries()]
      .filter(([id]) => Number(id.slice(1)) < 100)
      .reduce((sum, [, d]) => sum + d, 0);
    expect(early).toBeGreaterThan(edges.length * 0.4);
  });
});
