import { describe, expect, it } from "vitest";

import {
  archiveFeatureAction,
  docStemFromNodeId,
  relateToSelectionAction,
} from "./sharedActions";

describe("docStemFromNodeId", () => {
  it("returns the stem for a doc: node id, null otherwise", () => {
    expect(docStemFromNodeId("doc:2026-plan")).toBe("2026-plan");
    expect(docStemFromNodeId("doc: padded ")).toBe("padded");
    expect(docStemFromNodeId("code:src/x.ts")).toBeNull();
    expect(docStemFromNodeId("feature:dashboard")).toBeNull();
    expect(docStemFromNodeId("doc:")).toBeNull();
    expect(docStemFromNodeId(null)).toBeNull();
    expect(docStemFromNodeId(undefined)).toBeNull();
  });
});

describe("relateToSelectionAction", () => {
  const id = "x:relate";

  it("disables with reason when the source is not a document", () => {
    const a = relateToSelectionAction({
      id,
      srcStem: null,
      ctx: { timeTravel: false, selectedNodeId: "doc:b" },
      notADocumentReason: "only documents can be related",
    });
    expect(a.disabled).toBe(true);
    expect(a.disabledReason).toBe("only documents can be related");
    expect(a.disabledInTimeTravel).toBe(true);
    expect(a.dispatch).toBeUndefined();
  });

  it("disables when nothing (or no document) is focused", () => {
    expect(
      relateToSelectionAction({ id, srcStem: "a", ctx: { timeTravel: false } })
        .disabledReason,
    ).toBe("focus a document to relate to");
    expect(
      relateToSelectionAction({
        id,
        srcStem: "a",
        ctx: { timeTravel: false, selectedNodeId: "code:x" },
      }).disabledReason,
    ).toBe("focus a document to relate to");
  });

  it("disables when the focus is the same document", () => {
    expect(
      relateToSelectionAction({
        id,
        srcStem: "a",
        ctx: { timeTravel: false, selectedNodeId: "doc:a" },
      }).disabledReason,
    ).toBe("already this document");
  });

  it("dispatches link-add for a distinct focused document", () => {
    const a = relateToSelectionAction({
      id,
      srcStem: "a",
      scope: "wt",
      ctx: { timeTravel: false, selectedNodeId: "doc:b" },
    });
    expect(a.disabled).toBeUndefined();
    expect(a.dispatch).toEqual({
      type: "ops:run",
      payload: {
        target: "core",
        verb: "link-add",
        mode: "link",
        body: { scope: "wt", src: "a", dst: "b" },
      },
    });
  });
});

describe("archiveFeatureAction", () => {
  it("disables with reason when the feature is null", () => {
    const a = archiveFeatureAction({ id: "x:archive", feature: null });
    expect(a.disabled).toBe(true);
    expect(a.disabledReason).toBe("no feature to archive");
    expect(a.dispatch).toBeUndefined();
  });

  it("is a confirm-guarded, time-travel-gated danger dispatch when a feature is given", () => {
    const a = archiveFeatureAction({
      id: "x:archive",
      feature: "dashboard",
      scope: "wt",
    });
    expect(a.section).toBe("danger");
    expect(a.confirm).toBe(true);
    expect(a.disabledInTimeTravel).toBe(true);
    expect(a.dispatch).toEqual({
      type: "ops:run",
      payload: {
        target: "core",
        verb: "feature-archive",
        mode: "archive",
        body: { scope: "wt", feature: "dashboard" },
      },
    });
  });
});
