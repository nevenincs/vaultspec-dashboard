// Literal matcher unit vectors (search-providers ADR, D2 rank bands).
// Pure functions — no wire, no React, no mocks required.

import { describe, expect, it } from "vitest";

import {
  matchLiteral,
  rankLiteralMatches,
  STRONG_LITERAL_BAND,
  WEAK_LITERAL_BAND,
} from "./literalMatch";

// ── matchLiteral — null on empty / whitespace ─────────────────────────────────

describe("matchLiteral — null on empty or whitespace query", () => {
  it("returns null for an empty string", () => {
    expect(matchLiteral("", { stem: "my-doc" })).toBeNull();
  });

  it("returns null for a whitespace-only string", () => {
    expect(matchLiteral("   ", { stem: "my-doc" })).toBeNull();
    expect(matchLiteral("\t\n", { stem: "my-doc" })).toBeNull();
  });

  it("returns null when fields are all absent and query is non-empty", () => {
    expect(matchLiteral("foo", {})).toBeNull();
  });
});

// ── matchLiteral — exact equality → STRONG_LITERAL_BAND.max ─────────────────

describe("matchLiteral — exact match returns top of strong band", () => {
  it("returns STRONG_LITERAL_BAND.max (0.95) on exact stem equality", () => {
    expect(matchLiteral("my-doc", { stem: "my-doc" })).toBe(STRONG_LITERAL_BAND.max);
  });

  it("returns STRONG_LITERAL_BAND.max on exact title equality", () => {
    expect(
      matchLiteral("graph representation", { title: "graph representation" }),
    ).toBe(STRONG_LITERAL_BAND.max);
  });

  it("returns STRONG_LITERAL_BAND.max when query matches stem case-insensitively", () => {
    expect(matchLiteral("MY-DOC", { stem: "my-doc" })).toBe(STRONG_LITERAL_BAND.max);
  });

  it("does NOT return exact score for a path-only exact equality (path is a secondary field)", () => {
    // A path that equals the query exactly is only a prefix-or-substring match,
    // not an exact match, because exact is gated on stem/title only.
    const score = matchLiteral("frontend/src/foo.ts", {
      path: "frontend/src/foo.ts",
    });
    // Should be non-null (the path IS the query, so it's at substring index 0 → weak.max),
    // but NOT in the strong band.
    expect(score).not.toBeNull();
    expect(score!).toBeLessThan(STRONG_LITERAL_BAND.min);
  });
});

// ── matchLiteral — prefix → strong band below exact ──────────────────────────

describe("matchLiteral — prefix match is in strong band, below exact", () => {
  it("stem prefix → score in [STRONG_LITERAL_BAND.min, 0.95)", () => {
    const score = matchLiteral("search", { stem: "search-providers" });
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(STRONG_LITERAL_BAND.min);
    expect(score!).toBeLessThan(STRONG_LITERAL_BAND.max);
  });

  it("title prefix → score in the strong band", () => {
    const score = matchLiteral("graph rep", {
      title: "graph representation adr",
    });
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(STRONG_LITERAL_BAND.min);
    expect(score!).toBeLessThan(STRONG_LITERAL_BAND.max);
  });

  it("path prefix → score in the strong band", () => {
    const score = matchLiteral("frontend/src", {
      path: "frontend/src/stores/server/literalMatch.ts",
    });
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(STRONG_LITERAL_BAND.min);
    expect(score!).toBeLessThan(STRONG_LITERAL_BAND.max);
  });

  it("prefix score is strictly less than exact score on the same field", () => {
    const exact = matchLiteral("my-doc", { stem: "my-doc" })!;
    const prefix = matchLiteral("my", { stem: "my-doc" })!;
    expect(prefix).toBeLessThan(exact);
  });

  it("a longer query (higher coverage) scores higher than a shorter query in prefix tier", () => {
    // "search-providers" is the stem. A longer prefix covers more of the field.
    const shorter = matchLiteral("sea", { stem: "search-providers" })!;
    const longer = matchLiteral("search-prov", { stem: "search-providers" })!;
    expect(longer).toBeGreaterThan(shorter);
  });
});

// ── matchLiteral — substring → weak band ─────────────────────────────────────

describe("matchLiteral — substring match is in the weak band", () => {
  it("substring → score in [WEAK_LITERAL_BAND.min, WEAK_LITERAL_BAND.max]", () => {
    // "providers" appears at index 7 in "search-providers" (len 16)
    const score = matchLiteral("providers", { stem: "search-providers" });
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(WEAK_LITERAL_BAND.min);
    expect(score!).toBeLessThanOrEqual(WEAK_LITERAL_BAND.max);
  });

  it("earlier position in field scores higher within the weak band", () => {
    // Both queries are substrings of "search-providers" but at different positions.
    const earlier = matchLiteral("search", { stem: "X-search-providers" })!; // idx 2
    const later = matchLiteral("providers", { stem: "X-search-providers" })!; // idx 9
    // "search" at index 2; "providers" at index 9 → earlier wins
    expect(earlier).toBeGreaterThan(later);
  });

  it("weak band never overlaps the strong band", () => {
    // The band constants themselves enforce the gap; verify the invariant holds.
    expect(WEAK_LITERAL_BAND.max).toBeLessThan(STRONG_LITERAL_BAND.min);
  });
});

// ── matchLiteral — AND semantics ──────────────────────────────────────────────

describe("matchLiteral — AND semantics (every token must match)", () => {
  it("returns null when one token is missing from all fields", () => {
    expect(matchLiteral("search xyz", { stem: "search-providers" })).toBeNull();
  });

  it("matches when all tokens are present (each in any field)", () => {
    const score = matchLiteral("search providers", {
      stem: "search-providers",
    });
    expect(score).not.toBeNull();
  });

  it("tokens can match across different fields", () => {
    // "graph" in stem, "representation" in title
    const score = matchLiteral("graph representation", {
      stem: "graph",
      title: "graph-node representation adr",
    });
    expect(score).not.toBeNull();
  });

  it("cross-field multi-token match (tokens in different fields, no single-field substring) → WEAK_LITERAL_BAND.min", () => {
    // "alpha" only in stem, "beta" only in tags — full query "alpha beta" never
    // appears in any single field.
    const score = matchLiteral("alpha beta", {
      stem: "alpha",
      tags: ["beta"],
    });
    expect(score).toBe(WEAK_LITERAL_BAND.min);
  });
});

// ── matchLiteral — field coverage: title and tags ────────────────────────────

describe("matchLiteral — title and tags field coverage", () => {
  it("matches on title when stem and path are absent", () => {
    const score = matchLiteral("graph representation", {
      title: "graph representation adr",
    });
    expect(score).not.toBeNull();
  });

  it("matches on tags when other fields are absent", () => {
    // Exact tag match → substring at index 0 in the tag → WEAK_LITERAL_BAND.max
    const score = matchLiteral("search-providers", {
      tags: ["search-providers"],
    });
    expect(score).toBe(WEAK_LITERAL_BAND.max);
  });

  it("matches partial token in tag", () => {
    const score = matchLiteral("search", { tags: ["search-providers"] });
    expect(score).not.toBeNull();
  });

  it("returns null when query does not match any provided field", () => {
    expect(
      matchLiteral("zzz", { stem: "alpha", title: "beta doc", tags: ["gamma"] }),
    ).toBeNull();
  });
});

// ── matchLiteral — case insensitivity ─────────────────────────────────────────

describe("matchLiteral — case insensitivity", () => {
  it("UPPER query matches lower field", () => {
    expect(matchLiteral("SEARCH", { stem: "search-providers" })).not.toBeNull();
  });

  it("mixed-case query matches mixed-case field", () => {
    expect(matchLiteral("SearchProviders", { stem: "searchproviders" })).not.toBeNull();
  });

  it("case-insensitive exact match returns STRONG_LITERAL_BAND.max", () => {
    expect(matchLiteral("MY-DOC", { stem: "my-doc" })).toBe(STRONG_LITERAL_BAND.max);
    expect(matchLiteral("my-doc", { stem: "MY-DOC" })).toBe(STRONG_LITERAL_BAND.max);
  });
});

// ── matchLiteral — band boundary invariants ──────────────────────────────────

describe("matchLiteral — band boundary invariants", () => {
  it("no match score exceeds STRONG_LITERAL_BAND.max (0.95)", () => {
    const exact = matchLiteral("my-doc", { stem: "my-doc" })!;
    const prefix = matchLiteral("my", { stem: "my-doc" })!;
    const weak = matchLiteral("doc", { stem: "my-doc" })!;
    expect(exact).toBeLessThanOrEqual(STRONG_LITERAL_BAND.max);
    expect(prefix).toBeLessThanOrEqual(STRONG_LITERAL_BAND.max);
    expect(weak).toBeLessThanOrEqual(STRONG_LITERAL_BAND.max);
  });

  it("no match score falls below WEAK_LITERAL_BAND.min (0.20)", () => {
    // Substring very late in a long field — should still be >= 0.20.
    const field = "a".repeat(200) + "-target";
    const score = matchLiteral("target", { stem: field })!;
    expect(score).toBeGreaterThanOrEqual(WEAK_LITERAL_BAND.min);
  });

  it("prefix score is never >= STRONG_LITERAL_BAND.max (exact ceiling is exclusive)", () => {
    // A prefix that covers 99% of the field should still be < 0.95.
    const stem = "searchx";
    const score = matchLiteral("search", { stem })!; // "search" is 6/7 of "searchx"
    expect(score).toBeLessThan(STRONG_LITERAL_BAND.max);
    expect(score).toBeGreaterThanOrEqual(STRONG_LITERAL_BAND.min);
  });

  it("weak match score is always < STRONG_LITERAL_BAND.min (bands are disjoint)", () => {
    // "providers" at index 7 in "search-providers" — a weak match.
    const score = matchLiteral("providers", { stem: "search-providers" })!;
    expect(score).toBeLessThan(STRONG_LITERAL_BAND.min);
    expect(score).toBeLessThanOrEqual(WEAK_LITERAL_BAND.max);
  });

  it("ordering: exact > prefix > substring for the same base field", () => {
    const stem = "search-providers";
    const exact = matchLiteral("search-providers", { stem })!;
    const prefix = matchLiteral("search-pro", { stem })!;
    const sub = matchLiteral("providers", { stem })!;
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(sub);
    // Confirm band membership.
    expect(exact).toBe(STRONG_LITERAL_BAND.max);
    expect(prefix).toBeGreaterThanOrEqual(STRONG_LITERAL_BAND.min);
    expect(sub).toBeLessThanOrEqual(WEAK_LITERAL_BAND.max);
  });
});

// ── matchLiteral — determinism ────────────────────────────────────────────────

describe("matchLiteral — determinism", () => {
  it("same inputs always produce the same score", () => {
    const fields = { stem: "search-providers", title: "search providers adr" };
    const query = "search prov";
    const first = matchLiteral(query, fields);
    for (let i = 0; i < 10; i++) {
      expect(matchLiteral(query, fields)).toBe(first);
    }
  });

  it("null result is stable across repeated calls", () => {
    for (let i = 0; i < 10; i++) {
      expect(matchLiteral("zzz", { stem: "foo" })).toBeNull();
    }
  });
});

// ── rankLiteralMatches ────────────────────────────────────────────────────────

describe("rankLiteralMatches", () => {
  type Item = { id: string; stem: string };
  const getFields = (item: Item) => ({ stem: item.stem });

  it("returns items ordered by score descending", () => {
    const items: Item[] = [
      { id: "a", stem: "zeta-alpha" }, // substring match for "alpha"
      { id: "b", stem: "alpha" }, // exact match
      { id: "c", stem: "alpha-beta" }, // prefix match
    ];
    const ranked = rankLiteralMatches("alpha", items, getFields, 10);
    expect(ranked.map((r) => r.item.id)).toEqual(["b", "c", "a"]);
  });

  it("scores in ranked output honour the band ordering", () => {
    const items: Item[] = [
      { id: "exact", stem: "alpha" },
      { id: "prefix", stem: "alpha-beta" },
      { id: "sub", stem: "zeta-alpha" },
    ];
    const ranked = rankLiteralMatches("alpha", items, getFields, 10);
    expect(ranked[0].score).toBe(STRONG_LITERAL_BAND.max);
    expect(ranked[1].score).toBeGreaterThanOrEqual(STRONG_LITERAL_BAND.min);
    expect(ranked[1].score).toBeLessThan(STRONG_LITERAL_BAND.max);
    expect(ranked[2].score).toBeGreaterThanOrEqual(WEAK_LITERAL_BAND.min);
    expect(ranked[2].score).toBeLessThanOrEqual(WEAK_LITERAL_BAND.max);
  });

  it("stable tie-break: equal-score items sort ascending by stem", () => {
    // Two items that produce the same substring score (same field, same index).
    const items: Item[] = [
      { id: "z", stem: "z-search-doc" },
      { id: "a", stem: "a-search-doc" },
    ];
    const ranked = rankLiteralMatches("search", items, getFields, 10);
    // Both have "search" at index 2 in the same-length field → same score.
    // Tie-break: ascending stem → "a-search-doc" first.
    expect(ranked[0].item.id).toBe("a");
    expect(ranked[1].item.id).toBe("z");
  });

  it("enforces the cap", () => {
    const items: Item[] = Array.from({ length: 50 }, (_, i) => ({
      id: `item-${i}`,
      stem: `match-${i}`,
    }));
    const ranked = rankLiteralMatches("match", items, getFields, 15);
    expect(ranked).toHaveLength(15);
  });

  it("filters out non-matching items", () => {
    const items: Item[] = [
      { id: "hit", stem: "search-providers" },
      { id: "miss", stem: "unrelated" },
    ];
    const ranked = rankLiteralMatches("search", items, getFields, 10);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].item.id).toBe("hit");
  });

  it("returns an empty array for an empty query", () => {
    const items: Item[] = [{ id: "a", stem: "something" }];
    expect(rankLiteralMatches("", items, getFields, 10)).toEqual([]);
  });

  it("returns an empty array when cap is 0", () => {
    const items: Item[] = [{ id: "a", stem: "match" }];
    expect(rankLiteralMatches("match", items, getFields, 0)).toEqual([]);
  });

  it("multi-token AND: items missing any token are excluded", () => {
    const items: Item[] = [
      { id: "both", stem: "search-providers-adr" },
      { id: "partial", stem: "search-only" },
    ];
    const ranked = rankLiteralMatches("search providers", items, getFields, 10);
    expect(ranked.map((r) => r.item.id)).toEqual(["both"]);
  });
});
