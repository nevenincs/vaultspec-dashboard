// Outcome message contract (W06.P18): every typed error/status condition maps to a
// resolvable catalog message, and the unknown-condition path lands on a real safe
// fallback message — never a raw token or an unresolved key. The array-backed
// action-feedback union is swept exhaustively; the `(unknown) => descriptor`
// accessors (whose Record<Union, MessageDescriptor> map is already exhaustive at
// compile time) are proven to resolve a real message for a garbage input, i.e. no
// condition falls through to raw copy.

import { describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "./testing";
import { resolveMessageResult } from "../platform/localization/fallback";
import type { AnyMessageDescriptor } from "../platform/localization/message";
import {
  ACTION_FEEDBACK_CONDITIONS,
  actionFeedbackDescriptor,
  normalizeActionFeedbackCondition,
} from "../stores/view/actionFeedback";
import {
  documentViewerStatusDescriptor,
  documentViewerStateDescriptor,
} from "../stores/server/documentViewerVocabulary";
import { reviewStatusDescriptor } from "../stores/server/authoring/reviewStationVocabulary";
import { commentAuthorKindDescriptor } from "../stores/server/authoring/commentVocabulary";

const runtime = createTestLocalizationRuntime();

function resolved(descriptor: AnyMessageDescriptor): {
  message: string;
  usedFallback: boolean;
} {
  const result = resolveMessageResult(runtime, descriptor);
  return { message: result.message, usedFallback: result.usedFallback };
}

describe("outcome messages", () => {
  it("maps every action-feedback condition to a specific catalog message", () => {
    expect(ACTION_FEEDBACK_CONDITIONS.length).toBeGreaterThan(0);
    const messages = new Set<string>();
    for (const condition of ACTION_FEEDBACK_CONDITIONS) {
      const { message, usedFallback } = resolved(actionFeedbackDescriptor(condition));
      expect(message.length, condition).toBeGreaterThan(0);
      // Not the generic safe fallback: the specific outcome message resolved.
      expect(usedFallback, condition).toBe(false);
      messages.add(message);
    }
    // Non-vacuity: the conditions do not all collapse to one shared message.
    expect(messages.size).toBeGreaterThan(1);
  });

  it("routes an unknown action-feedback condition to the safe no-op path", () => {
    expect(normalizeActionFeedbackCondition("not-a-condition")).toBeNull();
    expect(normalizeActionFeedbackCondition(42)).toBeNull();
    // A real condition still normalizes.
    expect(normalizeActionFeedbackCondition("copy-failed")).toBe("copy-failed");
  });

  it("resolves a real safe-fallback message for an unknown status token, never raw", () => {
    // Every `(unknown) => MessageDescriptor` accessor maps a garbage token to a
    // catalog-owned fallback descriptor, so nothing falls through to raw copy.
    for (const [name, descriptor] of [
      ["review status", reviewStatusDescriptor("not-a-status")],
      ["comment author", commentAuthorKindDescriptor("not-an-actor")],
      ["document viewer status", documentViewerStatusDescriptor("not-a-status")],
    ] as const) {
      const { message, usedFallback } = resolved(descriptor);
      expect(message.length, name).toBeGreaterThan(0);
      // The fallback is a real catalog key, so resolution itself does not fall back.
      expect(usedFallback, name).toBe(false);
      // The raw unknown token never surfaces as user copy.
      expect(message, name).not.toContain("not-a-");
    }
  });

  it("routes an unknown viewer state to a safe fallback message, never a raw token", () => {
    const descriptor = documentViewerStateDescriptor("not-a-state");
    expect(descriptor).not.toBeNull();
    const { message, usedFallback } = resolved(descriptor!);
    expect(message.length).toBeGreaterThan(0);
    expect(usedFallback).toBe(false);
    expect(message).not.toContain("not-a-");
  });
});
