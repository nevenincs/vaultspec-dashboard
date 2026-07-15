import { describe, expect, it } from "vitest";

import type { SearchResult } from "./engine";
import {
  deriveSearchPillView,
  deriveSearchPillViews,
  deriveSearchPillViewsFromProviderEntries,
  pillRelativeDate,
} from "./searchPill";
import { toProviderEntry } from "./searchProviders";

function result(over: Partial<SearchResult>): SearchResult {
  return { score: 0.5, source: "vault", node_id: null, ...over };
}

describe("deriveSearchPillView — species eyebrows", () => {
  it("a vault doc shows its plain doc-type WORD on the doc-type category token", () => {
    const view = deriveSearchPillView(
      result({
        node_id: "doc:2026-06-12-timeline-research",
        doc_type: "research",
        source: "vault",
        feature: "timeline",
        title: "`timeline` research: `the strip`",
      }),
      0,
      "scope-a",
    );
    expect(view.species).toBe("doc");
    expect(view.typeWord).toEqual({ key: "documents:documentTypes.research" });
    expect(view.typeColorVar).toBe("var(--color-scene-category-research)");
    expect(view.titleMono).toBe(false);
    expect(view.title).toBe("`timeline` research: `the strip`");
    expect(view.featureTag).toBe("timeline");
  });

  it("a code file shows the 'Code' word and a MONO filename title", () => {
    const view = deriveSearchPillView(
      result({ node_id: "code:engine/src/query.rs", source: "codebase" }),
      0,
      "scope-a",
    );
    expect(view.species).toBe("code");
    expect(view.typeWord).toEqual({ key: "common:searchPalette.labels.code" });
    expect(view.typeColorVar).toBe("var(--color-scene-category-code)");
    expect(view.titleMono).toBe(true);
    expect(view.title).toEqual({ key: "common:searchPalette.labels.untitledResult" });
    expect(view.featureTag).toBeNull();
  });

  it("a commit shows the reserved 'Change' word in the accent tone", () => {
    const view = deriveSearchPillView(
      result({ node_id: "commit:abc123", title: "fix: the thing", date: undefined }),
      0,
      "scope-a",
    );
    expect(view.species).toBe("commit");
    expect(view.typeWord).toEqual({ key: "common:searchPalette.labels.change" });
    expect(view.typeColorVar).toBe("var(--color-accent)");
  });
});

describe("deriveSearchPillView — mechanism-free face", () => {
  it("carries NO relevance score, no semantic-vs-text distinction on the face", () => {
    const view = deriveSearchPillView(
      result({ node_id: "doc:a-plan", doc_type: "plan", score: 0.83 }),
      0,
      "scope-a",
    );
    expect(view.typeWord).toEqual({ key: "documents:documentTypes.plan" });
    expect(view).not.toHaveProperty("score");
    expect(view).not.toHaveProperty("result");
    expect(view.why).toBeNull();
  });
});

describe("deriveSearchPillView — identity + selectable derivations", () => {
  it("a hit with a graph node id is selectable and keyed by that id", () => {
    const view = deriveSearchPillView(
      result({ node_id: "doc:a-plan", doc_type: "plan" }),
      3,
      "scope-a",
    );
    expect(view.selectable).toBe(true);
    expect(view.key).toBe("doc:a-plan");
    expect(view.entity).toMatchObject({
      kind: "search-result",
      nodeId: "doc:a-plan",
      isCode: false,
    });
  });

  it("a node-less hit is not selectable and keeps a stable internal key", () => {
    const view = deriveSearchPillView(
      result({ node_id: null, source: "vault" }),
      2,
      "scope-a",
    );
    expect(view.selectable).toBe(false);
    expect(view.nodeId).toBeNull();
    expect(view.key).toBe("vault:2");
  });

  it("derives a stable list preserving order and per-index keys", () => {
    const views = deriveSearchPillViews(
      [
        result({ node_id: "doc:a", doc_type: "plan" }),
        result({ node_id: "code:x/y.ts", source: "codebase" }),
      ],
      "scope-a",
    );
    expect(views.map((v) => v.species)).toEqual(["doc", "code"]);
    expect(views.map((v) => v.key)).toEqual(["doc:a", "code:x/y.ts"]);
  });

  it("projects provider entries without exposing their raw results", () => {
    const authoredExcerpt = "  Exact authored preview  ";
    const [view] = deriveSearchPillViewsFromProviderEntries(
      [
        toProviderEntry(
          result({
            node_id: "doc:private-id",
            excerpt: authoredExcerpt,
            rerank_text: "private ranking explanation",
            score: 0.99,
            source: "private-source",
          }),
          "semantic",
        ),
      ],
      "scope-a",
    );

    expect(view.preview).toBe(authoredExcerpt);
    expect(view).not.toHaveProperty("result");
    expect(JSON.stringify(view)).not.toContain("private ranking explanation");
  });
});

describe("relative date and authored data", () => {
  it("pillRelativeDate renders a coarse human relative date, or undefined", () => {
    const now = Date.parse("2026-06-15T00:00:00Z");
    expect(pillRelativeDate("2026-06-15", now)).toEqual({
      kind: "relative-date",
      unit: "day",
      value: 0,
    });
    expect(pillRelativeDate("2026-06-14", now)).toEqual({
      kind: "relative-date",
      unit: "day",
      value: -1,
    });
    expect(pillRelativeDate(undefined, now)).toBeUndefined();
    expect(pillRelativeDate("not-a-date", now)).toBeUndefined();
  });

  it("preserves authored title, excerpt, and feature values byte for byte", () => {
    const view = deriveSearchPillView(
      result({
        node_id: "doc:private-node-id",
        title: "  User title — exactly  ",
        excerpt: "  User excerpt — exactly  ",
        feature: "  authored-feature  ",
      }),
      0,
      "scope-a",
    );
    expect(view.title).toBe("  User title — exactly  ");
    expect(view.why).toBe("  User excerpt — exactly  ");
    expect(view.preview).toBe("  User excerpt — exactly  ");
    expect(view.featureTag).toBe("  authored-feature  ");
  });
});
