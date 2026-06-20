// Regression (backend-hardening campaign, finding wire-03): adaptSearch must
// derive a hit's click-through node_id only along the §2 / M-B1 node-id
// grammar. The engine's `node_id` annotation wins; absent it, a CODE hit
// derives `code:{repo-relative path}` (never a `doc:` id that loses the path
// and mislabels the kind), a vault hit derives `doc:{stem}`, and an
// underivable hit is null — never a guess (M-C4 falsifier).

import { describe, expect, it } from "vitest";

import { adaptSearch, deriveSearchNodeId } from "./liveAdapters";

const TIERS = {
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic: { available: true },
};

const envelope = (results: unknown[]) => ({
  envelope: { ok: true, data: { results } },
  tiers: TIERS,
});

describe("adaptSearch node_id grammar (§2 / M-B1)", () => {
  it("derives a resolvable code: id for a code hit, never a doc: id", () => {
    const { results } = adaptSearch(
      envelope([
        { path: "src/auth-flow/mod.rs", source: "code", score: 0.91, text: "fn ..." },
      ]),
    ) as { results: { node_id: string | null }[] };
    expect(results[0].node_id).toBe("code:src/auth-flow/mod.rs");
    expect(results[0].node_id?.startsWith("doc:")).toBe(false);
  });

  it("derives doc:{stem} for a vault hit", () => {
    const { results } = adaptSearch(
      envelope([{ stem: "2026-06-12-foo-adr", source: "vault", score: 0.8 }]),
    ) as { results: { node_id: string | null }[] };
    expect(results[0].node_id).toBe("doc:2026-06-12-foo-adr");
  });

  it("honours an explicit engine node_id annotation over any derivation", () => {
    expect(
      deriveSearchNodeId({ node_id: "code:src/x/mod.rs#auth", path: "src/x/mod.rs" }),
    ).toBe("code:src/x/mod.rs#auth");
  });

  it("returns null when no honest id can be formed", () => {
    expect(deriveSearchNodeId({ source: "code", score: 0.5 })).toBeNull();
  });
});

// Rich-field forwarding (search-result representation): the engine forwards rag's
// envelope verbatim (rag-client `forward_search`), so the per-result metadata the
// rich Cmd-K pills render must survive adaptSearch — rag's `snippet` becomes the
// excerpt, and the species-specific fields (vault: doc_type/feature/date; code:
// language/line range/symbol) plus the long-form `rerank_text` carry through. A
// vault hit's null code fields are simply absent (optional wire shape).
describe("adaptSearch rich-field forwarding (mirror the live rag wire)", () => {
  it("carries vault metadata + snippet + rerank_text through", () => {
    const { results } = adaptSearch(
      envelope([
        {
          source: "vault",
          score: 0.97,
          snippet: "the timeline becomes the corpus's diachronic lineage view",
          rerank_text: "# dashboard-timeline adr\n\nThe full reranker body…",
          doc_type: "adr",
          feature: "dashboard-timeline",
          date: "2026-06-15",
          line_start: null,
          stem: "2026-06-15-dashboard-timeline-adr",
        },
      ]),
    ) as unknown as { results: Record<string, unknown>[] };
    const r = results[0];
    expect(r.excerpt).toBe("the timeline becomes the corpus's diachronic lineage view");
    expect(r.rerank_text).toContain("dashboard-timeline adr");
    expect(r.doc_type).toBe("adr");
    expect(r.feature).toBe("dashboard-timeline");
    expect(r.date).toBe("2026-06-15");
    expect("line_start" in r).toBe(false); // null line dropped, not echoed
  });

  it("carries code symbol + line range + language through", () => {
    const { results } = adaptSearch(
      envelope([
        {
          source: "codebase",
          score: 0.87,
          snippet: "export function buildFallbackResults(entries, query) {",
          language: "typescript",
          line_start: 910,
          line_end: 936,
          node_type: "function_item",
          function_name: "buildFallbackResults",
          path: "frontend/src/stores/server/searchController.ts",
        },
      ]),
    ) as unknown as { results: Record<string, unknown>[] };
    const r = results[0];
    expect(r.language).toBe("typescript");
    expect(r.line_start).toBe(910);
    expect(r.line_end).toBe(936);
    expect(r.function_name).toBe("buildFallbackResults");
    expect(r.node_type).toBe("function_item");
  });
});
