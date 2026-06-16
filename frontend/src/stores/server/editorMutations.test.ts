// @vitest-environment happy-dom
//
// Document write/create mutations + the bounded editor state slice (document-editor
// backend, W03). Everything runs through the SAME client transport the live app
// uses — the mock engine's `fetchImpl` installed on the app-wide client — so a
// passing test exercises the real dispatch → engine-client → adapter path, NOT a
// hand-built double (mock-mirrors-live-wire-shape). The mutations are driven through
// the stores hooks over a QueryClient, never a fetch in a component
// (dashboard-layer-ownership). The mock MUTATES + RE-HASHES its corpus on a write,
// so the stale-base conflict round-trip is exercised against real wire behavior.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { MOCK_SCOPE, MockEngine } from "../../testing/mockEngine";
import { useViewStore } from "../view/viewStore";
import { EngineClient } from "./engine";
import {
  deriveDocType,
  deriveLinkResolution,
  deriveReadTime,
  stemFromNodeId,
  useCreateDoc,
  useSaveBody,
  useSetFrontmatter,
} from "./queries";

// A known corpus document (feature `editor-demo`, fi=0 → `2026-01-05-...`).
const DOC_STEM = "2026-01-05-editor-demo-research";
const DOC_ID = `doc:${DOC_STEM}`;

function clientOf(mock: MockEngine): EngineClient {
  return new EngineClient({ baseUrl: "/api", fetchImpl: mock.fetchImpl });
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** Install the mock transport on the app-wide client the dispatch seam uses. */
async function installMock(mock: MockEngine): Promise<void> {
  const { engineClient } = await import("./engine");
  engineClient.useTransport(mock.fetchImpl);
}

afterEach(async () => {
  const { engineClient } = await import("./engine");
  engineClient.useTransport((input, init) => fetch(input, init));
  useViewStore.getState().closeEditor();
});

// --- stemFromNodeId -------------------------------------------------------------

describe("stemFromNodeId", () => {
  it("strips the doc: prefix to recover the write `ref`", () => {
    expect(stemFromNodeId(DOC_ID)).toBe(DOC_STEM);
  });
  it("passes a bare stem through unchanged", () => {
    expect(stemFromNodeId(DOC_STEM)).toBe(DOC_STEM);
  });
});

// --- the three mutations over the mock transport --------------------------------

describe("useSaveBody (set-body, mock transport)", () => {
  it("saves a body and returns a typed `saved` result with the new blob hash", async () => {
    const mock = new MockEngine();
    await installMock(mock);
    const client = clientOf(mock);
    // Read the current blob to use as the optimistic-concurrency base.
    const before = await client.content(DOC_ID, MOCK_SCOPE);

    const qc = testQueryClient();
    const { result } = renderHook(() => useSaveBody(), { wrapper: wrapper(qc) });

    const out = await result.current.mutateAsync({
      nodeId: DOC_ID,
      scope: MOCK_SCOPE,
      text: "# Rewritten body\n\nnew content",
      baseBlobHash: before.blob_hash,
    });
    expect(out.result.kind).toBe("saved");
    if (out.result.kind === "saved") {
      // The mock re-hashes the mutated corpus, so the saved blob differs.
      expect(out.result.blobHash).not.toBe(before.blob_hash);
    }
  });

  it("a stale base blob hash yields a typed `conflict` result (200, not a throw)", async () => {
    const mock = new MockEngine();
    await installMock(mock);
    const qc = testQueryClient();
    const { result } = renderHook(() => useSaveBody(), { wrapper: wrapper(qc) });

    // A baseline read would give the real hash; pass a deliberately stale one.
    const out = await result.current.mutateAsync({
      nodeId: DOC_ID,
      scope: MOCK_SCOPE,
      text: "anything",
      baseBlobHash: "0000000000000000000000000000000000000000",
    });
    expect(out.result.kind).toBe("conflict");
    if (out.result.kind === "conflict") {
      expect(out.result.expected).toBe("0000000000000000000000000000000000000000");
      // The actual on-disk hash is reported so the editor can reconcile.
      expect(out.result.actual).not.toBe(out.result.expected);
    }
  });
});

describe("useSetFrontmatter (mock transport)", () => {
  it("a dangling related stem yields a typed `refused` result with checks + errors", async () => {
    const mock = new MockEngine();
    await installMock(mock);
    const client = clientOf(mock);
    const before = await client.content(DOC_ID, MOCK_SCOPE);

    const qc = testQueryClient();
    const { result } = renderHook(() => useSetFrontmatter(), {
      wrapper: wrapper(qc),
    });
    const out = await result.current.mutateAsync({
      nodeId: DOC_ID,
      scope: MOCK_SCOPE,
      related: ["this-stem-does-not-exist"],
      baseBlobHash: before.blob_hash,
    });
    expect(out.result.kind).toBe("refused");
    if (out.result.kind === "refused") {
      expect(out.result.checks.length).toBeGreaterThan(0);
      expect(out.result.errors[0]).toContain("resolves to no document");
    }
  });

  it("a valid frontmatter set succeeds with a typed `saved` result", async () => {
    const mock = new MockEngine();
    await installMock(mock);
    const client = clientOf(mock);
    const before = await client.content(DOC_ID, MOCK_SCOPE);

    const qc = testQueryClient();
    const { result } = renderHook(() => useSetFrontmatter(), {
      wrapper: wrapper(qc),
    });
    const out = await result.current.mutateAsync({
      nodeId: DOC_ID,
      scope: MOCK_SCOPE,
      tags: ["editor-demo"],
      date: "2026-06-16",
      baseBlobHash: before.blob_hash,
    });
    expect(out.result.kind).toBe("saved");
  });
});

describe("useCreateDoc (mock transport)", () => {
  it("creates a document and returns the new doc:<stem> id", async () => {
    const mock = new MockEngine();
    await installMock(mock);
    const qc = testQueryClient();
    const { result } = renderHook(() => useCreateDoc(), { wrapper: wrapper(qc) });

    const out = await result.current.mutateAsync({
      scope: MOCK_SCOPE,
      docType: "research",
      feature: "brand-new-feature",
      title: "A brand new doc",
    });
    expect(out.result.kind).toBe("created");
    expect(out.nodeId).toMatch(/^doc:/);
    if (out.result.kind === "created") {
      expect(out.nodeId).toBe(`doc:${out.result.stem}`);
    }
  });

  it("a create missing the feature yields a typed `refused` result, nodeId null", async () => {
    const mock = new MockEngine();
    await installMock(mock);
    const qc = testQueryClient();
    const { result } = renderHook(() => useCreateDoc(), { wrapper: wrapper(qc) });

    const out = await result.current.mutateAsync({
      scope: MOCK_SCOPE,
      docType: "research",
      feature: "",
    });
    expect(out.result.kind).toBe("refused");
    expect(out.nodeId).toBeNull();
  });
});

// --- the save → re-hash → stale-base conflict round-trip ------------------------

describe("save round-trip (corpus mutates + re-hashes against a stale base)", () => {
  it("a second save with the now-STALE original base conflicts", async () => {
    const mock = new MockEngine();
    await installMock(mock);
    const client = clientOf(mock);
    const qc = testQueryClient();
    const { result } = renderHook(() => useSaveBody(), { wrapper: wrapper(qc) });

    // First read + save: succeeds against the original blob.
    const v1 = await client.content(DOC_ID, MOCK_SCOPE);
    const first = await result.current.mutateAsync({
      nodeId: DOC_ID,
      scope: MOCK_SCOPE,
      text: "first edit",
      baseBlobHash: v1.blob_hash,
    });
    expect(first.result.kind).toBe("saved");

    // The corpus is now re-hashed: a fresh read returns the NEW blob.
    const v2 = await client.content(DOC_ID, MOCK_SCOPE);
    expect(v2.blob_hash).not.toBe(v1.blob_hash);
    expect(v2.text).toBe("first edit");

    // A second save still using the ORIGINAL (now stale) base must conflict.
    const second = await result.current.mutateAsync({
      nodeId: DOC_ID,
      scope: MOCK_SCOPE,
      text: "second edit",
      baseBlobHash: v1.blob_hash,
    });
    expect(second.result.kind).toBe("conflict");

    // A save against the FRESH base succeeds.
    const third = await result.current.mutateAsync({
      nodeId: DOC_ID,
      scope: MOCK_SCOPE,
      text: "third edit",
      baseBlobHash: v2.blob_hash,
    });
    expect(third.result.kind).toBe("saved");
  });
});

// --- the bounded editor-state slice transitions ---------------------------------

describe("editor-state slice (bounded, single-value)", () => {
  it("openEditor seeds the target/draft/base and begins idle", () => {
    useViewStore.getState().openEditor(DOC_ID, "initial body", "hash-1");
    const s = useViewStore.getState();
    expect(s.editorTarget).toEqual({ nodeId: DOC_ID });
    expect(s.draftText).toBe("initial body");
    expect(s.baseBlobHash).toBe("hash-1");
    expect(s.editorStatus).toBe("idle");
  });

  it("setDraft marks dirty; an identical write is a no-op (no churn)", () => {
    useViewStore.getState().openEditor(DOC_ID, "initial body", "hash-1");
    const before = useViewStore.getState();
    useViewStore.getState().setDraft("edited body");
    expect(useViewStore.getState().draftText).toBe("edited body");
    expect(useViewStore.getState().editorStatus).toBe("dirty");
    // An identical setDraft returns the same state object (short-circuit).
    const dirtyState = useViewStore.getState();
    useViewStore.getState().setDraft("edited body");
    expect(useViewStore.getState()).toBe(dirtyState);
    expect(before.editorStatus).toBe("idle");
  });

  it("markSaving → markSaved adopts the new blob as the next concurrency base", () => {
    useViewStore.getState().openEditor(DOC_ID, "body", "hash-1");
    useViewStore.getState().setDraft("changed");
    useViewStore.getState().markSaving();
    expect(useViewStore.getState().editorStatus).toBe("saving");
    useViewStore.getState().markSaved("hash-2");
    expect(useViewStore.getState().editorStatus).toBe("saved");
    // The fresh blob is adopted so a follow-on edit does not phantom-conflict.
    expect(useViewStore.getState().baseBlobHash).toBe("hash-2");
  });

  it("markConflict / markFailed set the status and retain the draft", () => {
    useViewStore.getState().openEditor(DOC_ID, "body", "hash-1");
    useViewStore.getState().setDraft("unsaved work");
    useViewStore.getState().markConflict();
    expect(useViewStore.getState().editorStatus).toBe("conflict");
    expect(useViewStore.getState().draftText).toBe("unsaved work");
    useViewStore.getState().markFailed();
    expect(useViewStore.getState().editorStatus).toBe("save-failed");
    expect(useViewStore.getState().draftText).toBe("unsaved work");
  });

  it("closeEditor clears the whole slice back to idle", () => {
    useViewStore.getState().openEditor(DOC_ID, "body", "hash-1");
    useViewStore.getState().setDraft("changed");
    useViewStore.getState().closeEditor();
    const s = useViewStore.getState();
    expect(s.editorTarget).toBeNull();
    expect(s.draftText).toBe("");
    expect(s.baseBlobHash).toBe("");
    expect(s.editorStatus).toBe("idle");
  });

  it("a scope swap clears the open editor (corpus isolation)", () => {
    useViewStore.getState().openEditor(DOC_ID, "body", "hash-1");
    useViewStore.getState().setDraft("unsaved");
    useViewStore.getState().setScope("wt-other");
    const s = useViewStore.getState();
    expect(s.editorTarget).toBeNull();
    expect(s.draftText).toBe("");
    expect(s.baseBlobHash).toBe("");
    expect(s.editorStatus).toBe("idle");
    // Restore for other suites.
    useViewStore.getState().setScope(null);
  });
});

// --- read-side derivations (pure) -----------------------------------------------

describe("deriveDocType / deriveReadTime / deriveLinkResolution", () => {
  it("deriveDocType reads doc_type from the graph node payload", () => {
    const nodes = [
      { id: DOC_ID, kind: "research", doc_type: "research" },
      { id: "doc:other", kind: "adr", doc_type: "adr" },
    ];
    expect(deriveDocType(DOC_ID, nodes)).toBe("research");
    expect(deriveDocType("doc:absent", nodes)).toBeNull();
    expect(deriveDocType(null, nodes)).toBeNull();
  });

  it("deriveReadTime estimates from word count, honest floor when truncated", () => {
    const text = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
    const full = deriveReadTime(text, null);
    expect(full.words).toBe(400);
    // 400 words / 200 wpm = 2 minutes, exact (not a floor).
    expect(full.minutes).toBe(2);
    expect(full.atLeast).toBe(false);
    const truncated = deriveReadTime(text, {
      total_bytes: 99999,
      returned_bytes: text.length,
      reason: "byte cap",
    });
    // A truncated body makes the estimate an honest floor.
    expect(truncated.atLeast).toBe(true);
    // An empty body is zero minutes (no fabricated "1 min").
    expect(deriveReadTime("   ", null).minutes).toBe(0);
  });

  it("deriveLinkResolution joins frontmatter related stems to outbound structural edge state", () => {
    const text = [
      "---",
      "related:",
      "  - '[[doc-a]]'",
      "  - '[[doc-b]]'",
      "  - '[[doc-missing]]'",
      "---",
      "",
      "body",
    ].join("\n");
    const edges = [
      {
        id: "e1",
        src: DOC_ID,
        dst: "doc:doc-a",
        relation: "references",
        tier: "structural" as const,
        confidence: 1,
        state: "resolved" as const,
      },
      {
        id: "e2",
        src: DOC_ID,
        dst: "doc:doc-b",
        relation: "references",
        tier: "structural" as const,
        confidence: 1,
        state: "broken" as const,
      },
    ];
    const resolved = deriveLinkResolution(DOC_ID, text, edges);
    expect(resolved).toHaveLength(3);
    expect(resolved.find((r) => r.stem === "doc-a")?.state).toBe("resolved");
    expect(resolved.find((r) => r.stem === "doc-b")?.state).toBe("broken");
    // A related stem with no outbound structural edge is honestly `absent`.
    expect(resolved.find((r) => r.stem === "doc-missing")?.state).toBe("absent");
    expect(resolved.find((r) => r.stem === "doc-a")?.nodeId).toBe("doc:doc-a");
  });

  it("deriveLinkResolution is empty for a null node or a no-frontmatter body", () => {
    expect(deriveLinkResolution(null, "anything", [])).toEqual([]);
    expect(deriveLinkResolution(DOC_ID, "no frontmatter here", [])).toEqual([]);
  });
});
