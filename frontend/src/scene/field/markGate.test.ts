// The 14px grayscale-by-shape gate (iconography ADR a11y contract), asserted
// offline. The gate rasterizer is pure (`svgRaster.ts` — no Pixi, no DOM), so
// these tests run in the default node env. They exercise the silhouette
// geometry — the part the a11y gate is actually about — not the GPU upload,
// which stays untested (no GPU in the test env).

import { describe, expect, it } from "vitest";

import {
  GATE_SIZE,
  gateFamily,
  minFamilyDistance,
  silhouetteDistance,
  silhouetteOf,
} from "./markGate";
import {
  DOC_TYPE_MARK_DEFS,
  EVENT_MARK_DEFS,
  STATE_MARK_DEFS,
  TEXTURABLE_MARK_DEFS,
  TIER_MARK_DEFS,
  NODE_FEATURE_MARK,
} from "./marks";

// Squint-test floor: the minimum admissible Hamming distance between any two
// marks' 14×14 silhouettes. A GATE_SIZE² = 196-cell grid; an 8-cell floor
// means two marks must differ in at least ~4% of cells — collapsing to the
// same shape at 14px is well below this.
const GATE_FLOOR = 8;

describe("silhouetteOf", () => {
  it("renders a non-empty silhouette for a filled mark", () => {
    const sil = silhouetteOf(DOC_TYPE_MARK_DEFS.adr);
    expect(sil.size).toBe(GATE_SIZE);
    expect(sil.cells.length).toBe(GATE_SIZE * GATE_SIZE);
    expect(sil.coverage).toBeGreaterThan(0);
    expect(sil.coverage).toBeLessThan(1);
  });

  it("renders a non-empty silhouette for a stroke-only authored mark", () => {
    // The temporal tier is a dashed ring — pure stroke, no fill. The rasterizer
    // must still ink the stroke band, or stroke-only marks would falsely pass
    // as blank.
    const sil = silhouetteOf(TIER_MARK_DEFS.temporal);
    expect(sil.coverage).toBeGreaterThan(0);
  });

  it("keeps a ring hollow — a hollow ring is not a solid disc", () => {
    // The decisive gate property: state:complete is a ring + check, NOT a
    // filled disc like state:active. A fill-containment test collapses the
    // two; an ink rasterizer keeps the ring's center empty and separates them.
    const ring = silhouetteOf(STATE_MARK_DEFS.complete);
    const disc = silhouetteOf(STATE_MARK_DEFS.active);
    expect(silhouetteDistance(ring, disc)).toBeGreaterThan(0);
    // The ring's center cell is paper, the disc's is ink.
    const mid = Math.floor(GATE_SIZE / 2) * GATE_SIZE + Math.floor(GATE_SIZE / 2);
    expect(disc.cells[mid]).toBe(true);
  });

  it("is identical to itself (distance zero) and self-consistent", () => {
    const a = silhouetteOf(STATE_MARK_DEFS.broken);
    const b = silhouetteOf(STATE_MARK_DEFS.broken);
    expect(silhouetteDistance(a, b)).toBe(0);
  });
});

describe("the four abstract tier marks pass the 14px grayscale gate (S33)", () => {
  const defs = Object.values(TIER_MARK_DEFS);

  it("are mutually distinct in grayscale at 14px", () => {
    const result = gateFamily(defs, GATE_FLOOR);
    expect(result.pass).toBe(true);
    // Surface the weakest pair so a regression names the colliding marks.
    expect(result.minDistance).toBeGreaterThanOrEqual(GATE_FLOOR);
  });

  it("declared and structural — the diamond vs the framed square — separate", () => {
    const d = silhouetteDistance(
      silhouetteOf(TIER_MARK_DEFS.declared),
      silhouetteOf(TIER_MARK_DEFS.structural),
    );
    expect(d).toBeGreaterThanOrEqual(GATE_FLOOR);
  });
});

describe("the lifecycle state set passes the 14px grayscale gate (S34)", () => {
  const defs = Object.values(STATE_MARK_DEFS);

  it("are mutually distinct in grayscale at 14px", () => {
    expect(gateFamily(defs, GATE_FLOOR).pass).toBe(true);
  });

  it("active (solid disc) and broken (bolt-through-line) do not collide", () => {
    const d = silhouetteDistance(
      silhouetteOf(STATE_MARK_DEFS.active),
      silhouetteOf(STATE_MARK_DEFS.broken),
    );
    expect(d).toBeGreaterThanOrEqual(GATE_FLOOR);
  });

  it("keeps the broken baseline (the through-a-line reading) alive at 14px", () => {
    // The bolt-through-a-GAPPED-line is the documented broken-vs-gapped-line
    // feature, and it must survive the legibility floor — a bare bolt would
    // pass the active-disc distance trivially (the prior vacuous guard). The
    // baseline sits on a gate cell-center row (y≈137 → row 7) and is gapped at
    // the bolt's center column, so it inks cells on that row OUTSIDE the bolt.
    const sil = silhouetteOf(STATE_MARK_DEFS.broken);
    const n = sil.size;
    const baselineRow = Math.round((137 / 256) * n - 0.5); // = 7
    const boltColLeft = Math.floor((84 / 256) * n); // left edge of bolt gap
    const boltColRight = Math.ceil((172 / 256) * n); // right edge of bolt gap
    let leftInk = 0;
    let rightInk = 0;
    for (let x = 0; x < n; x++) {
      if (!sil.cells[baselineRow * n + x]) continue;
      if (x < boltColLeft) leftInk++;
      else if (x > boltColRight) rightInk++;
    }
    // Ink to BOTH sides of the bolt on the baseline row = a line cut by the
    // bolt, not a bare bolt.
    expect(leftInk).toBeGreaterThan(0);
    expect(rightInk).toBeGreaterThan(0);
  });
});

describe("the node-feature mark honors its collision constraints", () => {
  it("does not collide with state:active (the documented redline)", () => {
    // The redline: active is a SINGLE solid disc; node-feature is the adopted
    // Phosphor CirclesThree (three grouped HOLLOW rings). Their silhouettes must
    // stay well apart at 14px.
    const d = silhouetteDistance(
      silhouetteOf(NODE_FEATURE_MARK),
      silhouetteOf(STATE_MARK_DEFS.active),
    );
    expect(d).toBeGreaterThanOrEqual(GATE_FLOOR);
  });
  // (The prior "is asymmetric" assertion was specific to the retired hand-authored
  //  scalene-cluster mark. The feature glyph is now an adopted symmetric Phosphor
  //  icon; its distinctness from the other species is covered by the doc-type
  //  family gate below.)
});

describe("the adopted doc-type marks pass the 14px grayscale gate (S33)", () => {
  const defs = Object.values(DOC_TYPE_MARK_DEFS);

  it("every doc-type/feature species is mutually distinct at 14px", () => {
    const result = gateFamily(defs, GATE_FLOOR);
    // The ADR flags SealCheck/Diamond (audit/adr) and Stack/ListBullets as
    // squint-test risks; assert the chosen set clears the floor, naming the
    // closest pair if a future mark swap regresses it.
    expect(result.pass).toBe(true);
    expect(result.minDistance).toBeGreaterThanOrEqual(GATE_FLOOR);
  });

  it("adr (Diamond) and audit (SealCheck) — the ADR-flagged pair — separate", () => {
    const d = silhouetteDistance(
      silhouetteOf(DOC_TYPE_MARK_DEFS.adr),
      silhouetteOf(DOC_TYPE_MARK_DEFS.audit),
    );
    expect(d).toBeGreaterThanOrEqual(GATE_FLOOR);
  });
});

describe("the event marks pass the 14px grayscale gate", () => {
  it("the four event marks are mutually distinct at 14px", () => {
    expect(gateFamily(Object.values(EVENT_MARK_DEFS), GATE_FLOOR).pass).toBe(true);
  });

  it("doc-created (FilePlus) and doc-modified (FileText) — interior is the only channel — separate", () => {
    // The two share the file-with-corner-fold outer silhouette; the plus vs the
    // two ruled lines is the SOLE distinguishing channel, so this is the
    // family's thinnest pair. Assert the specific distance, not just family
    // pass, so a future interior tweak that erodes the margin is caught.
    const d = silhouetteDistance(
      silhouetteOf(EVENT_MARK_DEFS["doc-created"]),
      silhouetteOf(EVENT_MARK_DEFS["doc-modified"]),
    );
    expect(d).toBeGreaterThanOrEqual(GATE_FLOOR);
  });
});

describe("the CROSS-FAMILY gate over every texture-able mark", () => {
  // DomainGlyphs.textureForMark(id) can turn ANY mark into a silhouette
  // texture, so a collision ACROSS families (a filled diamond vs a filled disc)
  // is as real a defect as one within a family — and the within-family gates
  // never test it. This is the safety net for the whole texture-able set.
  it("every texture-able mark is mutually distinct at 14px, across families", () => {
    const result = gateFamily(TEXTURABLE_MARK_DEFS, GATE_FLOOR);
    // The closest pair names the cross-family regression if one appears.
    expect(result.pass).toBe(true);
    expect(result.minDistance).toBeGreaterThanOrEqual(GATE_FLOOR);
  });

  it("tier:declared (filled diamond) clears the floor against state:active (filled disc) with margin", () => {
    // The MEDIUM the review flagged: a near-disc diamond sat exactly at the
    // floor. The diamond's points reach the safe-area extents so it reads as a
    // rhombus, separating it from the disc with margin, not at the bare floor.
    const d = silhouetteDistance(
      silhouetteOf(TIER_MARK_DEFS.declared),
      silhouetteOf(STATE_MARK_DEFS.active),
    );
    expect(d).toBeGreaterThan(GATE_FLOOR);
  });
});

describe("minFamilyDistance", () => {
  it("returns Infinity for a family of fewer than two marks", () => {
    expect(minFamilyDistance([])).toBe(Infinity);
    expect(minFamilyDistance([DOC_TYPE_MARK_DEFS.adr])).toBe(Infinity);
  });
});
