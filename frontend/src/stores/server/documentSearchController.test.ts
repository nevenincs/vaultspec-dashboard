// Document-search plane units (command-palette-planes ADR, W02.P05): the pure
// literal matcher and the honest state derivation. The literal finder is the
// rag-free plane, so its core is unit-tested without any wire.

import { describe, expect, it } from "vitest";

import type { VaultTreeEntry } from "./engine";
import {
  DOCUMENT_SEARCH_RESULTS_MAX,
  deriveDocumentSearchState,
  matchDocumentEntries,
} from "./documentSearchController";

function entry(path: string, doc_type = "plan"): VaultTreeEntry {
  return { path, doc_type, feature_tags: [], dates: {} };
}

const entries: VaultTreeEntry[] = [
  entry(".vault/plan/2026-06-21-command-palette-architecture-plan.md"),
  entry(".vault/adr/2026-06-21-command-palette-providers-adr.md", "adr"),
  entry(".vault/research/2026-06-20-timeline-research.md", "research"),
];

describe("matchDocumentEntries", () => {
  it("returns nothing for an empty query", () => {
    expect(matchDocumentEntries(entries, "")).toEqual([]);
    expect(matchDocumentEntries(entries, "   ")).toEqual([]);
  });

  it("matches every token across stem, path, and doc-type (case-insensitive)", () => {
    const hits = matchDocumentEntries(entries, "command palette");
    expect(hits.map((h) => h.title)).toEqual([
      "2026-06-21-command-palette-architecture-plan",
      "2026-06-21-command-palette-providers-adr",
    ]);
    expect(hits.every((h) => h.source === "vault")).toBe(true);
  });

  it("emits wire SearchResult rows carrying the document graph node id", () => {
    const [hit] = matchDocumentEntries(entries, "timeline");
    expect(hit).toMatchObject({
      source: "vault",
      title: "2026-06-20-timeline-research",
      doc_type: "research",
    });
    expect(hit.node_id).toMatch(/^doc:/);
  });

  it("ranks stem-prefix matches ahead of substring matches", () => {
    const rows = [entry("notes/alpha-beta.md"), entry("notes/zeta-alpha.md")];
    const hits = matchDocumentEntries(rows, "alpha");
    expect(hits.map((h) => h.title)).toEqual(["alpha-beta", "zeta-alpha"]);
  });

  it("bounds the result list", () => {
    const many = Array.from({ length: DOCUMENT_SEARCH_RESULTS_MAX + 10 }, (_, i) =>
      entry(`notes/match-${i}.md`),
    );
    expect(matchDocumentEntries(many, "match")).toHaveLength(
      DOCUMENT_SEARCH_RESULTS_MAX,
    );
  });

  it("tolerates a missing entries array", () => {
    expect(matchDocumentEntries(undefined, "x")).toEqual([]);
  });
});

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
