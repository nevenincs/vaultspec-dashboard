import { describe, expect, it } from "vitest";

import { Link2 } from "lucide-react";

import {
  resolveActionPresentation,
  type ActionPresentation,
} from "../../platform/actions/action";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { createLocalizationRuntime } from "../../platform/localization/runtime";
import {
  archiveFeatureAction,
  autofixFeatureAction,
  docStemFromNodeId,
  openEntityAction,
  relateToSelectionAction,
} from "./sharedActions";

const localization = createLocalizationRuntime();
const resolvePresentation = (presentation: ActionPresentation): string =>
  resolveActionPresentation(presentation, (descriptor) =>
    resolveMessageResult(localization, descriptor),
  ).message;

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
    });
    expect(a.label).toEqual({ key: "documents:actions.linkToSelectedDocument" });
    expect(resolvePresentation(a.label)).toBe("Link to selected document");
    expect(a.section).toBe("transform");
    expect(a.icon).toBe(Link2);
    expect(a.disabled).toBe(true);
    expect(a.disabledReason).toEqual({
      key: "documents:disabledReasons.selectDocument",
    });
    expect(resolvePresentation(a.disabledReason!)).toBe("Select a document first.");
    expect(a.disabledInTimeTravel).toBe(true);
    expect(a.dispatch).toBeUndefined();
    expect(a.run).toBeUndefined();
    expect(a.confirm).toBeUndefined();
    expect(a.confirmation).toBeUndefined();
  });

  it("disables when nothing (or no document) is focused", () => {
    expect(
      relateToSelectionAction({ id, srcStem: "a", ctx: { timeTravel: false } })
        .disabledReason,
    ).toEqual({ key: "documents:disabledReasons.selectDocument" });
    expect(
      relateToSelectionAction({
        id,
        srcStem: "a",
        ctx: { timeTravel: false, selectedNodeId: "code:x" },
      }).disabledReason,
    ).toEqual({ key: "documents:disabledReasons.selectDocument" });
  });

  it("disables when the focus is the same document", () => {
    expect(
      relateToSelectionAction({
        id,
        srcStem: "a",
        ctx: { timeTravel: false, selectedNodeId: "doc:a" },
      }).disabledReason,
    ).toEqual({ key: "documents:disabledReasons.selectDifferentDocument" });
  });

  it("dispatches the relate action (edit_frontmatter read-modify-write) for a distinct focused document", () => {
    const a = relateToSelectionAction({
      id,
      srcStem: "a",
      scope: "wt",
      ctx: { timeTravel: false, selectedNodeId: "doc:b" },
    });
    expect(a.disabled).toBeUndefined();
    expect(a.dispatch).toEqual({
      type: "relate:link",
      payload: { src: "a", dst: "b", scope: "wt" },
    });
  });

  it("passes a null scope through as-is (no coercion) when the source carries none", () => {
    const a = relateToSelectionAction({
      id,
      srcStem: "a",
      ctx: { timeTravel: false, selectedNodeId: "doc:b" },
    });
    expect(a.dispatch).toEqual({
      type: "relate:link",
      payload: { src: "a", dst: "b", scope: null },
    });
  });
});

describe("openEntityAction", () => {
  it("is a non-mutating navigate verb with a run when the entity has a node", () => {
    const a = openEntityAction({
      id: "search-result:open",
      nodeId: "doc:b",
      scope: "wt",
    });
    expect(a.disabled).toBeUndefined();
    expect(a.section).toBe("navigate");
    expect(a.label).toEqual({ key: "common:actions.open" });
    expect(resolvePresentation(a.label)).toBe("Open");
    expect(typeof a.run).toBe("function");
    expect(a.dispatch).toBeUndefined();
    // Open is non-mutating, so it is never time-travel gated.
    expect(a.disabledInTimeTravel).toBeUndefined();
  });

  it("disables with reason when the entity has no node to open", () => {
    const a = openEntityAction({
      id: "search-result:open",
      nodeId: null,
    });
    expect(a.disabled).toBe(true);
    expect(a.disabledReason).toEqual({
      key: "common:disabledReasons.selectItemToOpen",
    });
    expect(resolvePresentation(a.disabledReason!)).toBe("Select an item to open.");
    expect(a.run).toBeUndefined();
  });
});

describe("autofixFeatureAction", () => {
  it("disables with reason when the feature is null", () => {
    const a = autofixFeatureAction({ id: "node:autofix-feature", feature: null });
    expect(a.disabled).toBe(true);
    expect(a.disabledReason).toBe("no feature to autofix");
    expect(a.dispatch).toBeUndefined();
  });

  it("is a confirm-guarded, time-travel-gated transform dispatch for a feature", () => {
    const a = autofixFeatureAction({
      id: "node:autofix-feature",
      feature: "dashboard",
      scope: "wt",
    });
    expect(a.section).toBe("transform");
    expect(a.confirm).toBe(true);
    expect(a.disabledInTimeTravel).toBe(true);
    expect(a.dispatch).toEqual({
      type: "ops:run",
      payload: {
        target: "core",
        verb: "autofix",
        mode: "autofix",
        body: { scope: "wt", feature: "dashboard" },
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
