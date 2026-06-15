// Adapter tests against samples CAPTURED from the live serve origin
// (vaultspec serve, 2026-06-13) — the S49 contract-shape verification in
// executable form. Tolerance is tested too: internal-shape (mock) bodies
// pass through unchanged.

import { describe, expect, it } from "vitest";

import { EngineClient } from "./engine";
import type { SearchResult } from "./engine";
import {
  adaptFilters,
  adaptGitOp,
  adaptGraphSlice,
  adaptMap,
  adaptPipeline,
  adaptPlanInterior,
  adaptSearch,
  adaptStatus,
  adaptVaultTree,
  deriveSearchNodeId,
  docTypeFromStem,
  metaEdgeToEdge,
  unwrapEnvelope,
} from "./liveAdapters";
import { MOCK_SCOPE, MockEngine } from "../../testing/mockEngine";

const TIERS = {
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic: { available: false, reason: "rag service down" },
};

describe("unwrapEnvelope", () => {
  it("unwraps {data, tiers} onto the flat internal shape", () => {
    const flat = unwrapEnvelope({ data: { ok: true, x: 1 }, tiers: TIERS }) as {
      ok: boolean;
      x: number;
      tiers: typeof TIERS;
    };
    expect(flat.ok).toBe(true);
    expect(flat.x).toBe(1);
    expect(flat.tiers.semantic.available).toBe(false);
  });

  it("unwraps the events family's payload nesting", () => {
    const flat = unwrapEnvelope({
      data: { payload: { buckets: [1] }, shape: "bucketed" },
      tiers: TIERS,
    }) as { buckets: number[] };
    expect(flat.buckets).toEqual([1]);
  });

  it("passes flat (mock) bodies through unchanged", () => {
    const body = { entries: [], tiers: TIERS };
    expect(unwrapEnvelope(body)).toBe(body);
  });
});

describe("adaptMap (live workspace sample)", () => {
  const live = {
    branches: [{ class: "default", name: "main" }],
    corpus_views: [{ head_ref: "refs/heads/main", worktree: "Y:/repo" }],
    remote_refs: [],
    scope_token_format: "absolute worktree path, forward slashes",
    workspace: "Y:/repo/.git",
    worktrees: [
      {
        dirty: true,
        has_vault: true,
        head_ref: "refs/heads/main",
        is_main: true,
        path: "Y:/repo",
      },
    ],
    tiers: TIERS,
  };

  it("maps worktrees with the path as the scope token id", () => {
    const adapted = adaptMap(live);
    const wt = adapted.repositories[0].worktrees[0];
    expect(wt.id).toBe("Y:/repo");
    expect(wt.branch).toBe("main");
    expect(wt.has_vault).toBe(true);
    expect(wt.is_default).toBe(true);
    expect(adapted.repositories[0].branches[0]).toEqual({
      name: "main",
      kind: "default",
    });
  });

  it("passes the internal repositories shape through", () => {
    const internal = { repositories: [], tiers: TIERS };
    expect(adaptMap(internal)).toBe(internal);
  });
});

describe("adaptStatus (live rollup sample)", () => {
  const live = {
    backends: { core: { invocation: "vaultspec-core" }, rag: { available: false } },
    index: { edges: 834, generation: 2, nodes: 142 },
    last_seq: 1809,
    ok: true,
    scope: "Y:/repo",
    watcher: { mode: "resident", running: true },
    tiers: TIERS,
  };

  it("rolls the index and backends onto the internal status", () => {
    const adapted = adaptStatus(live);
    expect(adapted.ok).toBe(true);
    expect(adapted.nodes).toBe(142);
    expect(adapted.edges).toBe(834);
    expect(adapted.degradations).toEqual(["semantic"]);
    expect(adapted.core?.reachable).toBe(true);
    expect(adapted.rag?.service).toBe("stopped");
    expect(adapted.git).toBeUndefined(); // not served — flagged divergence
  });
});

describe("adaptFilters (live vocabulary sample)", () => {
  it("unwraps the vocabulary wrapper", () => {
    const adapted = adaptFilters({
      vocabulary: {
        feature_tags: ["dashboard-gui"],
        kinds: ["document"],
        relations: ["mentions"],
        structural_states: ["resolved", "stale", "broken"],
        tiers: ["declared", "structural", "temporal", "semantic"],
      },
      tiers: TIERS,
    });
    expect(adapted.feature_tags).toEqual(["dashboard-gui"]);
    expect(adapted.relations).toEqual(["mentions"]);
    expect(adapted.doc_types).toEqual([]);
  });
});

describe("adaptGraphSlice (live constellation sample, 2026-06-13)", () => {
  // Captured verbatim from `vaultspec serve` over this repo's own vault at
  // feature granularity: feature-convergence nodes, edges EMPTY, and the
  // relationships in a SEPARATE meta_edges array (engine addendum S02). This
  // is the exact shape conformance.rs asserts engine-side.
  const liveFeatureSlice = {
    nodes: [
      {
        id: "feature:dashboard-foundation",
        kind: "feature",
        title: "dashboard-foundation",
        member_count: 5,
        degree_by_tier: { structural: 36 },
        lifecycle: null,
      },
      {
        id: "feature:dashboard-gui",
        kind: "feature",
        title: "dashboard-gui",
        member_count: 67,
        degree_by_tier: { structural: 590 },
        lifecycle: { state: "complete", progress: { done: 50, total: 50 } },
      },
    ],
    edges: [],
    meta_edges: [
      {
        src: "feature:dashboard-foundation",
        dst: "feature:dashboard-gui",
        src_feature: "dashboard-foundation",
        dst_feature: "dashboard-gui",
        count: 2,
        breakdown_by_tier: { structural: 2 },
      },
    ],
    filter: {},
    as_of: null,
    tiers: TIERS,
  };

  it("folds the separate meta_edges array into edges (the GUI reads edges)", () => {
    const slice = adaptGraphSlice(liveFeatureSlice);
    // The live edges[] is empty; every rendered edge comes from the fold.
    expect(slice.edges).toHaveLength(1);
    const edge = slice.edges[0];
    expect(edge.src).toBe("feature:dashboard-foundation");
    expect(edge.dst).toBe("feature:dashboard-gui");
    expect(edge.meta).toEqual({ count: 2, breakdown_by_tier: { structural: 2 } });
    // The raw array is consumed, not leaked onto the consumer slice.
    expect(slice.meta_edges).toBeUndefined();
    // Feature nodes and their member_count survive untouched.
    expect(slice.nodes[1].member_count).toBe(67);
  });

  it("synthesizes a stable id, relation, and dominant tier for a meta-edge", () => {
    const edge = metaEdgeToEdge({
      src: "feature:a",
      dst: "feature:b",
      src_feature: "a",
      dst_feature: "b",
      count: 7,
      breakdown_by_tier: { structural: 2, semantic: 5 },
    });
    // ID uses JSON-encoded endpoint pair to prevent collisions when endpoint
    // ids contain the "->" separator (wire-01 adversarial finding).
    expect(edge.id).toBe('meta:["feature:a","feature:b"]');
    expect(edge.relation).toBe("related");
    // Dominant tier = the breakdown's heaviest tier (semantic here).
    expect(edge.tier).toBe("semantic");
  });

  const meta = (breakdown: Record<string, number>) => ({
    src: "feature:a",
    dst: "feature:b",
    src_feature: "a",
    dst_feature: "b",
    count: 1,
    breakdown_by_tier: breakdown,
  });

  it("resolves a dominant-tier tie by canonical order", () => {
    // structural and temporal tie at 2 → the earlier canonical tier wins.
    expect(metaEdgeToEdge(meta({ structural: 2, temporal: 2 })).tier).toBe(
      "structural",
    );
    // declared precedes semantic; equal counts → declared.
    expect(metaEdgeToEdge(meta({ declared: 3, semantic: 3 })).tier).toBe("declared");
  });

  it("falls back to structural for an empty/all-zero breakdown", () => {
    expect(metaEdgeToEdge(meta({})).tier).toBe("structural");
    expect(metaEdgeToEdge(meta({ declared: 0, semantic: 0 })).tier).toBe("structural");
  });

  it("passes a document-granularity slice through unchanged (tolerance)", () => {
    // edges populated, meta_edges empty/absent: the fold is a no-op.
    const docSlice = {
      nodes: [{ id: "doc:x", kind: "document" }],
      edges: [
        {
          id: "e:1",
          src: "doc:x",
          dst: "doc:y",
          relation: "mentions",
          tier: "structural",
          confidence: 0.9,
        },
      ],
      meta_edges: [],
      tiers: TIERS,
    };
    const slice = adaptGraphSlice(docSlice);
    expect(slice.edges).toHaveLength(1);
    expect(slice.edges[0].meta).toBeUndefined();
  });
});

describe("adaptSearch (live nested rag envelope, W02.P16.S32)", () => {
  it("unwraps the live nested rag envelope and preserves the engine node-id annotation", () => {
    // The live `/search` forwards rag's envelope verbatim
    // (`{envelope: {ok, data: {results}}}`) plus the engine's §8 node-id
    // annotation; adaptSearch must reach into that nesting, not the flat shape.
    const adapted = adaptSearch({
      envelope: {
        ok: true,
        data: {
          results: [
            {
              source: "2026-06-12-auth-flow-adr",
              score: 0.91,
              excerpt: "auth flow decisions",
              node_id: "doc:2026-06-12-auth-flow-adr",
            },
          ],
        },
      },
      tiers: TIERS,
    }) as { results: SearchResult[]; tiers: typeof TIERS };
    expect(adapted.results).toHaveLength(1);
    expect(adapted.results[0].node_id).toBe("doc:2026-06-12-auth-flow-adr");
    expect(adapted.results[0].score).toBe(0.91);
    // The tiers block rides through (semantic degraded in this sample).
    expect(adapted.tiers.semantic.available).toBe(false);
  });

  it("passes a flat (mock/internal) body through unchanged — the one-code-path property", () => {
    const body = { results: [], tiers: TIERS };
    expect(adaptSearch(body)).toBe(body);
  });

  it("tolerates the rag item vocabulary (path/stem/text) when fields are sparse", () => {
    const adapted = adaptSearch({
      envelope: {
        data: {
          results: [{ path: "src/lib/auth.rs", score: 0.7, text: "fn authenticate" }],
        },
      },
      tiers: TIERS,
    }) as { results: SearchResult[] };
    expect(adapted.results[0].source).toBe("src/lib/auth.rs");
    expect(adapted.results[0].excerpt).toBe("fn authenticate");
  });
});

describe("deriveSearchNodeId (node-id grammar, null floor — search ADR)", () => {
  it("the engine annotation always wins", () => {
    expect(deriveSearchNodeId({ node_id: "doc:explicit", path: "x.md" })).toBe(
      "doc:explicit",
    );
  });

  it("derives doc:{stem} for a vault hit when the annotation is absent", () => {
    expect(deriveSearchNodeId({ path: ".vault/adr/2026-06-12-auth-flow-adr.md" })).toBe(
      "doc:2026-06-12-auth-flow-adr",
    );
    expect(deriveSearchNodeId({ stem: "2026-06-12-auth-flow-adr" })).toBe(
      "doc:2026-06-12-auth-flow-adr",
    );
  });

  it("derives code:{path} for a code hit — NEVER papers a code hit as doc:", () => {
    // A non-.md path is a code hit; papering it as doc: would lose the directory
    // and point at no graph node (search ADR risk: phantom click-through).
    expect(deriveSearchNodeId({ path: "src/lib/auth.rs" })).toBe(
      "code:src/lib/auth.rs",
    );
    expect(deriveSearchNodeId({ source: "code", path: "engine/query.rs" })).toBe(
      "code:engine/query.rs",
    );
  });

  it("yields null when no honest id can be formed (never a guess)", () => {
    expect(deriveSearchNodeId({ score: 0.5 })).toBeNull();
    expect(deriveSearchNodeId({ source: "code" })).toBeNull();
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

  it("derives the full stem-suffix vocabulary", () => {
    expect(docTypeFromStem("2026-06-12-x-plan")).toBe("plan");
    expect(docTypeFromStem("2026-06-12-x-research")).toBe("research");
    expect(docTypeFromStem("2026-06-12-x-P01-summary")).toBe("exec");
    expect(docTypeFromStem("dashboard-gui.index")).toBe("index");
    expect(docTypeFromStem("mystery")).toBe("document");
  });
});

// --- dashboard-pipeline-wire W05.P12: consumer fidelity ----------------------------
//
// Each test feeds a sample CAPTURED from the live serve wire shape (the
// `{data, tiers}` envelope the routes serve) through the SAME client path the app
// uses (unwrapEnvelope + the adapter), then drives the MockEngine through that same
// EngineClient and asserts the two shapes match — the mock-mirrors-live-wire-shape
// verification in executable form. A divergence is a test-fidelity defect to fix
// in the mock, never papered over by adapting only the live side.

function clientOn(mock: MockEngine): EngineClient {
  const client = new EngineClient({ baseUrl: "" });
  client.useTransport(mock.fetchImpl);
  return client;
}

describe("adaptPipeline + /pipeline consumer fidelity (W05.P12.S62)", () => {
  // A live `/pipeline` envelope: an active L3 plan (work started → execute) and a
  // proposed ADR (adr phase). The live route serves `{data: {artifacts}, tiers}`.
  const live = {
    data: {
      artifacts: [
        {
          node_id: "doc:2026-06-14-x-adr",
          stem: "2026-06-14-x-adr",
          title: "x adr",
          doc_type: "adr",
          status: "proposed",
          phase: "adr",
        },
        {
          node_id: "doc:2026-06-14-x-plan",
          stem: "2026-06-14-x-plan",
          title: "x plan",
          doc_type: "plan",
          tier: "L3",
          progress: { done: 2, total: 5 },
          phase: "execute",
        },
      ],
    },
    tiers: TIERS,
  };

  it("unwraps + adapts the live pipeline envelope", () => {
    const adapted = adaptPipeline(unwrapEnvelope(live));
    expect(adapted.artifacts).toHaveLength(2);
    expect(adapted.artifacts[0]).toMatchObject({
      node_id: "doc:2026-06-14-x-adr",
      status: "proposed",
      phase: "adr",
    });
    expect(adapted.artifacts[1]).toMatchObject({
      tier: "L3",
      phase: "execute",
      progress: { done: 2, total: 5 },
    });
    expect(adapted.tiers.semantic.available).toBe(false);
  });

  it("the mock serves the same pipeline shape through the client path", async () => {
    const mock = new MockEngine();
    const result = await clientOn(mock).pipeline(MOCK_SCOPE);
    // The mock excludes complete plans and rejected/deprecated ADRs, includes
    // active plans + proposed/accepted ADRs — same projection as the live engine.
    expect(result.artifacts.length).toBeGreaterThan(0);
    for (const a of result.artifacts) {
      if (a.doc_type === "adr") {
        expect(["proposed", "accepted"]).toContain(a.status);
        expect(a.phase).toBe("adr");
        expect(a.progress).toBeUndefined();
      } else {
        expect(a.doc_type).toBe("plan");
        expect(["plan", "execute"]).toContain(a.phase);
        // An active plan carries progress + tier, never a status.
        expect(a.status).toBeUndefined();
      }
    }
    // Sorted by node id (deterministic ordering), same as the live projection.
    const ids = result.artifacts.map((a) => a.node_id);
    expect([...ids].sort()).toEqual(ids);
  });
});

describe("adaptPlanInterior + plan-interior consumer fidelity (W05.P12.S63)", () => {
  // A live `/nodes/{id}/plan-interior` envelope: an L3 interior (one wave, one
  // phase, two steps) with a truncated block. The route wraps under `interior`.
  const live = {
    data: {
      interior: {
        plan_node_id: "doc:2026-06-14-x-plan",
        waves: [
          {
            node_id: "plan:2026-06-14-x-plan/W01",
            id: "W01",
            heading: "the wave",
            phases: [
              {
                node_id: "plan:2026-06-14-x-plan/W01/P01",
                id: "P01",
                heading: "the phase",
                steps: [
                  {
                    node_id: "plan:2026-06-14-x-plan/W01/P01/S01",
                    id: "S01",
                    action: "did it",
                    done: true,
                    exec_node_id: "doc:2026-06-14-x-W01-P01-S01",
                  },
                  {
                    node_id: "plan:2026-06-14-x-plan/W01/P01/S02",
                    id: "S02",
                    action: "todo",
                    done: false,
                  },
                ],
              },
            ],
          },
        ],
        phases: [],
        steps: [],
        truncated: {
          total_nodes: 9001,
          returned_nodes: 2000,
          reason: "plan interior node ceiling",
        },
      },
    },
    tiers: TIERS,
  };

  it("unwraps + adapts the live plan-interior envelope, folding the truncated block", () => {
    const adapted = adaptPlanInterior(unwrapEnvelope(live));
    expect(adapted.interior.plan_node_id).toBe("doc:2026-06-14-x-plan");
    expect(adapted.interior.waves).toHaveLength(1);
    const steps = adapted.interior.waves[0].phases[0].steps;
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({
      id: "S01",
      done: true,
      exec_node_id: "doc:2026-06-14-x-W01-P01-S01",
    });
    expect(steps[1].done).toBe(false);
    expect(adapted.interior.truncated).toEqual({
      total_nodes: 9001,
      returned_nodes: 2000,
      reason: "plan interior node ceiling",
    });
  });

  it("the mock serves the same plan-interior shape through the client path", async () => {
    const mock = new MockEngine();
    // Find a plan node id from the corpus.
    const planNode = mock.corpus.nodes.find((n) => n.doc_type === "plan");
    expect(planNode).toBeDefined();
    const result = await clientOn(mock).planInterior(planNode!.id);
    expect(result.interior.plan_node_id).toBe(planNode!.id);
    // The interior carries steps with the completion + canonical id shape, at
    // whatever depth the plan's tier declares (flat L1, phases L2, waves L3/L4).
    const allSteps = [
      ...result.interior.steps,
      ...result.interior.phases.flatMap((p) => p.steps),
      ...result.interior.waves.flatMap((w) => w.phases.flatMap((p) => p.steps)),
    ];
    expect(allSteps.length).toBeGreaterThan(0);
    for (const s of allSteps) {
      expect(typeof s.id).toBe("string");
      expect(s.id).toMatch(/^S\d+$/);
      expect(typeof s.done).toBe("boolean");
    }
    expect(result.interior.truncated).toBeNull();

    // A non-plan node has no interior — the client throws a tiered 404, exactly
    // like the live route's truthful-None path.
    const codeNode = mock.corpus.nodes.find((n) => n.kind === "code");
    await expect(clientOn(mock).planInterior(codeNode!.id)).rejects.toThrow();
  });
});

describe("adaptGitOp + /ops/git consumer fidelity (W05.P12.S64)", () => {
  // Live `/ops/git/{verb}` envelopes: git output forwarded verbatim under
  // `{data: {verb, output}, tiers}`.
  const liveStatus = {
    data: {
      verb: "status",
      output: "## main\n M .vault/plan/2026-01-05-editor-demo-plan.md\n",
    },
    tiers: TIERS,
  };
  const liveDiff = {
    data: {
      verb: "diff",
      output:
        "diff --git a/x.md b/x.md\n--- a/x.md\n+++ b/x.md\n@@ -1,1 +1,1 @@\n-old\n+new\n",
    },
    tiers: TIERS,
  };

  it("unwraps + adapts the live git status + diff envelopes verbatim", () => {
    const status = adaptGitOp(unwrapEnvelope(liveStatus));
    expect(status.verb).toBe("status");
    // Porcelain per-file `XY path` line forwarded verbatim.
    expect(status.output).toContain(" M .vault/plan/");
    const diff = adaptGitOp(unwrapEnvelope(liveDiff));
    expect(diff.verb).toBe("diff");
    expect(diff.output).toContain("@@ -1,1 +1,1 @@");
    expect(diff.output).toContain("+new");
  });

  it("the mock serves the same git status + diff shapes through the client path", async () => {
    const mock = new MockEngine();
    mock.setGitDirty(true);
    const client = clientOn(mock);

    const status = await client.opsGit("status");
    expect(status.verb).toBe("status");
    // The mock emits the same porcelain per-file `XY path` shape the live engine
    // forwards (a branch header line, then per-file status).
    expect(status.output).toMatch(/^## main\n/);
    expect(status.output).toMatch(/ M .+\.md\n/);

    const numstat = await client.opsGit("numstat");
    expect(numstat.output).toMatch(/^\d+\t\d+\t.+\.md\n/);

    const diff = await client.opsGit("diff", { path: ".vault/plan/x.md" });
    expect(diff.verb).toBe("diff");
    expect(diff.output).toContain("@@ ");
    expect(diff.output).toContain("+new line");

    // A non-whitelisted verb is a tiered 403 (read-only whitelist), and diff
    // without a path is a 400 — same as the live route.
    await expect(client.opsGit("commit" as "status")).rejects.toThrow();
    await expect(client.opsGit("diff")).rejects.toThrow();
  });
});

describe("status + tier facets carried identically by mock and live (W05.P12.S65)", () => {
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
        },
      ],
    },
    tiers: TIERS,
  };

  it("the live vault-tree carries status on its ADR and tier on its plan", () => {
    const adapted = adaptVaultTree(unwrapEnvelope(liveTree));
    const adr = adapted.entries.find((e) => e.doc_type === "adr");
    const plan = adapted.entries.find((e) => e.doc_type === "plan");
    expect(adr?.status).toBe("accepted");
    expect(plan?.tier).toBe("L3");
  });

  it("the mock vault-tree and graph-query nodes carry status and tier identically", async () => {
    const mock = new MockEngine();
    const client = clientOn(mock);

    // vault-tree: ADR entries carry status, plan entries carry tier.
    const tree = await client.vaultTree(MOCK_SCOPE);
    const adrEntry = tree.entries.find((e) => e.doc_type === "adr");
    const planEntry = tree.entries.find((e) => e.doc_type === "plan");
    expect(adrEntry?.status).toBeDefined();
    expect(["proposed", "accepted", "rejected", "deprecated"]).toContain(
      adrEntry?.status,
    );
    expect(planEntry?.tier).toBeDefined();
    expect(["L1", "L2", "L3", "L4"]).toContain(planEntry?.tier);
    // A non-ADR/non-plan entry carries neither facet (truthful absence).
    const research = tree.entries.find((e) => e.doc_type === "research");
    expect(research?.status).toBeUndefined();
    expect(research?.tier).toBeUndefined();

    // graph-query: the same facets ride on the doc nodes.
    const slice = await client.graphQuery({ scope: MOCK_SCOPE });
    const adrNode = slice.nodes.find((n) => n.doc_type === "adr");
    const planNode = slice.nodes.find((n) => n.doc_type === "plan");
    expect(adrNode?.status).toBeDefined();
    expect(planNode?.tier).toBeDefined();
  });
});
