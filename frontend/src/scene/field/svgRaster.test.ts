// Pure SVG-mark rasterizer (no DOM, no GPU) — the engine the 14px grayscale
// gate runs on. Tests assert the rasterizer reproduces ink coverage as the eye
// sees it: filled regions ink, hollow rings stay hollow, strokes ink their
// band. Expected values are derived from the geometry, never copied from a run.

import { describe, expect, it } from "vitest";

import { flattenPath, rasterizeBody, shapesFromBody } from "./svgRaster";

describe("flattenPath", () => {
  it("flattens a closed triangle into a polyline subpath", () => {
    const subs = flattenPath("M0 0 L100 0 L50 100 Z");
    expect(subs).toHaveLength(1);
    expect(subs[0].closed).toBe(true);
    // Three line vertices (M seeds the first point, two L add two more).
    expect(subs[0].points.length).toBeGreaterThanOrEqual(6);
  });

  it("resolves H and V into absolute line points", () => {
    const subs = flattenPath("M10 10 H50 V60 Z");
    const p = subs[0].points;
    // After H50 the point is (50,10); after V60 it is (50,60).
    expect(p.slice(0, 6)).toEqual([10, 10, 50, 10, 50, 60]);
  });

  it("samples a quadratic curve into multiple intermediate points", () => {
    const line = flattenPath("M0 0 L100 0");
    const curve = flattenPath("M0 0 Q50 100 100 0");
    expect(curve[0].points.length).toBeGreaterThan(line[0].points.length);
  });
});

describe("rasterizeBody — fills", () => {
  it("inks the interior of a full-grid filled square", () => {
    const body = '<path fill="currentColor" d="M0 0 H256 V256 H0 Z"/>';
    const cells = rasterizeBody(body, 8);
    expect(cells.every((c) => c)).toBe(true);
  });

  it("keeps the center of a stroked ring empty, inking only the band", () => {
    // The temporal tier's construction: a fill=none stroked circle. The center
    // must stay paper and the rim band must ink — the property a fill-
    // containment test loses by treating the ring as a solid disc.
    const body =
      '<circle cx="128" cy="128" r="90" fill="none" ' +
      'stroke="currentColor" stroke-width="24"/>';
    const size = 16;
    const cells = rasterizeBody(body, size);
    const center = Math.floor(size / 2) * size + Math.floor(size / 2);
    expect(cells[center]).toBe(false); // hollow center
    expect(cells.some((c) => c)).toBe(true); // the rim band inks
  });

  it("honors evenodd fill-rule for a square-with-hole", () => {
    const body =
      '<path fill="currentColor" fill-rule="evenodd" ' +
      'd="M40 40H216V216H40Z M88 88V168H168V88Z"/>';
    const size = 16;
    const cells = rasterizeBody(body, size);
    const center = Math.floor(size / 2) * size + Math.floor(size / 2);
    expect(cells[center]).toBe(false); // the inner square is the hole
  });
});

describe("rasterizeBody — strokes", () => {
  it("inks a stroke band but not the area away from the path", () => {
    const body =
      '<circle cx="128" cy="128" r="80" fill="none" ' +
      'stroke="currentColor" stroke-width="20"/>';
    const size = 16;
    const cells = rasterizeBody(body, size);
    const center = Math.floor(size / 2) * size + Math.floor(size / 2);
    expect(cells[center]).toBe(false); // hollow inside the stroked ring
    expect(cells.some((c) => c)).toBe(true); // the stroke band inks
  });

  it("inherits stroke-width from a parent <g>", () => {
    const grouped =
      '<g fill="none" stroke="currentColor" stroke-width="18">' +
      '<path d="M40 128 H216"/></g>';
    const bare = '<path fill="none" stroke="currentColor" d="M40 128 H216"/>';
    const groupedInk = rasterizeBody(grouped, 16).filter(Boolean).length;
    const bareInk = rasterizeBody(bare, 16).filter(Boolean).length;
    // The inherited 18-unit width inks a wider band than the 1-unit default.
    expect(groupedInk).toBeGreaterThan(bareInk);
  });
});

describe("shapesFromBody", () => {
  it("parses path, circle, and rect shapes from one body", () => {
    const body =
      '<path fill="currentColor" d="M0 0 H10 Z"/>' +
      '<circle cx="5" cy="5" r="3" fill="currentColor"/>' +
      '<rect x="1" y="1" width="4" height="4" fill="currentColor"/>';
    expect(shapesFromBody(body)).toHaveLength(3);
  });

  it("marks fill=none shapes as non-filling", () => {
    const body = '<path fill="none" stroke="currentColor" d="M0 0 H10"/>';
    const [shape] = shapesFromBody(body);
    expect(shape.fill).toBe(false);
    expect(shape.strokeWidth).toBeGreaterThan(0);
  });
});
