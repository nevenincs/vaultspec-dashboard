// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { liveTransport } from "../../../testing/liveClient";
import { engineClient } from "../engine";
import {
  GRAPH_GENERATION_QUERY_SUBTREES,
  SCOPED_ENGINE_QUERY_SUBTREES,
  engineKeys,
  invalidateAfterVaultMutation,
  invalidateGitRecoveryReads,
  invalidateGraphGenerationReads,
  invalidateScopedSemanticReads,
  normalizeCreateDocArgs,
  normalizeGitQueryKeyPart,
  normalizeGraphEmbeddingsRequestIdentity,
  normalizeRenameDocArgs,
  normalizeSaveBodyArgs,
  normalizeSetFrontmatterArgs,
  refreshAfterAcceptedScopeSwitch,
  refreshAfterAcceptedWorkspaceSwitch,
  stableKey,
  useGraphEmbeddings,
} from "./index";
import {
  hasQuery,
  isInvalidated,
  seedQuery,
  testQueryClient,
  wrapper,
} from "./testFixtures";

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

describe("stableKey", () => {
  it("is order-insensitive for object keys and drops undefined", () => {
    expect(stableKey({ b: 1, a: 2 })).toBe(stableKey({ a: 2, b: 1 }));
    expect(stableKey({ a: 1, gone: undefined })).toBe(stableKey({ a: 1 }));
    expect(stableKey(undefined)).toBe("");
  });
});

describe("engineKeys", () => {
  it("keys graph slices by the (scope, filter, as-of, granularity, lens, focus, corpus) tuple", () => {
    const a = engineKeys.graph("wt-1", { tiers: { structural: false } }, 123);
    const b = engineKeys.graph("wt-1", { tiers: { structural: false } }, 123);
    const c = engineKeys.graph("wt-2", { tiers: { structural: false } }, 123);
    const d = engineKeys.graph("wt-1", { tiers: { structural: false } });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    // Defaults (key tail is [..., asOf, granularity, lens, focus, corpus]): as-of
    // "live", granularity "document", lens "status", focus "none", corpus "vault".
    expect(d[d.length - 5]).toBe("live");
    expect(d[d.length - 4]).toBe("document");
    expect(d[d.length - 3]).toBe("status");
    expect(d[d.length - 2]).toBe("none");
    expect(d[d.length - 1]).toBe("vault");
    // Granularity is part of the cache identity: the constellation (feature)
    // and a document slice never collide in cache.
    const feature = engineKeys.graph("wt-1", undefined, undefined, "feature");
    const document = engineKeys.graph("wt-1", undefined, undefined, "document");
    expect(feature).not.toEqual(document);
    expect(feature[feature.length - 4]).toBe("feature");
    // Lens and focus are part of the cache identity (graph-node-salience): two
    // lenses or two focuses never collide in cache.
    const statusLens = engineKeys.graph(
      "wt-1",
      undefined,
      undefined,
      "document",
      "status",
    );
    const designLens = engineKeys.graph(
      "wt-1",
      undefined,
      undefined,
      "document",
      "design",
    );
    expect(statusLens).not.toEqual(designLens);
    // With focus + corpus appended as the key tail, the lens sits at length-3.
    expect(designLens[designLens.length - 3]).toBe("design");
    // The corpus is part of the cache identity (codebase-graphing ADR D7): the
    // vault and code corpora are disconnected datasets that never share a cache
    // entry, so a corpus switch is a refetch that reloads the canvas.
    const vaultCorpus = engineKeys.graph(
      "wt-1",
      undefined,
      undefined,
      "document",
      "status",
      null,
      "vault",
    );
    const codeCorpus = engineKeys.graph(
      "wt-1",
      undefined,
      undefined,
      "document",
      "status",
      null,
      "code",
    );
    expect(vaultCorpus).not.toEqual(codeCorpus);
    expect(codeCorpus[codeCorpus.length - 1]).toBe("code");
  });

  it("keys graph diffs by scope, window, and filter", () => {
    const all = engineKeys.diff("wt-1", 1_000, 2_000);
    const filtered = engineKeys.diff(
      "wt-1",
      1_000,
      2_000,
      JSON.stringify({ tiers: { semantic: false } }),
    );
    const sameNumericWindow = engineKeys.diff("wt-1", "1000", "2000");
    expect(all).not.toEqual(filtered);
    expect(all).toEqual(sameNumericWindow);
  });

  it("keys search by scope so same text cannot cross worktrees", () => {
    expect(engineKeys.search("wt-1", "alpha", "vault")).not.toEqual(
      engineKeys.search("wt-2", "alpha", "vault"),
    );
    expect(engineKeys.search("wt-1", "alpha", "vault")).not.toEqual(
      engineKeys.search("wt-1", "alpha", "code"),
    );
  });

  it("keys node-family reads by scope and node parameters", () => {
    expect(engineKeys.node("wt-1", "doc:plan")).not.toEqual(
      engineKeys.node("wt-2", "doc:plan"),
    );
    expect(engineKeys.neighbors("wt-1", "doc:plan", 1)).not.toEqual(
      engineKeys.neighbors("wt-1", "doc:plan", 2),
    );
    expect(engineKeys.evidence("wt-1", "doc:plan")).not.toEqual(
      engineKeys.evidence("wt-2", "doc:plan"),
    );
    expect(engineKeys.planInterior("wt-1", "doc:plan")).not.toEqual(
      engineKeys.planInterior("wt-2", "doc:plan"),
    );
  });

  it("keys historical git diffs by scope, path, and both revisions", () => {
    const base = engineKeys.gitHistoricalDiff(
      "wt-1",
      ".vault/plan.md",
      "HEAD~1",
      "HEAD",
    );

    expect(base).not.toEqual(
      engineKeys.gitHistoricalDiff("wt-2", ".vault/plan.md", "HEAD~1", "HEAD"),
    );
    expect(base).not.toEqual(
      engineKeys.gitHistoricalDiff("wt-1", ".vault/adr.md", "HEAD~1", "HEAD"),
    );
    expect(base).not.toEqual(
      engineKeys.gitHistoricalDiff("wt-1", ".vault/plan.md", "HEAD~2", "HEAD"),
    );
    expect(base).not.toEqual(
      engineKeys.gitHistoricalDiff("wt-1", ".vault/plan.md", "HEAD~1", "main"),
    );
  });

  it("enrolls every scoped query family in the workspace-swap scoped-cache boundary", () => {
    const scopedKeys = [
      engineKeys.vaultTree("wt-1"),
      engineKeys.codeFiles("wt-1"),
      engineKeys.fileTree("wt-1", ".vault", undefined),
      engineKeys.filters("wt-1"),
      engineKeys.dashboardState("wt-1", "session-a"),
      engineKeys.graph("wt-1", undefined, undefined, "document", "status", null),
      engineKeys.graphEmbeddings("wt-1", "status", null),
      engineKeys.node("wt-1", "doc:plan"),
      engineKeys.content("wt-1", "doc:plan"),
      engineKeys.neighbors("wt-1", "doc:plan", 1),
      engineKeys.evidence("wt-1", "doc:plan"),
      engineKeys.events("wt-1", {}),
      engineKeys.history("wt-1", 20),
      engineKeys.prs("wt-1", "open"),
      engineKeys.issues("wt-1", "open"),
      engineKeys.stream(["graph"], 42, "wt-1"),
      engineKeys.diff("wt-1", 1_000, 2_000),
      engineKeys.lineage("wt-1", {}),
      engineKeys.pipeline("wt-1"),
      engineKeys.planInterior("wt-1", "doc:plan"),
      engineKeys.search("wt-1", "alpha", "vault"),
      engineKeys.gitChanges("wt-1"),
      engineKeys.gitChangesSummary("wt-1"),
      engineKeys.gitDiff("wt-1", ".vault/plan.md"),
      engineKeys.gitHistoricalDiff("wt-1", ".vault/plan.md", "HEAD~1", "HEAD"),
      ["engine", "ops-rag", "service-state", "wt-1"] as const,
      ["engine", "ops-rag", "watcher", "wt-1"] as const,
      ["engine", "ops-rag", "readiness", "wt-1"] as const,
      ["engine", "ops-rag", "projects", "wt-1"] as const,
      ["engine", "ops-rag", "jobs", "wt-1", "job-1"] as const,
    ];
    const scopedFamilies = new Set(scopedKeys.map((key) => String(key[1])));
    expect(new Set(SCOPED_ENGINE_QUERY_SUBTREES)).toEqual(scopedFamilies);
  });

  it("enrolls every graph-generation read family in the generation-refresh boundary", () => {
    const graphGenerationKeys = [
      engineKeys.vaultTree("wt-1"),
      engineKeys.codeFiles("wt-1"),
      engineKeys.content("wt-1", "doc:plan"),
      engineKeys.fileTree("wt-1", ".vault", undefined),
      engineKeys.filters("wt-1"),
      engineKeys.dashboardState("wt-1", "session-a"),
      engineKeys.graph("wt-1", undefined, undefined, "document", "status", null),
      engineKeys.graphEmbeddings("wt-1", "status", null),
      engineKeys.node("wt-1", "doc:plan"),
      engineKeys.neighbors("wt-1", "doc:plan", 1),
      engineKeys.evidence("wt-1", "doc:plan"),
      engineKeys.events("wt-1", {}),
      engineKeys.diff("wt-1", 1_000, 2_000),
      engineKeys.lineage("wt-1", {}),
      engineKeys.stream(["graph"], 42, "wt-1"),
      engineKeys.history("wt-1", 20),
      engineKeys.pipeline("wt-1"),
      engineKeys.planInterior("wt-1", "doc:plan"),
      engineKeys.search("wt-1", "alpha", "vault"),
    ];
    const graphGenerationFamilies = new Set(
      graphGenerationKeys.map((key) => String(key[1])),
    );

    expect(new Set(GRAPH_GENERATION_QUERY_SUBTREES)).toEqual(graphGenerationFamilies);
  });

  it("normalizes graph embedding query identity before keying semantic vectors", () => {
    expect(
      normalizeGraphEmbeddingsRequestIdentity(" wt-1 ", "design", " doc:plan "),
    ).toEqual({
      scope: "wt-1",
      lens: "design",
      focus: "doc:plan",
    });
    expect(
      normalizeGraphEmbeddingsRequestIdentity({ scope: "wt-1" }, "unknown", {
        id: "doc:plan",
      }),
    ).toEqual({
      scope: null,
      lens: "status",
      focus: null,
    });
  });

  it("does not expose cached semantic embeddings for malformed runtime scope", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.graphEmbeddings("wt-1", "status", null), {
      embeddings: [{ node_id: "doc:cached", vector: [0.1, 0.2] }],
      generation: 7,
      tiers: { semantic: { available: true } },
      truncated: null,
      lens: "status",
    });

    const { result } = renderHook(
      () => useGraphEmbeddings({ scope: "wt-1" }, true, "status", null),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toMatchObject({
      loading: false,
      unavailable: false,
      available: false,
      embeddingCount: 0,
      generation: 0,
    });
    expect(result.current.embeddings.size).toBe(0);
    client.clear();
  });

  it("refreshes every scoped read family after an accepted active-scope switch", () => {
    const client = testQueryClient();
    const scopedKeys = [
      engineKeys.vaultTree("wt-1"),
      engineKeys.fileTree("wt-1", ".vault", undefined),
      engineKeys.filters("wt-1"),
      engineKeys.dashboardState("wt-1", "session-a"),
      engineKeys.graph("wt-1", undefined, undefined, "document", "status", null),
      engineKeys.graphEmbeddings("wt-1", "status", null),
      engineKeys.node("wt-1", "doc:plan"),
      engineKeys.content("wt-1", "doc:plan"),
      engineKeys.neighbors("wt-1", "doc:plan", 1),
      engineKeys.evidence("wt-1", "doc:plan"),
      engineKeys.events("wt-1", {}),
      engineKeys.history("wt-1", 20),
      engineKeys.prs("wt-1", "open"),
      engineKeys.issues("wt-1", "open"),
      engineKeys.stream(["graph"], 42, "wt-1"),
      engineKeys.diff("wt-1", 1_000, 2_000),
      engineKeys.lineage("wt-1", {}),
      engineKeys.pipeline("wt-1"),
      engineKeys.planInterior("wt-1", "doc:plan"),
      engineKeys.search("wt-1", "alpha", "vault"),
      engineKeys.gitChanges("wt-1"),
      engineKeys.gitDiff("wt-1", ".vault/plan.md"),
      engineKeys.gitHistoricalDiff("wt-1", ".vault/plan.md", "HEAD~1", "HEAD"),
      ["engine", "ops-rag", "service-state", "wt-1"] as const,
      ["engine", "ops-rag", "watcher", "wt-1"] as const,
      ["engine", "ops-rag", "readiness", "wt-1"] as const,
      ["engine", "ops-rag", "projects", "wt-1"] as const,
      ["engine", "ops-rag", "jobs", "wt-1", "job-1"] as const,
    ];
    const globalKeys = [engineKeys.map(), engineKeys.status()];
    const sessionKeys = [engineKeys.session(), engineKeys.workspaces()];

    for (const key of [...scopedKeys, ...globalKeys, ...sessionKeys]) {
      seedQuery(client, key);
    }

    refreshAfterAcceptedScopeSwitch(client);

    for (const key of [...scopedKeys, ...globalKeys]) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of sessionKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });

  it("removes stale scoped reads after an accepted workspace switch", () => {
    const client = testQueryClient();
    const scopedKeys = [
      engineKeys.vaultTree("wt-1"),
      engineKeys.fileTree("wt-1", ".vault", undefined),
      engineKeys.filters("wt-1"),
      engineKeys.dashboardState("wt-1", "session-a"),
      engineKeys.graph("wt-1", undefined, undefined, "document", "status", null),
      engineKeys.graphEmbeddings("wt-1", "status", null),
      engineKeys.node("wt-1", "doc:plan"),
      engineKeys.content("wt-1", "doc:plan"),
      engineKeys.neighbors("wt-1", "doc:plan", 1),
      engineKeys.evidence("wt-1", "doc:plan"),
      engineKeys.events("wt-1", {}),
      engineKeys.history("wt-1", 20),
      engineKeys.prs("wt-1", "open"),
      engineKeys.issues("wt-1", "open"),
      engineKeys.stream(["graph"], 42, "wt-1"),
      engineKeys.diff("wt-1", 1_000, 2_000),
      engineKeys.lineage("wt-1", {}),
      engineKeys.pipeline("wt-1"),
      engineKeys.planInterior("wt-1", "doc:plan"),
      engineKeys.search("wt-1", "alpha", "vault"),
      engineKeys.gitChanges("wt-1"),
      engineKeys.gitDiff("wt-1", ".vault/plan.md"),
      engineKeys.gitHistoricalDiff("wt-1", ".vault/plan.md", "HEAD~1", "HEAD"),
      ["engine", "ops-rag", "service-state", "wt-1"] as const,
      ["engine", "ops-rag", "watcher", "wt-1"] as const,
      ["engine", "ops-rag", "readiness", "wt-1"] as const,
      ["engine", "ops-rag", "projects", "wt-1"] as const,
      ["engine", "ops-rag", "jobs", "wt-1", "job-1"] as const,
    ];
    const removedGlobalKeys = [engineKeys.map()];
    const refreshedGlobalKeys = [engineKeys.workspaces(), engineKeys.status()];

    for (const key of [...scopedKeys, ...removedGlobalKeys, ...refreshedGlobalKeys]) {
      seedQuery(client, key);
    }

    refreshAfterAcceptedWorkspaceSwitch(client);

    for (const key of [...scopedKeys, ...removedGlobalKeys]) {
      expect(hasQuery(client, key), JSON.stringify(key)).toBe(false);
    }
    for (const key of refreshedGlobalKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true);
    }
  });

  it("invalidates every central read surface after a vault mutation", () => {
    const client = testQueryClient();
    const scope = "wt-1";
    const otherScope = "wt-2";
    const nodeId = "doc:plan";
    const affectedKeys = [
      engineKeys.status(),
      engineKeys.map(),
      engineKeys.content(scope, nodeId),
      engineKeys.vaultTree(scope),
      engineKeys.codeFiles(scope),
      engineKeys.filters(scope),
      engineKeys.dashboardState(scope, "session-a"),
      engineKeys.graph(scope, undefined, undefined, "document", "status", null),
      engineKeys.graphEmbeddings(scope, "status", null),
      engineKeys.fileTree(scope, ".vault", undefined),
      engineKeys.gitChanges(scope),
      engineKeys.gitDiff(scope, ".vault/plan.md"),
      engineKeys.gitHistoricalDiff(scope, ".vault/plan.md", "HEAD~1", "HEAD"),
      engineKeys.node(scope, nodeId),
      engineKeys.neighbors(scope, nodeId, 1),
      engineKeys.evidence(scope, nodeId),
      engineKeys.events(scope, { from: "2026-01-01", to: "2026-01-31" }),
      engineKeys.diff(scope, 1_000, 2_000),
      engineKeys.lineage(scope, {}),
      engineKeys.stream(["backends"], undefined, scope),
      engineKeys.history(scope, 20),
      engineKeys.pipeline(scope),
      engineKeys.planInterior(scope, nodeId),
      engineKeys.search(scope, "alpha", "vault"),
    ];
    const unaffectedKeys = [
      engineKeys.content(otherScope, nodeId),
      engineKeys.vaultTree(otherScope),
      engineKeys.dashboardState(otherScope, "session-a"),
      engineKeys.graph(otherScope, undefined, undefined, "document", "status", null),
      engineKeys.gitChanges(otherScope),
      engineKeys.gitHistoricalDiff(otherScope, ".vault/plan.md", "HEAD~1", "HEAD"),
      engineKeys.events(otherScope, { from: "2026-01-01", to: "2026-01-31" }),
      engineKeys.diff(otherScope, 1_000, 2_000),
      engineKeys.lineage(otherScope, {}),
      engineKeys.stream(["backends"], undefined, otherScope),
      engineKeys.history(otherScope, 20),
      engineKeys.search(otherScope, "alpha", "vault"),
    ];

    for (const key of affectedKeys) seedQuery(client, key);
    for (const key of unaffectedKeys) seedQuery(client, key);

    invalidateAfterVaultMutation(client, scope, nodeId);

    for (const key of affectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });

  it("normalizes git query key parts before cache identity construction", () => {
    expect(normalizeGitQueryKeyPart(" wt-1 ")).toBe("wt-1");
    expect(normalizeGitQueryKeyPart(null)).toBe("");
    expect(engineKeys.gitChanges(" wt-1 ")).toEqual(engineKeys.gitChanges("wt-1"));
    expect(engineKeys.gitDiff(" wt-1 ", " .vault/plan.md ")).toEqual(
      engineKeys.gitDiff("wt-1", ".vault/plan.md"),
    );
    expect(
      engineKeys.gitHistoricalDiff(" wt-1 ", " .vault/plan.md ", " HEAD~1 ", " HEAD "),
    ).toEqual(engineKeys.gitHistoricalDiff("wt-1", ".vault/plan.md", "HEAD~1", "HEAD"));
  });

  it("normalizes vault mutation invalidation scope and node identity", () => {
    const client = testQueryClient();
    const affectedKeys = [
      engineKeys.content("wt-1", "doc:plan"),
      engineKeys.gitChanges("wt-1"),
      engineKeys.gitDiff("wt-1", ".vault/plan.md"),
      engineKeys.gitHistoricalDiff("wt-1", ".vault/plan.md", "HEAD~1", "HEAD"),
      engineKeys.history("wt-1", 20),
    ];
    const unaffectedKeys = [
      engineKeys.content(" wt-1 ", " doc:plan "),
      engineKeys.gitChanges("wt-2"),
      engineKeys.gitDiff("wt-2", ".vault/plan.md"),
    ];

    for (const key of affectedKeys) seedQuery(client, key);
    for (const key of unaffectedKeys) seedQuery(client, key);

    invalidateAfterVaultMutation(client, " wt-1 ", " doc:plan ");

    for (const key of affectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });

  it("invalidates scoped generation reads after a vault mutation without a node id", () => {
    const client = testQueryClient();
    const scope = "wt-create";
    const otherScope = "wt-other";
    const nodeId = "doc:new-plan";
    const affectedKeys = [
      engineKeys.status(),
      engineKeys.map(),
      engineKeys.content(scope, nodeId),
      engineKeys.vaultTree(scope),
      engineKeys.fileTree(scope, ".vault", undefined),
      engineKeys.graph(scope, undefined, undefined, "document", "status", null),
      engineKeys.history(scope, 20),
      engineKeys.search(scope, "new", "vault"),
      engineKeys.gitChanges(scope),
      engineKeys.gitDiff(scope, ".vault/plan/new-plan.md"),
      engineKeys.gitHistoricalDiff(scope, ".vault/plan/new-plan.md", "HEAD~1", "HEAD"),
    ];
    const unaffectedKeys = [
      engineKeys.content(otherScope, nodeId),
      engineKeys.history(otherScope, 20),
      engineKeys.gitChanges(otherScope),
      engineKeys.gitDiff(otherScope, ".vault/plan/new-plan.md"),
      engineKeys.gitHistoricalDiff(
        otherScope,
        ".vault/plan/new-plan.md",
        "HEAD~1",
        "HEAD",
      ),
      engineKeys.search(otherScope, "new", "vault"),
    ];

    for (const key of affectedKeys) seedQuery(client, key);
    for (const key of unaffectedKeys) seedQuery(client, key);

    invalidateAfterVaultMutation(client, scope);

    for (const key of affectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });

  it("falls back to global search invalidation when a vault mutation has no scope", () => {
    const client = testQueryClient();
    const affectedKeys = [
      engineKeys.status(),
      engineKeys.map(),
      engineKeys.search("wt-1", "alpha", "vault"),
      engineKeys.search("wt-2", "alpha", "vault"),
    ];
    const unaffectedKeys = [
      engineKeys.graph("wt-1", undefined, undefined, "document", "status", null),
      engineKeys.gitChanges("wt-1"),
      engineKeys.vaultTree("wt-1"),
    ];

    for (const key of affectedKeys) seedQuery(client, key);
    for (const key of unaffectedKeys) seedQuery(client, key);

    invalidateAfterVaultMutation(client, null);

    for (const key of affectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });

  it("normalizes editor body write intent before ops dispatch", () => {
    expect(
      normalizeSaveBodyArgs({
        nodeId: " doc:2026-06-18-plan ",
        scope: " wt-1 ",
        text: 42,
        baseBlobHash: null,
      }),
    ).toEqual({
      scope: "wt-1",
      nodeId: "doc:2026-06-18-plan",
      ref: "2026-06-18-plan",
      text: "",
      baseBlobHash: "",
    });
    expect(normalizeSaveBodyArgs({ nodeId: { id: "doc:bad" } })).toMatchObject({
      scope: null,
      nodeId: null,
      ref: null,
    });
  });

  it("normalizes frontmatter write intent before ops dispatch", () => {
    expect(
      normalizeSetFrontmatterArgs({
        nodeId: " doc:alpha ",
        scope: " wt-1 ",
        date: " 2026-06-20 ",
        tags: [" #plan ", "", 42, "#state"],
        related: [" [[a]] ", null, " [[b]] "],
        baseBlobHash: " hash-a ",
      }),
    ).toEqual({
      scope: "wt-1",
      nodeId: "doc:alpha",
      ref: "alpha",
      date: "2026-06-20",
      tags: ["#plan", "#state"],
      related: ["[[a]]", "[[b]]"],
      baseBlobHash: " hash-a ",
    });
  });

  it("normalizes create and rename write intent before ops dispatch", () => {
    expect(
      normalizeCreateDocArgs({
        scope: " wt-1 ",
        docType: " plan ",
        feature: " git-state ",
        title: " Boundary Audit ",
        related: [" alpha ", "", { stem: "bad" }],
      }),
    ).toEqual({
      scope: "wt-1",
      docType: "plan",
      feature: "git-state",
      title: "Boundary Audit",
      related: ["alpha"],
    });

    expect(
      normalizeRenameDocArgs({
        scope: " wt-1 ",
        nodeId: " doc:old-plan ",
        to: " new-plan ",
        expectedBlobHash: " hash-1 ",
      }),
    ).toEqual({
      scope: "wt-1",
      nodeId: "doc:old-plan",
      ref: "old-plan",
      to: "new-plan",
      expectedBlobHash: "hash-1",
    });
    expect(normalizeRenameDocArgs(null)).toEqual({
      scope: null,
      nodeId: null,
      ref: null,
      to: "",
      expectedBlobHash: undefined,
    });
  });

  it("invalidates status, history, and per-file git projections after a git recovery signal", () => {
    const client = testQueryClient();
    const affectedKeys = [
      engineKeys.status(),
      engineKeys.gitChanges("wt-1"),
      engineKeys.gitChanges("wt-2"),
      engineKeys.gitDiff("wt-1", ".vault/plan.md"),
      engineKeys.gitDiff("wt-2", "src/app.ts"),
      engineKeys.gitHistoricalDiff("wt-1", ".vault/plan.md", "HEAD~1", "HEAD"),
      engineKeys.gitHistoricalDiff("wt-2", "src/app.ts", "abc", "def"),
      engineKeys.history("wt-1", 20),
      engineKeys.history("wt-2", 50),
    ];
    const unaffectedKeys = [
      engineKeys.map(),
      engineKeys.vaultTree("wt-1"),
      engineKeys.graph("wt-1", undefined, undefined, "document", "status", null),
      engineKeys.search("wt-1", "alpha", "vault"),
    ];

    for (const key of affectedKeys) seedQuery(client, key);
    for (const key of unaffectedKeys) seedQuery(client, key);

    invalidateGitRecoveryReads(client);

    for (const key of affectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });

  it("invalidates scoped semantic consumers from one helper", () => {
    const client = testQueryClient();
    const scope = "wt-1";
    const otherScope = "wt-2";
    const affectedKeys = [
      engineKeys.search(scope, "alpha", "vault"),
      engineKeys.search(scope, "beta", "code"),
      engineKeys.graphEmbeddings(scope, "status", null),
      engineKeys.graphEmbeddings(scope, "design", "doc:focus"),
    ];
    const unaffectedKeys = [
      engineKeys.status(),
      engineKeys.search(otherScope, "alpha", "vault"),
      engineKeys.graphEmbeddings(otherScope, "status", null),
      engineKeys.graph(scope, undefined, undefined, "document", "status", null),
    ];

    for (const key of affectedKeys) seedQuery(client, key);
    for (const key of unaffectedKeys) seedQuery(client, key);

    invalidateScopedSemanticReads(client, " wt-1 ");

    for (const key of affectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });

  it("invalidates graph-generation projections after a graph stream recovery", () => {
    const client = testQueryClient();
    const scope = "wt-1";
    const otherScope = "wt-2";
    const nodeId = "doc:plan";
    const affectedKeys = [
      engineKeys.vaultTree(scope),
      engineKeys.content(scope, nodeId),
      engineKeys.fileTree(scope, ".vault", undefined),
      engineKeys.filters(scope),
      engineKeys.dashboardState(scope, "session-a"),
      engineKeys.graph(scope, undefined, undefined, "document", "status", null),
      engineKeys.graphEmbeddings(scope, "status", null),
      engineKeys.node(scope, nodeId),
      engineKeys.neighbors(scope, nodeId, 1),
      engineKeys.evidence(scope, nodeId),
      engineKeys.events(scope, { from: "2026-01-01", to: "2026-01-31" }),
      engineKeys.diff(scope, 1_000, 2_000),
      engineKeys.lineage(scope, {}),
      engineKeys.stream(["graph"], 42, scope),
      engineKeys.history(scope, 20),
      engineKeys.pipeline(scope),
      engineKeys.planInterior(scope, nodeId),
      engineKeys.search(scope, "alpha", "vault"),
    ];
    const unaffectedKeys = [
      engineKeys.status(),
      engineKeys.map(),
      engineKeys.gitChanges(scope),
      engineKeys.gitDiff(scope, ".vault/plan.md"),
      engineKeys.vaultTree(otherScope),
      engineKeys.filters(otherScope),
      engineKeys.dashboardState(otherScope, "session-a"),
      engineKeys.graph(otherScope, undefined, undefined, "document", "status", null),
      engineKeys.graphEmbeddings(otherScope, "status", null),
      engineKeys.stream(["graph"], 42, otherScope),
      engineKeys.search(otherScope, "alpha", "vault"),
    ];

    for (const key of affectedKeys) seedQuery(client, key);
    for (const key of unaffectedKeys) seedQuery(client, key);

    invalidateGraphGenerationReads(client, scope);

    for (const key of affectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });
});
