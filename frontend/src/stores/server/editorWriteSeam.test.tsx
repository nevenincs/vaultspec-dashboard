// @vitest-environment happy-dom
//
// The editor WRITE seam — the REQUEST side (document-editor backend, S22; the
// Save button's body write cut over to the ledger at ledgered-edit-migration
// W01.P02, the frontmatter panel at W03.P07, the rename affordance at W03.P08,
// the create dialog at W03.P09, all generalized to the operation-typed
// `directWrite` route at W02.P06).
//
// The RESPONSE side (the wire `{data, tiers}` envelope → typed `OpsWriteResult`)
// is covered against CAPTURED LIVE samples in `liveAdapters.test.ts`. This file
// covers the complementary REQUEST side: that `useSaveBody` / `useSetFrontmatter`
// / `useRenameDoc` / `useCreateDoc` CONSTRUCT the correct `directWrite` payload
// — the `operation` discriminator,
// ref/body/frontmatter/new_stem/create/expected_blob_hash, the scope pin, and
// the bootstrapped actor token — and that each hook resolves (never throws) on
// a business outcome, mapping it to the typed result.
//
// This is NOT the tautological mock-engine test the no-mocks migration removed:
// every hook spies the authoring store's `directWrite` client method, CAPTURING
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
import { useCreateDoc, useRenameDoc, useSaveBody, useSetFrontmatter } from "./queries";

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
      // The advisories panel reads ONLY `checks` (conformanceChecksOf) — a
      // denial that lands solely in `errors` renders a silently blank panel.
      expect(res.result.checks).toHaveLength(1);
      expect((res.result.checks[0] as { message?: string }).message).toContain(
        "does not match",
      );
      expect((res.result.checks[0] as { severity?: string }).severity).toBe("error");
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
      // The advisories panel reads ONLY `checks` (conformanceChecksOf) — a
      // frontmatter refusal that lands solely in `errors` renders a silently
      // blank "Conformance advisories" panel (the exact regression vs. the
      // legacy set-frontmatter path, which put structured messages in `checks`).
      expect(res.result.checks).toHaveLength(1);
      expect((res.result.checks[0] as { message?: string }).message).toContain(
        "resolves to no document",
      );
      expect((res.result.checks[0] as { severity?: string }).severity).toBe("error");
      expect((res.result.checks[0] as { fixable?: boolean }).fixable).toBe(false);
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

describe("useRenameDoc — direct-write request construction", () => {
  it("builds an `operation: rename` direct-write request (ref + new_stem + optimistic base + scope pin) carrying the bootstrapped actor token, and resolves `renamed`", async () => {
    const spy = vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "applied",
      changesetId: "changeset_3",
      documentPath: ".vault/adr/new-stem.md",
      blobHash: "new-hash",
      replayed: false,
      tiers: TIERS,
    } satisfies DirectWriteOutcome);

    const { result } = renderHook(() => useRenameDoc(), {
      wrapper: wrapper(new QueryClient()),
    });
    const res = await result.current.mutateAsync({
      nodeId: "doc:old-stem",
      scope: "Y:/repo",
      to: "new-stem",
      expectedBlobHash: "old-hash",
    });

    expect(spy).toHaveBeenCalledWith(
      {
        operation: "rename",
        ref: "old-stem",
        new_stem: "new-stem",
        expected_blob_hash: "old-hash",
        scope: "Y:/repo",
      },
      { actorToken: "test-actor-token" },
    );
    expect(res.result.kind).toBe("renamed");
    if (res.result.kind === "renamed") {
      expect(res.result.oldNodeId).toBe("doc:old-stem");
      expect(res.result.newNodeId).toBe("doc:new-stem");
      expect(res.result.newBlobHash).toBe("new-hash");
    }
  });

  it("maps a direct-write conflict outcome (a stale optimistic base) to a `conflict` result (resolves, never throws)", async () => {
    vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "conflict",
      conflict: {
        document_ref: "old-stem",
        document_path: ".vault/adr/old-stem.md",
        expected_blob_hash: "old-hash",
        actual_blob_hash: "drifted-hash",
        target_blob_hash: "would-have-been-hash",
      },
      tiers: TIERS,
    } satisfies DirectWriteOutcome);

    const { result } = renderHook(() => useRenameDoc(), {
      wrapper: wrapper(new QueryClient()),
    });
    const res = await result.current.mutateAsync({
      nodeId: "doc:old-stem",
      scope: null,
      to: "new-stem",
      expectedBlobHash: "old-hash",
    });

    expect(res.result.kind).toBe("conflict");
    if (res.result.kind === "conflict") {
      expect(res.result.expected).toBe("old-hash");
      expect(res.result.actual).toBe("drifted-hash");
    }
  });

  it("maps a rename-target-collision denial to the `collision` result (resolves, never throws) — the apply-time RenameTargetCollision finding", async () => {
    vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "denied",
      reason:
        "a document already exists at the proposed stem `new-stem`; rename would collide",
      tiers: TIERS,
    } satisfies DirectWriteOutcome);

    const { result } = renderHook(() => useRenameDoc(), {
      wrapper: wrapper(new QueryClient()),
    });
    const res = await result.current.mutateAsync({
      nodeId: "doc:old-stem",
      scope: null,
      to: "new-stem",
      expectedBlobHash: "old-hash",
    });

    expect(res.result.kind).toBe("collision");
    if (res.result.kind === "collision") {
      expect(res.result.message).toContain("already exists at the proposed stem");
    }
  });

  it("maps every OTHER denial reason to a `refused` result carrying the reason in `checks` (the advisories panel reads only `checks`)", async () => {
    vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "denied",
      reason:
        "direct editor saves require a human actor; agents must propose changesets",
      tiers: TIERS,
    } satisfies DirectWriteOutcome);

    const { result } = renderHook(() => useRenameDoc(), {
      wrapper: wrapper(new QueryClient()),
    });
    const res = await result.current.mutateAsync({
      nodeId: "doc:old-stem",
      scope: null,
      to: "new-stem",
      expectedBlobHash: "old-hash",
    });

    expect(res.result.kind).toBe("refused");
    if (res.result.kind === "refused") {
      expect(res.result.message).toContain("agents must propose changesets");
      expect(res.result.checks).toHaveLength(1);
      expect((res.result.checks[0] as { message?: string }).message).toContain(
        "agents must propose changesets",
      );
    }
  });

  it("refuses client-side (never sends an empty expected_blob_hash) when no optimistic base is supplied", async () => {
    const spy = vi.spyOn(authoringClient, "directWrite");

    const { result } = renderHook(() => useRenameDoc(), {
      wrapper: wrapper(new QueryClient()),
    });
    const res = await result.current.mutateAsync({
      nodeId: "doc:old-stem",
      scope: "Y:/repo",
      to: "new-stem",
    });

    expect(res.result.kind).toBe("refused");
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses (never silently drops) a rename attempted with no bootstrapped actor token — the fail-safe", async () => {
    const spy = vi.spyOn(authoringClient, "directWrite");
    setActorToken(null);

    const { result } = renderHook(() => useRenameDoc(), {
      wrapper: wrapper(new QueryClient()),
    });

    await expect(
      result.current.mutateAsync({
        nodeId: "doc:old-stem",
        scope: "Y:/repo",
        to: "new-stem",
        expectedBlobHash: "old-hash",
      }),
    ).rejects.toThrow(/no authoring actor token is bootstrapped/);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("useCreateDoc — direct-write request construction", () => {
  it("builds an `operation: create_document` direct-write request (create params + scope pin, NO ref/expected_blob_hash) carrying the bootstrapped actor token, and resolves `created` with the SERVER-echoed identity (W03.P09a)", async () => {
    const spy = vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "applied",
      changesetId: "changeset_4",
      documentPath: ".vault/research/2026-07-09-alpha-research.md",
      blobHash: "new-hash",
      replayed: false,
      resultNodeId: "doc:2026-07-09-alpha-research",
      resultStem: "2026-07-09-alpha-research",
      tiers: TIERS,
    } satisfies DirectWriteOutcome);

    const { result } = renderHook(() => useCreateDoc(), {
      wrapper: wrapper(new QueryClient()),
    });
    const res = await result.current.mutateAsync({
      scope: "Y:/repo",
      docType: "research",
      feature: "alpha",
      title: "New note",
      related: ["existing-stem"],
    });

    expect(spy).toHaveBeenCalledWith(
      {
        operation: "create_document",
        create: {
          doc_type: "research",
          feature: "alpha",
          title: "New note",
          related: ["existing-stem"],
        },
        scope: "Y:/repo",
      },
      { actorToken: "test-actor-token" },
    );
    expect(res.result.kind).toBe("created");
    if (res.result.kind === "created") {
      expect(res.result.path).toBe(".vault/research/2026-07-09-alpha-research.md");
      expect(res.result.stem).toBe("2026-07-09-alpha-research");
    }
    // The echoed `resultNodeId` restores auto-open — never client-predicted.
    expect(res.nodeId).toBe("doc:2026-07-09-alpha-research");
  });

  it("still resolves `created` (never a false refusal) when the apply receipt reports no identity — the engine's fail-closed edge case", async () => {
    vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "applied",
      changesetId: "changeset_5",
      documentPath: null,
      blobHash: null,
      replayed: false,
      tiers: TIERS,
    } satisfies DirectWriteOutcome);

    const { result } = renderHook(() => useCreateDoc(), {
      wrapper: wrapper(new QueryClient()),
    });
    const res = await result.current.mutateAsync({
      scope: "Y:/repo",
      docType: "research",
      feature: "alpha",
    });

    expect(res.result.kind).toBe("created");
    expect(res.nodeId).toBeNull();
  });

  it("maps a predicted-create-path collision denial to a `refused` result carrying the reason in `checks`", async () => {
    vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "denied",
      reason:
        "a document already exists at the predicted create path `.vault/research/2026-07-09-alpha-research.md`; core refuses to overwrite it",
      tiers: TIERS,
    } satisfies DirectWriteOutcome);

    const { result } = renderHook(() => useCreateDoc(), {
      wrapper: wrapper(new QueryClient()),
    });
    const res = await result.current.mutateAsync({
      scope: "Y:/repo",
      docType: "research",
      feature: "alpha",
    });

    expect(res.result.kind).toBe("refused");
    if (res.result.kind === "refused") {
      expect(res.result.errors[0]).toContain(
        "already exists at the predicted create path",
      );
      expect(res.result.checks).toHaveLength(1);
      expect((res.result.checks[0] as { severity?: string }).severity).toBe("error");
    }
    expect(res.nodeId).toBeNull();
  });

  it("refuses client-side (never dispatches) when doc type or feature is missing", async () => {
    const spy = vi.spyOn(authoringClient, "directWrite");

    const { result } = renderHook(() => useCreateDoc(), {
      wrapper: wrapper(new QueryClient()),
    });
    const res = await result.current.mutateAsync({
      scope: "Y:/repo",
      docType: "",
      feature: "alpha",
    });

    expect(res.result.kind).toBe("refused");
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses (never silently drops) a create attempted with no bootstrapped actor token — the fail-safe", async () => {
    const spy = vi.spyOn(authoringClient, "directWrite");
    setActorToken(null);

    const { result } = renderHook(() => useCreateDoc(), {
      wrapper: wrapper(new QueryClient()),
    });

    await expect(
      result.current.mutateAsync({
        scope: "Y:/repo",
        docType: "research",
        feature: "alpha",
      }),
    ).rejects.toThrow(/no authoring actor token is bootstrapped/);
    expect(spy).not.toHaveBeenCalled();
  });
});
