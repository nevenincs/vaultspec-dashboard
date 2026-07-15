import { describe, expect, it } from "vitest";

import { Archive, Crosshair, Link2, Wrench } from "lucide-react";

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
  showOnCanvasAction,
} from "./sharedActions";

const localization = createLocalizationRuntime();
const resolvePresentation = (presentation: ActionPresentation): string =>
  resolveActionPresentation(presentation, (descriptor) =>
    resolveMessageResult(localization, descriptor),
  ).message;

describe("showOnCanvasAction", () => {
  it("builds the canonical localized canvas action for a trimmed node id", () => {
    const action = showOnCanvasAction({ id: "x:focus", nodeId: "  node:one  " });

    expect(action.label).toEqual({ key: "common:actions.showOnCanvas" });
    expect(resolvePresentation(action.label)).toBe("Show on canvas");
    expect(action.section).toBe("navigate");
    expect(action.icon).toBe(Crosshair);
    expect(action.disabled).toBeUndefined();
    expect(action.run).toBeTypeOf("function");
  });

  it("fails closed with an actionable localized reason for blank node ids", () => {
    const action = showOnCanvasAction({ id: "x:focus", nodeId: " \t " });

    expect(action.disabled).toBe(true);
    expect(action.disabledReason).toEqual({
      key: "common:disabledReasons.itemUnavailableOnCanvas",
    });
    expect(resolvePresentation(action.disabledReason!)).toBe(
      "Refresh data, then try showing this item on the canvas.",
    );
    expect(action.run).toBeUndefined();
  });
});

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
    expect(a.label).toEqual({ key: "features:guardedActions.repair" });
    expect(resolvePresentation(a.label)).toBe("Repair feature");
    expect(a.section).toBe("transform");
    expect(a.icon).toBe(Wrench);
    expect(a.disabled).toBe(true);
    expect(a.disabledReason).toEqual({
      key: "features:disabledReasons.selectFeature",
    });
    expect(resolvePresentation(a.disabledReason!)).toBe("Select a feature first.");
    expect(a.confirm).toBeUndefined();
    expect(a.confirmation).toBeUndefined();
    expect(a.dispatch).toBeUndefined();
    expect(a.run).toBeUndefined();
  });

  it("is a typed guarded, time-travel-gated transform dispatch for a feature", () => {
    const a = autofixFeatureAction({
      id: "node:autofix-feature",
      feature: "dashboard",
      scope: "wt",
    });
    expect(a.label).toEqual({ key: "features:guardedActions.repair" });
    expect(a.section).toBe("transform");
    expect(a.icon).toBe(Wrench);
    expect(a.confirm).toBeUndefined();
    expect(a.confirmation).toEqual({
      kind: "guarded",
      title: {
        key: "features:confirmations.repair.title",
        values: { feature: "dashboard" },
      },
      body: { key: "features:confirmations.repair.body" },
      confirmLabel: { key: "features:guardedActions.repair" },
      cancelLabel: { key: "common:actions.cancel" },
    });
    expect(resolvePresentation(a.confirmation!.title)).toBe("Repair dashboard?");
    expect(resolvePresentation(a.confirmation!.body)).toBe(
      "This applies fixes across this feature's documents. Review the changes when it finishes.",
    );
    expect(resolvePresentation(a.confirmation!.confirmLabel)).toBe("Repair feature");
    expect(resolvePresentation(a.confirmation!.cancelLabel)).toBe("Cancel");
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
    expect(a.label).toEqual({ key: "features:destructiveActions.archive" });
    expect(resolvePresentation(a.label)).toBe("Archive feature");
    expect(a.section).toBe("danger");
    expect(a.icon).toBe(Archive);
    expect(a.disabled).toBe(true);
    expect(a.disabledReason).toEqual({
      key: "features:disabledReasons.selectFeature",
    });
    expect(resolvePresentation(a.disabledReason!)).toBe("Select a feature first.");
    expect(a.confirm).toBeUndefined();
    expect(a.confirmation).toBeUndefined();
    expect(a.dispatch).toBeUndefined();
    expect(a.run).toBeUndefined();
  });

  it("is a typed destructive, time-travel-gated danger dispatch for a feature", () => {
    const a = archiveFeatureAction({
      id: "x:archive",
      feature: "dashboard",
      scope: "wt",
    });
    expect(a.label).toEqual({ key: "features:destructiveActions.archive" });
    expect(a.section).toBe("danger");
    expect(a.icon).toBe(Archive);
    expect(a.confirm).toBeUndefined();
    expect(a.confirmation).toEqual({
      kind: "destructive",
      title: {
        key: "features:confirmations.archive.title",
        values: { feature: "dashboard" },
      },
      body: { key: "features:confirmations.archive.body" },
      confirmLabel: { key: "features:destructiveActions.archive" },
      cancelLabel: { key: "common:actions.cancel" },
    });
    expect(resolvePresentation(a.confirmation!.title)).toBe("Archive dashboard?");
    expect(resolvePresentation(a.confirmation!.body)).toBe(
      "This removes the feature and its documents from active work.",
    );
    expect(resolvePresentation(a.confirmation!.confirmLabel)).toBe("Archive feature");
    expect(resolvePresentation(a.confirmation!.cancelLabel)).toBe("Cancel");
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
