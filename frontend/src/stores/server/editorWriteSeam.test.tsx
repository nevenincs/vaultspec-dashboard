// @vitest-environment happy-dom
//
// The editor WRITE seam — the REQUEST side (document-editor backend, S22; the
// Save button's body write cut over to the ledger at ledgered-edit-migration
// W01.P02).
//
// The RESPONSE side (the wire `{data, tiers}` envelope → typed `OpsWriteResult`)
// is covered against CAPTURED LIVE samples in `liveAdapters.test.ts`. This file
// covers the complementary REQUEST side: that `useSaveBody` / `useSetFrontmatter`
// CONSTRUCT the correct write — for `useSaveBody`, the direct-write route's
// ref/body/expected_blob_hash + the bootstrapped actor token; for
// `useSetFrontmatter` (still on the legacy verb), the write op — and that each
// hook resolves (never throws) on a business outcome, mapping it to the typed
// result.
//
// This is NOT the tautological mock-engine test the no-mocks migration removed:
// `useSetFrontmatter` spies the legacy dispatch seam (`dispatchOps`); `useSaveBody`
// spies the authoring store's `directWrite` client method. Both CAPTURE the
// outgoing request and return a fixture shaped like the live wire (the
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
import { dispatchOps } from "./opsActions";
import { useSaveBody, useSetFrontmatter } from "./queries";

vi.mock("./opsActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./opsActions")>()),
  dispatchOps: vi.fn(),
}));

const mockDispatch = vi.mocked(dispatchOps);

const TIERS = {
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic: { available: true },
};

/** The flat `OpsResult` the client transport hands the adapter: the inner
 *  `{schema,status,data}` envelope plus the brokered tiers (matches the live wire
 *  shape the captured samples in liveAdapters.test.ts assert). */
function opsResult(envelope: Record<string, unknown>) {
  return { envelope, tiers: TIERS } as unknown as Awaited<
    ReturnType<typeof dispatchOps>
  >;
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  mockDispatch.mockReset();
});

describe("useSaveBody — direct-write request construction", () => {
  beforeEach(() => {
    setActorToken("test-actor-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setActorToken(null);
  });

  it("builds a direct-write request (stem ref + body + optimistic base) carrying the bootstrapped actor token, and resolves `saved`", async () => {
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
        ref: "2026-01-01-alpha-research",
        body: "the new body text",
        expected_blob_hash: "old-hash",
      },
      { actorToken: "test-actor-token" },
    );
    expect(res.result.kind).toBe("saved");
    if (res.result.kind === "saved") {
      expect(res.result.blobHash).toBe("new-hash");
      expect(res.result.path).toBe(".vault/adr/x.md");
    }
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

  it("maps a direct-write denial outcome to a `refused` result carrying the served reason (resolves, never throws)", async () => {
    vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "denied",
      reason:
        "direct editor saves require a human actor; agents must propose changesets",
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

    expect(res.result.kind).toBe("refused");
    if (res.result.kind === "refused") {
      expect(res.result.errors[0]).toContain("agents must propose changesets");
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

describe("useSetFrontmatter — set-frontmatter request construction", () => {
  it("builds a set-frontmatter write op carrying date/tags/related + base, and resolves `saved`", async () => {
    mockDispatch.mockResolvedValue(
      opsResult({
        schema: "vaultspec.vault.set-frontmatter.v1",
        status: "set",
        data: { path: ".vault/adr/x.md", blob_hash: "h2", checks: [] },
      }),
    );
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
    expect(mockDispatch).toHaveBeenCalledWith({
      target: "core",
      verb: "set-frontmatter",
      mode: "write",
      body: {
        scope: "Y:/repo",
        ref: "2026-06-12-dashboard-gui-adr",
        expected_blob_hash: "base-h",
        date: "2026-06-18",
        tags: ["#adr", "#dashboard-gui"],
        related: ["[[2026-06-12-dashboard-foundation-adr]]"],
      },
    });
    expect(res.result.kind).toBe("saved");
  });

  it("maps a frontmatter refusal to a `refused` result carrying checks + errors", async () => {
    mockDispatch.mockResolvedValue(
      opsResult({
        schema: "vaultspec.vault.set-frontmatter.v1",
        status: "failed",
        data: {
          refused: true,
          checks: [{ message: "related link resolves to no document" }],
          errors: ["related link `missing` resolves to no document"],
          path: ".vault/adr/x.md",
        },
      }),
    );
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
      expect(res.result.checks).toHaveLength(1);
    }
  });
});
