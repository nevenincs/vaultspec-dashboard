// Wiki-link resolver (review-rail-viewers ADR + authoring-surface ADR D3). The
// copy-link verb emits the anchor form `[[stem#heading]]`; the wiki-link regex
// captures the whole `stem#heading` into the stem, so the resolver must split the
// `#fragment` before resolving — otherwise the anchor form resolves to no node (the
// trap this test guards). The bare form and non-wiki URLs are covered alongside.

import { describe, expect, it } from "vitest";

import { WIKI_LINK_SCHEME, wikiLinkNodeId } from "./remarkWikiLink";

describe("wikiLinkNodeId", () => {
  it("resolves a bare document reference to its node id", () => {
    expect(wikiLinkNodeId(`${WIKI_LINK_SCHEME}2026-07-12-x-plan`)).toBe(
      "doc:2026-07-12-x-plan",
    );
  });

  it("resolves the section-anchor form to the document node (fragment split off)", () => {
    expect(wikiLinkNodeId(`${WIKI_LINK_SCHEME}x-plan#some-heading`)).toBe("doc:x-plan");
  });

  it("returns null for a non-wiki-link URL", () => {
    expect(wikiLinkNodeId("https://example.com")).toBeNull();
    expect(wikiLinkNodeId(WIKI_LINK_SCHEME)).toBeNull();
  });
});
