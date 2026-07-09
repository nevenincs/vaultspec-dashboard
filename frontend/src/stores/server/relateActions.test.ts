// Relate/link dispatch effect (ledgered-edit-migration W03.P10) — the
// read-modify-write REQUEST side. Spies `engineClient.content` (the read) and
// `authoringClient.directWrite` (the write) to CAPTURE the outgoing requests
// and return fixtures shaped like the live wire — the same "REQUEST-side"
// precedent `editorWriteSeam.test.tsx` established for Save/frontmatter/
// rename/create: the unit under test is OUR read-then-append-then-write
// orchestration, not a faked engine verb.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appDispatcher } from "../../platform/dispatch/middleware";
import {
  authoringClient,
  getActorToken,
  setActorToken,
  type DirectWriteOutcome,
} from "./authoring";
import { engineClient, type ContentResponse } from "./engine";
import {
  RELATE_ACTION,
  dispatchRelate,
  relatedListWithTarget,
  type RelateAlreadyLinked,
} from "./relateActions";

const TIERS = {
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic: { available: true },
};

function content(text: string, blobHash: string): ContentResponse {
  return {
    path: ".vault/research/a.md",
    blob_hash: blobHash,
    byte_len: text.length,
    language_hint: "markdown",
    text,
    truncated: null,
    tiers: TIERS,
  };
}

const SRC_WITH_ONE_RELATED = content(
  "---\ntags:\n  - '#research'\nrelated:\n  - '[[existing-a]]'\n---\n\nbody\n",
  "old-hash",
);

const SRC_WITH_NO_RELATED = content(
  "---\ntags:\n  - '#research'\n---\n\nbody\n",
  "old-hash",
);

beforeEach(() => {
  setActorToken("test-actor-token");
});

afterEach(() => {
  vi.restoreAllMocks();
  setActorToken(null);
});

describe("relatedListWithTarget — the read + append step", () => {
  it("reads the source's current related list + blob hash and appends the target", async () => {
    const spy = vi
      .spyOn(engineClient, "content")
      .mockResolvedValue(SRC_WITH_ONE_RELATED);

    const result = await relatedListWithTarget("src-stem", "new-target", "Y:/repo");

    expect(spy).toHaveBeenCalledWith("doc:src-stem", "Y:/repo");
    expect(result).toEqual({
      related: ["existing-a", "new-target"],
      blobHash: "old-hash",
      alreadyRelated: false,
    });
  });

  it("is idempotent: the target already present is not duplicated", async () => {
    vi.spyOn(engineClient, "content").mockResolvedValue(SRC_WITH_ONE_RELATED);

    const result = await relatedListWithTarget("src-stem", "existing-a", "Y:/repo");

    expect(result).toEqual({
      related: ["existing-a"],
      blobHash: "old-hash",
      alreadyRelated: true,
    });
  });

  it("floors a source with no related list to an empty array before appending", async () => {
    vi.spyOn(engineClient, "content").mockResolvedValue(SRC_WITH_NO_RELATED);

    const result = await relatedListWithTarget("src-stem", "new-target", null);

    expect(result.related).toEqual(["new-target"]);
    expect(result.alreadyRelated).toBe(false);
  });
});

describe("RELATE_ACTION dispatch effect — the write step", () => {
  it("sends an `operation: edit_frontmatter` direct write carrying the read's related list + blob hash + scope pin", async () => {
    vi.spyOn(engineClient, "content").mockResolvedValue(SRC_WITH_ONE_RELATED);
    const writeSpy = vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "applied",
      changesetId: "changeset_relate",
      documentPath: ".vault/research/a.md",
      blobHash: "new-hash",
      replayed: false,
      tiers: TIERS,
    } satisfies DirectWriteOutcome);

    const outcome = await dispatchRelate({
      src: "src-stem",
      dst: "new-target",
      scope: "Y:/repo",
    });

    expect(writeSpy).toHaveBeenCalledWith(
      {
        operation: "edit_frontmatter",
        ref: "src-stem",
        frontmatter: { related: ["existing-a", "new-target"] },
        expected_blob_hash: "old-hash",
        scope: "Y:/repo",
      },
      { actorToken: "test-actor-token" },
    );
    expect(outcome).toEqual(
      expect.objectContaining({ kind: "applied", changesetId: "changeset_relate" }),
    );
  });

  it("is a no-op (never dispatches a write) when the edge already exists", async () => {
    vi.spyOn(engineClient, "content").mockResolvedValue(SRC_WITH_ONE_RELATED);
    const writeSpy = vi.spyOn(authoringClient, "directWrite");

    const outcome = await dispatchRelate({
      src: "src-stem",
      dst: "existing-a",
      scope: "Y:/repo",
    });

    expect(writeSpy).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "already_related" } satisfies RelateAlreadyLinked);
  });

  it("resolves a stale-blob-hash conflict as a VALUE, never a thrown fault", async () => {
    vi.spyOn(engineClient, "content").mockResolvedValue(SRC_WITH_ONE_RELATED);
    vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "conflict",
      conflict: {
        document_ref: "src-stem",
        document_path: ".vault/research/a.md",
        expected_blob_hash: "old-hash",
        actual_blob_hash: "drifted-hash",
        target_blob_hash: "would-have-been-hash",
      },
      tiers: TIERS,
    } satisfies DirectWriteOutcome);

    const outcome = await dispatchRelate({
      src: "src-stem",
      dst: "new-target",
      scope: "Y:/repo",
    });

    expect(outcome.kind).toBe("conflict");
  });

  it("resolves a denial (e.g. a dangling target) as a VALUE, never a thrown fault", async () => {
    vi.spyOn(engineClient, "content").mockResolvedValue(SRC_WITH_ONE_RELATED);
    vi.spyOn(authoringClient, "directWrite").mockResolvedValue({
      kind: "denied",
      reason: "related link `new-target` resolves to no document",
      tiers: TIERS,
    } satisfies DirectWriteOutcome);

    const outcome = await dispatchRelate({
      src: "src-stem",
      dst: "new-target",
      scope: "Y:/repo",
    });

    expect(outcome.kind).toBe("denied");
  });

  it("refuses (never silently drops) a relate attempted with no bootstrapped actor token — the fail-safe", async () => {
    vi.spyOn(engineClient, "content").mockResolvedValue(SRC_WITH_ONE_RELATED);
    const writeSpy = vi.spyOn(authoringClient, "directWrite");
    setActorToken(null);
    expect(getActorToken()).toBeNull();

    await expect(
      dispatchRelate({ src: "src-stem", dst: "new-target", scope: "Y:/repo" }),
    ).rejects.toThrow(/no authoring actor token is bootstrapped/);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("registers a handler for the relate action on the app dispatcher", () => {
    expect(appDispatcher.hasHandler(RELATE_ACTION)).toBe(true);
  });

  it("refuses a dispatch with a malformed payload rather than reading/writing anything", async () => {
    const readSpy = vi.spyOn(engineClient, "content");
    await expect(
      appDispatcher.dispatch({ type: RELATE_ACTION, payload: { src: 1, dst: "x" } }),
    ).rejects.toThrow(/valid src\/dst payload/);
    expect(readSpy).not.toHaveBeenCalled();
  });
});
