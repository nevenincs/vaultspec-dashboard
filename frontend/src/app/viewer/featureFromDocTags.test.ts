import { describe, expect, it } from "vitest";

import { featureFromDocTags } from "./MarkdownDocView";

describe("featureFromDocTags (#19 autofix feature derivation)", () => {
  it("returns the non-directory tag as the feature", () => {
    expect(featureFromDocTags("#exec, #dashboard")).toBe("dashboard");
    expect(featureFromDocTags("#adr #graph-backend-unification")).toBe(
      "graph-backend-unification",
    );
    // Order-independent: the directory tag is skipped wherever it sits.
    expect(featureFromDocTags("#timeline-lineage, #plan")).toBe("timeline-lineage");
  });

  it("tolerates missing '#', extra whitespace, and bare stems", () => {
    expect(featureFromDocTags("plan ,  my-feature ")).toBe("my-feature");
  });

  it("returns null when only directory tags (or nothing) are present", () => {
    expect(featureFromDocTags("#adr")).toBeNull();
    expect(featureFromDocTags("")).toBeNull();
    expect(featureFromDocTags("#exec, #plan")).toBeNull();
  });
});
