import { describe, expect, it } from "vitest";

import {
  featureQueryEchoText,
  featureQueryMatches,
  featureQueryPlainText,
  featureTagDisplayName,
  featureTagSuggestions,
  parseFeatureQueryInput,
} from "./featureQuery";

describe("parseFeatureQueryInput", () => {
  it("wraps a plain term as a substring glob", () => {
    expect(parseFeatureQueryInput("dash")).toEqual({ value: "*dash*", mode: "glob" });
  });

  it("keeps an explicit glob anchored as typed", () => {
    expect(parseFeatureQueryInput("dashboard-*")).toEqual({
      value: "dashboard-*",
      mode: "glob",
    });
    expect(parseFeatureQueryInput("plan?")).toEqual({ value: "plan?", mode: "glob" });
  });

  it("reads a /pattern/ as an advanced regex", () => {
    expect(parseFeatureQueryInput("/sync$/")).toEqual({
      value: "sync$",
      mode: "regex",
    });
  });

  it("clears on an empty or whitespace input", () => {
    expect(parseFeatureQueryInput("")).toBeNull();
    expect(parseFeatureQueryInput("   ")).toBeNull();
  });

  it("never emits a malformed regex (an in-progress pattern)", () => {
    expect(parseFeatureQueryInput("/[/")).toBeNull();
    expect(parseFeatureQueryInput("/(/")).toBeNull();
  });
});

describe("featureQueryEchoText", () => {
  it("unwraps a substring glob to the literal term", () => {
    expect(featureQueryEchoText({ value: "*dash*", mode: "glob" })).toBe("dash");
  });

  it("shows an explicit glob as typed and a regex in /…/ form", () => {
    expect(featureQueryEchoText({ value: "dashboard-*", mode: "glob" })).toBe(
      "dashboard-*",
    );
    expect(featureQueryEchoText({ value: "sync$", mode: "regex" })).toBe("/sync$/");
  });

  it("round-trips a parsed plain term", () => {
    const parsed = parseFeatureQueryInput("left-rail");
    expect(featureQueryEchoText(parsed)).toBe("left-rail");
  });

  it("is empty for a null query", () => {
    expect(featureQueryEchoText(null)).toBe("");
  });
});

describe("featureQueryPlainText", () => {
  it("strips glob/regex grammar to a plain substring", () => {
    expect(featureQueryPlainText({ value: "*dash*", mode: "glob" })).toBe("dash");
    expect(featureQueryPlainText({ value: "dashboard-*", mode: "glob" })).toBe(
      "dashboard-",
    );
    expect(featureQueryPlainText(null)).toBe("");
  });
});

describe("featureQueryMatches", () => {
  it("substring-globs over raw tags and display names, case-insensitively", () => {
    const q = parseFeatureQueryInput("left");
    expect(featureQueryMatches(q, ["dashboard-left-rail"])).toBe(true);
    // Matches via the sanitized display name too (the dual-match).
    expect(featureQueryMatches(q, ["Dashboard Left Rail"])).toBe(true);
    expect(featureQueryMatches(q, ["engine-hardening"])).toBe(false);
  });

  it("anchors an explicit glob to the whole tag", () => {
    const q = parseFeatureQueryInput("dashboard-*");
    expect(featureQueryMatches(q, ["dashboard-gui"])).toBe(true);
    expect(featureQueryMatches(q, ["my-dashboard-gui"])).toBe(false);
  });

  it("runs an advanced regex unanchored", () => {
    const q = parseFeatureQueryInput("/sync$/");
    expect(featureQueryMatches(q, ["delta-sync"])).toBe(true);
    expect(featureQueryMatches(q, ["sync-engine"])).toBe(false);
  });

  it("is no constraint when empty", () => {
    expect(featureQueryMatches(null, ["anything"])).toBe(true);
  });
});

describe("featureTagDisplayName", () => {
  it("de-kebabs and title-cases", () => {
    expect(featureTagDisplayName("dashboard-left-rail")).toBe("Dashboard Left Rail");
    expect(featureTagDisplayName("#filter_controls")).toBe("Filter Controls");
  });
});

describe("featureTagSuggestions", () => {
  const tags = ["dashboard-left-rail", "dashboard-gui", "engine-hardening", "timeline"];

  it("lists the whole vocabulary for an empty input", () => {
    expect(featureTagSuggestions("", tags).map((s) => s.tag)).toEqual([
      "dashboard-gui",
      "dashboard-left-rail",
      "engine-hardening",
      "timeline",
    ]);
  });

  it("matches the raw hyphenated tag", () => {
    expect(featureTagSuggestions("left-rail", tags).map((s) => s.tag)).toEqual([
      "dashboard-left-rail",
    ]);
  });

  it("matches the sanitized display string", () => {
    // "Left Rail" only appears in the display name, never the raw tag substring.
    expect(featureTagSuggestions("Left Rail", tags).map((s) => s.tag)).toEqual([
      "dashboard-left-rail",
    ]);
  });

  it("returns tag + display for each suggestion", () => {
    expect(featureTagSuggestions("timeline", tags)).toEqual([
      { tag: "timeline", display: "Timeline" },
    ]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 20 }, (_, i) => `feature-${i}`);
    expect(featureTagSuggestions("feature", many, 5)).toHaveLength(5);
  });
});
