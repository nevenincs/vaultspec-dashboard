// @vitest-environment happy-dom

// Document-search plane units (command-palette-planes ADR, W02.P05; search-
// providers ADR D3): the honest state derivation plus the thin-consumer wiring.
// The literal MATCH now lives in the shared files(vault) provider over the one
// `literalMatch` utility (covered by `literalMatch` + `searchProviders` vectors),
// so the finder's private scanner is gone; this file keeps the finder's pure
// state-derivation contract and proves it is backed by the provider over the live
// wire (no mocks — wire-contract).

import { createElement, type ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { engineClient } from "./engine";
import { liveScope, liveTransport } from "../../testing/liveClient";
import { ENGINE_WAIT } from "../../testing/timing";
import {
  deriveDocumentSearchState,
  useDocumentSearchController,
} from "./documentSearchController";

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

describe("useDocumentSearchController (thin files(vault) consumer, live wiring)", () => {
  it("is idle with no query, and narrows the cached vault tree over the live wire", async () => {
    engineClient.useTransport(liveTransport);
    const scope = await liveScope();
    const client = testQueryClient();

    // Empty query → idle, no results, regardless of the tree load.
    const idle = renderHook(() => useDocumentSearchController("", scope), {
      wrapper: wrapper(client),
    });
    expect(idle.result.current.state).toBe("idle");
    expect(idle.result.current.results).toEqual([]);

    // A real query settles to a ready listing backed by the files(vault)
    // provider: every hit is a navigable `doc:` document (never a code node),
    // and the count matches the results length.
    const { result } = renderHook(() => useDocumentSearchController("plan", scope), {
      wrapper: wrapper(client),
    });
    await waitFor(
      () => expect(["ready", "degraded"]).toContain(result.current.state),
      ENGINE_WAIT,
    );
    const view = result.current;
    expect(Array.isArray(view.results)).toBe(true);
    expect(view.count).toBe(view.results.length);
    for (const hit of view.results) {
      expect(hit.node_id).not.toBeNull();
      expect(hit.node_id).toMatch(/^doc:/);
      expect(hit.source).toBe("vault");
    }
  });
});
