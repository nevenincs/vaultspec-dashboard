// A compact, deterministic SVG-mark rasterizer for the 14px grayscale gate
// (`markGate.ts`). The gate must reproduce what the eye sees — ink vs paper at
// each cell — so it can tell a solid disc from a hollow ring, or a plus from a
// pair of lines, at the legibility floor. Pixi's `containsPoint` cannot: it
// tests geometric fill containment and flattens a ring's hole into a solid
// mass, so two marks that differ only in their interior register as identical.
// happy-dom ships no 2D-canvas rasterizer, so we paint coverage in pure JS.
//
// Scope is exactly the SVG the domain-mark family uses: `<path d>` (M/m, L/l,
// H/h, V/v, C/c, S/s, Q/q, T/t, A/a, Z/z), `<circle>`, `<rect>`, with
// `fill="currentColor"`/`fill="none"`, `fill-rule` (nonzero default,
// evenodd), and stroked outlines (`stroke`, `stroke-width`). Curves and arcs
// are flattened to polylines at a fixed density; fills use winding-rule
// point-in-contour, strokes use distance-to-polyline within half the stroke
// width. The output is a binary ink bitmap over the mark's 256 grid.

interface SubPath {
  /** Flattened polyline points (x,y interleaved) on the 256 grid. */
  readonly points: number[];
  readonly closed: boolean;
}

interface ShapeInk {
  readonly subpaths: SubPath[];
  readonly fill: boolean;
  readonly fillRule: "nonzero" | "evenodd";
  readonly strokeWidth: number; // 0 = no stroke
}

const CURVE_STEPS = 12;
const ARC_STEPS = 24;

// --- path `d` flattening ------------------------------------------------------

function tokenizeD(d: string): Array<string | number> {
  const out: Array<string | number> = [];
  const re = /([astvzlhmcq])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    out.push(m[1] !== undefined ? m[1] : parseFloat(m[2]));
  }
  return out;
}

function quad(
  pts: number[],
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
): void {
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    pts.push(
      u * u * x0 + 2 * u * t * cx + t * t * x1,
      u * u * y0 + 2 * u * t * cy + t * t * y1,
    );
  }
}

function cubic(
  pts: number[],
  x0: number,
  y0: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x1: number,
  y1: number,
): void {
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    pts.push(
      u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x1,
      u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1,
    );
  }
}

// Endpoint-parameterized arc → polyline (SVG arc spec, simplified for r>0).
function arc(
  pts: number[],
  x0: number,
  y0: number,
  rx: number,
  ry: number,
  phi: number,
  large: number,
  sweep: number,
  x1: number,
  y1: number,
): void {
  if (rx === 0 || ry === 0) {
    pts.push(x1, y1);
    return;
  }
  const cosP = Math.cos((phi * Math.PI) / 180);
  const sinP = Math.sin((phi * Math.PI) / 180);
  const dx = (x0 - x1) / 2;
  const dy = (y0 - y1) / 2;
  const x1p = cosP * dx + sinP * dy;
  const y1p = -sinP * dx + cosP * dy;
  let rxs = rx * rx;
  let rys = ry * ry;
  const x1ps = x1p * x1p;
  const y1ps = y1p * y1p;
  const lambda = x1ps / rxs + y1ps / rys;
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
    rxs = rx * rx;
    rys = ry * ry;
  }
  const sign = large === sweep ? -1 : 1;
  const num = rxs * rys - rxs * y1ps - rys * x1ps;
  const den = rxs * y1ps + rys * x1ps;
  const co = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * (rx * y1p)) / ry;
  const cyp = (co * -(ry * x1p)) / rx;
  const cx = cosP * cxp - sinP * cyp + (x0 + x1) / 2;
  const cy = sinP * cxp + cosP * cyp + (y0 + y1) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = ang(
    (x1p - cxp) / rx,
    (y1p - cyp) / ry,
    (-x1p - cxp) / rx,
    (-y1p - cyp) / ry,
  );
  if (sweep === 0 && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep === 1 && dTheta < 0) dTheta += 2 * Math.PI;
  for (let i = 1; i <= ARC_STEPS; i++) {
    const t = theta1 + (dTheta * i) / ARC_STEPS;
    const ex = cosP * rx * Math.cos(t) - sinP * ry * Math.sin(t) + cx;
    const ey = sinP * rx * Math.cos(t) + cosP * ry * Math.sin(t) + cy;
    pts.push(ex, ey);
  }
}

/** Flatten a path `d` string into closed/open polyline subpaths. */
export function flattenPath(d: string): SubPath[] {
  const tok = tokenizeD(d);
  const subs: SubPath[] = [];
  let pts: number[] = [];
  let closed = false;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let prevCtrlX = 0;
  let prevCtrlY = 0;
  let i = 0;
  let cmd = "";
  const flush = (): void => {
    if (pts.length >= 4) subs.push({ points: pts, closed });
    pts = [];
    closed = false;
  };
  const num = (): number => tok[i++] as number;
  while (i < tok.length) {
    if (typeof tok[i] === "string") cmd = tok[i++] as string;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    switch (C) {
      case "M": {
        flush();
        cx = (rel ? cx : 0) + num();
        cy = (rel ? cy : 0) + num();
        startX = cx;
        startY = cy;
        pts.push(cx, cy);
        cmd = rel ? "l" : "L";
        break;
      }
      case "L": {
        cx = (rel ? cx : 0) + num();
        cy = (rel ? cy : 0) + num();
        pts.push(cx, cy);
        break;
      }
      case "H": {
        cx = (rel ? cx : 0) + num();
        pts.push(cx, cy);
        break;
      }
      case "V": {
        cy = (rel ? cy : 0) + num();
        pts.push(cx, cy);
        break;
      }
      case "C": {
        const c1x = (rel ? cx : 0) + num();
        const c1y = (rel ? cy : 0) + num();
        const c2x = (rel ? cx : 0) + num();
        const c2y = (rel ? cy : 0) + num();
        const ex = (rel ? cx : 0) + num();
        const ey = (rel ? cy : 0) + num();
        cubic(pts, cx, cy, c1x, c1y, c2x, c2y, ex, ey);
        prevCtrlX = c2x;
        prevCtrlY = c2y;
        cx = ex;
        cy = ey;
        break;
      }
      case "S": {
        const c1x = 2 * cx - prevCtrlX;
        const c1y = 2 * cy - prevCtrlY;
        const c2x = (rel ? cx : 0) + num();
        const c2y = (rel ? cy : 0) + num();
        const ex = (rel ? cx : 0) + num();
        const ey = (rel ? cy : 0) + num();
        cubic(pts, cx, cy, c1x, c1y, c2x, c2y, ex, ey);
        prevCtrlX = c2x;
        prevCtrlY = c2y;
        cx = ex;
        cy = ey;
        break;
      }
      case "Q": {
        const qx = (rel ? cx : 0) + num();
        const qy = (rel ? cy : 0) + num();
        const ex = (rel ? cx : 0) + num();
        const ey = (rel ? cy : 0) + num();
        quad(pts, cx, cy, qx, qy, ex, ey);
        prevCtrlX = qx;
        prevCtrlY = qy;
        cx = ex;
        cy = ey;
        break;
      }
      case "T": {
        const qx = 2 * cx - prevCtrlX;
        const qy = 2 * cy - prevCtrlY;
        const ex = (rel ? cx : 0) + num();
        const ey = (rel ? cy : 0) + num();
        quad(pts, cx, cy, qx, qy, ex, ey);
        prevCtrlX = qx;
        prevCtrlY = qy;
        cx = ex;
        cy = ey;
        break;
      }
      case "A": {
        const rx = num();
        const ry = num();
        const phi = num();
        const large = num();
        const sweep = num();
        const ex = (rel ? cx : 0) + num();
        const ey = (rel ? cy : 0) + num();
        arc(pts, cx, cy, rx, ry, phi, large, sweep, ex, ey);
        cx = ex;
        cy = ey;
        break;
      }
      case "Z": {
        closed = true;
        cx = startX;
        cy = startY;
        flush();
        break;
      }
      default:
        i++; // skip unknown token defensively
    }
    if (C !== "C" && C !== "S" && C !== "Q" && C !== "T") {
      prevCtrlX = cx;
      prevCtrlY = cy;
    }
  }
  flush();
  return subs;
}

// --- coverage tests -----------------------------------------------------------

/** Winding number of a point against all closed subpaths (nonzero rule). */
function windingNumber(px: number, py: number, subs: SubPath[]): number {
  let wn = 0;
  for (const sub of subs) {
    const p = sub.points;
    const n = p.length / 2;
    for (let k = 0; k < n; k++) {
      const ax = p[k * 2];
      const ay = p[k * 2 + 1];
      const bx = p[((k + 1) % n) * 2];
      const by = p[((k + 1) % n) * 2 + 1];
      if (ay <= py) {
        if (by > py && (bx - ax) * (py - ay) - (px - ax) * (by - ay) > 0) wn++;
      } else if (by <= py && (bx - ax) * (py - ay) - (px - ax) * (by - ay) < 0) {
        wn--;
      }
    }
  }
  return wn;
}

function crossings(px: number, py: number, subs: SubPath[]): number {
  let c = 0;
  for (const sub of subs) {
    const p = sub.points;
    const n = p.length / 2;
    for (let k = 0, j = n - 1; k < n; j = k++) {
      const xi = p[k * 2];
      const yi = p[k * 2 + 1];
      const xj = p[j * 2];
      const yj = p[j * 2 + 1];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c++;
    }
  }
  return c;
}

function distToSubpaths(px: number, py: number, subs: SubPath[]): number {
  let best = Infinity;
  for (const sub of subs) {
    const p = sub.points;
    const segs = sub.closed ? p.length / 2 : p.length / 2 - 1;
    const n = p.length / 2;
    for (let k = 0; k < segs; k++) {
      const ax = p[k * 2];
      const ay = p[k * 2 + 1];
      const bx = p[((k + 1) % n) * 2];
      const by = p[((k + 1) % n) * 2 + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      best = Math.min(best, Math.hypot(px - (ax + dx * t), py - (ay + dy * t)));
    }
  }
  return best;
}

/** True where a shape inks the point (fill winding OR within stroke band). */
function inkedBy(px: number, py: number, shape: ShapeInk): boolean {
  if (shape.fill) {
    const inside =
      shape.fillRule === "evenodd"
        ? crossings(px, py, shape.subpaths) % 2 === 1
        : windingNumber(px, py, shape.subpaths) !== 0;
    if (inside) return true;
  }
  if (shape.strokeWidth > 0) {
    if (distToSubpaths(px, py, shape.subpaths) <= shape.strokeWidth / 2) return true;
  }
  return false;
}

// --- SVG body → shapes --------------------------------------------------------

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*=\\s*"([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

function numAttr(tag: string, name: string, fallback: number): number {
  const v = attr(tag, name);
  const n = v === null ? NaN : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function shapeFrom(
  tag: string,
  subpaths: SubPath[],
  inheritedStroke: number,
  inheritedFill: string | null,
): ShapeInk {
  const fillAttr = attr(tag, "fill") ?? inheritedFill;
  const ownStroke = attr(tag, "stroke");
  // A shape strokes when it carries its own stroke, or inherits a stroking
  // group's width and does not explicitly opt out (`stroke="none"`).
  let strokeWidth = 0;
  if (ownStroke && ownStroke !== "none") {
    strokeWidth = numAttr(tag, "stroke-width", inheritedStroke || 1);
  } else if (ownStroke === null && inheritedStroke > 0) {
    strokeWidth = numAttr(tag, "stroke-width", inheritedStroke);
  }
  const fillRule = attr(tag, "fill-rule") === "evenodd" ? "evenodd" : "nonzero";
  return {
    subpaths,
    fill: fillAttr !== null && fillAttr !== "none",
    fillRule,
    strokeWidth,
  };
}

function circleSubpath(cx: number, cy: number, r: number): SubPath {
  const pts: number[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return { points: pts, closed: true };
}

function rectSubpath(x: number, y: number, w: number, h: number): SubPath {
  return { points: [x, y, x + w, y, x + w, y + h, x, y + h], closed: true };
}

/**
 * Parse a mark body (the project's own authored/adopted SVG, no untrusted
 * input) into ink shapes. Honors a parent `<g>`'s inherited `stroke-width` and
 * `fill` so grouped authored marks (the semantic tier waves) rasterize.
 */
export function shapesFromBody(body: string): ShapeInk[] {
  const shapes: ShapeInk[] = [];
  let inheritedStroke = 0;
  let inheritedFill: string | null = null;
  const tagRe = /<(g|path|circle|rect)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(body)) !== null) {
    const name = m[1].toLowerCase();
    const tag = m[0];
    if (name === "g") {
      const sw = attr(tag, "stroke");
      inheritedStroke =
        sw && sw !== "none" ? numAttr(tag, "stroke-width", 1) : inheritedStroke;
      inheritedFill = attr(tag, "fill") ?? inheritedFill;
      continue;
    }
    if (name === "path") {
      const d = attr(tag, "d");
      if (!d) continue;
      shapes.push(shapeFrom(tag, flattenPath(d), inheritedStroke, inheritedFill));
    } else if (name === "circle") {
      const sp = circleSubpath(
        numAttr(tag, "cx", 0),
        numAttr(tag, "cy", 0),
        numAttr(tag, "r", 0),
      );
      shapes.push(shapeFrom(tag, [sp], inheritedStroke, inheritedFill));
    } else if (name === "rect") {
      const sp = rectSubpath(
        numAttr(tag, "x", 0),
        numAttr(tag, "y", 0),
        numAttr(tag, "width", 0),
        numAttr(tag, "height", 0),
      );
      shapes.push(shapeFrom(tag, [sp], inheritedStroke, inheritedFill));
    }
  }
  return shapes;
}

/**
 * Rasterize a mark body to a `size`×`size` ink bitmap over the full 256 grid
 * (NOT fit-to-bounds), so interior structure — a ring's hole, a plus, a pair
 * of lines — registers as the eye sees it. Row-major, true where any shape
 * inks the cell center.
 */
export function rasterizeBody(body: string, size: number, grid = 256): boolean[] {
  const shapes = shapesFromBody(body);
  const out: boolean[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = ((x + 0.5) / size) * grid;
      const py = ((y + 0.5) / size) * grid;
      let inked = false;
      for (const shape of shapes) {
        if (inkedBy(px, py, shape)) {
          inked = true;
          break;
        }
      }
      out.push(inked);
    }
  }
  return out;
}
