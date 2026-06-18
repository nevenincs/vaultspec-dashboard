// @vitest-environment happy-dom
//
// The editor WRITE seam — the REQUEST side (document-editor backend, S22).
//
// The RESPONSE side (the wire `{data, tiers}` envelope → typed `OpsWriteResult`)
// is covered against CAPTURED LIVE samples in `liveAdapters.test.ts`. This file
// covers the complementary REQUEST side: that `useSaveBody` / `useSetFrontmatter`
// CONSTRUCT the correct write op — the verb, the stem-derived `ref`, the
// optimistic `expected_blob_hash` base, and the scope — and that the hook resolves
// (never throws) on a business outcome, mapping it to the typed result.
//
// This is NOT the tautological mock-engine test the no-mocks migration removed: the
// dispatch seam (`dispatchOps`) is spied to CAPTURE the outgoing request and return
// a fixture shaped like the live wire (sourced from the captured samples). The unit
// under test is OUR request construction + result wiring, not a faked engine verb.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("useSaveBody — set-body request construction", () => {
  it("builds a set-body write op (stem ref + optimistic base + scope) and resolves `saved`", async () => {
    mockDispatch.mockResolvedValue(
      opsResult({
        schema: "vaultspec.vault.set-body.v1",
        status: "updated",
        data: { path: ".vault/adr/x.md", blob_hash: "new-hash", checks: [] },
      }),
    );
    const { result } = renderHook(() => useSaveBody(), {
      wrapper: wrapper(new QueryClient()),
    });
    const res = await result.current.mutateAsync({
      nodeId: "doc:2026-01-01-alpha-research",
      scope: "Y:/repo",
      text: "the new body text",
      baseBlobHash: "old-hash",
    });
    expect(mockDispatch).toHaveBeenCalledWith({
      target: "core",
      verb: "set-body",
      mode: "write",
      body: {
        scope: "Y:/repo",
        ref: "2026-01-01-alpha-research",
        body: "the new body text",
        expected_blob_hash: "old-hash",
      },
    });
    expect(res.result.kind).toBe("saved");
    if (res.result.kind === "saved") {
      expect(res.result.blobHash).toBe("new-hash");
    }
  });

  it("maps a blob-hash conflict envelope to a `conflict` result (resolves, never throws), scope omitted when null", async () => {
    mockDispatch.mockResolvedValue(
      opsResult({
        schema: "vaultspec.vault.set-body.v1",
        status: "failed",
        data: {
          conflict: true,
          expected: "old-hash",
          actual: "drifted-hash",
          path: ".vault/adr/x.md",
        },
      }),
    );
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
    }
    // scope null collapses to undefined (not sent as a literal null)
    const sent = mockDispatch.mock.calls[0][0] as { body: { scope?: string } };
    expect(sent.body.scope).toBeUndefined();
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
