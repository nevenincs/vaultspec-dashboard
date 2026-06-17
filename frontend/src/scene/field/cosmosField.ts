// cosmos.gl-backed scene field — node-graph-rework ADR (D1/D2/D3).
//
// cosmos.gl runs as a PURE GPU point/line RENDERER: its own simulation is OFF
// (enableSimulation:false) and upload-rescale is OFF (rescalePositions:false), so
// it neither box-clamps positions to spaceSize (the "bounded rectangle") nor
// squeezes sparse content into a corner (the "corner cluster"). Node positions are
// owned EXTERNALLY — a static phyllotaxis disc here in Tier 1; the revived
// d3-force FieldLayout drives them live in Tier 4 — and pushed via
// setPointPositions(flat, /*dontRescale*/ true) + render().
//
// The canvas is FREE and CENTRED with a CONFIGURABLE containment (set-bounds):
// default a CIRCLE, with free and rect options and a settable size. cosmos has no
// radial bound, so the bound is enforced where positions are produced.
//
// Implements the frozen SceneFieldRenderer seam (mount/resize/destroy/command);
// the SceneController, every chrome surface, and the wire shape are unchanged.

import { Graph } from "@cosmos.gl/graph";

import type {
  SceneCommand,
  SceneController,
  SceneEdgeData,
  SceneFieldRenderer,
  SceneNodeData,
} from "../sceneController";
import { categoryColor } from "./categoryColor";
import { nodeRadius } from "./nodeSprites";
import { cssColorNumber } from "./tokenReads";

/** cosmos world-space size: sizes the position texture and the screen-mapping
 *  origin. With the sim OFF and rescale OFF this no longer BOUNDS positions (the
 *  layout bound does); SPACE_CENTRE maps to the viewport centre. */
const SPACE_SIZE = 8192;
const SPACE_CENTRE = SPACE_SIZE / 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Fallback node diameter when no per-node radius is known (auto-sizing a bound). */
const FALLBACK_DIAMETER = 68;

/** Configurable canvas/sim containment (node-graph-rework ADR D3). `size` is the
 *  radius (circle) or half-extent (rect) in world units; 0 means auto-fit so the
 *  static layout is non-overlapping for the node count. `free` is unbounded. */
export type BoundShape = "free" | "circle" | "rect";
export interface FieldBounds {
  shape: BoundShape;
  size: number;
}

const DEFAULT_BOUNDS: FieldBounds = { shape: "circle", size: 0 };

/** Auto disc radius that keeps a sunflower-packed disc of `count` nodes of max
 *  diameter `d` non-overlapping: spacing ~= R*sqrt(pi/count) >= d, so
 *  R >= d*sqrt(count/pi); the 1.12 factor is headroom against the approximation. */
function autoDiscRadius(count: number, d: number): number {
  if (count <= 1) return d;
  return d * Math.sqrt(count / Math.PI) * 1.12;
}

/** Hex int (0xRRGGBB) -> cosmos [r,g,b,a] floats in [0,1]. */
function rgba(hex: number): [number, number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, 1];
}

/** Scene token (literal hex int) -> "#rrggbb" string for cosmos string colours. */
function hexString(varName: string, fallback: number): string {
  return `#${cssColorNumber(varName, fallback).toString(16).padStart(6, "0")}`;
}

/**
 * Place `count` points as a centred phyllotaxis (sunflower) layout inside the
 * given bound, non-overlapping BY CONSTRUCTION. Returns a flat [x,y,...] array in
 * world space centred on SPACE_CENTRE. This is the Tier-1 STATIC placement (no
 * forces); Tier 4 replaces it with the live d3-force driver.
 */
function placeStatic(
  count: number,
  bounds: FieldBounds,
  maxDiameter: number,
): Float32Array {
  const out = new Float32Array(count * 2);
  if (count === 0) return out;
  const d = maxDiameter > 0 ? maxDiameter : FALLBACK_DIAMETER;
  if (bounds.shape === "rect") {
    // Square box: a centred grid with cell >= node diameter (auto) keeps it clear.
    const half = bounds.size > 0 ? bounds.size : autoDiscRadius(count, d) * 0.886;
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const step = (half * 2) / cols;
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      out[i * 2] = SPACE_CENTRE - half + (col + 0.5) * step;
      out[i * 2 + 1] = SPACE_CENTRE - half + (row + 0.5) * step;
    }
    return out;
  }
  // circle (default) or free: a sunflower spiral. circle caps the radius to fill a
  // disc; free uses a fixed spacing >= node diameter and grows unbounded.
  if (bounds.shape === "free") {
    for (let i = 0; i < count; i++) {
      const r = d * Math.sqrt(i);
      const a = i * GOLDEN_ANGLE;
      out[i * 2] = SPACE_CENTRE + Math.cos(a) * r;
      out[i * 2 + 1] = SPACE_CENTRE + Math.sin(a) * r;
    }
    return out;
  }
  const R = bounds.size > 0 ? bounds.size : autoDiscRadius(count, d);
  for (let i = 0; i < count; i++) {
    const r = R * Math.sqrt((i + 0.5) / count);
    const a = i * GOLDEN_ANGLE;
    out[i * 2] = SPACE_CENTRE + Math.cos(a) * r;
    out[i * 2 + 1] = SPACE_CENTRE + Math.sin(a) * r;
  }
  return out;
}

export class CosmosField implements SceneFieldRenderer {
  private graph: Graph | null = null;
  private container: HTMLDivElement | null = null;
  /** Stable id <-> cosmos point-index mapping (cosmos addresses points by index). */
  private idToIndex = new Map<string, number>();
  private indexToId: string[] = [];
  /** Active containment (node-graph-rework ADR D3); default circle, auto-sized. */
  private bounds: FieldBounds = { ...DEFAULT_BOUNDS };
  /** Largest node diameter in the current slice, for auto-sizing the bound on a
   *  later set-bounds without re-reading the node data. */
  private currentMaxDiameter = 0;
  /** Set by createDashboardScene; seam events (select/hover) flow back through it. */
  controller: SceneController | null = null;

  mount(host: HTMLElement): void {
    if (typeof document === "undefined") return; // SSR / node test env
    if (this.graph) return; // idempotent
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.inset = "0";
    container.style.width = "100%";
    container.style.height = "100%";
    host.appendChild(container);
    this.container = container;

    this.graph = new Graph(container, {
      backgroundColor: hexString("--color-canvas-bg", 0xfdfaf6),
      spaceSize: SPACE_SIZE,
      // cosmos is a PURE RENDERER (node-graph-rework ADR D1): its own GPU sim is
      // OFF so positions are never box-clamped to spaceSize, and upload-rescale is
      // OFF so sparse content is never squeezed into a corner. Both are init-only.
      // Positions are owned externally and pushed via setPointPositions(.., true).
      enableSimulation: false,
      rescalePositions: false,
      // ---- interaction (live) ---------------------------------------------
      enableDrag: true,
      fitViewOnInit: true,
      fitViewPadding: 0.25,
      // Node sizes are WORLD-relative (scale with zoom): a fixed pixel size piles
      // big dots on top of each other when a spread field is zoomed out to fit.
      scalePointsOnZoom: true,
      pointSizeScale: 2,
      renderHoveredPointRing: true,
      hoveredPointRingColor: hexString("--color-accent", 0x8a7d5a),
      // ---- edges: flat-grey connection mesh + focus ring ------------------
      // (per-link tier/confidence encoding lands in Tier 3.)
      linkColor: hexString("--color-scene-rule", 0xd8d2ca),
      linkWidth: 1,
      linkArrows: false,
      renderLinks: true,
      focusedPointRingColor: hexString("--color-accent", 0x8a7d5a),
      onClick: (index) => {
        const id = index === undefined ? null : (this.indexToId[index] ?? null);
        this.controller?.emit({ kind: "select", id });
      },
      onPointMouseOver: (index) => {
        this.controller?.emit({ kind: "hover", id: this.indexToId[index] ?? null });
      },
      onPointMouseOut: () => {
        this.controller?.emit({ kind: "hover", id: null });
      },
    });
  }

  command(cmd: SceneCommand): void {
    if (!this.graph) return;
    switch (cmd.kind) {
      case "set-data":
        this.setData(cmd.nodes, cmd.edges);
        break;
      case "set-bounds":
        this.setBounds(cmd.shape, cmd.size);
        break;
      case "set-selected":
        this.setSelected(cmd.ids);
        break;
      case "focus-node": {
        const i = this.idToIndex.get(cmd.id);
        if (i !== undefined) this.graph.zoomToPointByIndex(i);
        break;
      }
      case "zoom-in":
        this.graph.setZoomLevel(this.graph.getZoomLevel() * 1.25, 250);
        break;
      case "zoom-out":
        this.graph.setZoomLevel(this.graph.getZoomLevel() / 1.25, 250);
        break;
      case "fit-to-view":
      case "reset-view":
        this.graph.fitView(400);
        break;
      // visibility, pins, representation mode, time, overlays, deltas, and the
      // live force controls (set-layout-params / set-frozen / interaction) land in
      // later tiers.
    }
  }

  /** The shared selection (set-selected): ring the first selected node present in
   *  the current slice. cosmos's focused-point ring is the on-canvas selection. */
  private setSelected(ids: ReadonlySet<string>): void {
    if (!this.graph) return;
    let focused: number | undefined;
    for (const id of ids) {
      const i = this.idToIndex.get(id);
      if (i !== undefined) {
        focused = i;
        break;
      }
    }
    this.graph.setConfig({ focusedPointIndex: focused });
  }

  /** Re-place the current nodes under a new containment (node-graph-rework ADR
   *  D3) and re-frame. Static Tier-1 behaviour; Tier 4 applies the bound as a
   *  force in the live tick instead. */
  private setBounds(shape: BoundShape, size?: number): void {
    if (!this.graph) return;
    this.bounds = { shape, size: size ?? 0 };
    const count = this.indexToId.length;
    if (count === 0) return;
    const positions = placeStatic(count, this.bounds, this.currentMaxDiameter);
    this.graph.setPointPositions(positions, true);
    this.graph.render();
    this.graph.fitView(400);
  }

  private setData(
    nodes: readonly SceneNodeData[],
    edges: readonly SceneEdgeData[],
  ): void {
    if (!this.graph) return;
    this.idToIndex.clear();
    this.indexToId = new Array(nodes.length);
    const count = nodes.length;
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 4);
    let maxDiameter = 0;

    nodes.forEach((node, i) => {
      this.idToIndex.set(node.id, i);
      this.indexToId[i] = node.id;
      const diameter = nodeRadius(node) * 2; // world-relative size; scales with zoom
      sizes[i] = diameter;
      if (diameter > maxDiameter) maxDiameter = diameter;
      // Category fill from the vault DOC TYPE first (adr/plan/exec/...), falling
      // back to the generic node species (`kind`) for nodes with no doc type. The
      // wire `kind` alone is the species, not the category, so colouring by it
      // collapses ~all document/plan-container nodes onto the single `code` swatch.
      const [r, g, b, a] = rgba(categoryColor(node.docType ?? node.kind));
      colors[i * 4] = r;
      colors[i * 4 + 1] = g;
      colors[i * 4 + 2] = b;
      colors[i * 4 + 3] = a;
    });
    this.currentMaxDiameter = maxDiameter;

    // Static placement inside the active bound (default circle), non-overlapping by
    // construction. cosmos's own sim is OFF, so these positions render verbatim.
    const positions = placeStatic(count, this.bounds, maxDiameter);

    const linkList: number[] = [];
    for (const e of edges) {
      const s = this.idToIndex.get(e.src);
      const t = this.idToIndex.get(e.dst);
      if (s !== undefined && t !== undefined) linkList.push(s, t);
    }

    // dontRescale=true: positions are verbatim world coords (belt-and-suspenders
    // with rescalePositions:false). No graph.start() — cosmos only renders.
    this.graph.setPointPositions(positions, true);
    this.graph.setPointColors(colors);
    this.graph.setPointSizes(sizes);
    this.graph.setLinks(new Float32Array(linkList));
    this.graph.render();
    this.graph.fitView(400);
  }

  resize(): void {
    // cosmos observes the container element's size and re-renders on its own.
  }

  destroy(): void {
    this.graph?.destroy();
    this.graph = null;
    this.container?.remove();
    this.container = null;
    this.idToIndex.clear();
    this.indexToId = [];
  }

  /** Warm-start persistence lands in a later tier; no-op for now. */
  setPersistenceScope(_workspace: string, _scope: string): void {
    void _workspace;
    void _scope;
  }

  /** Dev/test inspection for NON-tautological verification: the live cosmos point
   *  positions (is it real? do nodes overlap? is it moving when a force is on?). */
  debugSnapshot(): {
    pointCount: number;
    bounds: FieldBounds;
    points: { id: string; x: number; y: number }[];
  } {
    const flat = this.graph?.getPointPositions() ?? [];
    const points: { id: string; x: number; y: number }[] = [];
    for (let i = 0; i < flat.length / 2; i++) {
      points.push({
        id: this.indexToId[i] ?? String(i),
        x: flat[i * 2],
        y: flat[i * 2 + 1],
      });
    }
    return { pointCount: points.length, bounds: { ...this.bounds }, points };
  }
}
