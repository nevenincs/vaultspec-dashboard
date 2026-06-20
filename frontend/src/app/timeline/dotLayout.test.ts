import { describe, expect, it } from "vitest";

import {
  COLUMN_WIDTH,
  type DotInput,
  computeDotGeometry,
  layoutDots,
} from "./dotLayout";

// A roomy geometry so the row budget is never the thing under test unless we make
// it so; centered axis at 100, generous lanes.
const GEOM = computeDotGeometry(200);

function input(id: string, x: number, group: 0 | 1 = 0): DotInput {
  return { id, x, group };
}

describe("computeDotGeometry", () => {
  it("centers the axis and gives each lane at least one row", () => {
    const g = computeDotGeometry(200);
    expect(g.axisY).toBe(100);
    expect(g.maxRowsAbove).toBeGreaterThanOrEqual(1);
    expect(g.maxRowsBelow).toBeGreaterThanOrEqual(1);
  });

  it("never collapses below a single row even on a degenerate height", () => {
    const g = computeDotGeometry(0);
    expect(g.maxRowsAbove).toBeGreaterThanOrEqual(1);
    expect(g.maxRowsBelow).toBeGreaterThanOrEqual(1);
  });

  it("grows the row budget as the chart gets taller", () => {
    const small = computeDotGeometry(140);
    const tall = computeDotGeometry(400);
    expect(tall.maxRowsAbove).toBeGreaterThan(small.maxRowsAbove);
  });
});

describe("layoutDots — individual, non-overlapping, timestamp-driven", () => {
  it("places sparse, well-separated dots each on row 0 at its own x", () => {
    const layout = layoutDots([input("a", 0), input("b", 200), input("c", 400)], GEOM);
    expect(layout.clusters).toHaveLength(0);
    expect(layout.dots.map((d) => d.row)).toEqual([0, 0, 0]);
    const byId = new Map(layout.dots.map((d) => [d.id, d]));
    expect(byId.get("a")!.x).toBe(0);
    expect(byId.get("b")!.x).toBe(200);
    expect(byId.get("c")!.x).toBe(400);
  });

  it("stacks same-x (same-day) dots into one vertical column, no overlap", () => {
    const layout = layoutDots([input("a", 50), input("b", 50), input("c", 50)], GEOM);
    expect(layout.clusters).toHaveLength(0);
    // All three share the column center x, occupy distinct rows, distinct y.
    expect(new Set(layout.dots.map((d) => d.x))).toEqual(new Set([50]));
    expect(layout.dots.map((d) => d.row).sort()).toEqual([0, 1, 2]);
    expect(new Set(layout.dots.map((d) => d.y)).size).toBe(3);
  });

  it("gathers near-date dots (within a column width) into one centered stack", () => {
    const layout = layoutDots(
      [input("a", 100), input("b", 100 + COLUMN_WIDTH - 1)],
      GEOM,
    );
    expect(layout.dots).toHaveLength(2);
    // Both snap to the column center (the mean of the two x).
    expect(new Set(layout.dots.map((d) => d.x)).size).toBe(1);
    expect(layout.dots.map((d) => d.row).sort()).toEqual([0, 1]);
  });

  it("keeps dots a full column-width apart as distinct row-0 columns", () => {
    const layout = layoutDots([input("a", 0), input("b", COLUMN_WIDTH)], GEOM);
    expect(layout.dots.every((d) => d.row === 0)).toBe(true);
    expect(new Set(layout.dots.map((d) => d.x)).size).toBe(2);
  });

  it("fans the design lane up and the execution lane down from the axis", () => {
    const layout = layoutDots([input("d", 0, 0), input("e", 0, 1)], GEOM);
    const design = layout.dots.find((d) => d.id === "d")!;
    const exec = layout.dots.find((d) => d.id === "e")!;
    expect(design.y).toBeLessThan(GEOM.axisY);
    expect(exec.y).toBeGreaterThan(GEOM.axisY);
  });
});

describe("layoutDots — dense-cluster overflow summarizes, never hides", () => {
  it("collapses an over-budget column into one chip naming the hidden ids", () => {
    const geom = computeDotGeometry(140); // small row budget
    const n = geom.maxRowsAbove + 6;
    const dense = Array.from({ length: n }, (_, i) =>
      input(`doc-${String(i).padStart(2, "0")}`, 30),
    );
    const layout = layoutDots(dense, geom);
    expect(layout.clusters).toHaveLength(1);
    const chip = layout.clusters[0];
    // Shown dots + chip overflow account for every input — none dropped.
    expect(layout.dots.length + chip.count).toBe(n);
    expect(chip.ids).toHaveLength(chip.count);
    // The tower never exceeds the budget.
    expect(layout.dots.length).toBeLessThanOrEqual(geom.maxRowsAbove - 1);
  });

  it("does not summarize a column that fits the budget exactly", () => {
    const geom = computeDotGeometry(140);
    const exact = Array.from({ length: geom.maxRowsAbove }, (_, i) =>
      input(`doc-${i}`, 10),
    );
    const layout = layoutDots(exact, geom);
    expect(layout.clusters).toHaveLength(0);
    expect(layout.dots).toHaveLength(geom.maxRowsAbove);
  });
});

describe("layoutDots — deterministic across rerenders", () => {
  it("produces byte-identical output for the same input regardless of input order", () => {
    const a = [input("c", 50), input("a", 50), input("b", 50), input("z", 300)];
    const b = [input("z", 300), input("b", 50), input("c", 50), input("a", 50)];
    expect(layoutDots(a, GEOM)).toEqual(layoutDots(b, GEOM));
  });

  it("assigns the same id the same row on repeat layouts", () => {
    const dots = [input("a", 0), input("b", 0), input("c", 0)];
    const first = layoutDots(dots, GEOM);
    const second = layoutDots(dots, GEOM);
    const rowOf = (l: typeof first, id: string) => l.dots.find((d) => d.id === id)!.row;
    for (const id of ["a", "b", "c"]) {
      expect(rowOf(first, id)).toBe(rowOf(second, id));
    }
    // Stacked by id: a below b below c (row 0,1,2).
    expect(rowOf(first, "a")).toBe(0);
    expect(rowOf(first, "b")).toBe(1);
    expect(rowOf(first, "c")).toBe(2);
  });
});
