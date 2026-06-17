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
import { FieldLayout, type LayoutEdgeRef } from "./forceLayout";
import { nodeRadius } from "./nodeSprites";
import { cssColorNumber } from "./tokenReads";
import type { NodePosition } from "../positionCache";

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

// Default to a FREE canvas centred by soft gravity - the knowledge-graph norm
// (Obsidian/Logseq/Foam/Roam/force-graph): no hard bound, overlap-tolerant. The
// circle/rect options remain as a SOFT compactness preset, not a hard clamp.
const DEFAULT_BOUNDS: FieldBounds = { shape: "free", size: 0 };

/** Soft center-gravity strength (forceX/forceY) per bound shape - the norm's way
 *  of "centering" and shaping compactness, NOT a hard clip. free = loose sprawl,
 *  circle = tight round blob (Obsidian's "center force"), rect = medium. */
const CENTER_STRENGTH: Record<BoundShape, number> = {
  free: 0.025,
  circle: 0.08,
  rect: 0.05,
};

/** Resolve the soft center-gravity strength from a bound shape + optional size.
 *  size 0 = the shape preset; size>0 makes the size slider a live compactness knob
 *  (smaller = tighter / stronger gravity), so it is never a dead control. */
function centerStrength(shape: BoundShape, size: number): number {
  if (size > 0) {
    const s = Math.max(300, Math.min(4000, size));
    return 0.13 - (0.11 * (s - 300)) / (4000 - 300); // tight 0.13 .. loose 0.02
  }
  return CENTER_STRENGTH[shape];
}

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
 * World position for a stable phyllotaxis SLOT inside the bound, written into
 * `out` at point index `i`, non-overlapping BY CONSTRUCTION. Keying placement on a
 * per-id slot (not the array index) is the Tier-2 no-bounce retention: a surviving
 * node keeps its slot - and, because the capacity and radius are stable, its
 * position - across a refetch/add/remove. circle (default) and free are sunflower
 * spirals (circle caps the radius to fill a disc; free grows unbounded); rect is a
 * centred grid.
 */
function slotPosition(
  out: Float32Array,
  i: number,
  slot: number,
  bounds: FieldBounds,
  capacity: number,
  maxDiameter: number,
): void {
  const d = maxDiameter > 0 ? maxDiameter : FALLBACK_DIAMETER;
  const cap = Math.max(1, capacity);
  if (bounds.shape === "rect") {
    const half = bounds.size > 0 ? bounds.size : autoDiscRadius(cap, d) * 0.886;
    const cols = Math.max(1, Math.ceil(Math.sqrt(cap)));
    const step = (half * 2) / cols;
    out[i * 2] = SPACE_CENTRE - half + ((slot % cols) + 0.5) * step;
    out[i * 2 + 1] = SPACE_CENTRE - half + (Math.floor(slot / cols) + 0.5) * step;
    return;
  }
  if (bounds.shape === "free") {
    const r = d * Math.sqrt(slot);
    const a = slot * GOLDEN_ANGLE;
    out[i * 2] = SPACE_CENTRE + Math.cos(a) * r;
    out[i * 2 + 1] = SPACE_CENTRE + Math.sin(a) * r;
    return;
  }
  const R = bounds.size > 0 ? bounds.size : autoDiscRadius(cap, d);
  const r = R * Math.sqrt((slot + 0.5) / cap);
  const a = slot * GOLDEN_ANGLE;
  out[i * 2] = SPACE_CENTRE + Math.cos(a) * r;
  out[i * 2 + 1] = SPACE_CENTRE + Math.sin(a) * r;
}

/**
 * Cheap content signature for the Tier-2 dedup guard: node count, edge count, and
 * an FNV-1a hash over node ids + edge endpoints. An identical refetch hashes
 * identically and is skipped wholesale, so it cannot re-upload, re-place, or bounce.
 */
function contentSignature(
  nodes: readonly SceneNodeData[],
  edges: readonly SceneEdgeData[],
): string {
  let h = 0x811c9dc5;
  const mix = (s: string): void => {
    for (let k = 0; k < s.length; k++) {
      h ^= s.charCodeAt(k);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2c;
    h = Math.imul(h, 0x01000193);
  };
  for (const n of nodes) mix(n.id);
  for (const e of edges) {
    mix(e.src);
    mix(e.dst);
  }
  return `${nodes.length}:${edges.length}:${(h >>> 0).toString(16)}`;
}

// --- Tier-3 edge encoding (node-graph-rework ADR D4) -------------------------
// Edges encode meaning through colour (tier), width + opacity (confidence) and
// dimming (state). A low base opacity keeps the dense mesh a subtle haze so nodes
// stay readable; a hovered/selected node's incident edges read clearly via the low
// link greyout. This deliberately re-introduces tier colour on the canvas (the
// binding Figma redesign had retired it to flat grey) per the ADR D4 accepted
// divergence, because the user requires edges to carry semantic meaning.
const EDGE_ALPHA_MIN = 0.1;
const EDGE_ALPHA_MAX = 0.5;
const EDGE_WIDTH_MIN = 0.6;
const EDGE_WIDTH_MAX = 2.2;

interface EdgeAppearance {
  r: number;
  g: number;
  b: number;
  a: number;
  width: number;
}

/** Per-link colour/width/opacity for an edge: tier -> hue, confidence -> width +
 *  opacity, broken/stale state -> dimming. `tierColors` is keyed by tier name with
 *  a `rule` fallback for an unknown tier (dimmed, never silently re-bucketed). */
function edgeAppearance(
  edge: SceneEdgeData,
  tierColors: Record<string, [number, number, number, number]>,
): EdgeAppearance {
  const base = tierColors[edge.tier] ?? tierColors.rule;
  const conf =
    typeof edge.confidence === "number" ? Math.max(0, Math.min(1, edge.confidence)) : 1;
  let a = EDGE_ALPHA_MIN + (EDGE_ALPHA_MAX - EDGE_ALPHA_MIN) * conf;
  if (!tierColors[edge.tier]) a *= 0.6; // unknown tier: dim, surfaced via fallback
  if (edge.state === "broken") a *= 0.55;
  else if (edge.state === "stale") a *= 0.78;
  const width = EDGE_WIDTH_MIN + (EDGE_WIDTH_MAX - EDGE_WIDTH_MIN) * conf;
  return { r: base[0], g: base[1], b: base[2], a, width };
}

export class CosmosField implements SceneFieldRenderer {
  private graph: Graph | null = null;
  private container: HTMLDivElement | null = null;
  /** Stable id <-> cosmos point-index mapping (cosmos addresses points by index). */
  private idToIndex = new Map<string, number>();
  private indexToId: string[] = [];
  /** Active containment (node-graph-rework ADR D3); default circle, auto-sized. */
  private bounds: FieldBounds = { ...DEFAULT_BOUNDS };
  /** Stable per-id phyllotaxis SLOT (Tier-2 retention): a surviving node keeps its
   *  slot - and therefore its position - across a refetch/add/remove, so the field
   *  never bounces. Freed slots are reused; capacity only grows so the radius (and
   *  every kept slot's position) stays stable. */
  private slotById = new Map<string, number>();
  private freeSlots: number[] = [];
  private nextSlot = 0;
  private capacity = 1;
  /** Content signature of the last set-data (Tier-2 dedup): an identical refetch is
   *  skipped wholesale - no re-upload, no re-place, no re-fit, no bounce. */
  private lastSignature = "";
  /** Fit-once guard (Tier-2): frame the field on first data and after a bound
   *  change, not on every refetch (retention keeps the bbox stable, so re-fitting
   *  would only jitter the camera). */
  private fitPending = true;
  /** Edges dropped because an endpoint is not in the current slice (Tier-3 honest
   *  hidden-edge accounting): surfaced via debugSnapshot, never silently zeroed. */
  private droppedEdges = 0;
  /** Tier-4 live layout: the CPU d3-force driver (collide OFF, overlap-tolerant
   *  norm) that OWNS node positions. It works in origin-centred coords; cosmos
   *  renders them offset to SPACE_CENTRE. Settles then freezes (render-on-demand). */
  private layout: FieldLayout | null = null;
  /** Previous node/edge id sets, to diff a delta for the object-constancy
   *  applyChanges path (no-bounce: survivors keep their positions). */
  private prevNodeIds = new Set<string>();
  private prevEdgeIds = new Set<string>();
  /** Index of the node currently being dragged (Tier-4 drag), or undefined. */
  private dragIndex: number | undefined;
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
      // ---- edges: tier-encoded connection mesh (node-graph-rework ADR D4) --
      // Per-link colour (tier), width/opacity (confidence) and state dimming are
      // set in setData; these are the base config. A LOW base opacity keeps the
      // dense (~36k-edge) mesh a subtle haze so nodes stay readable; the low
      // greyout makes a hovered/selected node's incident edges read clearly against
      // the rest; the widened visibility-distance range stops edges vanishing on
      // zoom (the [50,150]px default fades most edges out at our scales).
      linkColor: hexString("--color-scene-rule", 0xd8d2ca), // fallback pre per-link
      linkWidth: 1,
      linkWidthScale: 1,
      linkArrows: false,
      renderLinks: true,
      linkGreyoutOpacity: 0.04,
      linkVisibilityDistanceRange: [5, 6000],
      hoveredLinkColor: hexString("--color-accent", 0x8a7d5a),
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
      // Tier-4 drag: cosmos reports the gesture; the d3-force layout OWNS the
      // position - dragNode pins fx/fy + reheats so neighbours couple through the
      // links, and releaseNode lets the node float back on drop (no auto-pin - the
      // graph-stability lesson). Pointer -> space via screenToSpacePosition, then
      // -> layout coords (origin-centred, so subtract SPACE_CENTRE).
      onDragStart: (e) => {
        const idx = (e.subject as { index?: number } | undefined)?.index;
        if (idx === undefined) return;
        this.dragIndex = idx;
        this.layout?.beginInteraction();
      },
      onDrag: (e) => {
        if (this.dragIndex === undefined || !this.graph || !this.layout) return;
        const id = this.indexToId[this.dragIndex];
        const src = e.sourceEvent as MouseEvent | undefined;
        const rect = this.container?.getBoundingClientRect();
        if (id === undefined || !src || !rect) return;
        const [sx, sy] = this.graph.screenToSpacePosition([
          src.clientX - rect.left,
          src.clientY - rect.top,
        ]);
        this.layout.dragNode(id, sx - SPACE_CENTRE, sy - SPACE_CENTRE);
      },
      onDragEnd: () => {
        if (this.dragIndex === undefined) return;
        const id = this.indexToId[this.dragIndex];
        if (id !== undefined) this.layout?.releaseNode(id);
        this.layout?.endInteraction();
        this.dragIndex = undefined;
      },
    });

    // Tier-4: the CPU d3-force layout drives positions (collide OFF for the
    // overlap-tolerant norm). Its per-tick frame pushes positions to cosmos
    // (render-on-demand: it only ticks while settling/reheating, idle otherwise);
    // its settle fires the fit-once camera.
    this.layout = new FieldLayout(undefined, false);
    this.layout.onPositions((positions) => this.pushPositions(positions));
    this.layout.onSettle(() => {
      if (this.fitPending && this.graph) {
        this.graph.fitView(400);
        this.fitPending = false;
      }
    });
  }

  /** Push the layout's latest (origin-centred) positions to cosmos, offset to the
   *  space centre, and render. The only per-tick GPU work; links follow by index. */
  private pushPositions(positions: ReadonlyMap<string, NodePosition>): void {
    if (!this.graph) return;
    const n = this.indexToId.length;
    const flat = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const p = positions.get(this.indexToId[i]);
      flat[i * 2] = (p ? p.x : 0) + SPACE_CENTRE;
      flat[i * 2 + 1] = (p ? p.y : 0) + SPACE_CENTRE;
    }
    this.graph.setPointPositions(flat, true);
    this.graph.render();
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
      // --- Tier-4 live force controls (drive the d3-force layout) ----------
      case "set-layout-params":
        this.layout?.setParams(cmd.params);
        break;
      case "set-frozen":
        if (cmd.frozen) this.layout?.stop();
        else this.layout?.unfreeze();
        break;
      case "begin-interaction":
        this.layout?.beginInteraction();
        break;
      case "end-interaction":
        this.layout?.endInteraction();
        break;
      case "set-pinned":
        this.layout?.setPinned(cmd.ids);
        break;
      // visibility, representation mode, time, overlays, deltas land next.
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

  /** Apply the configurable bound as SOFT center gravity (the knowledge-graph
   *  norm), not a hard clamp (a hard clip fights the force layout): free = loose,
   *  circle = tight round blob, rect = medium; an explicit size tightens/loosens
   *  it. The layout reheats and re-settles into the new compactness, keeping every
   *  node's identity (no re-seed). */
  private setBounds(shape: BoundShape, size?: number): void {
    this.bounds = { shape, size: size ?? 0 };
    this.layout?.setParams({ center: centerStrength(shape, this.bounds.size) });
  }

  private setData(
    nodes: readonly SceneNodeData[],
    edges: readonly SceneEdgeData[],
  ): void {
    if (!this.graph) return;

    // Tier-2 dedup: an identical refetch (same node ids + edge endpoints) is a
    // wholesale no-op - no re-upload, no re-place, no re-fit, so it cannot bounce.
    const signature = contentSignature(nodes, edges);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    this.idToIndex.clear();
    this.indexToId = new Array(nodes.length);
    const count = nodes.length;
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 4);
    let maxDiameter = 0;

    // Tier-2 retention: free the slots of nodes that left, so survivors keep their
    // slot (and position) and only genuinely-new ids get fresh (reused-or-appended)
    // slots below - the field never re-shuffles on a delta.
    const presentIds = new Set<string>(nodes.map((n) => n.id));
    for (const [id, slot] of this.slotById) {
      if (!presentIds.has(id)) {
        this.freeSlots.push(slot);
        this.slotById.delete(id);
      }
    }

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
      if (!this.slotById.has(node.id)) {
        const slot = this.freeSlots.length ? this.freeSlots.pop()! : this.nextSlot++;
        this.slotById.set(node.id, slot);
      }
    });
    // Capacity only grows, so the radius - and thus every kept slot's position -
    // stays stable across deltas: the no-bounce guarantee.
    this.capacity = Math.max(this.capacity, this.nextSlot);

    // Place each point by its stable slot inside the active bound (default circle),
    // non-overlapping by construction. cosmos's sim is OFF, so positions are verbatim.
    const positions = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const slot = this.slotById.get(this.indexToId[i])!;
      slotPosition(positions, i, slot, this.bounds, this.capacity, maxDiameter);
    }

    // Tier-3 edge encoding: build the link list plus per-link colour (tier),
    // width and opacity (confidence) + state dimming. Tier colours are read live so
    // they track the active theme. Cross-boundary edges (an endpoint absent from
    // this slice) are dropped and COUNTED, never silently lost.
    const tierColors: Record<string, [number, number, number, number]> = {
      declared: rgba(cssColorNumber("--color-tier-declared", 0x312d27)),
      structural: rgba(cssColorNumber("--color-tier-structural", 0x3f774d)),
      temporal: rgba(cssColorNumber("--color-tier-temporal", 0x5c5040)),
      semantic: rgba(cssColorNumber("--color-tier-semantic", 0x8b85b7)),
      rule: rgba(cssColorNumber("--color-scene-rule", 0xd8d2ca)),
    };
    const linkList: number[] = [];
    const linkColors: number[] = [];
    const linkWidths: number[] = [];
    let dropped = 0;
    for (const e of edges) {
      const s = this.idToIndex.get(e.src);
      const t = this.idToIndex.get(e.dst);
      if (s === undefined || t === undefined) {
        dropped++;
        continue;
      }
      linkList.push(s, t);
      const ap = edgeAppearance(e, tierColors);
      linkColors.push(ap.r, ap.g, ap.b, ap.a);
      linkWidths.push(ap.width);
    }
    this.droppedEdges = dropped;

    // Initial cosmos render: the static disc is the instant first paint AND the
    // warm seed for the force layout (so there is no cold-start yank). Colours,
    // sizes and links are set ONCE here; per-tick pushPositions only updates
    // positions and links follow by index. No graph.start() - cosmos only renders.
    this.graph.setPointPositions(positions, true);
    this.graph.setPointColors(colors);
    this.graph.setPointSizes(sizes);
    this.graph.setLinks(new Float32Array(linkList));
    this.graph.setLinkColors(new Float32Array(linkColors));
    this.graph.setLinkWidths(new Float32Array(linkWidths));
    this.graph.render();
    if (this.fitPending) this.graph.fitView(400); // frame the seed; onSettle re-fits

    // Tier-4: drive the live d3-force layout (the norm: CPU d3, overlap-tolerant,
    // settle-then-freeze). First data warm-seeds from the disc and runs a gentle
    // settle; a delta uses object-constancy applyChanges (survivors keep position,
    // only new nodes settle in - no bounce).
    const layoutEdges: LayoutEdgeRef[] = [];
    const newEdgeIds = new Set<string>();
    for (const e of edges) {
      if (this.idToIndex.has(e.src) && this.idToIndex.has(e.dst)) {
        layoutEdges.push({ id: e.id, src: e.src, dst: e.dst });
        newEdgeIds.add(e.id);
      }
    }
    const newNodeIds = new Set<string>(this.indexToId);
    if (this.layout) {
      if (this.prevNodeIds.size === 0) {
        const warm = new Map<string, NodePosition>();
        for (let i = 0; i < count; i++) {
          warm.set(this.indexToId[i], {
            x: positions[i * 2] - SPACE_CENTRE,
            y: positions[i * 2 + 1] - SPACE_CENTRE,
          });
        }
        this.layout.setParams({
          center: centerStrength(this.bounds.shape, this.bounds.size),
        });
        this.layout.init(this.indexToId, layoutEdges, warm, null);
        this.layout.start();
      } else {
        const addNodeIds = this.indexToId.filter((id) => !this.prevNodeIds.has(id));
        const removeNodeIds = [...this.prevNodeIds].filter((id) => !newNodeIds.has(id));
        const addEdges = layoutEdges.filter((e) => !this.prevEdgeIds.has(e.id));
        const removeEdgeIds = [...this.prevEdgeIds].filter((id) => !newEdgeIds.has(id));
        this.layout.applyChanges(
          { addNodeIds, removeNodeIds, addEdges, removeEdgeIds },
          undefined,
          null,
        );
      }
    }
    this.prevNodeIds = newNodeIds;
    this.prevEdgeIds = newEdgeIds;
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
    this.slotById.clear();
    this.freeSlots = [];
    this.nextSlot = 0;
    this.capacity = 1;
    this.lastSignature = "";
    this.fitPending = true;
    this.layout?.destroy();
    this.layout = null;
    this.prevNodeIds.clear();
    this.prevEdgeIds.clear();
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
    droppedEdges: number;
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
    return {
      pointCount: points.length,
      bounds: { ...this.bounds },
      droppedEdges: this.droppedEdges,
      points,
    };
  }
}
