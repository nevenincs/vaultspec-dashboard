import { describe, expect, it } from "vitest";

import { resolveFocusKey, resolveFocusTarget } from "./useFocusZone";

const ORDER = ["a", "b", "c", "d"];

describe("resolveFocusTarget", () => {
  it("moves to the next and previous keys", () => {
    expect(resolveFocusTarget(ORDER, "b", "next", { wrap: false })).toBe("c");
    expect(resolveFocusTarget(ORDER, "b", "prev", { wrap: false })).toBe("a");
  });

  it("jumps to the first and last keys", () => {
    expect(resolveFocusTarget(ORDER, "c", "first", { wrap: false })).toBe("a");
    expect(resolveFocusTarget(ORDER, "b", "last", { wrap: false })).toBe("d");
  });

  it("clamps at the edges by returning null (a no-op move)", () => {
    expect(resolveFocusTarget(ORDER, "a", "prev", { wrap: false })).toBeNull();
    expect(resolveFocusTarget(ORDER, "d", "next", { wrap: false })).toBeNull();
  });

  it("wraps around the edges when wrap is enabled", () => {
    expect(resolveFocusTarget(ORDER, "a", "prev", { wrap: true })).toBe("d");
    expect(resolveFocusTarget(ORDER, "d", "next", { wrap: true })).toBe("a");
  });

  it("returns null for an unknown origin or empty list", () => {
    expect(resolveFocusTarget(ORDER, "z", "next", { wrap: true })).toBeNull();
    expect(resolveFocusTarget([], "a", "next", { wrap: true })).toBeNull();
  });
});

describe("resolveFocusKey", () => {
  it("maps the primary axis to next/prev for a vertical zone", () => {
    expect(resolveFocusKey("ArrowDown", "vertical")).toEqual({ intent: "next" });
    expect(resolveFocusKey("ArrowUp", "vertical")).toEqual({ intent: "prev" });
  });

  it("maps the secondary axis to a cross intent for a vertical zone", () => {
    expect(resolveFocusKey("ArrowRight", "vertical")).toEqual({ cross: "crossNext" });
    expect(resolveFocusKey("ArrowLeft", "vertical")).toEqual({ cross: "crossPrev" });
  });

  it("maps the primary axis to next/prev for a horizontal zone", () => {
    expect(resolveFocusKey("ArrowRight", "horizontal")).toEqual({ intent: "next" });
    expect(resolveFocusKey("ArrowLeft", "horizontal")).toEqual({ intent: "prev" });
  });

  it("accepts either arrow pair as primary for a both-axis zone", () => {
    expect(resolveFocusKey("ArrowDown", "both")).toEqual({ intent: "next" });
    expect(resolveFocusKey("ArrowRight", "both")).toEqual({ intent: "next" });
  });

  it("maps Home and End to first and last", () => {
    expect(resolveFocusKey("Home", "vertical")).toEqual({ intent: "first" });
    expect(resolveFocusKey("End", "vertical")).toEqual({ intent: "last" });
  });

  it("returns an empty resolution for keys the zone does not own", () => {
    expect(resolveFocusKey("Enter", "vertical")).toEqual({});
    expect(resolveFocusKey("a", "vertical")).toEqual({});
  });
});
