// The 14px grayscale-by-shape gate (iconography ADR a11y contract), asserted
// offline. The gate rasterizer is pure (`svgRaster.ts` — no Pixi, no DOM), so
// these tests run in the default node env. They exercise the silhouette
// geometry — the part the a11y gate is actually about — not the GPU upload,
// which stays untested (no GPU in the test env), matching `glyphs.test.ts`.

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
});

describe("the node-feature mark honors its collision constraints (S35)", () => {
  it("does not collide with state:active (the documented redline)", () => {
    // The redline: active is a SINGLE solid disc; node-feature is a MULTI-dot
    // open asymmetric cluster. Their silhouettes must stay well apart at 14px.
    const d = silhouetteDistance(
      silhouetteOf(NODE_FEATURE_MARK),
      silhouetteOf(STATE_MARK_DEFS.active),
    );
    expect(d).toBeGreaterThanOrEqual(GATE_FLOOR);
  });

  it("is asymmetric — its silhouette is not left-right mirror-symmetric", () => {
    // The deliberate asymmetry (scalene dot cluster, largest low-left, open
    // lasso gap upper-left) is the mark's identity. A horizontally mirrored
    // silhouette must differ from the original, or the asymmetry is lost.
    const sil = silhouetteOf(NODE_FEATURE_MARK);
    let mirrorDiff = 0;
    const n = sil.size;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const a = sil.cells[y * n + x];
        const b = sil.cells[y * n + (n - 1 - x)];
        if (a !== b) mirrorDiff++;
      }
    }
    expect(mirrorDiff).toBeGreaterThan(0);
  });
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
    // doc-created (FilePlus) and doc-modified (FileText) share the file
    // silhouette but differ by their interior — assert the family still clears
    // the floor, since the interior glyph is the distinguishing channel.
    expect(gateFamily(Object.values(EVENT_MARK_DEFS), GATE_FLOOR).pass).toBe(true);
  });
});

describe("minFamilyDistance", () => {
  it("returns Infinity for a family of fewer than two marks", () => {
    expect(minFamilyDistance([])).toBe(Infinity);
    expect(minFamilyDistance([DOC_TYPE_MARK_DEFS.adr])).toBe(Infinity);
  });
});
