import { describe, expect, it } from "vitest";

import {
  authoredDisplayText,
  compareAuthoredDisplayText,
  compareRepositoryPaths,
  compareStableIdentifiers,
  repositoryPath,
  stableIdentifier,
} from "./displayText";

describe("canonical display-data comparators", () => {
  it("orders identifiers and paths deterministically without changing bytes", () => {
    const identifier = stableIdentifier("  Node:Ä  ");
    const path = repositoryPath("  Src/Ä.ts  ");
    expect(identifier).toBe("  Node:Ä  ");
    expect(path).toBe("  Src/Ä.ts  ");
    expect(
      compareStableIdentifiers(stableIdentifier("B"), stableIdentifier("a")),
    ).toBeLessThan(0);
    expect(
      compareRepositoryPaths(repositoryPath("B"), repositoryPath("a")),
    ).toBeLessThan(0);
  });

  it("uses the active locale for authored text while retaining authored bytes", () => {
    const authored = authoredDisplayText("  Ängel  ");
    expect(authored).toBe("  Ängel  ");
    expect(
      Math.sign(
        compareAuthoredDisplayText(
          "en",
          authoredDisplayText("ä"),
          authoredDisplayText("z"),
        ),
      ),
    ).toBe(-1);
    expect(
      Math.sign(
        compareAuthoredDisplayText(
          "sv",
          authoredDisplayText("ä"),
          authoredDisplayText("z"),
        ),
      ),
    ).toBe(1);
  });

  it("fails invalid locale input to deterministic code-unit order", () => {
    expect(
      compareAuthoredDisplayText(
        "not a locale",
        authoredDisplayText("B"),
        authoredDisplayText("a"),
      ),
    ).toBeLessThan(0);
  });
});
