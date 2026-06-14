// The status → stamp-treatment table, asserted exhaustively (node-visual-
// richness prototype). `statusStamp.ts` is pure (no Pixi, no DOM), so this runs
// in the default node env. Every doc-type status the spec enumerates is driven
// through the resolved-class shape the engine would carry, and the FULL table is
// asserted — including the compound superseded-rule case and the unparseable
// (no-stamp) floor.

import { describe, expect, it } from "vitest";

import { type NodeStatus, type StatusClass, stampFor, stampToken } from "./statusStamp";

// The authoritative doc-type → resolved-status fixtures (spec table). Each row
// is the status the engine would carry for that vocabulary term, paired with
// the descriptor `stampFor` must produce.
const adr = (value: string, cls: StatusClass): NodeStatus => ({ value, class: cls });

describe("stampFor — the authoritative status table (every doc-type status)", () => {
  it("adr: proposed → dashed ring (provisional)", () => {
    expect(stampFor(adr("proposed", "provisional"))).toEqual({
      ring: "dashed",
      ghost: false,
      slash: false,
    });
  });

  it("adr: accepted → solid ring (affirmed)", () => {
    expect(stampFor(adr("accepted", "affirmed"))).toEqual({
      ring: "solid",
      ghost: false,
      slash: false,
    });
  });

  it("adr: rejected → slash, no ring (negated)", () => {
    expect(stampFor(adr("rejected", "negated"))).toEqual({
      ring: "none",
      ghost: false,
      slash: true,
    });
  });

  it("adr: deprecated → ghost, no ring, no slash (retired)", () => {
    expect(stampFor(adr("deprecated", "retired"))).toEqual({
      ring: "none",
      ghost: true,
      slash: false,
    });
  });

  it("rule: active → solid ring (affirmed)", () => {
    expect(stampFor(adr("active", "affirmed"))).toEqual({
      ring: "solid",
      ghost: false,
      slash: false,
    });
  });

  it("rule: superseded → ghost AND slash (retired + negated)", () => {
    // The compound case: the engine carries class `retired` value `superseded`,
    // meaning the node is both retired (ghost) and negated (slash).
    expect(stampFor({ value: "superseded", class: "retired" })).toEqual({
      ring: "none",
      ghost: true,
      slash: true,
    });
  });

  it("feature: in_flight → solid ring (affirmed)", () => {
    expect(stampFor(adr("in_flight", "affirmed"))).toEqual({
      ring: "solid",
      ghost: false,
      slash: false,
    });
  });

  it("feature: archived → ghost, no slash (retired, value is not superseded)", () => {
    expect(stampFor(adr("archived", "retired"))).toEqual({
      ring: "none",
      ghost: true,
      slash: false,
    });
  });

  describe("audit: severity grade → severity dot fill level", () => {
    it("critical → severity dot 4", () => {
      expect(stampFor({ value: "critical", class: "graded", ordinal: 4 })).toEqual({
        ghost: false,
        slash: false,
        severityDot: 4,
      });
    });
    it("high → severity dot 3", () => {
      expect(stampFor({ value: "high", class: "graded", ordinal: 3 })).toEqual({
        ghost: false,
        slash: false,
        severityDot: 3,
      });
    });
    it("medium → severity dot 2", () => {
      expect(stampFor({ value: "medium", class: "graded", ordinal: 2 })).toEqual({
        ghost: false,
        slash: false,
        severityDot: 2,
      });
    });
    it("low → severity dot 1", () => {
      expect(stampFor({ value: "low", class: "graded", ordinal: 1 })).toEqual({
        ghost: false,
        slash: false,
        severityDot: 1,
      });
    });
  });

  describe("plan: tier L1..L4 → tier notch 1..4", () => {
    it("L1 → tier notch 1", () => {
      expect(stampFor({ value: "L1", class: "tiered", ordinal: 1 })).toEqual({
        ghost: false,
        slash: false,
        tierNotch: 1,
      });
    });
    it("L2 → tier notch 2", () => {
      expect(stampFor({ value: "L2", class: "tiered", ordinal: 2 })).toEqual({
        ghost: false,
        slash: false,
        tierNotch: 2,
      });
    });
    it("L3 → tier notch 3", () => {
      expect(stampFor({ value: "L3", class: "tiered", ordinal: 3 })).toEqual({
        ghost: false,
        slash: false,
        tierNotch: 3,
      });
    });
    it("L4 → tier notch 4", () => {
      expect(stampFor({ value: "L4", class: "tiered", ordinal: 4 })).toEqual({
        ghost: false,
        slash: false,
        tierNotch: 4,
      });
    });
  });
});

describe("stampFor — edges and the no-stamp floor", () => {
  it("undefined status → all-empty descriptor (no stamp)", () => {
    expect(stampFor(undefined)).toEqual({ ghost: false, slash: false });
  });

  it("a status with no class → no stamp (unparseable)", () => {
    expect(stampFor({ value: "mystery" })).toEqual({ ghost: false, slash: false });
  });

  it("graded with a missing ordinal → severity dot 0 (dot absent)", () => {
    expect(stampFor({ value: "graded", class: "graded" })).toEqual({
      ghost: false,
      slash: false,
      severityDot: 0,
    });
  });

  it("graded with an out-of-range ordinal clamps into 1..4", () => {
    expect(stampFor({ class: "graded", ordinal: 9 }).severityDot).toBe(4);
    expect(stampFor({ class: "graded", ordinal: -2 }).severityDot).toBe(0);
  });

  it("tiered with a missing ordinal → no notch (no stamp body)", () => {
    expect(stampFor({ value: "L?", class: "tiered" })).toEqual({
      ghost: false,
      slash: false,
    });
  });
});

describe("stampToken — the reinforcing tint NAME (never load-bearing)", () => {
  it("maps affirmed to the live state token", () => {
    expect(stampToken("affirmed")).toBe("--color-state-active");
  });

  it("maps retired and negated to the archived state token", () => {
    expect(stampToken("retired")).toBe("--color-state-archived");
    expect(stampToken("negated")).toBe("--color-state-archived");
  });

  it("maps provisional / graded / tiered to the prototype status tokens", () => {
    expect(stampToken("provisional")).toBe("--color-status-provisional");
    expect(stampToken("graded")).toBe("--color-status-graded");
    expect(stampToken("tiered")).toBe("--color-status-tiered");
  });

  it("falls back to muted ink for an absent class", () => {
    expect(stampToken(undefined)).toBe("--color-ink-muted");
  });
});
