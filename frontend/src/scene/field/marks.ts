// Shared domain-mark source — one currentColor SVG per mark, consumed by
// BOTH the Pixi texture seam (`domainGlyphs.ts`, the GlyphTextureProvider)
// and the React chrome (`markComponents.tsx`), so the canvas and the DOM render the
// same silhouette from one source (iconography ADR: "both planes ultimately
// consume the same currentColor ink"). W02.P17.S33–S35.
//
// Two provenance classes live here, both as clean per-icon SVG on Phosphor's
// 256-unit grid with `fill="currentColor"` and rounded joins:
//
//   * ADOPTED — verbatim regular-weight path data lifted from
//     `@phosphor-icons/react` (the doc-type and event marks the iconography
//     ADR adopts directly). The path strings are the package's own geometry;
//     inlining them (rather than extracting from the React `createElement`
//     defs at runtime) keeps one deterministic `d` source shared by both
//     planes without a build-time SVG-asset pipeline.
//
//   * AUTHORED IN-FAMILY — the four abstract tier marks, the node-feature
//     species mark, and the lifecycle state set. No framework ships these
//     product semantics (research gap analysis); they are drawn on the same
//     256 grid in Phosphor's house style (rounded joins, single currentColor
//     ink, the documented redline geometry from the retired hand-drawn
//     family) so they read as one hand with the adopted marks.
//
// Every mark — adopted or authored — must pass the 14px grayscale-by-shape
// gate (`markGate.ts`): distinguishable in pure grayscale at the legibility
// floor by silhouette alone, hue never load-bearing.

import type { MarkDef } from "./markInk";

export { MARK_GRID, markSvg } from "./markInk";
export type { MarkDef } from "./markInk";

// --- ADOPTED: doc-type marks (verbatim Phosphor regular weight) --------------
//
// One distinct silhouette per vault doc-type species, mapped onto the
// GLYPH_KINDS vocabulary the field resolves a node kind to. The `feature`
// species is NOT here — it is the authored node-feature mark below.

const p = (d: string): string => `<path fill="currentColor" d="${d}"/>`;

/** research → Flask: the inquiry vessel (distinct tapered silhouette). */
const RESEARCH = p(
  "M221.69,199.77,160,96.92V40h8a8,8,0,0,0,0-16H88a8,8,0,0,0,0,16h8V96.92L34.31,199.77A16,16,0,0,0,48,224H208a16,16,0,0,0,13.72-24.23ZM110.86,103.25A7.93,7.93,0,0,0,112,99.14V40h32V99.14a7.93,7.93,0,0,0,1.14,4.11L183.36,167c-12,2.37-29.07,1.37-51.75-10.11-15.91-8.05-31.05-12.32-45.22-12.81ZM48,208l28.54-47.58c14.25-1.74,30.31,1.85,47.82,10.72,19,9.61,35,12.88,48,12.88a69.89,69.89,0,0,0,19.55-2.7L208,208Z",
);

/** adr → Diamond: the decision diamond (sharp 4-point rhombus). */
const ADR = p(
  "M235.33,116.72,139.28,20.66a16,16,0,0,0-22.56,0l-96,96.06a16,16,0,0,0,0,22.56l96.05,96.06h0a16,16,0,0,0,22.56,0l96.05-96.06a16,16,0,0,0,0-22.56ZM128,224h0L32,128,128,32,224,128Z",
);

/** plan → ClipboardText: the tabbed sheet with ruled lines. */
const PLAN = p(
  "M168,152a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,152Zm-8-40H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16Zm56-64V216a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V48A16,16,0,0,1,56,32H92.26a47.92,47.92,0,0,1,71.48,0H200A16,16,0,0,1,216,48ZM96,64h64a32,32,0,0,0-64,0ZM200,48H173.25A47.93,47.93,0,0,1,176,64v8a8,8,0,0,1-8,8H88a8,8,0,0,1-8-8V64a47.93,47.93,0,0,1,2.75-16H56V216H200Z",
);

/** exec → Terminal: the grounded action prompt (chevron + baseline). */
const EXEC = p(
  "M117.31,134l-72,64a8,8,0,1,1-10.63-12L100,128,34.69,70A8,8,0,1,1,45.32,58l72,64a8,8,0,0,1,0,12ZM216,184H120a8,8,0,0,0,0,16h96a8,8,0,0,0,0-16Z",
);

/** audit → SealCheck: the verified seal (scalloped disc + check). */
const AUDIT = p(
  "M225.86,102.82c-3.77-3.94-7.67-8-9.14-11.57-1.36-3.27-1.44-8.69-1.52-13.94-.15-9.76-.31-20.82-8-28.51s-18.75-7.85-28.51-8c-5.25-.08-10.67-.16-13.94-1.52-3.56-1.47-7.63-5.37-11.57-9.14C146.28,23.51,138.44,16,128,16s-18.27,7.51-25.18,14.14c-3.94,3.77-8,7.67-11.57,9.14C88,40.64,82.56,40.72,77.31,40.8c-9.76.15-20.82.31-28.51,8S41,67.55,40.8,77.31c-.08,5.25-.16,10.67-1.52,13.94-1.47,3.56-5.37,7.63-9.14,11.57C23.51,109.72,16,117.56,16,128s7.51,18.27,14.14,25.18c3.77,3.94,7.67,8,9.14,11.57,1.36,3.27,1.44,8.69,1.52,13.94.15,9.76.31,20.82,8,28.51s18.75,7.85,28.51,8c5.25.08,10.67.16,13.94,1.52,3.56,1.47,7.63,5.37,11.57,9.14C109.72,232.49,117.56,240,128,240s18.27-7.51,25.18-14.14c3.94-3.77,8-7.67,11.57-9.14,3.27-1.36,8.69-1.44,13.94-1.52,9.76-.15,20.82-.31,28.51-8s7.85-18.75,8-28.51c.08-5.25.16-10.67,1.52-13.94,1.47-3.56,5.37-7.63,9.14-11.57C232.49,146.28,240,138.44,240,128S232.49,109.73,225.86,102.82Zm-11.55,39.29c-4.79,5-9.75,10.17-12.38,16.52-2.52,6.1-2.63,13.07-2.73,19.82-.1,7-.21,14.33-3.32,17.43s-10.39,3.22-17.43,3.32c-6.75.1-13.72.21-19.82,2.73-6.35,2.63-11.52,7.59-16.52,12.38S132,224,128,224s-9.15-4.92-14.11-9.69-10.17-9.75-16.52-12.38c-6.1-2.52-13.07-2.63-19.82-2.73-7-.1-14.33-.21-17.43-3.32s-3.22-10.39-3.32-17.43c-.1-6.75-.21-13.72-2.73-19.82-2.63-6.35-7.59-11.52-12.38-16.52S32,132,32,128s4.92-9.15,9.69-14.11,9.75-10.17,12.38-16.52c2.52-6.1,2.63-13.07,2.73-19.82.1-7,.21-14.33,3.32-17.43S70.51,56.9,77.55,56.8c6.75-.1,13.72-.21,19.82-2.73,6.35-2.63,11.52-7.59,16.52-12.38S124,32,128,32s9.15,4.92,14.11,9.69,10.17,9.75,16.52,12.38c6.1,2.52,13.07,2.63,19.82,2.73,7,.1,14.33.21,17.43,3.32s3.22,10.39,3.32,17.43c.1,6.75.21,13.72,2.73,19.82,2.63,6.35,7.59,11.52,12.38,16.52S224,124,224,128,219.08,137.15,214.31,142.11ZM173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34Z",
);

/** reference → BookOpen: the open reference (wide bilateral silhouette). */
const REFERENCE = p(
  "M232,48H160a40,40,0,0,0-32,16A40,40,0,0,0,96,48H24a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H96a24,24,0,0,1,24,24,8,8,0,0,0,16,0,24,24,0,0,1,24-24h72a8,8,0,0,0,8-8V56A8,8,0,0,0,232,48ZM96,192H32V64H96a24,24,0,0,1,24,24V200A39.81,39.81,0,0,0,96,192Zm128,0H160a39.81,39.81,0,0,0-24,8V88a24,24,0,0,1,24-24h64Z",
);

/** code → Code: the bracket pair with slash (distinct angular silhouette). */
const CODE = p(
  "M69.12,94.15,28.5,128l40.62,33.85a8,8,0,1,1-10.24,12.29l-48-40a8,8,0,0,1,0-12.29l48-40a8,8,0,0,1,10.24,12.3Zm176,27.7-48-40a8,8,0,1,0-10.24,12.3L227.5,128l-40.62,33.85a8,8,0,1,0,10.24,12.29l48-40a8,8,0,0,0,0-12.29ZM162.73,32.48a8,8,0,0,0-10.25,4.79l-64,176a8,8,0,0,0,4.79,10.26A8.14,8.14,0,0,0,96,224a8,8,0,0,0,7.52-5.27l64-176A8,8,0,0,0,162.73,32.48Z",
);

// --- ADOPTED: event marks (verbatim Phosphor regular weight) -----------------
//
// The event vocabulary the iconography ADR adopts directly: git-commit for the
// commit event, file-plus / file-text for doc-created / doc-modified, and
// flag-pennant for the lifecycle event.

/** event:commit → GitCommit (adopted directly per the ADR). */
const EVENT_COMMIT = p(
  "M248,120H183.42a56,56,0,0,0-110.84,0H8a8,8,0,0,0,0,16H72.58a56,56,0,0,0,110.84,0H248a8,8,0,0,0,0-16ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z",
);

/** event:doc-created → FilePlus. */
const EVENT_DOC_CREATED = p(
  "M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-40-64a8,8,0,0,1-8,8H136v16a8,8,0,0,1-16,0V160H104a8,8,0,0,1,0-16h16V128a8,8,0,0,1,16,0v16h16A8,8,0,0,1,160,152Z",
);

/** event:doc-modified → FileText. */
const EVENT_DOC_MODIFIED = p(
  "M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-32-80a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,136Zm0,32a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,168Z",
);

/** event:lifecycle → FlagPennant. */
const EVENT_LIFECYCLE = p(
  "M242.63,96.44l-184-64A8,8,0,0,0,48,40V216a8,8,0,0,0,16,0V173.69l178.63-62.13a8,8,0,0,0,0-15.12ZM64,156.75V51.25L215.65,104Z",
);

// --- AUTHORED IN-FAMILY: the four abstract tier marks (S33) ------------------
//
// Bespoke product semantics — no framework ships them. Authored on the 256
// grid in Phosphor's house style, carrying the retired hand-drawn family's
// redline geometry (one distinct silhouette + treatment per tier, never
// hue-dependent). The four must stay mutually distinct under a 14px squint:
//
//   declared   — a solid filled diamond: the only filled tier MASS.
//   structural — an open square frame with an accent corner-notch: the only
//                rectilinear frame, asymmetric by its single bold corner.
//   temporal   — a dashed/segmented ring with a center dot: the only
//                segmented (non-continuous) silhouette.
//   semantic   — three stacked sine waves: the only multi-stroke wave field.
//
// Anchor geometry is exact (diamond on center 128,128; square frame axis-true;
// ring arcs anchored at 12 o'clock; waves on a shared baseline rhythm).

/** tier:declared — solid filled diamond on center (the only filled mass). The
 * points reach the safe-area extents (24/232 on both axes) so the silhouette is
 * an unmistakable rhombus, not a near-disc, at the 14px gate — this is what
 * separates it from `state:active` (a filled disc) across families with margin
 * rather than at the bare floor. */
const TIER_DECLARED = {
  id: "tier:declared",
  provenance: "authored" as const,
  body: p("M128,24 232,128 128,232 24,128 Z"),
};

/** tier:structural — open square frame + one bold accent corner-notch. */
const TIER_STRUCTURAL = {
  id: "tier:structural",
  provenance: "authored" as const,
  // Outer square with an inner square cut (the frame), then a short bold
  // notch riding the top-left corner — the asymmetry that fixes the reading.
  body:
    // open frame: outer 56..200, inner 88..168 (even-odd hole via winding)
    '<path fill="currentColor" fill-rule="evenodd" d="M56,56H200V200H56ZM84,84V172H172V84Z"/>' +
    // accent corner-notch: a thick round-jointed L at the top-left corner
    '<path fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" d="M56,96V56H96"/>',
};

/** tier:temporal — segmented (dashed) ring + center dot (the only dashed). */
const TIER_TEMPORAL = {
  id: "tier:temporal",
  provenance: "authored" as const,
  body:
    // dashed ring: r=80 about center, round-cap dashes anchored at 12 o'clock
    '<circle cx="128" cy="128" r="80" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-dasharray="42 42"/>' +
    // center dot
    '<circle cx="128" cy="128" r="18" fill="currentColor"/>',
};

/** tier:semantic — three stacked sine waves (the only multi-stroke field). */
const TIER_SEMANTIC = {
  id: "tier:semantic",
  provenance: "authored" as const,
  body:
    '<g fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M40,84 Q84,52 128,84 T216,84"/>' +
    '<path d="M40,128 Q84,96 128,128 T216,128"/>' +
    '<path d="M40,172 Q84,140 128,172 T216,172"/>' +
    "</g>",
};

export const TIER_MARK_DEFS = {
  declared: TIER_DECLARED,
  structural: TIER_STRUCTURAL,
  temporal: TIER_TEMPORAL,
  semantic: TIER_SEMANTIC,
} as const;

export type TierKey = keyof typeof TIER_MARK_DEFS;

// --- AUTHORED IN-FAMILY: the lifecycle state set (S34) -----------------------
//
// Composed from Phosphor state energies (check / archive / warning) on the same
// grid, honoring two documented collisions:
//   * active vs node-feature — `active` is a SOLID filled disc (a settled
//     center of energy); the node-feature mark (below) is a deliberately
//     OPEN, asymmetric multi-dot cluster. The filled-vs-open + single-vs-
//     multi distinction is what keeps them apart, and `active` must NOT grow a
//     ring (the state-active ring is the node-feature collision the ADR flags).
//   * broken-bolt — `broken` is a lightning bolt cutting THROUGH a baseline,
//     made tall with a widened line gap so the bolt-through-a-line silhouette
//     survives 14px (an earlier draft collapsed to a star/plus).

/** state:active — a solid filled disc (settled energy; NO ring, by redline). */
const STATE_ACTIVE = {
  id: "state:active",
  provenance: "authored" as const,
  body: '<circle cx="128" cy="128" r="56" fill="currentColor"/>',
};

/** state:complete — a bold check inside a ring (Phosphor CheckCircle energy). */
const STATE_COMPLETE = {
  id: "state:complete",
  provenance: "authored" as const,
  body: p(
    "M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z",
  ),
};

/** state:archived — the archive drawer (Phosphor Archive energy). */
const STATE_ARCHIVED = {
  id: "state:archived",
  provenance: "authored" as const,
  body: p(
    "M224,48H32A16,16,0,0,0,16,64V88a16,16,0,0,0,16,16v88a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V104a16,16,0,0,0,16-16V64A16,16,0,0,0,224,48ZM208,192H48V104H208ZM224,88H32V64H224V88ZM96,136a8,8,0,0,1,8-8h48a8,8,0,0,1,0,16H104A8,8,0,0,1,96,136Z",
  ),
};

/** state:broken — a tall lightning bolt cutting through a gapped baseline
 * (miter joins by redline: the one sanctioned sharp ornament). The baseline is
 * the documented broken-vs-gapped-line collision feature, so it must SURVIVE
 * the 14px gate: it sits on the y≈137 cell-center row (row 7 of the 14-row
 * gate, not the y=128 axis that falls between two rows and inks nothing) and is
 * stroked at 30 (a ~1.6px band at 14px) so its ink reaches that row. The bolt
 * occupies the center column (x≈96..176); the baseline segments stay clear of
 * it (left x≤84, right x≥172), so the through-a-line reading shows ink on the
 * baseline row OUTSIDE the bolt at the legibility floor. */
const STATE_BROKEN = {
  id: "state:broken",
  provenance: "authored" as const,
  body:
    // the bolt: tall zig with a clear central gap, sharp (miter) joins
    '<path fill="currentColor" d="M148,24 96,116 134,116 108,232 176,108 134,108 Z"/>' +
    // the broken baseline it cuts through, anchored on a gate cell-center row
    // (y=137) and thickened so its band inks at 14px, gapped at the bolt column
    '<path fill="none" stroke="currentColor" stroke-width="30" stroke-linecap="round" d="M32,137H84 M172,137H224"/>',
};

/** state:stale — a counter-clockwise clock (time slipping; Phosphor energy). */
const STATE_STALE = {
  id: "state:stale",
  provenance: "authored" as const,
  body: p(
    "M136,80v43.47l36.12,21.67a8,8,0,0,1-8.24,13.72l-40-24A8,8,0,0,1,120,128V80a8,8,0,0,1,16,0Zm-8-48A95.44,95.44,0,0,0,60.08,60.15C52.81,67.51,46.35,74.59,40,82V64a8,8,0,0,0-16,0v40a8,8,0,0,0,8,8H72a8,8,0,0,0,0-16H49c7.15-8.42,14.27-16.35,22.39-24.57a80,80,0,1,1,1.66,114.75,8,8,0,1,0-11,11.64A96,96,0,1,0,128,32Z",
  ),
};

export const STATE_MARK_DEFS = {
  active: STATE_ACTIVE,
  complete: STATE_COMPLETE,
  archived: STATE_ARCHIVED,
  broken: STATE_BROKEN,
  stale: STATE_STALE,
} as const;

export type StateKey = keyof typeof STATE_MARK_DEFS;

// --- AUTHORED IN-FAMILY: the node-feature species mark (S35) ------------------
//
// The deliberately-asymmetric compound species mark — the constellation's
// center-of-gravity glyph. Redline geometry from the retired family, carried
// onto the 256 grid (×~10.67 from the 24 grid):
//   * three dot SIZES (not three equal dots) in a SCALENE triangle, the
//     LARGEST low-left — breaks facial symmetry so it never reads as a face.
//   * the binding loop left OPEN with a ~70° gap at the upper-left (a sketched
//     lasso, not a closed head).
//   * ONE detail-weight thread between the two SMALLER dots, steeply diagonal,
//     with clear air around each dot so it never fuses into a bar (a near-
//     vertical fused thread reads as an exclamation mark — avoided).
// Collision guards: vs state:active (active is a SINGLE solid disc, this is a
// MULTI-dot open cluster) and vs the state-active ring (this mark's open lasso
// has a deliberate gap and unequal interior, never a clean closed ring).

export const NODE_FEATURE_MARK = {
  id: "feature",
  provenance: "authored" as const,
  body:
    // open binding lasso: an arc with a ~70° gap at the upper-left
    '<path fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round" ' +
    'd="M84,72 A76,76 0 1 1 72,92"/>' +
    // detail-weight thread between the two SMALLER dots (upper + right),
    // steeply diagonal, stopping short of each dot (clear air)
    '<path fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" ' +
    'd="M150,96 173,148"/>' +
    // three dots, three sizes, scalene — largest LOW-LEFT
    '<circle cx="96" cy="168" r="26" fill="currentColor"/>' + // largest, low-left
    '<circle cx="140" cy="82" r="18" fill="currentColor"/>' + // mid, upper
    '<circle cx="182" cy="160" r="13" fill="currentColor"/>', // smallest, right
};

// --- AUTHORED IN-FAMILY: the status-stamp mark families (node-visual-richness) -
//
// Two NEW authored families for the status-stamp prototype, drawn on the same
// 256 grid in Phosphor's house style (rounded joins, single currentColor ink),
// so they read as one hand with the existing marks. Both are the SHAPE channel
// for a node's status — hue never load-bearing — and both must clear the 14px
// grayscale-by-shape gate (`markGate.ts`) within their family.
//
//   * status-severity-1..4 — ONE large dot at four fill levels: hollow ring,
//     quarter-filled (a bottom band), half-filled (lower hemisphere), and a
//     solid disc. The four silhouettes differ by how much of the SAME disc
//     footprint is inked, so the gate (true ink coverage, winding-rule fills,
//     hollow holes preserved) reads them as four distinct masses. The disc is
//     sized large (r≈74) so each fill increment moves well above the squint
//     floor at 14px.
//
//   * status-tier-1..4 — a stepped staircase notch with 1..4 filled steps,
//     ascending left-to-right. Each added step inks a new tall column on the
//     right, so the silhouettes grow monotonically and separate by whole
//     columns — the cleanest possible four-way grayscale ladder.
//
// Authoring discipline mirrors TIER_MARK_DEFS / STATE_MARK_DEFS above: each
// def is `{ id, provenance: "authored", body }`, registered into
// ALL_MARK_DEFS / TEXTURABLE_MARK_DEFS via the family map below.

// -- status-severity: a gauge, four fill levels -------------------------------
// A clock GAUGE that fills as severity rises: a thick round-capped arc anchored
// at 12 o'clock, sweeping clockwise by 1/4, 2/4, 3/4 of the circle, closing to a
// full ring at level 4. The "how much of the ring is filled" reading is the
// fill-level metaphor, made grayscale-safe by ARC LENGTH alone — never hue.
//
// Why an arc gauge and NOT a solid/growing disc: a filled disc rasterizes
// identically to the existing `state:active` mark (a solid disc) at 14px, a
// cross-family collision the CROSS-FAMILY gate rightly rejects. The hollow arc
// keeps the dot's center empty, so every severity level stays clear of the
// solid-disc and ring marks already in the family (measured: ≥37 cells from
// state:active / state:complete; within-family min-distance 11, floor 8, and
// the WHOLE cross-family TEXTURABLE set still clears the floor at 11).

const SEV_CX = 128;
const SEV_CY = 128;
const SEV_R = 72;
const SEV_SW = 30;

/** A round-capped gauge arc from 12 o'clock, sweeping `fraction` of the circle. */
function severityArc(fraction: number): string {
  const start = -Math.PI / 2;
  const end = start + fraction * 2 * Math.PI - 1e-4;
  const x0 = (SEV_CX + SEV_R * Math.cos(start)).toFixed(2);
  const y0 = (SEV_CY + SEV_R * Math.sin(start)).toFixed(2);
  const x1 = (SEV_CX + SEV_R * Math.cos(end)).toFixed(2);
  const y1 = (SEV_CY + SEV_R * Math.sin(end)).toFixed(2);
  const large = fraction > 0.5 ? 1 : 0;
  return (
    `<path fill="none" stroke="currentColor" stroke-width="${SEV_SW}" ` +
    `stroke-linecap="round" d="M${x0},${y0} A${SEV_R},${SEV_R} 0 ${large} 1 ${x1},${y1}"/>`
  );
}

/** severity 1 — a quarter gauge (the lowest grade). */
const STATUS_SEVERITY_1 = {
  id: "status-severity-1",
  provenance: "authored" as const,
  body: severityArc(0.25),
};

/** severity 2 — a half gauge. */
const STATUS_SEVERITY_2 = {
  id: "status-severity-2",
  provenance: "authored" as const,
  body: severityArc(0.5),
};

/** severity 3 — a three-quarter gauge. */
const STATUS_SEVERITY_3 = {
  id: "status-severity-3",
  provenance: "authored" as const,
  body: severityArc(0.75),
};

/** severity 4 — a full ring gauge (the highest grade). */
const STATUS_SEVERITY_4 = {
  id: "status-severity-4",
  provenance: "authored" as const,
  body:
    `<circle cx="${SEV_CX}" cy="${SEV_CY}" r="${SEV_R}" ` +
    `fill="none" stroke="currentColor" stroke-width="${SEV_SW}"/>`,
};

// -- status-tier: a staircase, 1..4 filled steps ------------------------------
// Steps ascend left→right; level N inks the leftmost N columns as tall bars of
// increasing height, so each added step inks a NEW column — four monotonically
// growing silhouettes. Columns are wide (≈44u) and tall enough that one column
// clears the squint floor at 14px.

const TIER_STEP = (n: 1 | 2 | 3 | 4): string => {
  // Four columns across x=40..216 (44u each), bottoms anchored at y=216, with
  // heights stepping up: col1 short … col4 tall. Only the first n columns ink.
  const cols: Array<[number, number]> = [
    [40, 150], // [x, top-y] — col 1 (shortest)
    [86, 118], // col 2
    [132, 86], // col 3
    [178, 54], // col 4 (tallest)
  ];
  return cols
    .slice(0, n)
    .map(
      ([x, top]) =>
        `<rect x="${x}" y="${top}" width="38" height="${216 - top}" ` +
        'fill="currentColor"/>',
    )
    .join("");
};

const STATUS_TIER_1 = {
  id: "status-tier-1",
  provenance: "authored" as const,
  body: TIER_STEP(1),
};
const STATUS_TIER_2 = {
  id: "status-tier-2",
  provenance: "authored" as const,
  body: TIER_STEP(2),
};
const STATUS_TIER_3 = {
  id: "status-tier-3",
  provenance: "authored" as const,
  body: TIER_STEP(3),
};
const STATUS_TIER_4 = {
  id: "status-tier-4",
  provenance: "authored" as const,
  body: TIER_STEP(4),
};

/**
 * The two status-stamp mark families, in fill/step order. Indexed 1..4 by the
 * severity grade (graded ordinal) and the tier rank (tiered ordinal) the
 * `statusStamp` descriptor carries.
 */
export const STATUS_MARK_DEFS: ReadonlyArray<MarkDef> = [
  STATUS_SEVERITY_1,
  STATUS_SEVERITY_2,
  STATUS_SEVERITY_3,
  STATUS_SEVERITY_4,
  STATUS_TIER_1,
  STATUS_TIER_2,
  STATUS_TIER_3,
  STATUS_TIER_4,
];

/** The severity dots, indexed by fill level 1..4 (graded ordinal). */
export const STATUS_SEVERITY_MARK_DEFS = {
  1: STATUS_SEVERITY_1,
  2: STATUS_SEVERITY_2,
  3: STATUS_SEVERITY_3,
  4: STATUS_SEVERITY_4,
} as const;

/** The tier notches, indexed by step count 1..4 (tiered ordinal). */
export const STATUS_TIER_MARK_DEFS = {
  1: STATUS_TIER_1,
  2: STATUS_TIER_2,
  3: STATUS_TIER_3,
  4: STATUS_TIER_4,
} as const;

// --- the assembled inventory --------------------------------------------------

/**
 * The full doc-type + event + feature silhouette inventory, keyed by the
 * GLYPH_KINDS species the field resolves a node kind to (plus the event keys).
 * `feature` is the authored node-feature mark; every other doc-type is adopted.
 */
export const DOC_TYPE_MARK_DEFS: Record<string, MarkDef> = {
  feature: NODE_FEATURE_MARK,
  research: { id: "research", provenance: "adopted", body: RESEARCH },
  adr: { id: "adr", provenance: "adopted", body: ADR },
  plan: { id: "plan", provenance: "adopted", body: PLAN },
  exec: { id: "exec", provenance: "adopted", body: EXEC },
  audit: { id: "audit", provenance: "adopted", body: AUDIT },
  reference: { id: "reference", provenance: "adopted", body: REFERENCE },
  code: { id: "code", provenance: "adopted", body: CODE },
};

/** The four event marks, keyed by event kind. */
export const EVENT_MARK_DEFS: Record<string, MarkDef> = {
  commit: { id: "event:commit", provenance: "adopted", body: EVENT_COMMIT },
  "doc-created": {
    id: "event:doc-created",
    provenance: "adopted",
    body: EVENT_DOC_CREATED,
  },
  "doc-modified": {
    id: "event:doc-modified",
    provenance: "adopted",
    body: EVENT_DOC_MODIFIED,
  },
  lifecycle: { id: "event:lifecycle", provenance: "adopted", body: EVENT_LIFECYCLE },
};

/**
 * Every mark in the domain family, by stable id. The single registry both the
 * texture seam and the React chrome resolve against, so neither plane defines
 * its own mark source.
 */
export const ALL_MARK_DEFS: Record<string, MarkDef> = {
  ...DOC_TYPE_MARK_DEFS,
  ...Object.fromEntries(Object.values(EVENT_MARK_DEFS).map((d) => [d.id, d])),
  ...Object.fromEntries(Object.values(TIER_MARK_DEFS).map((d) => [d.id, d])),
  ...Object.fromEntries(Object.values(STATE_MARK_DEFS).map((d) => [d.id, d])),
  ...Object.fromEntries(STATUS_MARK_DEFS.map((d) => [d.id, d])),
};

/** Resolve a mark def by id, or undefined when unknown (caller falls back). */
export function markDef(id: string): MarkDef | undefined {
  return ALL_MARK_DEFS[id];
}

/**
 * Every mark that can be rasterized into a texture — exactly what
 * `DomainGlyphs.textureForMark(id)` can resolve, deduplicated by stable id.
 * The cross-family grayscale gate runs over this whole set, not just within a
 * single family, because the texture seam can turn ANY of these into a
 * silhouette and a cross-family collision (e.g. a filled diamond vs a filled
 * disc) would otherwise ship untested.
 */
export const TEXTURABLE_MARK_DEFS: ReadonlyArray<MarkDef> =
  Object.values(ALL_MARK_DEFS);
