// Tier-treated edge rendering (W01.P03.S11, ADR G3.c and G7.d).
//
// Four provenance tiers, four fixed line treatments — the product-wide
// encoding: declared = solid inked line; structural = solid,
// status-coloured (resolved/stale/broken); temporal = dotted; semantic =
// soft light "haze" stroke with width by score. Line treatment is the
// primary channel and hue secondary, so the encoding reads in grayscale;
// confidence rides LIGHTNESS (mix toward the paper ground), never
// transparency-only, per the Guo et al. channel-interference findings the
// ADR cites.
//
// Geometry strategy proven by the W01.P01 spike: static topology built per
// edge-set change, position buffers re-uploaded in place per frame. Solid
// and dotted tiers draw as line-list meshes; the semantic haze draws as
// triangle-list quads (GL lines have no width). Dotted edges use a fixed
// dash count per edge so per-frame updates never resize buffers.
//
// Unknown tiers are a surfaced data error, not a silent re-bucket (audit
// finding spike-tier-wrap-003): the truthfulness stance applies to our own
// rendering pipeline too.

import { Container, Mesh, MeshGeometry, Texture } from "pixi.js";

import type { SceneEdgeData } from "../sceneController";

// --- fixed treatment palette (interim values pending the S47 token layer) ---

export const EDGE_TIERS = ["declared", "structural", "temporal", "semantic"] as const;
export type EdgeTier = (typeof EDGE_TIERS)[number];

const PAPER = { r: 0xfa, g: 0xf9, b: 0xf7 };

const TIER_BASE_COLORS: Record<string, number> = {
  declared: 0x3a342c,
  "structural:resolved": 0x2f7d4f,
  "structural:stale": 0xa07520,
  "structural:broken": 0xb3502d,
  temporal: 0x4a4137,
  semantic: 0x7d6f9e,
};

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

/** Confidence quantized to 4 lightness buckets (0 = faintest, 3 = fullest). */
export function confidenceBucket(confidence: number): number {
  const c = Math.max(0, Math.min(1, confidence));
  return Math.min(3, Math.floor(c * 4));
}

/** Mix a colour toward the paper ground — lightness carries confidence. */
export function mixTowardPaper(color: number, amount: number): number {
  const t = Math.max(0, Math.min(1, amount));
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (ch: number, paper: number) => Math.round(ch + (paper - ch) * t);
  return (mix(r, PAPER.r) << 16) | (mix(g, PAPER.g) << 8) | mix(b, PAPER.b);
}

/** Lightness mix for a group: bucket 3 → 0 (full ink), bucket 0 → 0.6. */
export function bucketLightness(bucket: number): number {
  return (3 - Math.max(0, Math.min(3, bucket))) * 0.2;
}

/** Resolved colour for a group key. */
export function groupColor(key: string): number {
  if (key === "meta") return mixTowardPaper(TIER_BASE_COLORS.declared, 0.35);
  const [head, sub] = key.split(":");
  if (head === "structural") return TIER_BASE_COLORS[`structural:${sub}`];
  const base = TIER_BASE_COLORS[head];
  if (head === "temporal" || head === "semantic") {
    return mixTowardPaper(base, bucketLightness(Number(sub)));
  }
  return base;
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

export class EdgeMeshLayer {
  private container = new Container();
  private groups = new Map<string, MeshGroup>();
  private lastEdges: SceneEdgeData[] = [];
  private highlight: ReadonlySet<string> | null = null;
  /** Latest visibility sample: id → presentation progress (0..1]. */
  private visProgress: ReadonlyMap<string, number> | null = null;
  private visSignature = "";
  private arrowsVisible = false;

  constructor(world: Container) {
    // Edges draw under nodes: insert at the back of the world.
    world.addChildAt(this.container, 0);
  }

  /** Rebuild mesh topology for a new edge set (edge-set changes only). */
  setEdges(edges: readonly SceneEdgeData[]): EdgeSetResult {
    this.lastEdges = [...edges];
    this.visProgress = null;
    this.visSignature = "";
    return this.rebuild();
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
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const a = positionOf(edge.src);
        const b = positionOf(edge.dst);
        if (!a || !b) continue;
        const offset = i * group.vertsPerEdge * 2;
        const base = group.key.split("+")[0];
        if (base.startsWith("temporal")) {
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
    const isTemporal = base.startsWith("temporal");
    const isSemantic = base.startsWith("semantic") || base === "meta";
    const topology = isSemantic ? "triangle-list" : "line-list";
    const vertsPerEdge = isSemantic ? 4 : isTemporal ? DASHES_PER_EDGE * 2 : 2;
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
    // Alpha supports the treatment but never carries confidence alone;
    // while an ego is lifted, non-lifted groups recede (G3.b).
    const treatmentAlpha = isSemantic ? 0.45 : 0.8;
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
