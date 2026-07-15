import { beforeEach, describe, expect, it } from "vitest";

import type { FeatureCoverage } from "../server/engine";
import {
  CREATE_DOC_DRAFT_TEXT_MAX_CHARS,
  CREATE_DOC_RELATED_MAX,
  DEFAULT_CREATE_DOC_STAGE,
  DEFAULT_CREATE_DOC_TYPE,
  deriveCreateDocSubmission,
  deriveOfferedCreateDocTypes,
  goToCreateDocDocumentStage,
  goToCreateDocFeatureStage,
  isCreateDocStage,
  isCreateDocType,
  isCreateDocTypeEligible,
  normalizeCreateDocChromeView,
  normalizeCreateDocDraftText,
  normalizeCreateDocError,
  normalizeCreateDocRelated,
  normalizeCreateDocStage,
  normalizeCreateDocType,
  closeCreateDocDialog,
  reconcileCreateDocType,
  resetCreateDocChrome,
  seedRelatedFromCoverage,
  setCreateDocError,
  setCreateDocFeature,
  setCreateDocRelated,
  setCreateDocTitle,
  setCreateDocType,
  toggleCreateDocDialog,
  useCreateDocChromeStore,
} from "./createDocChrome";

/** A served coverage fixture (feature-group-authoring wire shape) with the given
 *  present types, mirroring the engine projection's per-type entries. */
function coverage(
  overrides: Partial<
    Record<string, { newestStem?: string; eligible: boolean; note?: string }>
  >,
  nextStep?: string,
): FeatureCoverage {
  const types = ["research", "reference", "adr", "plan", "exec", "audit"].map(
    (docType) => {
      const o = overrides[docType];
      const present = o?.newestStem !== undefined;
      return {
        doc_type: docType,
        present,
        count: present ? 1 : 0,
        newest_stem: o?.newestStem,
        eligible: o?.eligible ?? false,
        note: o?.note,
      };
    },
  );
  return {
    feature: "x",
    types,
    missing: types.filter((t) => !t.present).map((t) => t.doc_type),
    next_step: nextStep,
  };
}

describe("createDocChrome store", () => {
  beforeEach(() => resetCreateDocChrome());

  it("opens at stage 1 and captures the create-document draft through the store seam", () => {
    toggleCreateDocDialog();
    setCreateDocType("adr");
    setCreateDocFeature("dashboard");
    setCreateDocTitle("Boundary Decision");
    setCreateDocRelated(["2026-07-14-dashboard-research"]);
    setCreateDocError("complete-required-fields");

    expect(useCreateDocChromeStore.getState()).toMatchObject({
      open: true,
      stage: "feature",
      docType: "adr",
      feature: "dashboard",
      title: "Boundary Decision",
      related: ["2026-07-14-dashboard-research"],
      error: "complete-required-fields",
    });
  });

  it("advances to and returns from the document stage, clearing stale errors", () => {
    toggleCreateDocDialog();
    setCreateDocError("project-changed");
    goToCreateDocDocumentStage();
    expect(useCreateDocChromeStore.getState()).toMatchObject({
      stage: "document",
      error: null,
    });
    setCreateDocError("create-failed");
    goToCreateDocFeatureStage();
    expect(useCreateDocChromeStore.getState()).toMatchObject({
      stage: "feature",
      error: null,
    });
  });

  it("preserves the draft across dismiss and clears only the transient error", () => {
    // create-panel-hardening ADR: Escape/Cancel/backdrop must never wipe typed
    // work — dismiss keeps the draft; only the transient error and the one-shot
    // focus flag clear.
    toggleCreateDocDialog();
    goToCreateDocDocumentStage();
    setCreateDocType("plan");
    setCreateDocFeature("git");
    setCreateDocTitle("Git State");
    setCreateDocRelated(["2026-07-14-git-adr"]);
    setCreateDocError("create-failed");

    closeCreateDocDialog();

    expect(useCreateDocChromeStore.getState()).toMatchObject({
      open: false,
      docType: "plan",
      feature: "git",
      title: "Git State",
      related: ["2026-07-14-git-adr"],
      error: null,
      focusFeatureField: false,
    });
  });

  it("toggle-close also preserves the draft (the keymap toggle is a dismiss)", () => {
    toggleCreateDocDialog();
    setCreateDocFeature("git");
    setCreateDocTitle("Git State");
    toggleCreateDocDialog();
    expect(useCreateDocChromeStore.getState()).toMatchObject({
      open: false,
      feature: "git",
      title: "Git State",
    });
  });

  it("resets the whole draft only on the successful-create path", () => {
    toggleCreateDocDialog();
    setCreateDocFeature("git");
    setCreateDocTitle("Git State");
    setCreateDocRelated(["2026-07-14-git-adr"]);

    resetCreateDocChrome();

    expect(useCreateDocChromeStore.getState()).toMatchObject({
      open: false,
      stage: DEFAULT_CREATE_DOC_STAGE,
      docType: DEFAULT_CREATE_DOC_TYPE,
      feature: "",
      title: "",
      related: [],
      error: null,
    });
  });

  it("reopens the preserved draft at stage 1 after a document-stage dismiss", () => {
    toggleCreateDocDialog();
    goToCreateDocDocumentStage();
    setCreateDocFeature("git");
    closeCreateDocDialog();
    toggleCreateDocDialog(); // reopen
    const state = useCreateDocChromeStore.getState();
    expect(state.stage).toBe("feature");
    expect(state.feature).toBe("git");
  });

  it("accepts only registered document types and stages at the app boundary", () => {
    expect(isCreateDocType("research")).toBe(true);
    expect(isCreateDocType("reference")).toBe(true);
    expect(isCreateDocType("audit")).toBe(true);
    // exec left the offered set (ADR D4).
    expect(isCreateDocType("exec")).toBe(false);
    expect(isCreateDocType("story")).toBe(false);
    expect(isCreateDocStage("feature")).toBe(true);
    expect(isCreateDocStage("document")).toBe(true);
    expect(isCreateDocStage("wizard")).toBe(false);
  });

  it("ignores unsupported document types at the store boundary", () => {
    setCreateDocType("plan");
    setCreateDocType("exec");
    setCreateDocType(null);

    expect(useCreateDocChromeStore.getState().docType).toBe("plan");
  });

  it("normalizes corrupted chrome state before reopening the dialog", () => {
    const longDraft = "x".repeat(CREATE_DOC_DRAFT_TEXT_MAX_CHARS + 8);
    useCreateDocChromeStore.setState({
      open: false,
      stage: "wizard",
      docType: "exec",
      feature: longDraft,
      title: { value: "Bad" },
      related: "not-an-array",
      error: "hostile backend diagnostic /private/path",
    } as unknown as ReturnType<typeof useCreateDocChromeStore.getState>);

    expect(normalizeCreateDocChromeView(useCreateDocChromeStore.getState())).toEqual({
      open: false,
      stage: DEFAULT_CREATE_DOC_STAGE,
      docType: DEFAULT_CREATE_DOC_TYPE,
      feature: longDraft.slice(0, CREATE_DOC_DRAFT_TEXT_MAX_CHARS),
      title: "",
      related: [],
      error: null,
      focusFeatureField: false,
    });

    toggleCreateDocDialog();

    expect(useCreateDocChromeStore.getState()).toMatchObject({
      open: true,
      stage: DEFAULT_CREATE_DOC_STAGE,
      docType: DEFAULT_CREATE_DOC_TYPE,
      feature: longDraft.slice(0, CREATE_DOC_DRAFT_TEXT_MAX_CHARS),
      title: "",
      error: null,
    });
  });

  it("normalizes padded document types and stages at the store boundary", () => {
    expect(normalizeCreateDocType(" adr ")).toBe("adr");
    expect(normalizeCreateDocType(" exec ")).toBeNull();
    expect(normalizeCreateDocStage(" document ")).toBe("document");
    expect(normalizeCreateDocStage(" nope ")).toBe(DEFAULT_CREATE_DOC_STAGE);

    setCreateDocType(" plan ");

    expect(useCreateDocChromeStore.getState().docType).toBe("plan");
  });

  it("normalizes and bounds the editable related list at the store boundary", () => {
    expect(normalizeCreateDocRelated(["  a  ", "a", "", 5, "b"])).toEqual(["a", "b"]);
    expect(normalizeCreateDocRelated("nope")).toEqual([]);
    const many = Array.from({ length: CREATE_DOC_RELATED_MAX + 5 }, (_, i) => `s${i}`);
    expect(normalizeCreateDocRelated(many)).toHaveLength(CREATE_DOC_RELATED_MAX);

    setCreateDocRelated(["dup", "dup", " keep "]);
    expect(useCreateDocChromeStore.getState().related).toEqual(["dup", "keep"]);
  });

  it("normalizes draft text and errors at the store boundary", () => {
    expect(normalizeCreateDocDraftText(" dashboard ")).toBe(" dashboard ");
    expect(normalizeCreateDocDraftText(null)).toBe("");
    expect(normalizeCreateDocError("create-failed")).toBe("create-failed");
    expect(normalizeCreateDocError("Create failed at /private/path")).toBeNull();
    expect(normalizeCreateDocError("   ")).toBeNull();

    setCreateDocFeature(null);
    setCreateDocTitle({ value: "Git State" });
    setCreateDocError({ message: "Create failed" });

    expect(useCreateDocChromeStore.getState()).toMatchObject({
      feature: "",
      title: "",
      error: null,
    });
  });

  it("derives normalized create submissions carrying the related links", () => {
    expect(
      deriveCreateDocSubmission({
        docType: " adr ",
        feature: " dashboard ",
        title: " Boundary Decision ",
        related: ["  2026-07-14-dashboard-research  ", ""],
      }),
    ).toEqual({
      ok: true,
      docType: "adr",
      feature: "dashboard",
      title: "Boundary Decision",
      related: ["2026-07-14-dashboard-research"],
    });

    expect(
      deriveCreateDocSubmission({
        docType: "plan",
        feature: " ",
        title: "Git State",
      }),
    ).toEqual({ ok: false, issue: "complete-required-fields" });

    expect(
      deriveCreateDocSubmission({
        docType: "exec",
        feature: "dashboard",
        title: "Plan-derived",
      }),
    ).toEqual({ ok: false, issue: "choose-document-type" });

    expect(deriveCreateDocSubmission(null)).toEqual({
      ok: false,
      issue: "choose-document-type",
    });
  });
});

describe("createDocChrome coverage derivations", () => {
  it("offers every pipeline type except exec, with served eligibility and reasons", () => {
    const cov = coverage(
      {
        research: { newestStem: "2026-07-14-x-research", eligible: true },
        adr: { eligible: false, note: "requires-research-or-reference" },
      },
      "adr",
    );
    const offered = deriveOfferedCreateDocTypes(cov);
    const offeredTypes = offered.map((o) => o.docType);
    expect(offeredTypes).toEqual(["research", "reference", "adr", "plan", "audit"]);
    // exec never enters the offered set (ADR D4).
    expect(offeredTypes).not.toContain("exec");
    const research = offered.find((o) => o.docType === "research")!;
    expect(research).toMatchObject({ present: true, eligible: true });
    const adr = offered.find((o) => o.docType === "adr")!;
    expect(adr).toMatchObject({
      eligible: false,
      note: "requires-research-or-reference",
    });
  });

  it("falls back to the always-open entry points when coverage is absent", () => {
    const offered = deriveOfferedCreateDocTypes(undefined);
    expect(offered.find((o) => o.docType === "research")!.eligible).toBe(true);
    expect(offered.find((o) => o.docType === "reference")!.eligible).toBe(true);
    expect(offered.find((o) => o.docType === "adr")!.eligible).toBe(false);
    expect(offered.find((o) => o.docType === "plan")!.eligible).toBe(false);
    expect(offered.find((o) => o.docType === "audit")!.eligible).toBe(false);
  });

  it("reads served eligibility, never recomputing it", () => {
    const cov = coverage({
      research: { newestStem: "2026-07-14-x-research", eligible: true },
      adr: { eligible: true },
    });
    expect(isCreateDocTypeEligible("adr", cov)).toBe(true);
    expect(isCreateDocTypeEligible("plan", cov)).toBe(false);
    // Entry points stay eligible with no served coverage.
    expect(isCreateDocTypeEligible("research", undefined)).toBe(true);
    expect(isCreateDocTypeEligible("adr", undefined)).toBe(false);
  });

  it("reconciles an ineligible selection to the advised next step, then first eligible", () => {
    // adr selected but ineligible (no upstream): reset to the advised next step.
    const noUpstream = coverage(
      { adr: { eligible: false, note: "requires-research-or-reference" } },
      "research",
    );
    expect(reconcileCreateDocType("adr", noUpstream)).toBe("research");

    // An eligible selection stands.
    const researchPresent = coverage(
      {
        research: { newestStem: "2026-07-14-x-research", eligible: true },
        adr: { eligible: true },
      },
      "adr",
    );
    expect(reconcileCreateDocType("adr", researchPresent)).toBe("adr");

    // next_step absent/ineligible: fall through to the first eligible offered type.
    const onlyEntry = coverage({ research: { eligible: true } as never });
    expect(reconcileCreateDocType("plan", onlyEntry)).toBe("research");
  });

  it("seeds related links deterministically from newest upstream stems (ADR D5)", () => {
    const full = coverage({
      research: { newestStem: "2026-07-14-x-research", eligible: true },
      reference: { newestStem: "2026-07-14-x-reference", eligible: true },
      adr: { newestStem: "2026-07-14-x-adr", eligible: true },
      plan: { newestStem: "2026-07-14-x-plan", eligible: true },
    });
    // adr ← newest research AND reference stems.
    expect(seedRelatedFromCoverage("adr", full)).toEqual([
      "2026-07-14-x-research",
      "2026-07-14-x-reference",
    ]);
    // plan ← newest adr.
    expect(seedRelatedFromCoverage("plan", full)).toEqual(["2026-07-14-x-adr"]);
    // audit ← newest plan.
    expect(seedRelatedFromCoverage("audit", full)).toEqual(["2026-07-14-x-plan"]);
    // research/reference ← none.
    expect(seedRelatedFromCoverage("research", full)).toEqual([]);
    expect(seedRelatedFromCoverage("reference", full)).toEqual([]);
    // A missing upstream contributes nothing (no fabricated stem).
    const researchOnly = coverage({
      research: { newestStem: "2026-07-14-x-research", eligible: true },
    });
    expect(seedRelatedFromCoverage("adr", researchOnly)).toEqual([
      "2026-07-14-x-research",
    ]);
    expect(seedRelatedFromCoverage("plan", researchOnly)).toEqual([]);
  });
});
