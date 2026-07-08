// @vitest-environment happy-dom

// Provider-host vectors (search-providers ADR D1/D2). The merge/dedupe/band/epoch
// collapse is tested PURE over synthetic provider results (no render needed); one
// live case renders `useSearchProviders` against the REAL engine to prove the host
// wires to the three providers end to end (no mocks — wire-contract).

import { createElement, type ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SearchResult } from "./engine";
import { engineClient } from "./engine";
import { liveScope, liveTransport } from "../../testing/liveClient";
import { ENGINE_WAIT } from "../../testing/timing";
import {
  literalBand,
  mergeSearchProviders,
  toProviderEntry,
  useSearchProviders,
  type SearchBand,
  type SearchProviderEntry,
  type SearchProviderResult,
  type SearchProviderState,
} from "./searchProviders";

function result(nodeId: string | null, score: number, source = "vault"): SearchResult {
  return { score, source, node_id: nodeId };
}

function entry(
  nodeId: string | null,
  score: number,
  band: SearchBand,
): SearchProviderEntry {
  return toProviderEntry(result(nodeId, score), band);
}

function provider(
  id: string,
  state: SearchProviderState,
  entries: SearchProviderEntry[],
  extra: Partial<
    Pick<SearchProviderResult, "semanticEpoch" | "retry" | "incomplete">
  > = {},
): SearchProviderResult {
  return { id, state, entries, ...extra };
}

describe("literalBand (ADR D2 two-tier split)", () => {
  it("classifies at or above the strong floor as strong, else weak", () => {
    expect(literalBand(0.95)).toBe("strong-literal");
    expect(literalBand(0.7)).toBe("strong-literal");
    expect(literalBand(0.69)).toBe("weak-literal");
    expect(literalBand(0.2)).toBe("weak-literal");
  });
});

describe("mergeSearchProviders (pure merge/dedupe/band/epoch)", () => {
  it("interleaves the bands by score into ONE ranked list", () => {
    const semantic = provider("semantic", "ready", [entry("doc:a", 0.6, "semantic")]);
    const files = provider("files-vault", "ready", [
      entry("doc:b", 0.85, "strong-literal"),
      entry("doc:c", 0.3, "weak-literal"),
    ]);
    const view = mergeSearchProviders([semantic, files]);
    expect(view.entries.map((e) => e.result.node_id)).toEqual([
      "doc:b", // strong-literal 0.85
      "doc:a", // semantic 0.60
      "doc:c", // weak-literal 0.30
    ]);
    expect(view.entries.map((e) => e.band)).toEqual([
      "strong-literal",
      "semantic",
      "weak-literal",
    ]);
    expect(view.state).toBe("results");
  });

  it("dedupes by node identity, keeping the BEST (highest) rank", () => {
    // The same document is found by meaning (0.6) AND by exact name (0.9): it
    // must render ONCE, at its best rank.
    const semantic = provider("semantic", "ready", [entry("doc:x", 0.6, "semantic")]);
    const files = provider("files-vault", "ready", [
      entry("doc:x", 0.9, "strong-literal"),
    ]);
    const view = mergeSearchProviders([semantic, files]);
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0].result.score).toBe(0.9);
    expect(view.entries[0].band).toBe("strong-literal");
  });

  it("treats a semantic outage as a NON-EVENT when files providers serve", () => {
    const semantic = provider("semantic", "degraded", []);
    const files = provider("files-vault", "ready", [
      entry("doc:n", 0.3, "weak-literal"),
    ]);
    const view = mergeSearchProviders([semantic, files]);
    expect(view.semanticOffline).toBe(true);
    expect(view.state).toBe("results"); // files carry the set — not a dead mode
    expect(view.error).toBe(false);
  });

  it("reports the honest degraded phase when semantic is down and files are empty", () => {
    const semantic = provider("semantic", "degraded", []);
    const files = provider("files-vault", "ready", []);
    const view = mergeSearchProviders([semantic, files]);
    expect(view.semanticOffline).toBe(true);
    expect(view.state).toBe("semantic-offline");
  });

  it("is the error state only when semantic failed AND nothing else served", () => {
    const failed = provider("semantic", "error", []);
    const files = provider("files-vault", "ready", []);
    expect(mergeSearchProviders([failed, files]).state).toBe("error");
    // A files hit rescues the query — no error.
    const rescued = provider("files-vault", "ready", [
      entry("doc:r", 0.3, "weak-literal"),
    ]);
    const view = mergeSearchProviders([failed, rescued]);
    expect(view.state).toBe("results");
    expect(view.error).toBe(false);
  });

  it("collapses the shared semantic epoch, number winning over null over undefined", () => {
    const withEpoch = provider("semantic", "ready", [], { semanticEpoch: 42 });
    const filesNoEpoch = provider("files-vault", "ready", []);
    expect(mergeSearchProviders([withEpoch, filesNoEpoch]).semanticEpoch).toBe(42);
    const knownUnknown = provider("semantic", "degraded", [], { semanticEpoch: null });
    expect(mergeSearchProviders([knownUnknown, filesNoEpoch]).semanticEpoch).toBeNull();
    expect(
      mergeSearchProviders([filesNoEpoch, filesNoEpoch]).semanticEpoch,
    ).toBeUndefined();
  });

  it("bounds the merged list at 40 even when providers overflow", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      entry(`doc:a${i}`, 0.5, "weak-literal"),
    );
    const more = Array.from({ length: 30 }, (_, i) =>
      entry(`doc:b${i}`, 0.4, "weak-literal"),
    );
    const view = mergeSearchProviders([
      provider("semantic", "ready", []),
      provider("files-vault", "ready", many),
      provider("files-code", "ready", more),
    ]);
    expect(view.entries).toHaveLength(40);
  });

  it("aggregates the incomplete (walk-capped) truth across providers", () => {
    // No provider capped → complete.
    const complete = mergeSearchProviders([
      provider("semantic", "ready", []),
      provider("files-code", "ready", [entry("code:a", 0.3, "weak-literal")]),
    ]);
    expect(complete.incomplete).toBe(false);
    // A files provider whose listing was walk-capped → the merged view is
    // incomplete, so the palette can state it.
    const capped = mergeSearchProviders([
      provider("semantic", "ready", []),
      provider("files-code", "ready", [entry("code:a", 0.3, "weak-literal")], {
        incomplete: true,
      }),
    ]);
    expect(capped.incomplete).toBe(true);
  });

  it("is idle only when every provider is idle", () => {
    const view = mergeSearchProviders([
      provider("semantic", "idle", []),
      provider("files-vault", "idle", []),
      provider("files-code", "idle", []),
    ]);
    expect(view.state).toBe("idle");
  });

  it("fans a retry out to every provider that exposes one", () => {
    let a = 0;
    let b = 0;
    const view = mergeSearchProviders([
      provider("semantic", "error", [], { retry: () => (a += 1) }),
      provider("files-vault", "ready", [], { retry: () => (b += 1) }),
    ]);
    view.retry();
    expect(a).toBe(1);
    expect(b).toBe(1);
  });
});

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
}

describe("useSearchProviders (real engine, live wiring)", () => {
  it("settles one composed Search view over the live wire without erroring", async () => {
    engineClient.useTransport(liveTransport);
    const scope = await liveScope();
    const client = testQueryClient();
    const { result: hook } = renderHook(() => useSearchProviders("plan", scope), {
      wrapper: wrapper(client),
    });

    // Wait for the query to settle out of loading/idle into a terminal phase.
    // `semantic-offline` is a legitimate served terminal on a rag-less host
    // (CI runners have no rag service): honest degradation, not an error.
    await waitFor(
      () =>
        expect(["results", "no-results", "semantic-offline"]).toContain(
          hook.current.state,
        ),
      ENGINE_WAIT,
    );
    const view = hook.current;
    expect(view.error).toBe(false);
    expect(Array.isArray(view.entries)).toBe(true);
    // The 40-item bound holds, and every entry is a navigable, species-tagged hit.
    expect(view.entries.length).toBeLessThanOrEqual(40);
    for (const item of view.entries) {
      expect(item.result.node_id).not.toBeNull();
      expect(["doc", "code", "commit", "unknown"]).toContain(item.species);
    }
  });

  it("narrows to the code corpus: only code hits, doc providers idle", async () => {
    engineClient.useTransport(liveTransport);
    const scope = await liveScope();
    const client = testQueryClient();
    const { result: hook } = renderHook(
      () => useSearchProviders("plan", scope, "code"),
      { wrapper: wrapper(client) },
    );
    await waitFor(
      () =>
        expect(["results", "no-results", "semantic-offline"]).toContain(
          hook.current.state,
        ),
      ENGINE_WAIT,
    );
    // Every merged hit is a code hit — the doc-corpus providers read an empty
    // query (idle), so no doc species can leak into a code-narrowed list.
    for (const item of hook.current.entries) {
      expect(item.species).toBe("code");
    }
  });

  it("narrows to the docs corpus: no code hits leak in", async () => {
    engineClient.useTransport(liveTransport);
    const scope = await liveScope();
    const client = testQueryClient();
    const { result: hook } = renderHook(
      () => useSearchProviders("plan", scope, "docs"),
      { wrapper: wrapper(client) },
    );
    await waitFor(
      () =>
        expect(["results", "no-results", "semantic-offline"]).toContain(
          hook.current.state,
        ),
      ENGINE_WAIT,
    );
    for (const item of hook.current.entries) {
      expect(item.species).not.toBe("code");
    }
  });
});
