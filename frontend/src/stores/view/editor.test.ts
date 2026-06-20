import { beforeEach, describe, expect, it } from "vitest";

import {
  applyEditorWriteResult,
  applyRenameEditorResult,
  conformanceChecksOf,
  closeDocumentEditor,
  deriveMarkdownEditorFrontmatterPatch,
  deriveMarkdownEditorChromeView,
  normalizeMarkdownEditorFrontmatterDraft,
  normalizeMarkdownEditorFrontmatterDraftState,
  openDocumentEditor,
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
      advisoriesLabel: "Conformance advisories",
      advisoryRows: [
        {
          key: "check-0",
          toneClass: "text-ink-muted",
          marker: "!",
          message: "check frontmatter",
          fixableLabel: null,
          fixableSuffix: "",
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
        fixableLabel: "fixable",
        fixableSuffix: " - fixable",
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

    applyEditorWriteResult({
      kind: "saved",
      path: "alpha.md",
      blobHash: "new",
      checks: [],
    });
    expect(useViewStore.getState()).toMatchObject({
      editorStatus: "saved",
      baseBlobHash: "new",
    });

    applyEditorWriteResult({ kind: "refused", checks: [], errors: [] });
    expect(useViewStore.getState().editorStatus).toBe("save-failed");

    applyRenameEditorResult({ kind: "conflict", expected: "new", actual: "other" });
    expect(useViewStore.getState().editorStatus).toBe("conflict");
  });
});
