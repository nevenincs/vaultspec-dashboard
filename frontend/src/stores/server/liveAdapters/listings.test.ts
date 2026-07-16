// @vitest-environment happy-dom is NOT needed (pure adapter unit tests on captured samples).
// Split from liveAdapters.test.ts (module-decomposition mandate, 2026-07-12).

import { describe, expect, it } from "vitest";
import { deriveHoverEvidenceSummary } from "../../view/hoverCardEvidence";
import type { SearchResult } from "../engine";
import {
  SEARCH_RESULTS_MAX_ITEMS,
  SEARCH_RESULT_EXCERPT_MAX_CHARS,
  SEARCH_RESULT_IDENTITY_MAX_CHARS,
  adaptCodeFiles,
  adaptFileTree,
  adaptNodeDetail,
  adaptNodeEvidence,
  adaptCodeFilesDelta,
  adaptSearch,
  adaptVaultTree,
  adaptVaultTreeDelta,
  docTypeFromStem,
  unwrapEnvelope,
} from "./index";
import { TIERS } from "./testFixtures";

describe("adaptFileTree (code tree listing)", () => {
  it("normalizes file-tree rows before code-browser selection", () => {
    const adapted = adaptFileTree({
      path: " src ",
      entries: [
        {
          path: " src/main.ts ",
          kind: "file",
          has_children: true,
          node_id: " code:src/main.ts ",
        },
        {
          path: " src/components ",
          kind: "dir",
          has_children: true,
          node_id: "   ",
        },
        {
          path: "   ",
          kind: "dir",
          node_id: "code:blank",
        },
        "not an entry",
      ],
      truncated: {
        total_children: 10.8,
        returned_children: 3,
        reason: " capped ",
      },
      next_cursor: " next-page ",
      tiers: TIERS,
    });

    expect(adapted.path).toBe("src");
    expect(adapted.entries).toEqual([
      {
        path: "src/main.ts",
        kind: "file",
        has_children: false,
        node_id: "code:src/main.ts",
      },
      {
        path: "src/components",
        kind: "dir",
        has_children: true,
        node_id: "code:src/components",
      },
    ]);
    expect(adapted.truncated).toEqual({
      total_children: 10,
      returned_children: 3,
      reason: "capped",
    });
    expect(adapted.next_cursor).toBe("next-page");
  });

  it("drops malformed file-tree truncation and blank cursors", () => {
    const adapted = adaptFileTree({
      entries: [],
      truncated: {
        total_children: Number.NaN,
        returned_children: 3,
        reason: "bad total",
      },
      next_cursor: "   ",
      tiers: TIERS,
    });

    expect(adapted.truncated).toBeNull();
    expect(adapted.next_cursor).toBeUndefined();
  });
});

describe("adaptCodeFiles (complete code-file listing, search-providers ADR D1)", () => {
  it("normalizes entries and falls back to code:{path} when node_id is absent", () => {
    const adapted = adaptCodeFiles({
      entries: [
        {
          path: " src/main.ts ",
          node_id: " code:src/main.ts ",
          title: " Main entry ",
          lang: " typescript ",
        },
        {
          path: " src/lib.rs ",
          node_id: "   ", // blank → derives code:{path}
          lang: " rust ",
        },
        {
          path: "   ", // blank path → dropped
          node_id: "code:oops",
        },
        "not an entry",
      ],
      truncated: null,
      tiers: TIERS,
    });

    expect(adapted.entries).toEqual([
      {
        path: "src/main.ts",
        node_id: "code:src/main.ts",
        title: "Main entry",
        lang: "typescript",
      },
      {
        path: "src/lib.rs",
        node_id: "code:src/lib.rs",
        lang: "rust",
      },
    ]);
    expect(adapted.truncated).toBeNull();
    expect(adapted.tiers).toEqual(TIERS);
  });

  it("omits absent optional fields rather than emitting undefined keys", () => {
    const adapted = adaptCodeFiles({
      entries: [{ path: "src/bare.py", node_id: "code:src/bare.py" }],
      truncated: null,
      tiers: TIERS,
    });

    expect(adapted.entries[0]).toEqual({
      path: "src/bare.py",
      node_id: "code:src/bare.py",
    });
    expect("title" in adapted.entries[0]!).toBe(false);
    expect("lang" in adapted.entries[0]!).toBe(false);
  });

  it("passes through honest truncation and drops malformed blocks", () => {
    const capped = adaptCodeFiles({
      entries: [],
      truncated: { returned_files: 50000.7, reason: " walk ceiling " },
      tiers: TIERS,
    });
    expect(capped.truncated).toEqual({ returned_files: 50000, reason: "walk ceiling" });

    // Negative counts are clamped to 0 by the adapter (never rejected).
    const badCount = adaptCodeFiles({
      entries: [],
      truncated: { returned_files: -1, reason: "negative" },
      tiers: TIERS,
    });
    expect(badCount.truncated).toEqual({ returned_files: 0, reason: "negative" });

    const missingReason = adaptCodeFiles({
      entries: [],
      truncated: { returned_files: 100 },
      tiers: TIERS,
    });
    expect(missingReason.truncated).toBeNull();
  });

  it("defaults to empty entries and null truncated on a missing body", () => {
    const fromNull = adaptCodeFiles(null);
    expect(fromNull.entries).toEqual([]);
    expect(fromNull.truncated).toBeNull();
    expect(fromNull.tiers).toEqual({});

    const fromEmpty = adaptCodeFiles({});
    expect(fromEmpty.entries).toEqual([]);
    expect(fromEmpty.truncated).toBeNull();
  });
});

describe("adaptSearch (live flat rag HTTP envelope, rag-integration-hardening D1/D3)", () => {
  it("reads top-level results and preserves the engine node-id annotation", () => {
    // The live `/search` now serves rag's FLAT HTTP envelope: `results` at the
    // top level (unwrapEnvelope already stripped the §2 {data,tiers} wrapper),
    // plus the engine's §8 node-id annotation. adaptSearch reads the flat shape,
    // not the retired nested `{envelope:{data:{results}}}` CLI envelope.
    const adapted = adaptSearch({
      results: [
        {
          source: "vault",
          score: 0.91,
          snippet: "auth flow decisions",
          node_id: "doc:2026-06-12-auth-flow-adr",
        },
      ],
      tiers: TIERS,
    }) as { results: SearchResult[]; tiers: typeof TIERS };
    expect(adapted.results).toHaveLength(1);
    expect(adapted.results[0].node_id).toBe("doc:2026-06-12-auth-flow-adr");
    expect(adapted.results[0].score).toBe(0.91);
    // rag's short preview field is `snippet` (the CLI's `excerpt` is a tolerated
    // alias); it becomes the internal `excerpt`.
    expect(adapted.results[0].excerpt).toBe("auth flow decisions");
    // The tiers block rides through (semantic degraded in this shared fixture).
    expect(adapted.tiers.semantic.available).toBe(false);
  });

  it("adapts a flat top-level-results body (no nested envelope, no passthrough)", () => {
    // Post-cutover there is one shape: a flat body with top-level `results` is
    // ADAPTED (each row run through the node-id grammar), never short-circuited
    // as a preadapted mock. An empty list yields an empty adapted list.
    const adapted = adaptSearch({ results: [], tiers: TIERS }) as {
      results: SearchResult[];
    };
    expect(adapted.results).toEqual([]);
  });

  it("tolerates the rag item vocabulary (path/stem/snippet) when fields are sparse", () => {
    const adapted = adaptSearch({
      results: [{ path: "src/lib/auth.rs", score: 0.7, snippet: "fn authenticate" }],
      tiers: TIERS,
    }) as { results: SearchResult[] };
    expect(adapted.results[0].source).toBe("src/lib/auth.rs");
    expect(adapted.results[0].excerpt).toBe("fn authenticate");
  });

  it("normalizes search result rows before controller interpretation", () => {
    const adapted = adaptSearch({
      results: [
        {
          path: " src/lib/auth.rs ",
          score: 1.4,
          text: " fn authenticate ",
        },
        {
          source: "  ",
          score: 0.3,
          excerpt: "blank source is malformed",
        },
        {
          stem: "2026-06-12-auth-flow-adr",
          score: Number.NaN,
          excerpt: "bad score is malformed",
        },
        "not a row",
      ],
      tiers: TIERS,
    });

    expect(adapted.results).toEqual([
      {
        score: 1,
        source: "src/lib/auth.rs",
        excerpt: "fn authenticate",
        node_id: "code:src/lib/auth.rs",
      },
    ]);
  });

  it("forwards rag's index_state freshness block verbatim (D3)", () => {
    const adapted = adaptSearch({
      results: [{ source: "vault", score: 0.8, snippet: "hit", node_id: "doc:x" }],
      index_state: {
        source: "vault",
        indexed_count: 3173,
        vault_count: 3173,
        code_count: 10507,
        indexed_target_root: "Y:\\code\\proj",
        requested_target_root: "Y:\\code\\proj",
        target_matches: true,
        status: "available",
      },
      semantic_epoch: 42,
      tiers: TIERS,
    }) as {
      index_state?: {
        indexed_count?: number;
        target_matches?: boolean;
        status?: string;
      };
      semantic_epoch?: number | null;
    };
    expect(adapted.index_state).toEqual({
      source: "vault",
      indexed_count: 3173,
      vault_count: 3173,
      code_count: 10507,
      indexed_target_root: "Y:\\code\\proj",
      requested_target_root: "Y:\\code\\proj",
      target_matches: true,
      status: "available",
    });
    expect(adapted.semantic_epoch).toBe(42);
  });

  it("preserves an explicit null semantic_epoch as the honest absent marker", () => {
    // A cold/failed epoch read annotates `null` — freshness known-unknown, never
    // fabricated. `null` and absent are distinct and never collapsed.
    const adapted = adaptSearch({
      results: [],
      semantic_epoch: null,
      tiers: TIERS,
    }) as { semantic_epoch?: number | null };
    expect("semantic_epoch" in adapted).toBe(true);
    expect(adapted.semantic_epoch).toBeNull();
  });

  it("omits freshness entirely when the wire carried none (the degraded path)", () => {
    // The degraded/empty search envelope emits neither index_state nor an epoch;
    // the adapter never fabricates a block.
    const adapted = adaptSearch({ results: [], tiers: TIERS }) as {
      index_state?: unknown;
      semantic_epoch?: unknown;
    };
    expect("index_state" in adapted).toBe(false);
    expect("semantic_epoch" in adapted).toBe(false);
  });

  it("drops a malformed index_state field but keeps the well-formed rest", () => {
    const adapted = adaptSearch({
      results: [],
      index_state: {
        source: "vault",
        indexed_count: -5, // negative count is malformed → dropped
        target_matches: "yes", // non-boolean → dropped
        status: "indexing",
      },
      tiers: TIERS,
    }) as { index_state?: Record<string, unknown> };
    expect(adapted.index_state).toEqual({ source: "vault", status: "indexing" });
  });

  it("bounds live search result strings and accumulated rows at the adapter", () => {
    const overlongIdentity = "x".repeat(SEARCH_RESULT_IDENTITY_MAX_CHARS + 1);
    const overlongExcerpt = "e".repeat(SEARCH_RESULT_EXCERPT_MAX_CHARS + 8);
    const rows = [
      {
        path: overlongIdentity,
        score: 0.5,
        excerpt: "overlong identity is malformed",
      },
      ...Array.from({ length: SEARCH_RESULTS_MAX_ITEMS + 3 }, (_, index) => ({
        path: `src/search/result-${index}.ts`,
        score: 0.75,
        text: index === 0 ? overlongExcerpt : `match ${index}`,
      })),
    ];

    const adapted = adaptSearch({
      results: rows,
      tiers: TIERS,
    }) as { results: SearchResult[] };

    expect(adapted.results).toHaveLength(SEARCH_RESULTS_MAX_ITEMS);
    expect(adapted.results[0].source).toBe("src/search/result-0.ts");
    expect(adapted.results[0].excerpt).toHaveLength(SEARCH_RESULT_EXCERPT_MAX_CHARS);
    expect(adapted.results.at(-1)?.source).toBe(
      `src/search/result-${SEARCH_RESULTS_MAX_ITEMS - 1}.ts`,
    );
  });
});

describe("adaptVaultTree (live stem entries)", () => {
  it("derives paths and doc types from stems", () => {
    const adapted = adaptVaultTree({
      entries: [
        {
          feature_tags: ["dashboard-gui"],
          node_id: "doc:2026-06-12-dashboard-gui-adr",
          stem: "2026-06-12-dashboard-gui-adr",
        },
        {
          feature_tags: ["dashboard-gui"],
          node_id: "doc:2026-06-12-dashboard-gui-W01-P01-S01",
          stem: "2026-06-12-dashboard-gui-W01-P01-S01",
        },
      ],
      tiers: TIERS,
    });
    expect(adapted.entries[0]).toMatchObject({
      path: ".vault/adr/2026-06-12-dashboard-gui-adr.md",
      doc_type: "adr",
    });
    expect(adapted.entries[1].doc_type).toBe("exec");
  });

  it("normalizes vault-tree rows before browser grouping", () => {
    const adapted = adaptVaultTree({
      entries: [
        {
          stem: " 2026-06-12-dashboard-gui-plan ",
          feature_tags: [" dashboard-gui ", "dashboard-gui", "", 42],
          dates: { created: " 2026-06-12 ", modified: "   " },
          status: " proposed ",
          tier: " L2 ",
          progress: { done: 2.9, total: 5.1 },
          size: { bytes: 2048.7, words: 310.2 },
        },
        {
          path: " .vault/adr/2026-06-12-dashboard-gui-adr.md ",
          doc_type: " adr ",
          feature_tags: [" design "],
          dates: { modified: " 2026-06-13 " },
          progress: { done: 5, total: 2 },
          // Malformed weight (negative / non-numeric) is dropped whole.
          size: { bytes: -1, words: "many" },
        },
        {
          stem: "   ",
          feature_tags: ["bad"],
        },
        "not a row",
      ],
      tiers: TIERS,
    });

    expect(adapted.entries).toEqual([
      {
        path: ".vault/plan/2026-06-12-dashboard-gui-plan.md",
        doc_type: "plan",
        feature_tags: ["dashboard-gui"],
        dates: { created: "2026-06-12" },
        status: "proposed",
        tier: "L2",
        progress: { done: 2, total: 5 },
        size: { bytes: 2048, words: 310 },
      },
      {
        path: ".vault/adr/2026-06-12-dashboard-gui-adr.md",
        doc_type: "adr",
        feature_tags: ["design"],
        dates: { modified: "2026-06-13" },
      },
    ]);
  });

  it("derives the full stem-suffix vocabulary", () => {
    expect(docTypeFromStem("2026-06-12-x-plan")).toBe("plan");
    expect(docTypeFromStem("2026-06-12-x-research")).toBe("research");
    expect(docTypeFromStem("2026-06-12-x-P01-summary")).toBe("exec");
    // `.index` (`.vault/index` feature-index) is a strictly-ignored metanode
    // (index-node-exclusion ADR): no `index` doc-type, falls through to document.
    expect(docTypeFromStem("dashboard-gui.index")).toBe("document");
    expect(docTypeFromStem("mystery")).toBe("document");
  });
});

describe("adaptVaultTree generation (vault-tree-delta ADR D1)", () => {
  it("absorbs a numeric generation and omits a malformed one", () => {
    expect(
      adaptVaultTree({ entries: [], tiers: TIERS, generation: 7 }).generation,
    ).toBe(7);
    // A fractional generation floors; a negative/non-number is dropped (no baseline).
    expect(
      adaptVaultTree({ entries: [], tiers: TIERS, generation: 12.9 }).generation,
    ).toBe(12);
    expect(
      adaptVaultTree({ entries: [], tiers: TIERS, generation: -1 }).generation,
    ).toBeUndefined();
    expect(
      adaptVaultTree({ entries: [], tiers: TIERS, generation: "x" }).generation,
    ).toBeUndefined();
    expect(adaptVaultTree({ entries: [], tiers: TIERS }).generation).toBeUndefined();
  });
});

describe("adaptVaultTreeDelta (vault-tree-delta ADR D3)", () => {
  it("adapts a real diff: changed rows and removed stems", () => {
    const delta = adaptVaultTreeDelta({
      since: 3,
      generation: 5,
      changed: [{ stem: "2026-06-12-x-plan", feature_tags: ["x"] }],
      removed: ["2026-06-11-old-adr", 42],
      tiers: TIERS,
    });
    expect(delta.generation).toBe(5);
    expect(delta.since).toBe(3);
    expect(delta.full_required).toBeUndefined();
    expect(delta.changed?.[0]).toMatchObject({
      path: ".vault/plan/2026-06-12-x-plan.md",
      doc_type: "plan",
    });
    // Non-string removed entries are dropped (tolerant).
    expect(delta.removed).toEqual(["2026-06-11-old-adr"]);
  });

  it("passes through an explicit full_required instruction", () => {
    const delta = adaptVaultTreeDelta({
      generation: 9,
      full_required: true,
      tiers: TIERS,
    });
    expect(delta.full_required).toBe(true);
    expect(delta.generation).toBe(9);
  });

  it("fails safe to a full drain on an unusable or generation-less body", () => {
    expect(adaptVaultTreeDelta(null).full_required).toBe(true);
    expect(adaptVaultTreeDelta("nope").full_required).toBe(true);
    // A body with no usable generation cannot be a baseline → full drain.
    expect(adaptVaultTreeDelta({ changed: [], removed: [] }).full_required).toBe(true);
  });
});

describe("adaptCodeFilesDelta (path-keyed delta, /code-files follow-on)", () => {
  it("adapts a real diff: changed code rows and removed paths", () => {
    const delta = adaptCodeFilesDelta({
      since: 3,
      generation: 5,
      changed: [{ path: "src/new.rs", node_id: "code:src/new.rs", lang: "rust" }],
      removed: ["src/old.rs", 42],
      tiers: TIERS,
    });
    expect(delta.generation).toBe(5);
    expect(delta.since).toBe(3);
    expect(delta.full_required).toBeUndefined();
    expect(delta.changed?.[0]).toMatchObject({
      path: "src/new.rs",
      node_id: "code:src/new.rs",
      lang: "rust",
    });
    // A code row missing its path is dropped; non-string removed keys are dropped.
    expect(delta.removed).toEqual(["src/old.rs"]);
  });

  it("fails safe to a full drain on full_required / unusable / generation-less bodies", () => {
    expect(
      adaptCodeFilesDelta({ generation: 9, full_required: true, tiers: TIERS })
        .full_required,
    ).toBe(true);
    expect(adaptCodeFilesDelta(null).full_required).toBe(true);
    expect(adaptCodeFilesDelta({ changed: [], removed: [] }).full_required).toBe(true);
  });
});

describe("status + tier facets carried by live-shaped vault tree samples (W05.P12.S65)", () => {
  // A live `/vault-tree` sample carrying status/tier on its ADR and plan entries
  // — the stem-keyed live shape the adapter maps, now with the new facets.
  const liveTree = {
    data: {
      entries: [
        {
          stem: "2026-06-14-x-adr",
          node_id: "doc:2026-06-14-x-adr",
          feature_tags: ["x"],
          status: "accepted",
        },
        {
          stem: "2026-06-14-x-plan",
          node_id: "doc:2026-06-14-x-plan",
          feature_tags: ["x"],
          tier: "L3",
          progress: { done: 2, total: 5 },
        },
      ],
    },
    tiers: TIERS,
  };

  it("the live vault-tree carries status on its ADR and tier + progress on its plan", () => {
    const adapted = adaptVaultTree(unwrapEnvelope(liveTree));
    const adr = adapted.entries.find((e) => e.doc_type === "adr");
    const plan = adapted.entries.find((e) => e.doc_type === "plan");
    expect(adr?.status).toBe("accepted");
    expect(plan?.tier).toBe("L3");
    // The plan's checkbox progress rides through so the rail's status pip lights
    // up from real lifecycle truth (planStatus => in-progress here).
    expect(plan?.progress).toEqual({ done: 2, total: 5 });
    // An ADR carries no checkbox progress (truthful absence).
    expect(adr?.progress).toBeUndefined();
  });

  it("ignores a malformed progress pair (tolerant adapter, honest absence)", () => {
    const adapted = adaptVaultTree(
      unwrapEnvelope({
        data: {
          entries: [
            {
              stem: "2026-06-14-y-plan",
              node_id: "doc:2026-06-14-y-plan",
              feature_tags: ["y"],
              tier: "L1",
              progress: { done: "2", total: null },
            },
          ],
        },
        tiers: TIERS,
      }),
    );
    const plan = adapted.entries.find((e) => e.doc_type === "plan");
    expect(plan?.progress).toBeUndefined();
  });
});

describe("enriched node-evidence consumer fidelity (figma-parity-reconciliation S18)", () => {
  // A sample CAPTURED from the live `/nodes/{id}/evidence` wire under the S13
  // enrichment: the `{data, tiers}` envelope carrying the GUI `NodeEvidence`
  // shape — documents as `{ path, doc_type }`, code locations as
  // `{ path, symbol?, line?, state? }`, and commits carrying the `subject`.
  // Feeding it through the SAME unwrap path the app uses verifies the enriched
  // evidence shape.
  const liveEvidence = {
    data: {
      documents: [
        { path: ".vault/adr/2026-06-14-x-adr.md", doc_type: "adr" },
        { path: ".vault/plan/2026-06-14-x-plan.md", doc_type: "plan" },
      ],
      code_locations: [
        { path: "src/lib.rs", symbol: "build", line: 42, state: "resolved" },
      ],
      commits: [
        {
          sha: "abc1234",
          subject: "feat: the enriched commit",
          rule: "step-id-correlation",
          // The live `CorrelatedCommit` always serializes `confidence: f32` (the
          // correlating edge's confidence); the captured sample carries it so the
          // sample matches the live wire byte-for-byte (review LOW-1).
          confidence: 0.7,
        },
      ],
    },
    tiers: TIERS,
  };

  it("unwraps the live enriched evidence envelope onto the GUI NodeEvidence shape", () => {
    const ev = unwrapEnvelope(liveEvidence) as {
      documents: { path: string; doc_type: string }[];
      code_locations: {
        path: string;
        symbol?: string;
        line?: number;
        state?: string;
      }[];
      commits: { sha: string; subject: string; rule?: string }[];
      tiers: typeof TIERS;
    };
    // Documents carry path + doc_type (not bare stems).
    expect(ev.documents[0]).toEqual({
      path: ".vault/adr/2026-06-14-x-adr.md",
      doc_type: "adr",
    });
    expect(ev.code_locations[0]).toEqual({
      path: "src/lib.rs",
      symbol: "build",
      line: 42,
      state: "resolved",
    });
    // Commits carry the subject (the previously-missing git lookup datum).
    expect(ev.commits[0].subject).toBe("feat: the enriched commit");
    expect(ev.tiers.semantic.available).toBe(false);
  });
});

describe("adaptNodeDetail (live nested {detail:{bundle}} wire, hover-card summary)", () => {
  // The shape `unwrapEnvelope` hands this adapter: the envelope's `data` flattened
  // with the tiers block (the nested context bundle is preserved under `detail`).
  const live = {
    detail: {
      bundle: {
        node: {
          id: "doc:foo-research",
          kind: "document",
          doc_type: "research",
          title: "Foo",
        },
        edges_by_tier: {},
        neighbors: [],
        degree_by_tier: {},
      },
    },
    summary: "The first prose line of the doc.",
    tiers: TIERS,
  };

  it("flattens the nested context bundle to a top-level node + summary", () => {
    const detail = adaptNodeDetail(live);
    expect(detail.node.id).toBe("doc:foo-research");
    expect(detail.node.doc_type).toBe("research");
    expect(detail.summary).toBe("The first prose line of the doc.");
    expect(detail.tiers).toEqual(TIERS);
  });

  it("omits the summary when the wire carries none (a feature node)", () => {
    const detail = adaptNodeDetail({
      detail: { bundle: { node: { id: "feature:x", kind: "feature", title: "X" } } },
      summary: null,
      tiers: TIERS,
    });
    expect(detail.node.id).toBe("feature:x");
    expect(detail.summary).toBeUndefined();
  });

  it("passes an already-flat (mock/internal) body through unchanged", () => {
    const flat = {
      node: { id: "doc:bar", kind: "document", doc_type: "plan", title: "Bar" },
      summary: "Bar summary.",
      tiers: TIERS,
    };
    const detail = adaptNodeDetail(flat);
    expect(detail.node.id).toBe("doc:bar");
    expect(detail.summary).toBe("Bar summary.");
  });

  it("tolerates a malformed body with a degraded (empty-tiers, no-node) result", () => {
    const detail = adaptNodeDetail(null);
    expect(detail.node).toBeUndefined();
    expect(detail.summary).toBeUndefined();
    expect(detail.tiers).toEqual({});
  });
});

describe("adaptNodeEvidence (live /nodes/{id}/evidence; serde-omitted empty arrays)", () => {
  // The shape `unwrapEnvelope` hands this adapter: the evidence fields flattened to
  // the top level with the tiers block a sibling. The engine serde OMITS an empty
  // evidence array, so a node with no code locations arrives MISSING `code_locations`.
  it("floors each omitted evidence array to [] (the crash the raw consumer hit)", () => {
    // A doc node with documents + commits but NO code_locations key on the wire.
    const evidence = adaptNodeEvidence({
      documents: [{ path: ".vault/adr/x.md", doc_type: "adr" }],
      commits: [{ sha: "abc1234", subject: "do a thing" }],
      tiers: TIERS,
    });
    expect(evidence.documents).toHaveLength(1);
    expect(evidence.commits).toHaveLength(1);
    expect(evidence.code_locations).toEqual([]); // omitted on the wire → floored
    expect(evidence.tiers).toEqual(TIERS);
  });

  it("yields three empty arrays + empty tiers for an absent/odd body", () => {
    const evidence = adaptNodeEvidence(null);
    expect(evidence.documents).toEqual([]);
    expect(evidence.code_locations).toEqual([]);
    expect(evidence.commits).toEqual([]);
    expect(evidence.tiers).toEqual({});
  });

  it("the adapted evidence folds without throwing — the panel no longer crashes", () => {
    // The exact regression: a payload MISSING `code_locations` must fold to bounded
    // groups, never read `.length` of undefined (the stage-panel ErrorBoundary crash).
    const evidence = adaptNodeEvidence({
      documents: [{ path: ".vault/plan/p.md", doc_type: "plan" }],
      tiers: TIERS,
    });
    const summary = deriveHoverEvidenceSummary(evidence);
    expect(summary.documentCount).toBe(1);
    // And the pure fold is itself robust to a directly-omitted array (defensive floor).
    expect(() =>
      deriveHoverEvidenceSummary({ documents: [], tiers: TIERS } as never),
    ).not.toThrow();
  });
});
