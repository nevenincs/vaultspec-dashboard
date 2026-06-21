// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { VaultTreeEntry } from "../../stores/server/engine";
import { dashboardDocumentStateResetPatch } from "../../stores/server/dashboardState";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { useViewStore } from "../../stores/view/viewStore";
import {
  highlightedPathFor,
  nodeIdToStem,
  pathToNodeId,
  useDashboardBrowserSelection,
  useSelectFolderContext,
} from "./browserSelection";

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

let cleanupDashboardScope: string | null = null;

afterEach(async () => {
  cleanup();
  useViewStore.setState({
    scope: null,
    activeFolder: null,
    featureContexts: [],
    openDocs: [],
    activeDocId: null,
  });
  if (cleanupDashboardScope !== null) {
    await createLiveClient()
      .patchDashboardState(dashboardDocumentStateResetPatch(cleanupDashboardScope))
      .catch(() => undefined);
    cleanupDashboardScope = null;
  }
});

const entry = (path: string): VaultTreeEntry => ({
  path,
  doc_type: "adr",
  feature_tags: [],
  dates: {},
});

async function realDocumentEntry(scope: string): Promise<VaultTreeEntry> {
  const graph = await createLiveClient().graphQuery({
    scope,
    granularity: "document",
  });
  const node = graph.nodes.find((candidate) => candidate.id.startsWith("doc:"));
  if (!node) throw new Error("live browser-selection fixture has no document node");
  return entry(`.vault/adr/${node.id.slice(4)}.md`);
}

describe("id derivation (contract identity guarantees)", () => {
  it("derives the document node id from the vault stem and back", () => {
    expect(pathToNodeId(".vault/adr/2026-06-12-x-adr.md")).toBe("doc:2026-06-12-x-adr");
    expect(nodeIdToStem("doc:2026-06-12-x-adr")).toBe("2026-06-12-x-adr");
    expect(nodeIdToStem("feature:x")).toBeNull();
  });
});

describe("bidirectional selection (G2.b)", () => {
  it("selection highlights its browser row, document nodes only", () => {
    const entries = [entry(".vault/adr/2026-06-12-x-adr.md")];
    expect(highlightedPathFor(entries, "doc:2026-06-12-x-adr")).toBe(
      ".vault/adr/2026-06-12-x-adr.md",
    );
    expect(highlightedPathFor(entries, "feature:x")).toBeNull();
    expect(highlightedPathFor(entries, null)).toBeNull();
    expect(highlightedPathFor(undefined, "doc:2026-06-12-x-adr")).toBeNull();
  });

  it("rejects malformed browser-selection scope before opening local tabs", () => {
    const qc = testQueryClient();
    const { result } = renderHook(
      () => useDashboardBrowserSelection({ scope: "scope-a" }),
      { wrapper: wrapper(qc) },
    );

    act(() => result.current.handleEntryClick(entry(".vault/adr/2026-06-12-x.md")));
    act(() =>
      result.current.handleCodeEntryOpen({
        path: "src/app.ts",
        kind: "file",
        has_children: false,
        node_id: "code:src/app.ts",
      }),
    );

    expect(useViewStore.getState().openDocs).toEqual([]);
    expect(useViewStore.getState().activeDocId).toBeNull();
    qc.clear();
  });

  it("accepts trimmed browser-selection scopes for local tab activation", async () => {
    const scope = await liveScope();
    cleanupDashboardScope = scope;
    const doc = await realDocumentEntry(scope);
    const qc = testQueryClient();
    const { result } = renderHook(() => useDashboardBrowserSelection(` ${scope} `), {
      wrapper: wrapper(qc),
    });

    act(() => result.current.handleEntryClick(doc));

    expect(useViewStore.getState()).toMatchObject({
      openDocs: [
        {
          nodeId: pathToNodeId(doc.path),
          surface: "markdown",
          provisional: true,
        },
      ],
      activeDocId: pathToNodeId(doc.path),
    });
    await waitFor(async () => {
      await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
        selected_ids: [pathToNodeId(doc.path)],
      });
    });
    qc.clear();
  });
});

describe("folder context persistence", () => {
  it("mirrors the accepted session context instead of advancing before persistence", async () => {
    const scope = await liveScope();
    const tag = `ctx-${Date.now().toString(36)}`;
    await createLiveClient().putSession({
      active_scope: scope,
      scope_context: { folder: null, feature_tags: [] },
    });
    useViewStore.setState({
      scope,
      activeFolder: null,
      featureContexts: [],
    });

    const qc = testQueryClient();
    const { result } = renderHook(() => useSelectFolderContext(), {
      wrapper: wrapper(qc),
    });

    act(() => result.current.select(" adr ", [" ", ` ${tag} `, tag, 7] as unknown));

    expect(useViewStore.getState()).toMatchObject({
      activeFolder: null,
      featureContexts: [],
    });
    await waitFor(() =>
      expect(useViewStore.getState()).toMatchObject({
        activeFolder: "adr",
        featureContexts: [tag],
      }),
    );
    await expect(createLiveClient().session()).resolves.toMatchObject({
      scope_context: { folder: "adr", feature_tags: [tag] },
    });
    qc.clear();
  });

  it("targets the picked scope instead of falling through to the server-active scope", async () => {
    const serverActiveScope = await liveScope();
    const pickedScope = `${serverActiveScope}:detached-folder-context-${Date.now()}`;
    const activeTag = `active-${Date.now().toString(36)}`;
    const pickedTag = `picked-${Date.now().toString(36)}`;

    await createLiveClient().putSession({
      active_scope: serverActiveScope,
      scope_context: {
        scope: serverActiveScope,
        folder: "plan",
        feature_tags: [activeTag],
      },
    });
    useViewStore.setState({
      scope: pickedScope,
      activeFolder: null,
      featureContexts: [],
    });

    const qc = testQueryClient();
    const { result } = renderHook(() => useSelectFolderContext(), {
      wrapper: wrapper(qc),
    });

    act(() => result.current.select("adr", [pickedTag]));

    await waitFor(() => expect(result.current.putSession.isSuccess).toBe(true));
    expect(useViewStore.getState()).toMatchObject({
      scope: pickedScope,
      activeFolder: null,
      featureContexts: [],
    });
    await expect(createLiveClient().session()).resolves.toMatchObject({
      active_scope: serverActiveScope,
      scope_context: { folder: "plan", feature_tags: [activeTag] },
    });
    qc.clear();
  });

  it("rejects malformed picked scope before falling through to the server-active scope", async () => {
    const serverActiveScope = await liveScope();
    const activeTag = `active-${Date.now().toString(36)}`;

    await createLiveClient().putSession({
      active_scope: serverActiveScope,
      scope_context: {
        scope: serverActiveScope,
        folder: "plan",
        feature_tags: [activeTag],
      },
    });
    useViewStore.setState({
      scope: { value: serverActiveScope } as unknown as string,
      activeFolder: null,
      featureContexts: [],
    });

    const qc = testQueryClient();
    const { result } = renderHook(() => useSelectFolderContext(), {
      wrapper: wrapper(qc),
    });

    act(() => result.current.select("adr", ["bad-scope"]));

    expect(result.current.putSession.isIdle).toBe(true);
    await expect(createLiveClient().session()).resolves.toMatchObject({
      active_scope: serverActiveScope,
      scope_context: { folder: "plan", feature_tags: [activeTag] },
    });
    qc.clear();
  });
});
