// Derivation arcs for the phase-lane timeline (dashboard-timeline ADR
// "Representation", W03.P06.S36-S37): the pure geometry + tier-as-treatment
// resolver + the on-demand incident-arc resolver. The component (`Timeline`)
// renders the descriptors these helpers return as SVG `<path>`s.
//
// Relations are an ON-DEMAND overlay, never an always-on field: the default view
// is dated marks only, and a node's 1-hop derivation arcs are resolved and drawn
// only while that node is hovered or selected. `incidentResolvedArcs` is the one
// resolver the surface calls — it takes a focused node id and returns ONLY that
// node's incident arcs, resolved to paths + treatment. There is no whole-corpus
// arc field to bundle or thin, so the HEB-bundling / disparity-filter machinery
// the v1 surface carried is gone.
//
// Tier-as-treatment vocabulary (reused from the stage edge styling in
// `edgeStyle.ts` — the MAPPING and the token names): declared = solid inked line;
// structural = solid, status-hued (resolved/stale/broken); temporal = dotted;
// semantic = a faint wide haze. Line treatment is the PRIMARY channel and hue is
// secondary, so the arc reads in grayscale at the 14px gate; confidence rides
// LIGHTNESS (a four-bucket lightness step), never opacity alone — mirroring
// edgeStyle's `confidenceBucket`/`bucketLightness` so the timeline matches the
// stage for free.
//
// Pure + deterministic. Every helper is a referentially-transparent function of
// its arguments — no DOM, no React, no tokens read at runtime; treatment carries
// the CSS custom-property NAME and the consumer resolves it through the cascade
// (the SVG lives in a real cascade, so `var()` resolves directly — the literal-
// hex-via-getComputedStyle hazard does not apply here). Fully unit-testable.

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
 * Resolve a single arc into a renderable arc (path + treatment) when BOTH its
 * endpoints have a known position, else `null`. A dangling arc (a missing
 * endpoint — off-screen or its lane hidden) never draws. The shared resolution
 * step for the on-demand incident overlay.
 */
function resolveArc(
  arc: ArcInput,
  positionOf: (id: string) => ArcPoint | undefined,
): ResolvedArc | null {
  const a = positionOf(arc.src);
  const b = positionOf(arc.dst);
  if (!a || !b) return null;
  const tier = asArcTier(arc.tier);
  return {
    id: arc.id,
    src: arc.src,
    dst: arc.dst,
    path: arcPath(a, b),
    treatment: arcTreatment(tier, arc.confidence, arc.state),
    label: arcLabel(arc),
  };
}

// --- on-demand incident-arc resolver (the relations overlay) ------------------
//
// Relations are an ON-DEMAND overlay: the default view is marks only, and the
// surface draws ONLY the focused (hovered/selected) node's 1-hop derivation arcs.
// This is intrinsically bounded — a single node's incident set is small — so no
// bundling, disparity filter, or client arc-ceiling is needed; the always-on
// hairball the v1 surface fought is structurally absent.

/**
 * The incident arc ids for a node — the arcs touching it (src or dst). Pure set
 * computation; the focused node's 1-hop edge identities.
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
 * Resolve ONLY the focused node's incident arcs into renderable arcs (path +
 * treatment). When no node is focused (`nodeId == null`) the result is empty —
 * the marks-only default. Arcs whose other endpoint is not positioned (off-screen
 * or its lane hidden) are dropped, so no dangling arc draws. Deterministic and
 * insertion-ordered over the input arcs.
 */
export function incidentResolvedArcs(
  arcs: readonly ArcInput[],
  positionOf: (id: string) => ArcPoint | undefined,
  nodeId: string | null,
): ResolvedArc[] {
  if (nodeId == null) return [];
  const out: ResolvedArc[] = [];
  for (const arc of arcs) {
    if (arc.src !== nodeId && arc.dst !== nodeId) continue;
    const resolved = resolveArc(arc, positionOf);
    if (resolved) out.push(resolved);
  }
  return out;
}
