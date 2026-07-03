// Document-search plane units (command-palette-planes ADR, W02.P05; search-
// providers ADR D3): the honest state derivation. The literal MATCH now lives in
// the shared files(vault) provider over the one `literalMatch` utility (covered by
// `literalMatch` + `searchProviders` vectors), so the finder's private scanner is
// gone; this file keeps the finder's pure state-derivation contract.

import { describe, expect, it } from "vitest";

import { deriveDocumentSearchState } from "./documentSearchController";

describe("deriveDocumentSearchState", () => {
  it("is idle for an empty query regardless of loading", () => {
    expect(deriveDocumentSearchState("", true, false)).toBe("idle");
  });

  it("is loading while pending, degraded when the structural tier is down", () => {
    expect(deriveDocumentSearchState("q", true, false)).toBe("loading");
    expect(deriveDocumentSearchState("q", false, true)).toBe("degraded");
    expect(deriveDocumentSearchState("q", false, false)).toBe("ready");
  });
});
