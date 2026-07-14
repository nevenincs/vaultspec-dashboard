import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import {
  commandPaletteOpsFeedback,
  type CommandPaletteOpsFeedbackTone,
} from "./commandPalette";

const expected = [
  [
    "check-workspace",
    "running",
    "operations:feedback.checkWorkspace.running",
    "neutral",
  ],
  [
    "check-workspace",
    "succeeded",
    "operations:feedback.checkWorkspace.succeeded",
    "success",
  ],
  ["check-workspace", "failed", "operations:feedback.checkWorkspace.failed", "error"],
  [
    "show-workspace-details",
    "running",
    "operations:feedback.showWorkspaceDetails.running",
    "neutral",
  ],
  [
    "show-workspace-details",
    "succeeded",
    "operations:feedback.showWorkspaceDetails.succeeded",
    "success",
  ],
  [
    "show-workspace-details",
    "failed",
    "operations:feedback.showWorkspaceDetails.failed",
    "error",
  ],
  ["enable-search", "running", "operations:feedback.enableSearch.running", "neutral"],
  [
    "enable-search",
    "succeeded",
    "operations:feedback.enableSearch.succeeded",
    "success",
  ],
  ["enable-search", "failed", "operations:feedback.enableSearch.failed", "error"],
  [
    "enable-search",
    "unavailable",
    "operations:feedback.enableSearch.unavailable",
    "error",
  ],
  ["disable-search", "running", "operations:feedback.disableSearch.running", "neutral"],
  [
    "disable-search",
    "succeeded",
    "operations:feedback.disableSearch.succeeded",
    "success",
  ],
  ["disable-search", "failed", "operations:feedback.disableSearch.failed", "error"],
  ["refresh-search", "running", "operations:feedback.refreshSearch.running", "neutral"],
  [
    "refresh-search",
    "succeeded",
    "operations:feedback.refreshSearch.succeeded",
    "success",
  ],
  ["refresh-search", "failed", "operations:feedback.refreshSearch.failed", "error"],
  [
    "refresh-search",
    "unavailable",
    "operations:feedback.refreshSearch.unavailable",
    "error",
  ],
  [
    "apply-search-settings",
    "running",
    "operations:feedback.applySearchSettings.running",
    "neutral",
  ],
  [
    "apply-search-settings",
    "succeeded",
    "operations:feedback.applySearchSettings.succeeded",
    "success",
  ],
  [
    "apply-search-settings",
    "failed",
    "operations:feedback.applySearchSettings.failed",
    "error",
  ],
  [
    "apply-search-settings",
    "unavailable",
    "operations:feedback.applySearchSettings.unavailable",
    "error",
  ],
] as const;

const approvedEnglish = {
  "operations:feedback.checkWorkspace.running": "Checking workspace…",
  "operations:feedback.checkWorkspace.succeeded": "Workspace check complete.",
  "operations:feedback.checkWorkspace.failed":
    "Couldn't check the workspace. Try again.",
  "operations:feedback.showWorkspaceDetails.running": "Loading workspace details…",
  "operations:feedback.showWorkspaceDetails.succeeded": "Workspace details loaded.",
  "operations:feedback.showWorkspaceDetails.failed":
    "Couldn't load workspace details. Try again.",
  "operations:feedback.enableSearch.running": "Enabling search…",
  "operations:feedback.enableSearch.succeeded": "Search enabled.",
  "operations:feedback.enableSearch.failed": "Couldn't enable search. Try again.",
  "operations:feedback.enableSearch.unavailable":
    "Search is still unavailable. Try again.",
  "operations:feedback.disableSearch.running": "Disabling search…",
  "operations:feedback.disableSearch.succeeded": "Search disabled.",
  "operations:feedback.disableSearch.failed": "Couldn't disable search. Try again.",
  "operations:feedback.refreshSearch.running": "Refreshing search…",
  "operations:feedback.refreshSearch.succeeded": "Search refresh started.",
  "operations:feedback.refreshSearch.failed": "Couldn't refresh search. Try again.",
  "operations:feedback.refreshSearch.unavailable":
    "Search is unavailable. Enable search, then try again.",
  "operations:feedback.applySearchSettings.running": "Applying search settings…",
  "operations:feedback.applySearchSettings.succeeded": "Search settings applied.",
  "operations:feedback.applySearchSettings.failed":
    "Couldn't apply search settings. Try again.",
  "operations:feedback.applySearchSettings.unavailable":
    "Search is unavailable. Enable search, then try again.",
} as const;

describe("localized command palette operation feedback", () => {
  it("maps the approved 21 concept-condition pairs to immutable descriptors", () => {
    for (const [concept, condition, key, tone] of expected) {
      const feedback = commandPaletteOpsFeedback({ concept, condition });
      expect(feedback).toEqual({ message: { key }, tone });
      expect(Object.isFrozen(feedback)).toBe(true);
      expect(Object.isFrozen(feedback.message)).toBe(true);
    }
  });

  it("returns the safe generic descriptor for invalid or unmapped input", () => {
    for (const input of [
      null,
      "refresh-search:failed",
      { concept: "disable-search", condition: "unavailable" },
      { concept: "private-operation", condition: "failed" },
      { concept: "refresh-search", condition: "failed", detail: "private" },
    ]) {
      expect(commandPaletteOpsFeedback(input)).toEqual({
        message: { key: "common:feedback.actionUnavailable" },
        tone: "error" satisfies CommandPaletteOpsFeedbackTone,
      });
    }
  });

  it("resolves approved copy through real English, French, and Arabic runtimes", () => {
    const source = createTestLocalizationRuntime();
    const alternate = createTestLocalizationRuntime(ltrTestLocale);
    const rtl = createTestLocalizationRuntime(rtlTestLocale);
    for (const [concept, condition, key] of expected) {
      const descriptor = commandPaletteOpsFeedback({ concept, condition }).message;
      const sourceResult = resolveMessageResult(source, descriptor);
      const alternateResult = resolveMessageResult(alternate, descriptor);
      const rtlResult = resolveMessageResult(rtl, descriptor);
      expect(sourceResult.usedFallback).toBe(false);
      expect(alternateResult.usedFallback).toBe(false);
      expect(rtlResult.usedFallback).toBe(false);
      expect(sourceResult.message).toBe(approvedEnglish[key]);
      expect(sourceResult.message).not.toBe(alternateResult.message);
      expect(sourceResult.message).not.toBe(rtlResult.message);
    }
  });
});
