import { describe, expect, it } from "vitest";

import {
  temporalClusterLayout,
  type TemporalClusterInput,
} from "./temporalClusterLayout";

const DAY = 24 * 60 * 60 * 1000;

function node(id: string, day: number, x: number): TemporalClusterInput {
  return { id, tMs: Date.UTC(2026, 5, day), x, lane: "design" };
}

describe("temporalClusterLayout", () => {
  it("keeps same-day documents as individual finite clustered positions", () => {
    const inputs = Array.from({ length: 20 }, (_, i) => node(`n${i}`, 17, 400));
    const result = temporalClusterLayout(inputs, { height: 240 });

    expect(result.positions.size).toBe(20);
    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0]).toMatchObject({ key: "2026-06-17", count: 20 });

    const unique = new Set<string>();
    for (const p of result.positions.values()) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      unique.add(`${p.x.toFixed(3)}:${p.y.toFixed(3)}`);
    }
    expect(unique.size).toBe(20);
  });

  it("is deterministic across input order and separates day buckets", () => {
    const inputs = [
      node("c", 18, 520),
      node("a", 17, 320),
      node("b", 17, 320),
      { ...node("d", 18, 520), tMs: Date.UTC(2026, 5, 18) + DAY / 2 },
    ];
    const first = temporalClusterLayout(inputs, { height: 240 });
    const second = temporalClusterLayout([...inputs].reverse(), { height: 240 });

    expect([...first.positions.entries()]).toEqual([...second.positions.entries()]);
    expect(first.buckets.map((bucket) => bucket.key)).toEqual([
      "2026-06-17",
      "2026-06-18",
    ]);
    expect(first.buckets[1]!.x).toBeGreaterThan(first.buckets[0]!.x);
  });
});
