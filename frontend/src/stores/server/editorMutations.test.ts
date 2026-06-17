// @vitest-environment happy-dom
//
// The bounded editor-state slice + the read-side editor derivations
// (document-editor backend, W03). These are PURE store/selector logic, exercised
// directly — no engine surface, no double.
//
// NOTE — the editor WRITE seam (useSaveBody / useSetFrontmatter / useCreateDoc →
// `/ops/core/{set-body,set-frontmatter,create}`) is NOT tested here against the
// live engine because the installed `vaultspec-core` (0.1.31) does not yet ship
// the `set-body` / `set-frontmatter` verbs the seam forwards to — the live route
// 502s. The old mock-engine tests for these passed only because the mock FAKED
// those verbs (a tautology the no-mocks migration exists to remove). Real write-
// seam coverage is blocked on vaultspec-core shipping the edit verbs (the
// document-editor-backend campaign); see tmp/hardening/FINDINGS.md finding W1.
// When the verbs ship, restore the live write tests against the fixture vault.

import { describe, expect, it } from "vitest";

import { useViewStore } from "../view/viewStore";
import { deriveDocType, deriveLinkResolution, deriveReadTime, stemFromNodeId } from "./queries";

// A document the fixture vault ships (feature `alpha`).
const DOC_STEM = "2026-01-01-alpha-research";
const DOC_ID = `doc:${DOC_STEM}`;

// --- stemFromNodeId -------------------------------------------------------------

describe("stemFromNodeId", () => {
  it("strips the doc: prefix to recover the write `ref`", () => {
    expect(stemFromNodeId(DOC_ID)).toBe(DOC_STEM);
  });
  it("passes a bare stem through unchanged", () => {
    expect(stemFromNodeId(DOC_STEM)).toBe(DOC_STEM);
  });
});

// --- the bounded editor-state slice transitions (pure store logic) --------------

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
    useViewStore.getState().setScope(null);
  });
});

// --- read-side derivations (pure functions over explicit vectors) ---------------

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
    expect(full.minutes).toBe(2);
    expect(full.atLeast).toBe(false);
    const truncated = deriveReadTime(text, {
      total_bytes: 99999,
      returned_bytes: text.length,
      reason: "byte cap",
    });
    expect(truncated.atLeast).toBe(true);
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
    expect(resolved.find((r) => r.stem === "doc-missing")?.state).toBe("absent");
    expect(resolved.find((r) => r.stem === "doc-a")?.nodeId).toBe("doc:doc-a");
  });

  it("deriveLinkResolution is empty for a null node or a no-frontmatter body", () => {
    expect(deriveLinkResolution(null, "anything", [])).toEqual([]);
    expect(deriveLinkResolution(DOC_ID, "no frontmatter here", [])).toEqual([]);
  });
});
