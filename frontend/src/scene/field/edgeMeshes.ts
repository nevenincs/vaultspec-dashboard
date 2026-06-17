// Edge rendering — the binding flat-grey connection field (graph/Hero 85:2,
// graph/Node-items 83:2; figma-parity-reconciliation W03.P07.S45). Scene-layer
// module: framework-free by design.
//
// THE CONNECTION FIELD (graph/Hero 85:2 — binding): the edges are a THIN
// FLAT-GREY node-connection field sitting LOW-OPACITY BEHIND the nodes, so the
// canvas reads as clean category circles on faint connective rule lines, never a
// coloured web. Every edge draws in ONE uniform grey — the --color-scene-rule
// scene token (literal hex per theme, resolved through the getComputedStyle seam,
// never a var() chain). This SUPERSEDES the prior tier-coloured stroke encoding
// ON THE CANVAS (Figma is binding): declared/structural/temporal/semantic no
// longer paint distinct hues.
//
// The tier DATA survives untouched — the model still carries
// `tier`/`state`/`confidence`, filtering and selection still key off it, and the
// grouping below still PARTITIONS by tier so each treatment's geometry (dashes /
// haze quads / meta ribbon / routed lineage chains) is preserved for the off-
// canvas consumers; only the resolved TINT flattens to the single grey and the
// per-treatment alpha stays close so the field reads as one uniform connection
// mesh. (Codify follow-up: this deliberately retires the tier-edge colour
// encoding per the headline-canvas redesign.)
//
// Geometry strategy proven by the W01.P01 spike: static topology built per
// edge-set change, position buffers re-uploaded in place per frame. Solid and
// dotted tiers draw as line-list meshes; the semantic haze draws as triangle-list
// quads (GL lines have no width). Dotted edges use a fixed dash count per edge so
// per-frame updates never resize buffers.
//
// Unknown tiers are a surfaced data error, not a silent re-bucket (audit finding
// spike-tier-wrap-003): the truthfulness stance applies to our own rendering
// pipeline too.

import { Container, Mesh, MeshGeometry, Texture } from "pixi.js";

import type { SceneEdgeData } from "../sceneController";
import { cssColorNumber as getCssColor } from "./tokenReads";

// --- fixed treatment palette (interim values pending the S47 token layer) ---

export const EDGE_TIERS = ["declared", "structural", "temporal", "semantic"] as const;
export type EdgeTier = (typeof EDGE_TIERS)[number];

/** Light-mode fallback for the scene rule grey (node test env has no document). */
export const SCENE_RULE_FALLBACK = 0xd8d2ca;

/** Dash slots per temporal edge — fixed so buffers never resize per frame. */
export const DASHES_PER_EDGE = 8;

// --- pure helpers (unit-tested) ----------------------------------------------

export class UnknownTierError extends Error {
  readonly edgeId: string;
  readonly tier: string;
  constructor(edgeId: string, tier: string) {
    super(
      `edge ${edgeId} carries unknown tier "${tier}" — refusing to render it silently`,
    );
    this.edgeId = edgeId;
    this.tier = tier;
  }
}

/**
 * Group key for an edge: which mesh it batches into. Throws on unknown
 * tiers — the caller surfaces the error, never re-buckets.
 */
export function edgeGroupKey(edge: SceneEdgeData): string {
  // Constellation meta-edges are their own treatment: an aggregation
  // ribbon (quad, width by count), not a tier line (G3.d).
  if (edge.meta) return "meta";
  switch (edge.tier) {
    case "declared":
      return "declared";
    case "structural":
      return `structural:${edge.state ?? "resolved"}`;
    case "temporal":
      return `temporal:${confidenceBucket(edge.confidence)}`;
    case "semantic":
      return `semantic:${confidenceBucket(edge.confidence)}`;
    default:
      throw new UnknownTierError(edge.id, String(edge.tier));
  }
}

/**
 * Pipeline-derivation labels in PROV/lineage axis order (graph-node-semantics /
 * graph-representation): the directed chain research -> adr -> plan -> exec ->
 * audit -> rule. A derivation-bearing edge is a LINEAGE edge — the lineage layout
 * orders nodes along this axis. Tier still carries the line treatment (the channel
 * separation is preserved): derivation never becomes a competing edge colour, it
 * is a layout-axis and edge-classification signal only.
 */
export const DERIVATION_AXIS_ORDER: Record<string, number> = {
  grounds: 0, // research -> adr
  authorizes: 1, // adr -> plan
  binds: 1, // adr -> plan (synonym)
  "generated-by": 2, // plan -> exec
  aggregates: 3, // exec -> summary
  reviews: 4, // exec -> audit
  "promoted-from": 5, // audit -> rule
};

/** True when the edge carries a pipeline-derivation label (a lineage edge). */
export function isLineageEdge(edge: SceneEdgeData): boolean {
  return (
    typeof edge.derivation === "string" && edge.derivation in DERIVATION_AXIS_ORDER
  );
}

/** Confidence quantized to 4 lightness buckets (0 = faintest, 3 = fullest). */
export function confidenceBucket(confidence: number): number {
  const c = Math.max(0, Math.min(1, confidence));
  return Math.min(3, Math.floor(c * 4));
}

/**
 * Mix a colour toward the canvas-background ground — lightness carries
 * confidence (per the ADR: lightness, never transparency).  The optional
 * `paper` argument lets callers pass the resolved theme value; when absent,
 * the light-mode paper warm-white is used (keeps unit tests pure).
 */
export function mixTowardPaper(
  color: number,
  amount: number,
  paper = { r: 0xfa, g: 0xf9, b: 0xf7 },
): number {
  const t = Math.max(0, Math.min(1, amount));
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (ch: number, p: number) => Math.round(ch + (p - ch) * t);
  return (mix(r, paper.r) << 16) | (mix(g, paper.g) << 8) | mix(b, paper.b);
}

/** Lightness mix for a group: bucket 3 → 0 (full ink), bucket 0 → 0.6. */
export function bucketLightness(bucket: number): number {
  return (3 - Math.max(0, Math.min(3, bucket))) * 0.2;
}

/**
 * Resolved stroke colour for a group key — now a SINGLE uniform grey for every
 * tier (graph/Hero 85:2 binding redesign): the --color-scene-rule scene token,
 * read as literal hex per theme through the scene token seam. The `key` argument
 * is retained (the grouping still partitions by tier so each treatment's geometry
 * survives), but the resolved tint no longer varies by tier/state/confidence —
 * the canvas edge is one clean grey rule, the way the Hero shows it. In the node
 * test environment the seam returns the SCENE_RULE_FALLBACK light-mode grey.
 */
export function groupColor(_key: string): number {
  return getCssColor("--color-scene-rule", SCENE_RULE_FALLBACK);
}

/** Semantic haze half-width from the score (width by score per G3.c). */
export function hazeHalfWidth(confidence: number): number {
  return 0.75 + 1.25 * Math.max(0, Math.min(1, confidence));
}

/** Meta-edge ribbon half-width from the aggregated count (G3.d). */
export function metaHalfWidth(count: number): number {
  return Math.min(6, 1 + Math.log2(Math.max(1, count)) * 1.5);
}

/** Write one solid segment (4 floats) into `out` at `offset`. */
export function writeSegment(
  out: Float32Array,
  offset: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  out[offset] = x1;
  out[offset + 1] = y1;
  out[offset + 2] = x2;
  out[offset + 3] = y2;
}

/**
 * Write a routed polyline as a CHAIN of line-list segments (graph-lineage-dag
 * ADR D6): a lineage edge routed through dummy-node waypoints becomes
 * `[a, w0, w1, ..., b]`, drawn as consecutive `writeSegment`s into the SAME
 * line-list topology — no new mesh topology. `segmentCapacity` is the fixed
 * number of segment slots the group allocated (so per-frame writes never resize
 * the buffer); a shorter route pads the trailing slots with degenerate
 * zero-length segments at the endpoint (invisible). Returns nothing; writes
 * `segmentCapacity * 4` floats starting at `offset`.
 */
export function writePolyline(
  out: Float32Array,
  offset: number,
  points: readonly { x: number; y: number }[],
  segmentCapacity: number,
): void {
  for (let s = 0; s < segmentCapacity; s++) {
    const a = points[s];
    const b = points[s + 1];
    if (a && b) {
      writeSegment(out, offset + s * 4, a.x, a.y, b.x, b.y);
    } else {
      // Degenerate (zero-length) segment at the last real point — invisible.
      const last = points[points.length - 1] ?? { x: 0, y: 0 };
      writeSegment(out, offset + s * 4, last.x, last.y, last.x, last.y);
    }
  }
}

/**
 * Write a fixed-count dash pattern (DASHES_PER_EDGE segments, 4 floats
 * each) into `out` at `offset`. Dashes fill the first 60% of each slot.
 */
export function writeDashedSegments(
  out: Float32Array,
  offset: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  const dx = (x2 - x1) / DASHES_PER_EDGE;
  const dy = (y2 - y1) / DASHES_PER_EDGE;
  for (let i = 0; i < DASHES_PER_EDGE; i++) {
    const sx = x1 + dx * i;
    const sy = y1 + dy * i;
    writeSegment(out, offset + i * 4, sx, sy, sx + dx * 0.6, sy + dy * 0.6);
  }
}

/**
 * Write a quad (4 vertices, 8 floats) around a segment with the given
 * half-width into `out` at `offset` — the semantic haze body.
 */
export function writeQuadCorners(
  out: Float32Array,
  offset: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  halfWidth: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * halfWidth;
  const ny = (dx / len) * halfWidth;
  out[offset] = x1 + nx;
  out[offset + 1] = y1 + ny;
  out[offset + 2] = x1 - nx;
  out[offset + 3] = y1 - ny;
  out[offset + 4] = x2 - nx;
  out[offset + 5] = y2 - ny;
  out[offset + 6] = x2 + nx;
  out[offset + 7] = y2 + ny;
}

// --- the mesh layer -------------------------------------------------------------

interface MeshGroup {
  key: string;
  /** Edges in this group, in buffer order. */
  edges: SceneEdgeData[];
  topology: "line-list" | "triangle-list";
  vertsPerEdge: number;
  positions: Float32Array;
  geometry: MeshGeometry;
  mesh: Mesh;
  /** Treatment alpha before fade/recede modulation. */
  baseAlpha: number;
  /** Arrowhead triangles — 3 verts × 2 floats per edge. Only on line-list groups. */
  arrowPositions?: Float32Array;
  arrowGeometry?: MeshGeometry;
  arrowMesh?: Mesh;
}

export interface EdgeSetResult {
  /** Edges refused because their tier is unknown — surface these (G8-style). */
  rejected: UnknownTierError[];
}

/** Scale threshold above which arrowhead glyphs appear (document LOD). */
export const ARROW_VISIBLE_SCALE = 1.6;

/** Arrowhead tip-to-base depth in world units. */
const ARROW_DEPTH = 12;
/** Arrowhead half-width at the base in world units. */
const ARROW_HALF_WIDTH = 4;

/** Write one arrowhead triangle (3 vertices, 6 floats) into `arrowPos`. */
function writeArrow(
  arrowPos: Float32Array,
  offset: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  // Tip at dst; base ARROW_DEPTH back along the edge direction.
  const baseX = bx - ux * ARROW_DEPTH;
  const baseY = by - uy * ARROW_DEPTH;
  arrowPos[offset + 0] = bx;
  arrowPos[offset + 1] = by;
  arrowPos[offset + 2] = baseX + px * ARROW_HALF_WIDTH;
  arrowPos[offset + 3] = baseY + py * ARROW_HALF_WIDTH;
  arrowPos[offset + 4] = baseX - px * ARROW_HALF_WIDTH;
  arrowPos[offset + 5] = baseY - py * ARROW_HALF_WIDTH;
}

/** Membership equality for two optional id sets (B6): used to skip a rebuild
 *  when an ego-highlight re-fires with the same set. */
function sameStringSet(
  a: ReadonlySet<string> | null,
  b: ReadonlySet<string> | null,
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** True when two route maps carry the same edge ids AND the same per-edge
 *  waypoint COUNT — the only properties that affect topology (the buffer sizing
 *  and the `+routed` group membership). Waypoint POSITIONS update per frame, so
 *  a positional-only change needs no rebuild. */
function sameRouteKeys(
  a: ReadonlyMap<string, { x: number; y: number }[]>,
  b: ReadonlyMap<string, { x: number; y: number }[]>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [id, pts] of a) {
    const other = b.get(id);
    if (!other || other.length !== pts.length) return false;
  }
  return true;
}

/** The longest route (intermediate-waypoint count) over a routed-group's edges,
 *  capped so a pathological route cannot blow the buffer. Segment count for an
 *  edge with W waypoints is W + 1. */
const MAX_ROUTE_SEGMENTS = 32;
function routedSegmentCapacity(
  edges: readonly SceneEdgeData[],
  routes: ReadonlyMap<string, { x: number; y: number }[]>,
): number {
  let maxWaypoints = 0;
  for (const e of edges) {
    const r = routes.get(e.id);
    if (r) maxWaypoints = Math.max(maxWaypoints, r.length);
  }
  return Math.min(MAX_ROUTE_SEGMENTS, maxWaypoints + 1);
}

export class EdgeMeshLayer {
  private container = new Container();
  private groups = new Map<string, MeshGroup>();
  private lastEdges: SceneEdgeData[] = [];
  /** Structure signature (id + mesh group key, in order) of the last BUILT edge
   *  set. A `setEdges` whose signature matches this skips the destroy+recreate
   *  rebuild entirely — see `setEdges`. Null means "force a rebuild" (an unknown
   *  tier was present, which `rebuild` surfaces as a rejection). */
  private edgeStructureSig: string | null = "";
  private highlight: ReadonlySet<string> | null = null;
  /** Latest visibility sample: id → presentation progress (0..1]. */
  private visProgress: ReadonlyMap<string, number> | null = null;
  private visSignature = "";
  private arrowsVisible = false;
  /** Lineage routed waypoints (graph-lineage-dag ADR D6): edge id -> ordered
   *  INTERMEDIATE waypoints (excludes endpoints). A routed edge draws as a
   *  polyline chain through these in the existing line-list topology. Empty when
   *  the mode is not lineage or no edge bends. */
  private routes: ReadonlyMap<string, { x: number; y: number }[]> = new Map();

  constructor(world: Container) {
    // Edges draw under nodes: insert at the back of the world.
    world.addChildAt(this.container, 0);
  }

  /**
   * The structure signature for an edge set: `id:groupKey` per edge, in order.
   * This is exactly what determines mesh PARTITIONING (which mesh each edge
   * batches into) and therefore whether a rebuild would produce different GPU
   * meshes. Positions are NOT in the signature — they re-upload per frame in
   * `update()`. Returns null if any edge carries an unknown tier, forcing a full
   * rebuild so `rebuild()` surfaces the rejection rather than silently skipping it.
   */
  private structureSignature(edges: readonly SceneEdgeData[]): string | null {
    let sig = `${edges.length}|`;
    for (const e of edges) {
      let key: string;
      try {
        key = edgeGroupKey(e);
      } catch {
        return null;
      }
      sig += `${e.id}:${key};`;
    }
    return sig;
  }

  /**
   * Apply a new edge set. SKIPS the destroy+recreate rebuild when the edge
   * STRUCTURE is unchanged (same ids + same mesh group keys, same order, no fade
   * in flight). A refetch / live keyframe that restated the same edges — the
   * common "refresh" case — must NOT destroy and rebuild every GPU mesh: that
   * flashes the connection field on every poll, and under a mesh-less canvas
   * renderer fallback it leaves a destroyed/rebuilt mesh in the render group's
   * dirty list and throws in `validateRenderables` every frame. Positions still
   * re-upload per frame in `update()`, so a pure position change needs no rebuild
   * either. Edge-set changes, highlight, routing, and fades still rebuild.
   */
  setEdges(edges: readonly SceneEdgeData[]): EdgeSetResult {
    const hadFade = this.visProgress != null;
    const sig = this.structureSignature(edges);
    this.lastEdges = [...edges];
    this.visProgress = null;
    this.visSignature = "";
    if (
      !hadFade &&
      sig !== null &&
      sig === this.edgeStructureSig &&
      this.groups.size > 0
    ) {
      // Structure identical and meshes already built — nothing to rebuild.
      return { rejected: [] };
    }
    this.edgeStructureSig = sig;
    return this.rebuild();
  }

  /**
   * Apply lineage routed waypoints (graph-lineage-dag ADR D6): the per-edge
   * intermediate dummy-node bends the lineage layout produced, folded into the
   * existing line-list topology. Passing an empty map clears routing (every
   * lineage edge draws straight again — connectivity/semantic modes). A routed
   * edge moves into a `+routed` line-list group sized for the longest route, so
   * the topology rebuilds when the route SET changes; the per-frame `update()`
   * then draws the polyline chain through the waypoints. Semantic/meta
   * triangle-list ribbons are untouched.
   */
  setRoutes(routes: ReadonlyMap<string, { x: number; y: number }[]>): void {
    // Only the non-empty routes matter; a route with no intermediate waypoints
    // is a straight edge and stays on the plain line-list path.
    const meaningful = new Map<string, { x: number; y: number }[]>();
    for (const [id, pts] of routes) if (pts.length > 0) meaningful.set(id, pts);
    if (sameRouteKeys(this.routes, meaningful)) {
      // Same routed-edge membership and lengths: positions update per frame, no
      // topology rebuild needed.
      this.routes = meaningful;
      return;
    }
    this.routes = meaningful;
    this.rebuild();
  }

  /**
   * Try to apply a single edge delta without a full rebuild.
   *
   * Fast path: `op:"change"` where the edge stays in the same tier group
   * — patch the edge data in place and return `true`. The per-frame `update()`
   * call re-uploads positions so no buffer write is needed here.
   *
   * All other operations (add, remove, or a change that shifts the group key)
   * return `false` — the caller must fall back to `setEdges` + rebuild.
   */
  updateEdge(edge: SceneEdgeData, op: "add" | "remove" | "change"): boolean {
    if (op !== "change") return false;
    const idx = this.lastEdges.findIndex((e) => e.id === edge.id);
    if (idx === -1) return false; // unknown edge; treat as add
    try {
      const oldKey = edgeGroupKey(this.lastEdges[idx]).split("+")[0];
      const newKey = edgeGroupKey(edge).split("+")[0];
      if (oldKey !== newKey) return false; // group shift — must rebuild
      this.lastEdges[idx] = edge;
      // Patch the group's edge reference in place.
      for (const group of this.groups.values()) {
        const gi = group.edges.findIndex((e) => e.id === edge.id);
        if (gi !== -1) {
          group.edges[gi] = edge;
          break;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Toggle arrowhead glyph visibility (driven by camera scale, LOD). */
  setArrowVisibility(visible: boolean): void {
    if (visible === this.arrowsVisible) return;
    this.arrowsVisible = visible;
    for (const group of this.groups.values()) {
      if (group.arrowMesh) group.arrowMesh.visible = visible;
    }
  }

  /**
   * Ego-highlight (G3.b): lifted edge ids keep full treatment, the rest
   * recede. Null clears. Rebuilds topology — fine at DOI-bounded sizes.
   */
  setHighlight(edgeIds: ReadonlySet<string> | null): void {
    // Skip redundant rebuilds (B6, resource-hardening): hover frequently
    // re-fires the SAME ego set, and a full rebuild destroys + re-uploads every
    // group's GPU mesh/geometry. Only rebuild when the membership actually
    // changed; when it does the topology genuinely changes (lifted edges move to
    // a `+lift` group), so a rebuild is still correct there.
    if (sameStringSet(this.highlight, edgeIds)) return;
    this.highlight = edgeIds;
    this.rebuild();
  }

  /**
   * Visibility fades (G3.f, audit finding edge-fade-snaps-017): edges in
   * transition rebuild into `+fade` groups whose mesh alpha tracks the
   * sampled progress per frame; topology rebuilds only when the
   * membership/transition partition changes, alpha updates are per-call.
   */
  applyVisibility(progress: ReadonlyMap<string, number>): void {
    this.visProgress = progress;
    let signature = "";
    for (const [id, p] of progress) {
      signature += p >= 1 ? id : `${id}~`;
      signature += "|";
    }
    if (signature !== this.visSignature) {
      this.visSignature = signature;
      this.rebuild();
    }
    for (const group of this.groups.values()) {
      if (!group.key.includes("+fade")) continue;
      let sum = 0;
      for (const edge of group.edges) {
        sum += progress.get(edge.id) ?? 0;
      }
      group.mesh.alpha = group.baseAlpha * (sum / Math.max(1, group.edges.length));
    }
  }

  private rebuild(): EdgeSetResult {
    const rejected: UnknownTierError[] = [];
    const byGroup = new Map<string, SceneEdgeData[]>();
    const drawable = this.visProgress
      ? this.lastEdges.filter((e) => (this.visProgress!.get(e.id) ?? 0) > 0)
      : this.lastEdges;
    for (const edge of drawable) {
      try {
        let key = edgeGroupKey(edge);
        // Lineage routed edges (D6): an edge with intermediate waypoints joins a
        // `+routed` line-list group sized for the polyline chain. Only the solid
        // line-list tiers route — semantic/meta ribbons and temporal dashes keep
        // their own geometry untouched.
        const base = key.split("+")[0];
        const routable =
          !base.startsWith("temporal") &&
          !base.startsWith("semantic") &&
          base !== "meta";
        if (routable && (this.routes.get(edge.id)?.length ?? 0) > 0) {
          key = `${key}+routed`;
        }
        if (this.highlight?.has(edge.id)) key = `${key}+lift`;
        if (this.visProgress && (this.visProgress.get(edge.id) ?? 0) < 1) {
          key = `${key}+fade`;
        }
        let list = byGroup.get(key);
        if (!list) {
          list = [];
          byGroup.set(key, list);
        }
        list.push(edge);
      } catch (err) {
        if (err instanceof UnknownTierError) rejected.push(err);
        else throw err;
      }
    }
    for (const group of this.groups.values()) {
      group.mesh.destroy();
      group.geometry.destroy();
      group.arrowMesh?.destroy();
      group.arrowGeometry?.destroy();
    }
    this.groups.clear();
    for (const [key, groupEdges] of byGroup) {
      this.groups.set(key, this.buildGroup(key, groupEdges));
    }
    return { rejected };
  }

  /** Per-frame position re-upload from the node position lookup. */
  update(positionOf: (id: string) => { x: number; y: number } | undefined): void {
    for (const group of this.groups.values()) {
      const { edges, positions } = group;
      let arrowDirty = false;
      const isRouted = group.key.includes("+routed");
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const a = positionOf(edge.src);
        const b = positionOf(edge.dst);
        if (!a || !b) continue;
        const offset = i * group.vertsPerEdge * 2;
        const base = group.key.split("+")[0];
        if (isRouted) {
          // Routed lineage polyline (D6): draw the chain a -> w0 -> ... -> b as
          // line-list segments through the layout's intermediate waypoints, into
          // the SAME topology. The arrowhead still points along the final
          // segment toward dst.
          const waypoints = this.routes.get(edge.id) ?? [];
          const chain = [a, ...waypoints, b];
          writePolyline(positions, offset, chain, group.vertsPerEdge / 2);
          if (group.arrowPositions) {
            const tail = chain[chain.length - 2] ?? a;
            writeArrow(group.arrowPositions, i * 6, tail.x, tail.y, b.x, b.y);
            arrowDirty = true;
          }
        } else if (base.startsWith("temporal")) {
          writeDashedSegments(positions, offset, a.x, a.y, b.x, b.y);
        } else if (base === "meta") {
          writeQuadCorners(
            positions,
            offset,
            a.x,
            a.y,
            b.x,
            b.y,
            metaHalfWidth(edge.meta?.count ?? 1),
          );
        } else if (base.startsWith("semantic")) {
          writeQuadCorners(
            positions,
            offset,
            a.x,
            a.y,
            b.x,
            b.y,
            hazeHalfWidth(edge.confidence),
          );
        } else {
          writeSegment(positions, offset, a.x, a.y, b.x, b.y);
          // Arrowhead triangle: only for non-semantic, non-meta edges.
          if (group.arrowPositions) {
            writeArrow(group.arrowPositions, i * 6, a.x, a.y, b.x, b.y);
            arrowDirty = true;
          }
        }
      }
      group.geometry.getBuffer("aPosition").update();
      if (arrowDirty && group.arrowGeometry) {
        group.arrowGeometry.getBuffer("aPosition").update();
      }
    }
  }

  get groupCount(): number {
    return this.groups.size;
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.groups.clear();
  }

  private buildGroup(key: string, edges: SceneEdgeData[]): MeshGroup {
    const base = key.split("+")[0];
    const lifted = key.includes("+lift");
    const isRouted = key.includes("+routed");
    const isTemporal = base.startsWith("temporal");
    const isSemantic = base.startsWith("semantic") || base === "meta";
    const topology = isSemantic ? "triangle-list" : "line-list";
    // A routed lineage group (D6) draws a polyline chain in the line-list
    // topology: its per-edge vertex budget is the fixed segment capacity × 2,
    // sized for the longest route in the group so per-frame writes never resize.
    const routedSegments = isRouted ? routedSegmentCapacity(edges, this.routes) : 1;
    const vertsPerEdge = isSemantic
      ? 4
      : isTemporal
        ? DASHES_PER_EDGE * 2
        : isRouted
          ? routedSegments * 2
          : 2;
    const positions = new Float32Array(edges.length * vertsPerEdge * 2);
    const uvs = new Float32Array(positions.length);
    let indices: Uint32Array;
    if (isSemantic) {
      indices = new Uint32Array(edges.length * 6);
      for (let i = 0; i < edges.length; i++) {
        const v = i * 4;
        indices.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
      }
    } else {
      indices = new Uint32Array(edges.length * vertsPerEdge);
      for (let i = 0; i < indices.length; i++) indices[i] = i;
    }
    const geometry = new MeshGeometry({ positions, uvs, indices, topology });
    const mesh = new Mesh({ geometry, texture: Texture.WHITE });
    mesh.tint = groupColor(base);
    // Thin flat-grey connection field (graph/Hero 85:2): every group draws the
    // same uniform low-opacity grey behind the nodes so the canvas reads as clean
    // category circles on a faint connective mesh, not a coloured web. The crisp
    // line tiers carry the field opacity; the soft semantic-haze quad stays a
    // touch fainter (it is a wide soft body, not a hairline) so it does not bloom
    // brighter than the rule lines. While an ego is lifted, non-lifted groups
    // recede (G3.b).
    // Connection lines must read clearly as a mesh (the binding "category circles
    // on a connective mesh" treatment) — at the prior 0.42/0.32 the dark scene-rule
    // grey on the near-black dark ground blended to within ~13/255 of the
    // background and the lines effectively vanished. These higher alphas keep the
    // mesh a quiet connective web while making every edge actually visible; the
    // soft semantic haze stays a touch fainter than the crisp tier lines so it
    // never blooms brighter than them.
    const treatmentAlpha = isSemantic ? 0.55 : 0.82;
    const baseAlpha =
      this.highlight && !lifted ? treatmentAlpha * 0.25 : treatmentAlpha;
    mesh.alpha = baseAlpha;
    this.container.addChild(mesh);

    // Arrowhead triangles: only for solid line-list groups (not temporal dashes,
    // not semantic quads, not meta ribbons). 3 vertices × 2 floats per edge.
    let arrowPositions: Float32Array | undefined;
    let arrowGeometry: MeshGeometry | undefined;
    let arrowMesh: Mesh | undefined;
    if (!isSemantic && !isTemporal) {
      arrowPositions = new Float32Array(edges.length * 6);
      const arrowUvs = new Float32Array(arrowPositions.length);
      const arrowIndices = new Uint32Array(edges.length * 3);
      for (let i = 0; i < edges.length; i++) {
        arrowIndices[i * 3] = i * 3;
        arrowIndices[i * 3 + 1] = i * 3 + 1;
        arrowIndices[i * 3 + 2] = i * 3 + 2;
      }
      arrowGeometry = new MeshGeometry({
        positions: arrowPositions,
        uvs: arrowUvs,
        indices: arrowIndices,
        topology: "triangle-list",
      });
      arrowMesh = new Mesh({ geometry: arrowGeometry, texture: Texture.WHITE });
      arrowMesh.tint = groupColor(base);
      arrowMesh.alpha = baseAlpha;
      arrowMesh.visible = this.arrowsVisible;
      this.container.addChild(arrowMesh);
    }

    return {
      key,
      edges,
      topology,
      vertsPerEdge,
      positions,
      geometry,
      mesh,
      baseAlpha,
      arrowPositions,
      arrowGeometry,
      arrowMesh,
    };
  }
}
