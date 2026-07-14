import { beforeEach, describe, expect, it } from "vitest";

import {
  ACTION_FEEDBACK_CONDITIONS,
  actionFeedbackDescriptor,
  actionFeedbackSnapshot,
  announceActionFeedback,
  clearActionFeedback,
  normalizeActionFeedbackCondition,
} from "./actionFeedback";

describe("actionFeedback store", () => {
  beforeEach(() => clearActionFeedback());

  it("accepts only the exact closed condition union", () => {
    expect(Object.isFrozen(ACTION_FEEDBACK_CONDITIONS)).toBe(true);
    for (const condition of ACTION_FEEDBACK_CONDITIONS) {
      expect(normalizeActionFeedbackCondition(condition)).toBe(condition);
      expect(Object.isFrozen(actionFeedbackDescriptor(condition))).toBe(true);
    }
    expect(normalizeActionFeedbackCondition(" copy-succeeded ")).toBeNull();
    expect(normalizeActionFeedbackCondition("unknown")).toBeNull();
    expect(
      normalizeActionFeedbackCondition({ condition: "copy-succeeded" }),
    ).toBeNull();
  });

  it("stores the condition and bumps the reannouncement token for every valid repeat", () => {
    announceActionFeedback("copy-succeeded");
    const first = actionFeedbackSnapshot();
    expect(first.condition).toBe("copy-succeeded");

    announceActionFeedback("copy-succeeded");
    const second = actionFeedbackSnapshot();
    expect(second.condition).toBe("copy-succeeded");
    expect(second.token).toBeGreaterThan(first.token);
  });

  it("leaves the condition and token untouched for invalid input", () => {
    announceActionFeedback("link-failed");
    const before = actionFeedbackSnapshot();
    announceActionFeedback("link-failed ");
    expect(actionFeedbackSnapshot()).toEqual(before);
  });

  it("clears the condition and bumps the token", () => {
    announceActionFeedback("repair-succeeded");
    const before = actionFeedbackSnapshot();
    clearActionFeedback();
    const after = actionFeedbackSnapshot();
    expect(after.condition).toBeNull();
    expect(after.token).toBeGreaterThan(before.token);
  });
});
