// Wiki-link resolver (review-rail-viewers ADR + authoring-surface ADR D3). The
// copy-link verb emits the anchor form `[[stem#heading]]`; the wiki-link regex
// captures the whole `stem#heading` into the stem, so the resolver must split the
// `#fragment` before resolving — otherwise the anchor form resolves to no node (the
// trap this test guards). The bare form and non-wiki URLs are covered alongside.

import { describe, expect, it } from "vitest";

import { documentWikiLink } from "../../stores/view/documentLinkActions";
import {
  WIKI_LINK_SCHEME,
  wikiLinkFragment,
  wikiLinkNodeId,
  remarkWikiLink,
} from "./remarkWikiLink";
import type { Link, Root } from "mdast";

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

describe("wikiLinkFragment", () => {
  it("extracts the section-anchor slug from a section wiki-link", () => {
    expect(wikiLinkFragment(`${WIKI_LINK_SCHEME}x-plan#some-heading`)).toBe(
      "some-heading",
    );
  });

  it("returns null for a bare document reference or a non-wiki URL", () => {
    expect(wikiLinkFragment(`${WIKI_LINK_SCHEME}x-plan`)).toBeNull();
    expect(wikiLinkFragment("https://example.com#frag")).toBeNull();
  });
});

describe("section link round-trip (copy → resolve)", () => {
  it("the copied [[stem#slug]] rewrites to a URL that resolves to both node id and slug", () => {
    // The exact string the copy-section-link verb puts on the clipboard.
    const copied = documentWikiLink("2026-07-12-x-plan", "wave-w04");
    expect(copied).toBe("[[2026-07-12-x-plan#wave-w04]]");

    // Run it through the reader's own plugin, then the resolvers — the same path a
    // follower takes, so copy and follow cannot drift.
    const tree: Root = {
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value: copied }] }],
    };
    remarkWikiLink()(tree);
    const paragraph = tree.children[0] as { children: (Link | { type: string })[] };
    const link = paragraph.children.find(
      (child): child is Link => child.type === "link",
    );
    expect(link).toBeDefined();
    expect(wikiLinkNodeId(link!.url)).toBe("doc:2026-07-12-x-plan");
    expect(wikiLinkFragment(link!.url)).toBe("wave-w04");
  });
});
