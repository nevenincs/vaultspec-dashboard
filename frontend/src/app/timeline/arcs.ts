// Derivation arcs for the phase-lane timeline (dashboard-timeline ADR
// "Representation" / "Density, bundling, and the scroll model", W03.P06.S36-S39):
// the pure geometry + tier-as-treatment resolver + the bundling/disparity
// hardening layer + the un-bundle-on-hover affordance. The component (`Timeline`)
// renders the descriptors these helpers return as SVG `<path>`s.
//
// Tier-as-treatment vocabulary (reused from the stage `edgeMeshes.ts`, NOT the
// Pixi code — the MAPPING and the token names): declared = solid inked line;
// structural = solid, status-hued (resolved/stale/broken); temporal = dotted;
// semantic = a faint wide haze. Line treatment is the PRIMARY channel and hue is
// secondary, so the arc reads in grayscale at the 14px gate; confidence rides
// LIGHTNESS (a four-bucket lightness step), never opacity alone — mirroring
// edgeMeshes' `confidenceBucket`/`bucketLightness` so the timeline matches the
// stage for free.
//
// Pure + deterministic. Every helper is a referentially-transparent function of
// its arguments — no DOM, no React, no tokens read at runtime; treatment carries
// the CSS custom-property NAME and the consumer resolves it through the cascade
// (the SVG lives in a real cascade, so `var()` resolves directly — the literal-
// hex-via-getComputedStyle hazard does not apply here). Fully unit-testable.

import { capItems, type Capped } from "./scrollStrip";

// --- tier-as-treatment resolver (S36) -----------------------------------------

/** The four provenance tiers an arc carries (the wire `LineageArc.tier`). */
export const ARC_TIERS = ["declared", "structural", "temporal", "semantic"] as const;
export type ArcTier = (typeof ARC_TIERS)[number];

/** A structural arc's resolution state, when the wire carries one. */
export type ArcState = "resolved" | "stale" | "broken";

/**
 * Confidence quantized to four lightness buckets (0 = faintest, 3 = fullest) —
 * the same quantization the stage uses (`edgeMeshes.confidenceBucket`) so the
 * timeline and the stage agree on the confidence-to-lightness step.
 */
export function confidenceBucket(confidence: number): number {
  const c = Math.max(0, Math.min(1, confidence));
  return Math.min(3, Math.floor(c * 4));
}

/**
 * The treatment descriptor for an arc: everything the renderer needs to draw it
 * but nothing about its position. `stroke` and `fill` carry the CSS custom-
 * property NAME (resolved through the cascade by the SVG, not read at runtime);
 * `dash` is an SVG `stroke-dasharray` value (empty for solid); `widthPx` is the
 * stroke/haze body width; `lightnessBucket` carries confidence so a consumer
 * that wants to lighten the stroke can, mirroring the stage's lightness channel.
 */
export interface ArcTreatment {
  readonly tier: ArcTier;
  /** SVG path style: a solid stroke, a dotted stroke, or a wide faint haze. */
  readonly style: "solid" | "dotted" | "haze";
  /** CSS custom-property name for the stroke colour (resolved by the cascade). */
  readonly stroke: string;
  /** SVG `stroke-dasharray` value; empty string for a continuous stroke. */
  readonly dash: string;
  /** Stroke (or haze body) width in px. */
  readonly widthPx: number;
  /** Stroke opacity — supports the treatment; never the SOLE confidence channel. */
  readonly opacity: number;
  /** Confidence lightness bucket (0 faintest .. 3 fullest), mirrors the stage. */
  readonly lightnessBucket: number;
}

/** The CSS custom-property name carrying a structural arc's status colour. */
function structuralStrokeToken(state: ArcState | undefined): string {
  switch (state) {
    case "stale":
      return "--color-state-stale";
    case "broken":
      return "--color-state-broken";
    default:
      return "--color-state-active"; // resolved (or unknown) = the active hue
  }
}

/**
 * Resolve an arc's tier (and optional structural state + confidence) to its
 * treatment descriptor — the timeline analogue of `edgeMeshes.groupColor` +
 * treatment selection. Declared draws a solid inked line; structural a solid
 * status-hued line; temporal a dotted line; semantic a wide faint haze. The
 * confidence bucket lightens temporal/semantic the same way the stage does
 * (fuller confidence = fuller ink), carried as a bucket the renderer can use.
 */
export function arcTreatment(
  tier: ArcTier,
  confidence: number,
  state?: ArcState,
): ArcTreatment {
  const bucket = confidenceBucket(confidence);
  switch (tier) {
    case "declared":
      return {
        tier,
        style: "solid",
        stroke: "--color-tier-declared",
        dash: "",
        widthPx: 1.5,
        opacity: 0.85,
        lightnessBucket: bucket,
      };
    case "structural":
      return {
        tier,
        style: "solid",
        stroke: structuralStrokeToken(state),
        dash: "",
        widthPx: 1.5,
        opacity: 0.85,
        lightnessBucket: bucket,
      };
    case "temporal":
      return {
        tier,
        style: "dotted",
        stroke: "--color-tier-temporal",
        dash: "2 4",
        widthPx: 1.25,
        // Confidence rides lightness (the bucket); a small opacity floor keeps
        // the dots legible without making opacity the sole confidence channel.
        opacity: 0.55 + bucket * 0.1,
        lightnessBucket: bucket,
      };
    case "semantic":
      return {
        tier,
        style: "haze",
        stroke: "--color-tier-semantic",
        dash: "",
        // The haze body widens slightly with confidence (width-by-score, like
        // the stage `hazeHalfWidth`), staying soft and wide.
        widthPx: 4 + bucket * 1.5,
        opacity: 0.18 + bucket * 0.05,
        lightnessBucket: bucket,
      };
  }
}

// --- arc geometry (S36) -------------------------------------------------------

/** A 2-D point in viewport pixel space (a mark's rendered position). */
export interface ArcPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * A smooth cubic SVG path connecting two mark positions, bowed vertically so the
 * arc lifts clear of the lane rows rather than cutting straight through them. The
 * bow direction is deterministic: an arc rising into an EARLIER (upper) lane bows
 * up, an arc flowing into a LATER (lower) lane bows down, so the derivation chain
 * reads as arcs flowing left-to-right and down (research -> adr -> plan -> exec)
 * then up to review and codify — exactly the ADR's left-to-right-and-down read.
 * Same-lane arcs bow up by a small fixed amount. The bow magnitude scales with
 * horizontal distance (clamped) so short arcs stay tight and long arcs arch.
 */
export function arcPath(from: ArcPoint, to: ArcPoint): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = Math.abs(dx);
  // Bow height grows with span, clamped so a multi-month arc does not balloon.
  const bow = Math.min(48, 12 + span * 0.12);
  // Direction: flowing DOWN (to a later lane) bows below; UP (earlier) above;
  // same lane bows up by the base amount. dy>0 means `to` is lower on screen.
  const dir = dy > 0 ? 1 : -1;
  const midX = from.x + dx / 2;
  const c1y = from.y + dir * bow;
  const c2y = to.y + dir * bow;
  return `M ${from.x} ${from.y} C ${midX} ${c1y} ${midX} ${c2y} ${to.x} ${to.y}`;
}

// --- arc model: the renderable arc with its endpoints resolved (S37) ----------

/** The minimal arc shape these helpers read (a wire `LineageArc` subset). */
export interface ArcInput {
  readonly id: string;
  readonly src: string;
  readonly dst: string;
  readonly tier: string;
  readonly confidence: number;
  /** Structural resolution state, when the wire carries one. */
  readonly state?: ArcState;
  /** The framework derivation label, when shipped (for the hover relation). */
  readonly derivation?: string;
  readonly relation?: string;
}

/** A fully-resolved arc ready to draw: its path, its treatment, its identity. */
export interface ResolvedArc {
  readonly id: string;
  readonly src: string;
  readonly dst: string;
  readonly path: string;
  readonly treatment: ArcTreatment;
  /** A short human label for the arc (derivation > relation > tier). */
  readonly label: string;
}

/** Coerce an unknown wire tier string to a known `ArcTier`, defaulting safely. */
function asArcTier(tier: string): ArcTier {
  return (ARC_TIERS as readonly string[]).includes(tier)
    ? (tier as ArcTier)
    : "structural";
}

/** A short human label for an arc — the derivation label when shipped, else the
 *  relation, else the tier — used for the hover/a11y announcement. */
export function arcLabel(arc: ArcInput): string {
  return arc.derivation ?? arc.relation ?? `${arc.tier} link`;
}

/**
 * The a11y phrase announcing an arc FROM one of its endpoints (S64): the relation
 * (the `arcLabel`) plus which node it joins and in which direction, so the
 * relation is announced from either endpoint without the arc becoming its own
 * tab-stop. From the `src` end an arc reads outgoing ("<relation> to <dst>"); from
 * the `dst` end it reads incoming ("<relation> from <src>"). `nameOf` resolves a
 * node id to a short human name. Pure and unit-testable.
 */
export function arcEndpointLabel(
  arc: ArcInput,
  end: "src" | "dst",
  nameOf: (id: string) => string,
): string {
  const relation = arcLabel(arc);
  return end === "src"
    ? `${relation} to ${nameOf(arc.dst)}`
    : `${relation} from ${nameOf(arc.src)}`;
}

/**
 * Resolve the arcs whose BOTH endpoints have a known position into renderable
 * arcs (path + treatment), dropping any arc with a missing endpoint so a
 * dangling arc never draws. Endpoint positions come from a lookup the renderer
 * builds for the in-range, visible-lane marks — so an arc only resolves when
 * both its marks are on screen, satisfying the "only when both endpoints are
 * in-range and their lanes visible" rule structurally.
 */
export function resolveArcs(
  arcs: readonly ArcInput[],
  positionOf: (id: string) => ArcPoint | undefined,
): ResolvedArc[] {
  const out: ResolvedArc[] = [];
  for (const arc of arcs) {
    const a = positionOf(arc.src);
    const b = positionOf(arc.dst);
    if (!a || !b) continue;
    const tier = asArcTier(arc.tier);
    out.push({
      id: arc.id,
      src: arc.src,
      dst: arc.dst,
      path: arcPath(a, b),
      treatment: arcTreatment(tier, arc.confidence, arc.state),
      label: arcLabel(arc),
    });
  }
  return out;
}

/**
 * The raw-arcs-under-cap path for v1 (S37): resolve the in-range arcs and apply
 * the belt-and-suspenders client ceiling so the surface never draws an unbounded
 * arc count even if served one. THIS IS THE v1 WORKING SURFACE — bundling (S38)
 * is layered on top and falls back to exactly this.
 */
export function rawArcs(
  arcs: readonly ArcInput[],
  positionOf: (id: string) => ArcPoint | undefined,
  max: number,
): Capped<ResolvedArc> {
  return capItems(resolveArcs(arcs, positionOf), max);
}

// --- HEB bundling + disparity filter (S38, hardening) -------------------------
//
// At coarse scale a raw arc field becomes a hairball; the settled discipline
// (graph-representation ADR, reused here) is hierarchical edge bundling along a
// containment grouping plus a disparity filter that thins the weak temporal/
// semantic arcs to their significant subset. This is a HARDENING LAYER: it is
// gated behind a `bundle` flag and ALWAYS falls back to the raw arcs, so the v1
// surface (raw arcs) is never broken by it. Bundling here groups arcs by their
// containment key (feature / lineage) and routes each group's arcs through a
// shared meeting point so cross-feature links read as clean threads.

/** A containment grouping for an arc — its feature/lineage membership key. The
 *  renderer derives this from node feature membership; absent => its own group. */
export type ContainmentKeyOf = (arc: ArcInput) => string;

/**
 * The disparity filter (S38): keep the SIGNIFICANT arcs of the weak tiers
 * (temporal, semantic) and always keep the strong tiers (declared, structural).
 * An arc is significant when its confidence clears `minConfidence`; declared and
 * structural arcs are framework-named lineage and are never thinned. This is the
 * "thin temporal/semantic to their significant subset" rule, pure and testable.
 */
export function disparityFilter(
  arcs: readonly ArcInput[],
  minConfidence: number,
): ArcInput[] {
  return arcs.filter((arc) => {
    const tier = asArcTier(arc.tier);
    if (tier === "declared" || tier === "structural") return true;
    return arc.confidence >= minConfidence;
  });
}

/**
 * Group arcs by their containment key — the HEB grouping. Returns a stable
 * insertion-ordered map so bundling is deterministic. Pure.
 */
export function groupByContainment(
  arcs: readonly ArcInput[],
  keyOf: ContainmentKeyOf,
): Map<string, ArcInput[]> {
  const groups = new Map<string, ArcInput[]>();
  for (const arc of arcs) {
    const key = keyOf(arc);
    const list = groups.get(key);
    if (list) list.push(arc);
    else groups.set(key, [arc]);
  }
  return groups;
}

/**
 * A bundled cubic path between two endpoints routed through a group MEETING
 * POINT — the HEB control point all arcs in a containment group share, pulling
 * cross-feature links into a clean thread. `strength` (0..1) is how far the path
 * is pulled toward the meeting point (1 = fully bundled, 0 = straight); v1
 * bundling uses a fixed strong pull. Pure geometry.
 */
export function bundledPath(
  from: ArcPoint,
  to: ArcPoint,
  meet: ArcPoint,
  strength: number,
): string {
  const s = Math.max(0, Math.min(1, strength));
  // Control points are the endpoints pulled toward the shared meeting point.
  const c1x = from.x + (meet.x - from.x) * s;
  const c1y = from.y + (meet.y - from.y) * s;
  const c2x = to.x + (meet.x - to.x) * s;
  const c2y = to.y + (meet.y - to.y) * s;
  return `M ${from.x} ${from.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${to.x} ${to.y}`;
}

/** How strongly bundled arcs are pulled toward their group meeting point. */
export const BUNDLE_STRENGTH = 0.85;

/**
 * The bundled-arcs path for coarse scale (S38). For each containment group it
 * computes a meeting point (the centroid of the group's endpoints) and routes
 * each arc through it with the bundle strength; the disparity filter has already
 * thinned the weak tiers. Arcs whose endpoints are not both positioned are
 * dropped (no dangling arc). The result is capped exactly like the raw path so
 * bundling never raises the ceiling.
 *
 * Gating: this is only CALLED when the renderer chooses to bundle (coarse scale);
 * when it does not, `rawArcs` is used and this code never runs — raw arcs are the
 * fallback by construction, so a bug here cannot break the v1 surface.
 */
export function bundledArcs(
  arcs: readonly ArcInput[],
  positionOf: (id: string) => ArcPoint | undefined,
  keyOf: ContainmentKeyOf,
  options: { minConfidence: number; max: number },
): Capped<ResolvedArc> {
  const thinned = disparityFilter(arcs, options.minConfidence);
  const groups = groupByContainment(thinned, keyOf);
  const out: ResolvedArc[] = [];
  for (const group of groups.values()) {
    // Meeting point: centroid of all positioned endpoints in the group.
    let sx = 0;
    let sy = 0;
    let n = 0;
    const positioned: { arc: ArcInput; a: ArcPoint; b: ArcPoint }[] = [];
    for (const arc of group) {
      const a = positionOf(arc.src);
      const b = positionOf(arc.dst);
      if (!a || !b) continue;
      positioned.push({ arc, a, b });
      sx += a.x + b.x;
      sy += a.y + b.y;
      n += 2;
    }
    if (n === 0) continue;
    const meet: ArcPoint = { x: sx / n, y: sy / n };
    for (const { arc, a, b } of positioned) {
      const tier = asArcTier(arc.tier);
      out.push({
        id: arc.id,
        src: arc.src,
        dst: arc.dst,
        path: bundledPath(a, b, meet, BUNDLE_STRENGTH),
        treatment: arcTreatment(tier, arc.confidence, arc.state),
        label: arcLabel(arc),
      });
    }
  }
  return capItems(out, options.max);
}

// --- un-bundle-on-hover (S39) -------------------------------------------------

/**
 * The incident arc ids for a node — the arcs touching it (src or dst). The
 * bundling-legibility affordance: the hovered node's incident arcs render RAW
 * (full, un-bundled) even when the rest are bundled, so a user can always trace
 * one node's true lineage through the bundle. Pure set computation.
 */
export function incidentArcIds(
  arcs: readonly ArcInput[],
  nodeId: string | null,
): Set<string> {
  const ids = new Set<string>();
  if (nodeId == null) return ids;
  for (const arc of arcs) {
    if (arc.src === nodeId || arc.dst === nodeId) ids.add(arc.id);
  }
  return ids;
}

/**
 * The composed render set when bundling is active and a node is hovered (S39):
 * the hovered node's incident arcs are resolved RAW (un-bundled, full treatment)
 * and the REST are bundled. This is the un-bundle-on-hover affordance — the
 * hovered ego is always legible through the bundle. When no node is hovered the
 * incident set is empty and the result is exactly `bundledArcs` (the raw subset
 * is empty), so the affordance adds nothing at rest. The combined result is
 * capped so the un-bundling can never exceed the ceiling.
 */
export function bundledWithHoverUnbundle(
  arcs: readonly ArcInput[],
  positionOf: (id: string) => ArcPoint | undefined,
  keyOf: ContainmentKeyOf,
  hoveredNodeId: string | null,
  options: { minConfidence: number; max: number },
): Capped<ResolvedArc> {
  const incident = incidentArcIds(arcs, hoveredNodeId);
  const rest = arcs.filter((a) => !incident.has(a.id));
  const hovered = arcs.filter((a) => incident.has(a.id));
  const bundled = bundledArcs(rest, positionOf, keyOf, options).items;
  const raw = resolveArcs(hovered, positionOf);
  // Un-bundled (raw) hovered arcs draw OVER the bundled rest; cap the union.
  return capItems([...bundled, ...raw], options.max);
}
