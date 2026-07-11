import { describe, expect, it } from "vitest";

import { directoryTagOf, featureTagOf, splitTags, withFeatureTag } from "./editorTags";

describe("editorTags", () => {
  it("splits comma/space tag strings into bare tokens", () => {
    expect(splitTags("#plan, #graph-backend")).toEqual(["plan", "graph-backend"]);
    expect(splitTags("plan  my-feature")).toEqual(["plan", "my-feature"]);
    expect(splitTags("")).toEqual([]);
  });

  it("finds the directory tag wherever it sits", () => {
    expect(directoryTagOf("#plan, #graph-backend")).toBe("plan");
    expect(directoryTagOf("#graph-backend, #adr")).toBe("adr");
    expect(directoryTagOf("#graph-backend")).toBeNull();
  });

  it("finds the feature tag (the non-directory tag)", () => {
    expect(featureTagOf("#plan, #graph-backend")).toBe("graph-backend");
    expect(featureTagOf("#adr")).toBeNull();
    expect(featureTagOf("")).toBeNull();
  });

  it("replaces the feature tag while preserving the directory tag", () => {
    expect(withFeatureTag("#plan, #old-feature", "new-feature")).toBe(
      "#plan, #new-feature",
    );
    // A '#'-prefixed feature is normalized, not doubled.
    expect(withFeatureTag("#adr, #x", "#y")).toBe("#adr, #y");
    // Dropping the feature leaves just the directory tag.
    expect(withFeatureTag("#plan, #x", null)).toBe("#plan");
    // No directory tag present → only the feature is emitted.
    expect(withFeatureTag("#x", "y")).toBe("#y");
  });
});
