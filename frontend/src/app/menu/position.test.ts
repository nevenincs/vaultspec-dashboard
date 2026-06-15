// Menu flip/clamp positioning (W01.P03): pure geometry, no DOM.

import { describe, expect, it } from "vitest";

import { computeMenuPosition } from "./position";

const VP = { width: 1000, height: 800 };
const SIZE = { width: 200, height: 300 };

describe("computeMenuPosition", () => {
  it("opens down-right of the anchor when it fits", () => {
    expect(computeMenuPosition({ x: 100, y: 100 }, SIZE, VP)).toEqual({
      x: 100,
      y: 100,
    });
  });

  it("flips left when the right edge would overflow", () => {
    const pos = computeMenuPosition({ x: 950, y: 100 }, SIZE, VP);
    expect(pos.x).toBe(950 - SIZE.width);
    expect(pos.y).toBe(100);
  });

  it("flips up when the bottom edge would overflow", () => {
    const pos = computeMenuPosition({ x: 100, y: 700 }, SIZE, VP);
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(700 - SIZE.height);
  });

  it("pins to the top margin when the menu is taller than the viewport (host scrolls)", () => {
    const tall = { width: 200, height: 900 };
    const pos = computeMenuPosition({ x: 100, y: 400 }, tall, VP);
    // Cannot fit below or above the anchor: clamp to the top margin and never
    // off-screen; the host's max-height gives the overflow an internal scroll.
    expect(pos.y).toBe(8);
  });

  it("never positions left of the edge margin", () => {
    const pos = computeMenuPosition({ x: 2, y: 100 }, SIZE, VP);
    expect(pos.x).toBeGreaterThanOrEqual(8);
  });
});
