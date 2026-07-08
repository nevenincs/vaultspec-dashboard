import { beforeEach, describe, expect, it } from "vitest";

import {
  ACTION_FEEDBACK_MESSAGE_CAP,
  actionFeedbackSnapshot,
  announceActionFeedback,
  clearActionFeedback,
  normalizeActionFeedbackMessage,
} from "./actionFeedback";

describe("actionFeedback store (KAR-006 / KAR-004)", () => {
  beforeEach(() => clearActionFeedback());

  it("normalizes: trims, drops empty/non-string, caps length", () => {
    expect(normalizeActionFeedbackMessage("  Copied.  ")).toBe("Copied.");
    expect(normalizeActionFeedbackMessage("   ")).toBeNull();
    expect(normalizeActionFeedbackMessage(42)).toBeNull();
    const capped = normalizeActionFeedbackMessage(
      "x".repeat(ACTION_FEEDBACK_MESSAGE_CAP + 50),
    );
    expect(capped).not.toBeNull();
    expect(capped!.length).toBe(ACTION_FEEDBACK_MESSAGE_CAP);
    expect(capped!.endsWith("…")).toBe(true);
  });

  it("announce sets the message and bumps the re-announce token every time", () => {
    announceActionFeedback("Copied.");
    const first = actionFeedbackSnapshot();
    expect(first.message).toBe("Copied.");

    // An IDENTICAL consecutive message must still re-announce: same text, a NEW
    // token (the aria-live region keys on the token, so AT reads it again).
    announceActionFeedback("Copied.");
    const second = actionFeedbackSnapshot();
    expect(second.message).toBe("Copied.");
    expect(second.token).toBeGreaterThan(first.token);

    announceActionFeedback("Couldn't copy.");
    const third = actionFeedbackSnapshot();
    expect(third.message).toBe("Couldn't copy.");
    expect(third.token).toBeGreaterThan(second.token);
  });

  it("ignores an empty announce (no message, no token bump)", () => {
    announceActionFeedback("Done.");
    const before = actionFeedbackSnapshot();
    announceActionFeedback("   ");
    const after = actionFeedbackSnapshot();
    expect(after.message).toBe("Done.");
    expect(after.token).toBe(before.token);
  });

  it("clear empties the message and still bumps the token", () => {
    announceActionFeedback("Done.");
    const before = actionFeedbackSnapshot();
    clearActionFeedback();
    const after = actionFeedbackSnapshot();
    expect(after.message).toBeNull();
    expect(after.token).toBeGreaterThan(before.token);
  });
});
