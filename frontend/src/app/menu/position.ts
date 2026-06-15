// Menu positioning (dashboard-context-menus ADR, layer 5): a pure flip/clamp so
// the floating menu always sits fully inside the viewport. Anchored at the
// pointer (right-click) or a focused row's edge (keyboard). If the menu would
// overflow the right/bottom edge it flips to open up/left of the anchor; if it
// still overflows (a menu taller/wider than the viewport) it clamps to the edge
// with a small margin. Pure and unit-tested - the host measures the rendered
// menu, then calls this to place it.

export interface Size {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Gap kept from the viewport edge when clamping. */
const EDGE_MARGIN = 8;

/**
 * Place a menu of `size` anchored at `anchor` inside `viewport`. Prefers
 * down-right of the anchor; flips to up/left when that side overflows; clamps to
 * the edge margin when even the flipped side overflows.
 */
export function computeMenuPosition(
  anchor: Point,
  size: Size,
  viewport: Viewport,
): Point {
  return {
    x: place(anchor.x, size.width, viewport.width),
    y: place(anchor.y, size.height, viewport.height),
  };
}

/** One-axis flip/clamp. */
function place(anchor: number, extent: number, bound: number): number {
  // Preferred: open from the anchor toward the positive edge.
  if (anchor + extent + EDGE_MARGIN <= bound) {
    return Math.max(EDGE_MARGIN, anchor);
  }
  // Flip: open from the anchor toward the negative edge.
  const flipped = anchor - extent;
  if (flipped >= EDGE_MARGIN) {
    return flipped;
  }
  // Clamp: the menu is larger than the available space either way.
  return Math.max(EDGE_MARGIN, bound - extent - EDGE_MARGIN);
}
