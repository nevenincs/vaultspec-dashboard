// @vitest-environment happy-dom
//
// The bounded editor-state slice + the read-side editor derivations
// (document-editor backend, W03). These are PURE store/selector logic, exercised
// directly — no engine surface, no double.
//
// NOTE — the editor WRITE seam (useSaveBody / useSetFrontmatter / useRenameDoc
// / useCreateDoc, all routed through the authoring ledger's `directWrite`) is
// split across two files, with NO faked-verb mock (the tautology the
// no-mocks migration removed):
//   • REQUEST + RESPONSE side — `editorWriteSeam.test.tsx` proves the hooks
//     construct the correct `directWrite` request (the operation discriminator
//     + per-kind fields + scope pin), spying the client method, and that the
//     `directWriteResultToOpsResult` / `directWriteRefusedResult` mapping
//     resolves it onto the typed `OpsWriteResult` the editor consumes (the
//     response is a captured-shape fixture, not a faked engine verb).
//   • EDITOR STATE — this file: the bounded slice + `applyEditorWriteResult`.
// Every kind lands on the SAME `OpsWriteResult`/`applyEditorWriteResult` shape
// (rename maps to its own `RenameDocResult`), so this file's coverage is
// unchanged by which route materializes it.

import { describe, expect, it } from "vitest";

import {
  applyEditorWriteResult,
  closeDocumentEditor,
  deriveDocumentEditorView,
  deriveMarkdownEditorDocumentView,
  markEditorConflict,
  markEditorFailed,
  markEditorSaved,
  markEditorSaving,
  openDocumentEditor,
  updateEditorDraft,
} from "../view/editor";
import {
  EDITOR_BLOB_HASH_MAX_CHARS,
  EDITOR_DRAFT_TEXT_MAX_CHARS,
  normalizeEditorBlobHash,
  normalizeEditorTextValue,
  useViewStore,
} from "../view/viewStore";
import type { ContentView } from "./queries";
import {
  deriveDocType,
  deriveLinkResolution,
  deriveReadTime,
  stemFromNodeId,
} from "./queries";

// A document the fixture vault ships (feature `alpha`).
const DOC_STEM = "2026-01-01-alpha-research";
const DOC_ID = `doc:${DOC_STEM}`;

function content(patch: Partial<ContentView> = {}): ContentView {
  return {
    loading: false,
    errored: false,
    degraded: false,
    degradedTiers: [],
    reasons: {},
    path: ".vault/plan/2026-06-18-editor-plan.md",
    blobHash: "hash-1",
    languageHint: "markdown",
    text: [
      "---",
      "tags:",
      "  - '#plan'",
      "  - '#editor'",
      "date: '2026-06-18'",
      "related:",
      "  - '[[2026-06-18-reader-plan]]'",
      "---",
      "",
      "# Body",
    ].join("\n"),
    truncated: null,
    available: true,
    ...patch,
  };
}

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
    openDocumentEditor(DOC_ID, "initial body", "hash-1");
    const s = useViewStore.getState();
    expect(s.editorTarget).toEqual({ nodeId: DOC_ID, scope: null });
    expect(s.draftText).toBe("initial body");
    expect(s.baseBlobHash).toBe("hash-1");
    expect(s.editorStatus).toBe("idle");
  });

  it("pins the tab scope onto the editor target — the single save source (audit finding 2)", () => {
    openDocumentEditor(DOC_ID, "body", "hash-1", " scope-x ");
    // The scope every save path (panel + Mod+S) reads, so a cross-scope tab always
    // writes to its own corpus, never the ambient active scope.
    expect(useViewStore.getState().editorTarget).toEqual({
      nodeId: DOC_ID,
      scope: "scope-x",
    });
  });

  it("normalizes malformed editor lifecycle payloads at the store seam", () => {
    expect(normalizeEditorTextValue("body")).toBe("body");
    expect(normalizeEditorTextValue(null)).toBe("");
    expect(
      normalizeEditorTextValue("x".repeat(EDITOR_DRAFT_TEXT_MAX_CHARS + 1)),
    ).toHaveLength(EDITOR_DRAFT_TEXT_MAX_CHARS);
    expect(
      normalizeEditorBlobHash("h".repeat(EDITOR_BLOB_HASH_MAX_CHARS + 1)),
    ).toHaveLength(EDITOR_BLOB_HASH_MAX_CHARS);

    openDocumentEditor(` ${DOC_ID} `, 42, null);
    expect(useViewStore.getState()).toMatchObject({
      editorTarget: { nodeId: DOC_ID },
      draftText: "",
      baseBlobHash: "",
      editorStatus: "idle",
    });

    updateEditorDraft({ text: "bad" });
    expect(useViewStore.getState()).toMatchObject({
      draftText: "",
      editorStatus: "idle",
    });

    updateEditorDraft("changed");
    markEditorSaving();
    markEditorSaved({ blobHash: "bad" }, "changed");
    expect(useViewStore.getState()).toMatchObject({
      editorStatus: "saved",
      baseBlobHash: "",
    });

    const longDraft = "x".repeat(EDITOR_DRAFT_TEXT_MAX_CHARS + 1);
    const longHash = "h".repeat(EDITOR_BLOB_HASH_MAX_CHARS + 1);
    openDocumentEditor(DOC_ID, longDraft, longHash);
    expect(useViewStore.getState().draftText).toHaveLength(EDITOR_DRAFT_TEXT_MAX_CHARS);
    expect(useViewStore.getState().baseBlobHash).toHaveLength(
      EDITOR_BLOB_HASH_MAX_CHARS,
    );

    closeDocumentEditor();
    openDocumentEditor({ id: DOC_ID }, "ignored", "hash");
    expect(useViewStore.getState().editorTarget).toBeNull();
  });

  it("setDraft marks dirty; an identical write is a no-op (no churn)", () => {
    openDocumentEditor(DOC_ID, "initial body", "hash-1");
    const before = useViewStore.getState();
    updateEditorDraft("edited body");
    expect(useViewStore.getState().draftText).toBe("edited body");
    expect(useViewStore.getState().editorStatus).toBe("dirty");
    const dirtyState = useViewStore.getState();
    updateEditorDraft("edited body");
    expect(useViewStore.getState()).toBe(dirtyState);
    expect(before.editorStatus).toBe("idle");
  });

  it("markSaving → markSaved adopts the new blob as the next concurrency base", () => {
    openDocumentEditor(DOC_ID, "body", "hash-1");
    updateEditorDraft("changed");
    markEditorSaving();
    expect(useViewStore.getState().editorStatus).toBe("saving");
    markEditorSaved("hash-2", "changed");
    expect(useViewStore.getState().editorStatus).toBe("saved");
    expect(useViewStore.getState().baseBlobHash).toBe("hash-2");
  });

  it("markSaved does NOT mask an edit-during-save (a raced keystroke keeps it dirty)", () => {
    openDocumentEditor(DOC_ID, "body", "hash-1");
    updateEditorDraft("changed");
    markEditorSaving();
    expect(useViewStore.getState().editorStatus).toBe("saving");
    // The textarea stays editable during the save — the user keeps typing mid-save.
    updateEditorDraft("changed again mid-save");
    expect(useViewStore.getState().editorStatus).toBe("dirty");
    markEditorSaved("hash-2", "changed");
    // The raced edit is unsaved: markSaved must KEEP "dirty" (not mask it as "saved")
    // so the unsaved-edit guard still protects it — but it adopts the new base blob so
    // the next save's expected_blob_hash matches the fresh on-disk body.
    expect(useViewStore.getState().editorStatus).toBe("dirty");
    expect(useViewStore.getState().baseBlobHash).toBe("hash-2");
  });

  it("markConflict / markFailed set the status and retain the draft", () => {
    openDocumentEditor(DOC_ID, "body", "hash-1");
    updateEditorDraft("unsaved work");
    markEditorConflict();
    expect(useViewStore.getState().editorStatus).toBe("conflict");
    expect(useViewStore.getState().draftText).toBe("unsaved work");
    markEditorFailed();
    expect(useViewStore.getState().editorStatus).toBe("save-failed");
    expect(useViewStore.getState().draftText).toBe("unsaved work");
  });

  it("maps typed write results onto the editor lifecycle state", () => {
    openDocumentEditor(DOC_ID, "body", "hash-1");
    updateEditorDraft("changed");
    markEditorSaving();

    applyEditorWriteResult(
      {
        kind: "saved",
        path: ".vault/research/alpha.md",
        blobHash: "hash-2",
        checks: [],
      },
      "changed",
    );
    expect(useViewStore.getState()).toMatchObject({
      editorStatus: "saved",
      baseBlobHash: "hash-2",
    });

    applyEditorWriteResult(
      { kind: "conflict", expected: "hash-2", actual: "hash-3" },
      "",
    );
    expect(useViewStore.getState().editorStatus).toBe("conflict");

    applyEditorWriteResult({ kind: "refused", checks: [], errors: ["bad"] }, "");
    expect(useViewStore.getState().editorStatus).toBe("save-failed");
  });

  it("closeEditor clears the whole slice back to idle", () => {
    openDocumentEditor(DOC_ID, "body", "hash-1");
    updateEditorDraft("changed");
    closeDocumentEditor();
    const s = useViewStore.getState();
    expect(s.editorTarget).toBeNull();
    expect(s.draftText).toBe("");
    expect(s.baseBlobHash).toBe("");
    expect(s.editorStatus).toBe("idle");
  });

  it("a scope swap clears the open editor (corpus isolation)", () => {
    openDocumentEditor(DOC_ID, "body", "hash-1");
    updateEditorDraft("unsaved");
    useViewStore.getState().setScope("wt-other");
    const s = useViewStore.getState();
    expect(s.editorTarget).toBeNull();
    expect(s.draftText).toBe("");
    expect(s.baseBlobHash).toBe("");
    expect(s.editorStatus).toBe("idle");
    useViewStore.getState().setScope(null);
  });

  it("projects the document editor read model for chrome consumers", () => {
    openDocumentEditor(DOC_ID, "body", "hash-1", "scope-x");
    let view = deriveDocumentEditorView(useViewStore.getState(), DOC_ID);
    expect(view).toMatchObject({
      isEditing: true,
      // The pinned editor scope is surfaced so the panel save reads the SAME source
      // as the Mod+S keybinding (audit finding 2).
      scope: "scope-x",
      draftText: "body",
      baseBlobHash: "hash-1",
      status: "idle",
      statusLabel: "Saved",
      statusTone: "muted",
      statusToneClass: "text-ink-muted",
      canSave: false,
    });

    updateEditorDraft("changed");
    view = deriveDocumentEditorView(useViewStore.getState(), DOC_ID);
    expect(view).toMatchObject({
      draftText: "changed",
      status: "dirty",
      statusLabel: "Unsaved changes",
      statusTone: "ink",
      statusToneClass: "text-ink",
      canSave: true,
    });

    markEditorConflict();
    view = deriveDocumentEditorView(useViewStore.getState(), DOC_ID);
    expect(view).toMatchObject({
      status: "conflict",
      statusLabel: "Conflict — the file changed on disk",
      statusTone: "broken",
      statusToneClass: "text-state-broken",
      canSave: false,
    });

    expect(
      deriveDocumentEditorView(useViewStore.getState(), "doc:other"),
    ).toMatchObject({
      isEditing: false,
      draftText: "changed",
      baseBlobHash: "hash-1",
    });
    expect(
      deriveDocumentEditorView(useViewStore.getState(), ` ${DOC_ID} `),
    ).toMatchObject({
      isEditing: true,
    });
    expect(
      deriveDocumentEditorView(useViewStore.getState(), { id: DOC_ID }),
    ).toMatchObject({
      isEditing: false,
    });
  });

  it("projects markdown editor seed fields from the content view", () => {
    expect(deriveMarkdownEditorDocumentView(content())).toEqual({
      canEdit: true,
      initialText: content().text,
      initialBlobHash: "hash-1",
      properties: {
        tags: "#plan, #editor",
        date: "2026-06-18",
        related: "2026-06-18-reader-plan",
      },
    });
  });

  it("disables editing and falls back to empty seeds when content is unavailable", () => {
    expect(
      deriveMarkdownEditorDocumentView(
        content({
          available: false,
          blobHash: undefined,
          text: "",
        }),
      ),
    ).toEqual({
      canEdit: false,
      initialText: "",
      initialBlobHash: "",
      properties: { tags: "", date: "", related: "" },
    });
  });

  it("disables editing when the body was truncated (saving a prefix would lose the tail)", () => {
    const view = deriveMarkdownEditorDocumentView(
      content({
        truncated: { total_bytes: 1_000_000, returned_bytes: 524_288, reason: "cap" },
      }),
    );
    expect(view.canEdit).toBe(false);
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
