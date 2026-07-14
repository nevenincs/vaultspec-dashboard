// Unit tests for the document copy-link verb (authoring-surface ADR D3). The builder
// is a pure function of its options — no DOM, no store — so it is asserted directly:
// the wiki-link format (the app's only navigable document reference), the single
// shared id, the runnable (never dispatch) shape so it is valid on both the menu and
// the palette, and the disabled-with-reason path for a non-document source.

import { describe, expect, it } from "vitest";

import { Link } from "lucide-react";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import {
  COPY_LINK_ACTION_ID,
  copyLinkAction,
  documentWikiLink,
} from "./documentLinkActions";

describe("documentWikiLink", () => {
  it("is the bare wiki-link for a document stem", () => {
    expect(documentWikiLink("2026-07-12-x-plan")).toBe("[[2026-07-12-x-plan]]");
  });

  it("appends a section anchor when a heading slug is supplied", () => {
    expect(documentWikiLink("x-plan", "implementation")).toBe(
      "[[x-plan#implementation]]",
    );
  });

  it("trims the stem and ignores a blank heading", () => {
    expect(documentWikiLink("  x-plan  ", "   ")).toBe("[[x-plan]]");
  });
});

describe("copyLinkAction", () => {
  it("is a runnable copy verb under the one shared id", () => {
    const action = copyLinkAction({ stem: "x-plan" });
    expect(action.id).toBe(COPY_LINK_ACTION_ID);
    expect(action.id).toBe("vault-doc:copy-link");
    expect(action.label).toEqual({ key: "documents:actions.copyLink" });
    expect(action.section).toBe("copy");
    expect(action.icon).toBe(Link);
    expect(typeof action.run).toBe("function");
    // A `run`, never a `dispatch` — the palette normalizer drops dispatch-only
    // descriptors, so the ONE builder must be run-based to ride both planes.
    expect(action.dispatch).toBeUndefined();
    expect(action.disabled).toBeUndefined();
    expect(action.confirm).toBeUndefined();
    expect(action.confirmation).toBeUndefined();
  });

  it("is disabled-with-reason when the source is not a document", () => {
    const action = copyLinkAction({ stem: null });
    expect(action.label).toEqual({ key: "documents:actions.copyLink" });
    expect(action.disabled).toBe(true);
    expect(action.disabledReason).toEqual({
      key: "documents:disabledReasons.selectDocument",
    });
    expect(action.run).toBeUndefined();
    expect(action.confirm).toBeUndefined();
    expect(action.confirmation).toBeUndefined();
  });

  it("preserves an explicit surface action id without changing presentation", () => {
    const action = copyLinkAction({ id: "reader:copy-section-link", stem: "x-plan" });
    expect(action.id).toBe("reader:copy-section-link");
    expect(action.label).toEqual({ key: "documents:actions.copyLink" });
  });

  it("resolves the action and disabled reason through the real localization runtime", () => {
    const runtime = createTestLocalizationRuntime();
    const enabled = copyLinkAction({ stem: "x-plan" });
    const disabled = copyLinkAction({ stem: null });

    expect(resolveMessageResult(runtime, enabled.label)).toEqual({
      message: "Copy link",
      usedFallback: false,
    });
    expect(resolveMessageResult(runtime, disabled.disabledReason)).toEqual({
      message: "Select a document first.",
      usedFallback: false,
    });
  });
});
