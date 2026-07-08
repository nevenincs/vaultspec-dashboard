// Search-pill derivation vectors (search-providers ADR D4/D5). The pill face is a
// pure, tiers-free projection that obeys the UX simplicity law: show the ANSWER
// (a plain species word, a title, a one-line why, a feature chip), hide the
// MECHANISM (no score, no semantic-vs-text distinction). These vectors pin the
// species eyebrows, the mechanism-free face, and the identity/selectable
// derivations the surface renders.

import { describe, expect, it } from "vitest";

import type { SearchResult } from "./engine";
import { docTypeLabel } from "./docTypeVocabulary";
import {
  cleanWireTitle,
  deriveSearchPillView,
  deriveSearchPillViews,
  pillRelativeDate,
  prettifyStem,
} from "./searchPill";

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
    expect(view.typeWord).toBe(docTypeLabel("research"));
    expect(view.typeColorVar).toBe("var(--color-scene-category-research)");
    expect(view.titleMono).toBe(false);
    // The H1 convention title is cleaned to its human segment.
    expect(view.title).toBe("the strip");
    expect(view.featureTag).toBe("#timeline");
  });

  it("a code file shows the 'Code' word and a MONO filename title", () => {
    const view = deriveSearchPillView(
      result({ node_id: "code:engine/src/query.rs", source: "codebase" }),
      0,
      "scope-a",
    );
    expect(view.species).toBe("code");
    expect(view.typeWord).toBe("Code");
    expect(view.typeColorVar).toBe("var(--color-scene-category-code)");
    expect(view.titleMono).toBe(true);
    expect(view.title).toBe("query.rs"); // the filename, from the stable node id
    expect(view.featureTag).toBeNull(); // code hits carry no feature chip
  });

  it("a commit shows the reserved 'Change' word in the accent tone", () => {
    const view = deriveSearchPillView(
      result({ node_id: "commit:abc123", title: "fix: the thing", date: undefined }),
      0,
      "scope-a",
    );
    expect(view.species).toBe("commit");
    expect(view.typeWord).toBe("Change");
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
    // The plain type word is never a percentage / mechanism token.
    expect(view.typeWord).not.toMatch(/%|semantic|text|score|rag|vector/i);
    // The projected face has no `score` field (it stays backend context on
    // `view.result`, never on the rendered pill shape).
    expect(view).not.toHaveProperty("score");
    expect(view.why ?? "").not.toMatch(/semantic|text match|relevance/i);
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

  it("a node-less hit is NOT selectable, keyed by source+index, and says so in aria", () => {
    const view = deriveSearchPillView(
      result({ node_id: null, source: "vault" }),
      2,
      "scope-a",
    );
    expect(view.selectable).toBe(false);
    expect(view.nodeId).toBeNull();
    expect(view.key).toBe("vault:2");
    expect(view.ariaLabel).toMatch(/not selectable/i);
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
});

describe("pure pill helpers", () => {
  it("prettifyStem drops the date prefix and the trailing type word", () => {
    expect(prettifyStem("2026-06-12-command-palette-architecture-plan")).toBe(
      "Command palette architecture",
    );
  });

  it("cleanWireTitle extracts the backtick-wrapped human segment after the colon", () => {
    expect(cleanWireTitle("`timeline` research: `the strip`")).toBe("the strip");
    expect(cleanWireTitle("A plain title")).toBe("A plain title");
  });

  it("pillRelativeDate renders a coarse human relative date, or undefined", () => {
    const now = Date.parse("2026-06-15T00:00:00Z");
    expect(pillRelativeDate("2026-06-15", now)).toBe("today");
    expect(pillRelativeDate("2026-06-14", now)).toBe("yesterday");
    expect(pillRelativeDate(undefined, now)).toBeUndefined();
    expect(pillRelativeDate("not-a-date", now)).toBeUndefined();
  });
});
