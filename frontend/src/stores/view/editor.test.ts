import { beforeEach, describe, expect, it } from "vitest";

import {
  applyEditorWriteResult,
  applyRenameEditorResult,
  conformanceChecksOf,
  closeDocumentEditor,
  deriveMarkdownEditorFrontmatterPatch,
  deriveMarkdownEditorChromeView,
  MARKDOWN_EDITOR_ADVISORIES_MAX_ITEMS,
  MARKDOWN_EDITOR_ADVISORY_TEXT_MAX_CHARS,
  MARKDOWN_EDITOR_DRAFT_TEXT_MAX_CHARS,
  normalizeMarkdownEditorAdvisories,
  normalizeMarkdownEditorFrontmatterDraft,
  normalizeMarkdownEditorFrontmatterDraftState,
  openDocumentEditor,
  updateEditorDraft,
} from "./editor";
import { useViewStore } from "./viewStore";

describe("editor view seam", () => {
  beforeEach(() => {
    closeDocumentEditor();
  });

  it("projects markdown rename draft and advisories behind the editor seam", () => {
    expect(
      deriveMarkdownEditorChromeView(
        {
          nodeId: "doc:alpha",
          renameDraft: " beta ",
          frontmatterDraft: { tags: "#ui", date: "2026-06-19", related: "alpha" },
          advisories: [{ severity: "warn", message: "check frontmatter" }],
        },
        "doc:alpha",
        "alpha",
        { tags: "", date: "", related: "" },
      ),
    ).toEqual({
      currentStem: "alpha",
      renameDraft: " beta ",
      renameTarget: "beta",
      frontmatterDraft: { tags: "#ui", date: "2026-06-19", related: "alpha" },
      hasAdvisories: true,
      advisoriesLabel: { key: "documents:editor.advisories.label" },
      advisoryRows: [
        {
          key: "check-0",
          toneClass: "text-ink-muted",
          marker: "!",
          message: "check frontmatter",
          messageDescriptor: null,
          fixable: false,
        },
      ],
    });

    expect(
      deriveMarkdownEditorChromeView(
        {
          nodeId: "doc:other",
          renameDraft: "other",
          frontmatterDraft: { tags: "stale", date: "", related: "" },
          advisories: [],
        },
        "doc:alpha",
        "alpha",
        { tags: "#source", date: "2026-06-19", related: "source" },
      ),
    ).toMatchObject({
      renameDraft: "alpha",
      renameTarget: null,
      frontmatterDraft: { tags: "#source", date: "2026-06-19", related: "source" },
      hasAdvisories: false,
      advisoryRows: [],
    });

    expect(
      deriveMarkdownEditorChromeView(
        {
          nodeId: "doc:alpha",
          renameDraft: "alpha",
          frontmatterDraft: { tags: "", date: "", related: "" },
          advisories: [
            {
              check: "frontmatter",
              severity: "error",
              fixable: true,
            },
          ],
        },
        "doc:alpha",
        "alpha",
        { tags: "", date: "", related: "" },
      ).advisoryRows,
    ).toEqual([
      {
        key: "frontmatter-0",
        toneClass: "text-state-broken",
        marker: "x",
        message: "frontmatter",
        messageDescriptor: null,
        fixable: true,
      },
    ]);
  });

  it("extracts only structured conformance checks from write results", () => {
    expect(
      conformanceChecksOf({
        kind: "saved",
        checks: [{ message: "ok" }, null, "bad"],
      }),
    ).toEqual([{ message: "ok" }]);

    expect(
      conformanceChecksOf({
        kind: "conflict",
      }),
    ).toEqual([]);
  });

  it("normalizes frontmatter form drafts for the write seam", () => {
    expect(
      deriveMarkdownEditorFrontmatterPatch({
        tags: " #state, ui ,, ",
        date: " 2026-06-19 ",
        related: "alpha, beta ,",
      }),
    ).toEqual({
      tags: ["#state", "ui"],
      date: "2026-06-19",
      related: ["alpha", "beta"],
    });

    expect(
      deriveMarkdownEditorFrontmatterPatch({
        tags: "",
        date: "   ",
        related: "",
      }),
    ).toEqual({
      tags: [],
      date: undefined,
      related: [],
    });
  });

  it("normalizes malformed editor frontmatter draft payloads at the store seam", () => {
    expect(normalizeMarkdownEditorFrontmatterDraft(null)).toEqual({});
    expect(normalizeMarkdownEditorFrontmatterDraftState(null)).toEqual({
      tags: "",
      date: "",
      related: "",
    });
    expect(
      normalizeMarkdownEditorFrontmatterDraft({
        tags: "#ok",
        date: 20260619,
        related: ["bad"],
        extra: "ignored",
      }),
    ).toEqual({ tags: "#ok", date: "", related: "" });
    expect(
      normalizeMarkdownEditorFrontmatterDraftState({
        tags: "#ok",
        date: 20260619,
      }),
    ).toEqual({ tags: "#ok", date: "", related: "" });

    const overlong = "x".repeat(MARKDOWN_EDITOR_DRAFT_TEXT_MAX_CHARS + 1);
    expect(
      normalizeMarkdownEditorFrontmatterDraft({
        tags: overlong,
        date: overlong,
        related: overlong,
      }),
    ).toEqual({
      tags: overlong.slice(0, MARKDOWN_EDITOR_DRAFT_TEXT_MAX_CHARS),
      date: overlong.slice(0, MARKDOWN_EDITOR_DRAFT_TEXT_MAX_CHARS),
      related: overlong.slice(0, MARKDOWN_EDITOR_DRAFT_TEXT_MAX_CHARS),
    });
  });

  it("bounds markdown editor advisories before projection", () => {
    const overlong = "x".repeat(MARKDOWN_EDITOR_ADVISORY_TEXT_MAX_CHARS + 1);
    const advisories = normalizeMarkdownEditorAdvisories([
      null,
      "bad",
      {
        check: overlong,
        severity: "error",
        message: overlong,
        fixable: true,
      },
      ...Array.from(
        { length: MARKDOWN_EDITOR_ADVISORIES_MAX_ITEMS + 3 },
        (_, index) => ({
          check: `check-${index}`,
          message: `message-${index}`,
        }),
      ),
    ]);

    expect(advisories).toHaveLength(MARKDOWN_EDITOR_ADVISORIES_MAX_ITEMS);
    expect(advisories[0]).toEqual({
      check: overlong.slice(0, MARKDOWN_EDITOR_ADVISORY_TEXT_MAX_CHARS),
      severity: "error",
      message: overlong.slice(0, MARKDOWN_EDITOR_ADVISORY_TEXT_MAX_CHARS),
      fixable: true,
    });

    const rows = deriveMarkdownEditorChromeView(
      {
        nodeId: "doc:alpha",
        renameDraft: "alpha",
        frontmatterDraft: { tags: "", date: "", related: "" },
        advisories,
      },
      "doc:alpha",
      "alpha",
      { tags: "", date: "", related: "" },
    ).advisoryRows;

    expect(rows).toHaveLength(MARKDOWN_EDITOR_ADVISORIES_MAX_ITEMS);
    expect(rows[0].message).toHaveLength(MARKDOWN_EDITOR_ADVISORY_TEXT_MAX_CHARS);
  });

  it("normalizes source frontmatter before exposing editor chrome", () => {
    expect(
      deriveMarkdownEditorChromeView(
        {
          nodeId: "doc:other",
          renameDraft: "other",
          frontmatterDraft: {
            tags: "stale",
            date: "stale",
            related: "stale",
          },
          advisories: [],
        },
        "doc:alpha",
        "alpha",
        { tags: "#source", date: 20260619, related: ["bad"] },
      ),
    ).toMatchObject({
      frontmatterDraft: { tags: "#source", date: "", related: "" },
    });
  });

  it("maps typed write and rename outcomes onto editor status", () => {
    openDocumentEditor("doc:alpha", "body", "old");

    applyEditorWriteResult(
      { kind: "saved", path: "alpha.md", blobHash: "new", checks: [] },
      "body",
    );
    expect(useViewStore.getState()).toMatchObject({
      editorStatus: "saved",
      baseBlobHash: "new",
    });

    applyEditorWriteResult({ kind: "refused", checks: [], errors: [] }, "body");
    expect(useViewStore.getState().editorStatus).toBe("save-failed");

    applyRenameEditorResult({ kind: "conflict", expected: "new", actual: "other" });
    expect(useViewStore.getState().editorStatus).toBe("conflict");
  });

  it("advances editorBaseText to the committed text when a save resolves (diff shows clean after save)", () => {
    // Open with initial body; edit to diverge the draft; simulate a successful save.
    openDocumentEditor("doc:alpha", "initial body", "hash-0");
    updateEditorDraft("edited body");
    // editorBaseText is still "initial body" — diff would show changes.
    expect(useViewStore.getState().editorBaseText).toBe("initial body");

    // Simulate the save landing with the committed text.
    applyEditorWriteResult(
      { kind: "saved", path: "alpha.md", blobHash: "hash-1", checks: [] },
      "edited body",
    );
    // editorBaseText must now equal what was saved, so the diff is empty.
    expect(useViewStore.getState().editorBaseText).toBe("edited body");
    // baseBlobHash advances as before.
    expect(useViewStore.getState().baseBlobHash).toBe("hash-1");
  });

  it("advances editorBaseText to savedText even when an edit raced the save (edit-during-save)", () => {
    // Open; edit; simulate save in-flight; type again to race the save.
    openDocumentEditor("doc:alpha", "v1", "hash-0");
    updateEditorDraft("v2"); // text sent to wire
    // Save lands while the user has already typed v3.
    updateEditorDraft("v3"); // edit-during-save race
    applyEditorWriteResult(
      { kind: "saved", path: "alpha.md", blobHash: "hash-1", checks: [] },
      "v2",
    );
    // Status stays dirty (v3 is unsaved), but baseText advances to v2 (what's on disk).
    expect(useViewStore.getState().editorStatus).toBe("dirty");
    expect(useViewStore.getState().editorBaseText).toBe("v2");
    // v3 is still the live draft.
    expect(useViewStore.getState().draftText).toBe("v3");
  });
});

describe("agent-edit reconcile (editor-change-fidelity D2/D4)", () => {
  beforeEach(() => closeDocumentEditor());

  it("clean arm: adopts the new base and captures the agent baseline", () => {
    openDocumentEditor("doc:alpha", "line one\nline two\n", "hash-0");
    // An agent applied externally: the served body advanced under a CLEAN draft.
    useViewStore.getState().reconcileEditorBase("line one\nAGENT two\n", "hash-1");
    const s = useViewStore.getState();
    // Base + draft adopt the new body; the concurrency base advances; status idle.
    expect(s.editorBaseText).toBe("line one\nAGENT two\n");
    expect(s.draftText).toBe("line one\nAGENT two\n");
    expect(s.baseBlobHash).toBe("hash-1");
    expect(s.editorStatus).toBe("idle");
    // The pre-apply body is captured so the app can decorate the agent's change,
    // starting UNSEEN.
    expect(s.editorAgentBaseline).toBe("line one\nline two\n");
    expect(s.editorAgentSeen).toBe(false);
  });

  it("dirty arm: NEVER silently overwrites the user's draft", () => {
    // THE safety guarantee. The user is mid-edit when an agent applies.
    openDocumentEditor("doc:alpha", "original\n", "hash-0");
    updateEditorDraft("my unsaved work\n");
    useViewStore.getState().reconcileEditorBase("agent rewrote everything\n", "hash-1");
    const s = useViewStore.getState();
    // The draft is preserved byte-for-byte; the base is NOT advanced; no agent
    // baseline is captured. (The eventual save hits the existing conflict path.)
    expect(s.draftText).toBe("my unsaved work\n");
    expect(s.editorBaseText).toBe("original\n");
    expect(s.baseBlobHash).toBe("hash-0");
    expect(s.editorAgentBaseline).toBeNull();
  });

  it("KEEPS the agent baseline across user edits (D11 anchor stability)", () => {
    openDocumentEditor("doc:alpha", "a\nb\n", "hash-0");
    useViewStore.getState().reconcileEditorBase("a\nB\n", "hash-1");
    expect(useViewStore.getState().editorAgentBaseline).toBe("a\nb\n");
    // The user edits elsewhere → the baseline PERSISTS (marks re-project, not clear).
    updateEditorDraft("a\nB\nc\n");
    expect(useViewStore.getState().editorAgentBaseline).toBe("a\nb\n");
  });

  it("keeps the OLDEST baseline across stacked agent applies (D11)", () => {
    openDocumentEditor("doc:alpha", "v1\n", "hash-0");
    useViewStore.getState().reconcileEditorBase("v2\n", "hash-1");
    expect(useViewStore.getState().editorAgentBaseline).toBe("v1\n");
    // A second agent apply while still clean must not reset the baseline to v2 —
    // the user last SAW v1, so marks compose from v1.
    useViewStore.getState().reconcileEditorBase("v3\n", "hash-2");
    expect(useViewStore.getState().editorAgentBaseline).toBe("v1\n");
    expect(useViewStore.getState().editorBaseText).toBe("v3\n");
  });

  it("a save folds provenance into the ledger — clears the agent baseline (D11)", () => {
    openDocumentEditor("doc:alpha", "a\nb\n", "hash-0");
    useViewStore.getState().reconcileEditorBase("a\nB\n", "hash-1");
    expect(useViewStore.getState().editorAgentBaseline).toBe("a\nb\n");
    // Simulate a save landing.
    applyEditorWriteResult(
      { kind: "saved", path: "alpha.md", blobHash: "hash-2", checks: [] },
      "a\nB\n",
    );
    expect(useViewStore.getState().editorAgentBaseline).toBeNull();
    expect(useViewStore.getState().editorAgentSeen).toBe(false);
  });

  it("acknowledge flips the pending agent changes from new to seen", () => {
    openDocumentEditor("doc:alpha", "a\nb\n", "hash-0");
    useViewStore.getState().reconcileEditorBase("a\nB\n", "hash-1");
    expect(useViewStore.getState().editorAgentSeen).toBe(false);
    useViewStore.getState().acknowledgeAgentChanges();
    expect(useViewStore.getState().editorAgentSeen).toBe(true);
  });

  it("acknowledge is a no-op when no agent change is pending", () => {
    openDocumentEditor("doc:alpha", "a\n", "hash-0");
    useViewStore.getState().acknowledgeAgentChanges();
    expect(useViewStore.getState().editorAgentSeen).toBe(false);
  });

  it("reconcile is inert when no editor is open", () => {
    closeDocumentEditor();
    useViewStore.getState().reconcileEditorBase("whatever", "hash-9");
    expect(useViewStore.getState().editorTarget).toBeNull();
    expect(useViewStore.getState().editorBaseText).toBe("");
  });
});
