import { beforeEach, describe, expect, it } from "vitest";

import {
  CREATE_DOC_DRAFT_TEXT_MAX_CHARS,
  CREATE_DOC_ERROR_MAX_CHARS,
  DEFAULT_CREATE_DOC_TYPE,
  deriveCreateDocSubmission,
  isCreateDocType,
  normalizeCreateDocChromeView,
  normalizeCreateDocDraftText,
  normalizeCreateDocError,
  normalizeCreateDocType,
  resetCreateDocChrome,
  setCreateDocError,
  setCreateDocFeature,
  setCreateDocTitle,
  setCreateDocType,
  toggleCreateDocDialog,
  useCreateDocChromeStore,
} from "./createDocChrome";

describe("createDocChrome store", () => {
  beforeEach(() => resetCreateDocChrome());

  it("opens and captures the create-document draft through the store seam", () => {
    toggleCreateDocDialog();
    setCreateDocType("adr");
    setCreateDocFeature("dashboard");
    setCreateDocTitle("Boundary Decision");
    setCreateDocError("Feature and title are required");

    expect(useCreateDocChromeStore.getState()).toMatchObject({
      open: true,
      docType: "adr",
      feature: "dashboard",
      title: "Boundary Decision",
      error: "Feature and title are required",
    });
  });

  it("resets draft state when the dialog closes", () => {
    toggleCreateDocDialog();
    setCreateDocType("plan");
    setCreateDocFeature("git");
    setCreateDocTitle("Git State");
    setCreateDocError("Create failed");

    toggleCreateDocDialog();

    expect(useCreateDocChromeStore.getState()).toMatchObject({
      open: false,
      docType: DEFAULT_CREATE_DOC_TYPE,
      feature: "",
      title: "",
      error: null,
    });
  });

  it("accepts only registered document types at the app boundary", () => {
    expect(isCreateDocType("research")).toBe(true);
    expect(isCreateDocType("story")).toBe(false);
  });

  it("ignores unsupported document types at the store boundary", () => {
    setCreateDocType("plan");
    setCreateDocType("story");
    setCreateDocType(null);

    expect(useCreateDocChromeStore.getState().docType).toBe("plan");
  });

  it("normalizes corrupted chrome state before reopening the dialog", () => {
    const longDraft = "x".repeat(CREATE_DOC_DRAFT_TEXT_MAX_CHARS + 8);
    const longError = "e".repeat(CREATE_DOC_ERROR_MAX_CHARS + 8);
    useCreateDocChromeStore.setState({
      open: false,
      docType: "story",
      feature: longDraft,
      title: { value: "Bad" },
      error: longError,
    } as unknown as ReturnType<typeof useCreateDocChromeStore.getState>);

    expect(normalizeCreateDocChromeView(useCreateDocChromeStore.getState())).toEqual({
      open: false,
      docType: DEFAULT_CREATE_DOC_TYPE,
      feature: longDraft.slice(0, CREATE_DOC_DRAFT_TEXT_MAX_CHARS),
      title: "",
      error: longError.slice(0, CREATE_DOC_ERROR_MAX_CHARS),
    });

    toggleCreateDocDialog();

    expect(useCreateDocChromeStore.getState()).toMatchObject({
      open: true,
      docType: DEFAULT_CREATE_DOC_TYPE,
      feature: longDraft.slice(0, CREATE_DOC_DRAFT_TEXT_MAX_CHARS),
      title: "",
      error: null,
    });
  });

  it("normalizes padded document types at the store boundary", () => {
    expect(normalizeCreateDocType(" adr ")).toBe("adr");
    expect(normalizeCreateDocType(" story ")).toBeNull();

    setCreateDocType(" plan ");

    expect(useCreateDocChromeStore.getState().docType).toBe("plan");
  });

  it("normalizes draft text and errors at the store boundary", () => {
    expect(normalizeCreateDocDraftText(" dashboard ")).toBe(" dashboard ");
    expect(normalizeCreateDocDraftText(null)).toBe("");
    expect(normalizeCreateDocDraftText({ value: "dashboard" })).toBe("");
    expect(normalizeCreateDocError("Create failed")).toBe("Create failed");
    expect(normalizeCreateDocError("   ")).toBeNull();
    expect(normalizeCreateDocError({ message: "Create failed" })).toBeNull();

    setCreateDocFeature(null);
    setCreateDocTitle({ value: "Git State" });
    setCreateDocError({ message: "Create failed" });

    expect(useCreateDocChromeStore.getState()).toMatchObject({
      feature: "",
      title: "",
      error: null,
    });
  });

  it("bounds draft text and error strings at the store boundary", () => {
    const longDraft = "x".repeat(CREATE_DOC_DRAFT_TEXT_MAX_CHARS + 8);
    const longError = "e".repeat(CREATE_DOC_ERROR_MAX_CHARS + 8);

    expect(normalizeCreateDocDraftText(longDraft)).toHaveLength(
      CREATE_DOC_DRAFT_TEXT_MAX_CHARS,
    );
    expect(normalizeCreateDocError(longError)).toHaveLength(
      CREATE_DOC_ERROR_MAX_CHARS,
    );

    setCreateDocFeature(longDraft);
    setCreateDocTitle(longDraft);
    setCreateDocError(longError);

    expect(useCreateDocChromeStore.getState().feature).toHaveLength(
      CREATE_DOC_DRAFT_TEXT_MAX_CHARS,
    );
    expect(useCreateDocChromeStore.getState().title).toHaveLength(
      CREATE_DOC_DRAFT_TEXT_MAX_CHARS,
    );
    expect(useCreateDocChromeStore.getState().error).toHaveLength(
      CREATE_DOC_ERROR_MAX_CHARS,
    );
  });

  it("derives normalized create submissions at the store seam", () => {
    expect(
      deriveCreateDocSubmission({
        docType: " adr ",
        feature: " dashboard ",
        title: " Boundary Decision ",
      }),
    ).toEqual({
      ok: true,
      docType: "adr",
      feature: "dashboard",
      title: "Boundary Decision",
    });

    expect(
      deriveCreateDocSubmission({
        docType: "plan",
        feature: " ",
        title: "Git State",
      }),
    ).toEqual({
      ok: false,
      error: "Feature and title are required",
    });

    expect(
      deriveCreateDocSubmission({
        docType: "story",
        feature: "dashboard",
        title: "Unsupported Doc",
      }),
    ).toEqual({
      ok: false,
      error: "Unsupported document type",
    });

    expect(deriveCreateDocSubmission(null)).toEqual({
      ok: false,
      error: "Unsupported document type",
    });
    expect(
      deriveCreateDocSubmission({
        docType: "plan",
        feature: { value: "dashboard" },
        title: ["Git State"],
      }),
    ).toEqual({
      ok: false,
      error: "Feature and title are required",
    });
  });
});
