// @vitest-environment happy-dom
//
// Unit test for the editor's link-picker corpus derivation
// (document-editor-redesign ADR P01.S01): the pure projection from the served
// vault-tree entries to the pickable document list + feature-tag vocabulary.

import { describe, expect, it } from "vitest";

import type { VaultTreeEntry } from "./engine";
import { deriveEditorLinkingCorpus } from "./queries";

function entry(part: Partial<VaultTreeEntry> & { path: string }): VaultTreeEntry {
  return {
    doc_type: "plan",
    feature_tags: [],
    dates: {},
    ...part,
  };
}

describe("deriveEditorLinkingCorpus", () => {
  it("projects stems, titles, and the first feature tag per document", () => {
    const corpus = deriveEditorLinkingCorpus([
      entry({
        path: ".vault/plan/2026-07-11-editor-plan.md",
        title: "Editor plan",
        feature_tags: ["document-editor-redesign"],
      }),
      entry({ path: ".vault/adr/2026-01-01-x-adr.md", doc_type: "adr" }),
    ]);
    expect(corpus.documents).toEqual([
      {
        stem: "2026-07-11-editor-plan",
        title: "Editor plan",
        feature: "document-editor-redesign",
      },
      { stem: "2026-01-01-x-adr", title: "2026-01-01-x-adr", feature: null },
    ]);
  });

  it("collects the distinct feature-tag vocabulary, sorted", () => {
    const corpus = deriveEditorLinkingCorpus([
      entry({ path: "a.md", feature_tags: ["timeline", "graph"] }),
      entry({ path: "b.md", feature_tags: ["graph"] }),
      entry({ path: "c.md", feature_tags: ["audit-flow"] }),
    ]);
    expect(corpus.featureTags).toEqual(["audit-flow", "graph", "timeline"]);
  });

  it("returns an empty corpus for no entries", () => {
    const corpus = deriveEditorLinkingCorpus([]);
    expect(corpus.documents).toEqual([]);
    expect(corpus.featureTags).toEqual([]);
  });
});
