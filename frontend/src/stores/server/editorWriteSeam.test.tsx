// @vitest-environment happy-dom
//
// The editor WRITE seam — the REQUEST side (document-editor backend, S22; the
// Save button's body write cut over to the ledger at ledgered-edit-migration
// W01.P02, the frontmatter panel at W03.P07, both generalized to the
// operation-typed `directWrite` route at W02.P06).
//
// The RESPONSE side (the wire `{data, tiers}` envelope → typed `OpsWriteResult`)
// is covered against CAPTURED LIVE samples in `liveAdapters.test.ts`. This file
// covers the complementary REQUEST side: that `useSaveBody` / `useSetFrontmatter`
// CONSTRUCT the correct `directWrite` payload — the `operation` discriminator,
// ref/body/frontmatter/expected_blob_hash, the scope pin, and the bootstrapped
// actor token — and that each hook resolves (never throws) on a business
// outcome, mapping it to the typed result.
//
// This is NOT the tautological mock-engine test the no-mocks migration removed:
// both hooks spy the authoring store's `directWrite` client method, CAPTURING
// the outgoing request and returning a fixture shaped like the live wire (the
// direct-write shape matches `authoring.live.test.ts`'s captured contract). The
// unit under test is OUR request construction + result wiring, not a faked
// engine verb.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authoringClient,
  getActorToken,
  setActorToken,
  type DirectWriteOutcome,
} from "./authoring";
import { useSaveBody, useSetFrontmatter } from "./queries";

const TIERS = {
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic: { available: true },
};

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  setActorToken("test-actor-token");
});

afterEach(() => {
  vi.restoreAllMocks();
  setActorToken(null);
});

describe("useSaveBody — direct-write request construction", () => {
  it("builds an `operation: replace_body` direct-write request (stem ref + body + optimistic base + scope pin) carrying the bootstrapped actor token, and resolves `saved`", async () => {
    const spy = vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "applied",
      changesetId: "changeset_1",
      documentPath: ".vault/adr/x.md",
      blobHash: "new-hash",
      replayed: false,
      tiers: TIERS,
    } satisfies DirectWriteOutcome);

    const { result } = renderHook(() => useSaveBody(), {
      wrapper: wrapper(new QueryClient()),
    });
    const res = await result.current.mutateAsync({
      nodeId: "doc:2026-01-01-alpha-research",
      scope: "Y:/repo",
      text: "the new body text",
      baseBlobHash: "old-hash",
    });

    expect(spy).toHaveBeenCalledWith(
      {
        operation: "replace_body",
        ref: "2026-01-01-alpha-research",
        body: "the new body text",
        expected_blob_hash: "old-hash",
        scope: "Y:/repo",
      },
      { actorToken: "test-actor-token" },
    );
    expect(res.result.kind).toBe("saved");
    if (res.result.kind === "saved") {
      expect(res.result.blobHash).toBe("new-hash");
      expect(res.result.path).toBe(".vault/adr/x.md");
    }
  });

  it("sends `scope: null` as-is (no coercion) when the open doc carries no scope", async () => {
    const spy = vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "applied",
      changesetId: "changeset_1",
      documentPath: null,
      blobHash: "new-hash",
      replayed: false,
      tiers: TIERS,
    } satisfies DirectWriteOutcome);

    const { result } = renderHook(() => useSaveBody(), {
      wrapper: wrapper(new QueryClient()),
    });
    await result.current.mutateAsync({
      nodeId: "doc:x",
      scope: null,
      text: "t",
      baseBlobHash: "old-hash",
    });

    const sent = spy.mock.calls[0][0] as { scope?: string | null };
    expect(sent.scope).toBeNull();
  });

  it("maps a direct-write conflict outcome to a `conflict` result (resolves, never throws)", async () => {
    vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "conflict",
      conflict: {
        document_ref: "2026-01-01-alpha-research",
        document_path: ".vault/adr/x.md",
        expected_blob_hash: "old-hash",
        actual_blob_hash: "drifted-hash",
        target_blob_hash: "would-have-been-hash",
      },
      tiers: TIERS,
    } satisfies DirectWriteOutcome);

    const { result } = renderHook(() => useSaveBody(), {
      wrapper: wrapper(new QueryClient()),
    });
    const res = await result.current.mutateAsync({
      nodeId: "doc:x",
      scope: null,
      text: "t",
      baseBlobHash: "old-hash",
    });

    expect(res.result.kind).toBe("conflict");
    if (res.result.kind === "conflict") {
      expect(res.result.expected).toBe("old-hash");
      expect(res.result.actual).toBe("drifted-hash");
      expect(res.result.path).toBe(".vault/adr/x.md");
    }
  });

  it("maps a direct-write denial outcome to a `refused` result carrying the served reason (resolves, never throws) — covers the scope-pin-mismatch denial too", async () => {
    vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "denied",
      reason:
        "the requested scope does not match the server's active workspace; re-check which workspace is active before retrying",
      tiers: TIERS,
    } satisfies DirectWriteOutcome);

    const { result } = renderHook(() => useSaveBody(), {
      wrapper: wrapper(new QueryClient()),
    });
    const res = await result.current.mutateAsync({
      nodeId: "doc:x",
      scope: "Y:/repo",
      text: "t",
      baseBlobHash: "old-hash",
    });

    expect(res.result.kind).toBe("refused");
    if (res.result.kind === "refused") {
      expect(res.result.errors[0]).toContain("does not match");
    }
  });

  it("refuses (never silently drops) a save attempted with no bootstrapped actor token — the fail-safe", async () => {
    const spy = vi.spyOn(authoringClient, "directWrite");
    setActorToken(null);
    expect(getActorToken()).toBeNull();

    const { result } = renderHook(() => useSaveBody(), {
      wrapper: wrapper(new QueryClient()),
    });

    await expect(
      result.current.mutateAsync({
        nodeId: "doc:2026-01-01-alpha-research",
        scope: "Y:/repo",
        text: "the new body text",
        baseBlobHash: "old-hash",
      }),
    ).rejects.toThrow(/no authoring actor token is bootstrapped/);
    // The fail-safe refuses BEFORE any request fires.
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("useSetFrontmatter — direct-write request construction", () => {
  it("builds an `operation: edit_frontmatter` direct-write request (ref + frontmatter fields + optimistic base + scope pin) carrying the bootstrapped actor token, and resolves `saved`", async () => {
    const spy = vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "applied",
      changesetId: "changeset_2",
      documentPath: ".vault/adr/x.md",
      blobHash: "h2",
      replayed: false,
      tiers: TIERS,
    } satisfies DirectWriteOutcome);

    const { result } = renderHook(() => useSetFrontmatter(), {
      wrapper: wrapper(new QueryClient()),
    });
    const res = await result.current.mutateAsync({
      nodeId: "doc:2026-06-12-dashboard-gui-adr",
      scope: "Y:/repo",
      date: "2026-06-18",
      tags: ["#adr", "#dashboard-gui"],
      related: ["[[2026-06-12-dashboard-foundation-adr]]"],
      baseBlobHash: "base-h",
    });

    expect(spy).toHaveBeenCalledWith(
      {
        operation: "edit_frontmatter",
        ref: "2026-06-12-dashboard-gui-adr",
        frontmatter: {
          date: "2026-06-18",
          tags: ["#adr", "#dashboard-gui"],
          related: ["[[2026-06-12-dashboard-foundation-adr]]"],
        },
        expected_blob_hash: "base-h",
        scope: "Y:/repo",
      },
      { actorToken: "test-actor-token" },
    );
    expect(res.result.kind).toBe("saved");
    if (res.result.kind === "saved") {
      expect(res.result.blobHash).toBe("h2");
      expect(res.result.path).toBe(".vault/adr/x.md");
    }
  });

  it("maps a direct-write conflict outcome to a `conflict` result (resolves, never throws)", async () => {
    vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "conflict",
      conflict: {
        document_ref: "s",
        document_path: ".vault/adr/s.md",
        expected_blob_hash: "b",
        actual_blob_hash: "drifted-hash",
        target_blob_hash: "would-have-been-hash",
      },
      tiers: TIERS,
    } satisfies DirectWriteOutcome);

    const { result } = renderHook(() => useSetFrontmatter(), {
      wrapper: wrapper(new QueryClient()),
    });
    const res = await result.current.mutateAsync({
      nodeId: "doc:s",
      scope: null,
      tags: ["#x"],
      baseBlobHash: "b",
    });

    expect(res.result.kind).toBe("conflict");
    if (res.result.kind === "conflict") {
      expect(res.result.expected).toBe("b");
      expect(res.result.actual).toBe("drifted-hash");
    }
  });

  it("maps a frontmatter validation denial to a `refused` result carrying the served reason", async () => {
    vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "denied",
      reason: "related link `missing` resolves to no document",
      tiers: TIERS,
    } satisfies DirectWriteOutcome);

    const { result } = renderHook(() => useSetFrontmatter(), {
      wrapper: wrapper(new QueryClient()),
    });
    const res = await result.current.mutateAsync({
      nodeId: "doc:s",
      scope: null,
      tags: ["#x"],
      baseBlobHash: "b",
    });

    expect(res.result.kind).toBe("refused");
    if (res.result.kind === "refused") {
      expect(res.result.errors[0]).toContain("resolves to no document");
    }
  });

  it("refuses (never silently drops) a frontmatter save attempted with no bootstrapped actor token — the fail-safe", async () => {
    const spy = vi.spyOn(authoringClient, "directWrite");
    setActorToken(null);

    const { result } = renderHook(() => useSetFrontmatter(), {
      wrapper: wrapper(new QueryClient()),
    });

    await expect(
      result.current.mutateAsync({
        nodeId: "doc:2026-06-12-dashboard-gui-adr",
        scope: "Y:/repo",
        tags: ["#adr"],
        baseBlobHash: "base-h",
      }),
    ).rejects.toThrow(/no authoring actor token is bootstrapped/);
    expect(spy).not.toHaveBeenCalled();
  });
});
