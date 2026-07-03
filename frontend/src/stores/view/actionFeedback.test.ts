import { beforeEach, describe, expect, it } from "vitest";

import {
  ACTION_FEEDBACK_MESSAGE_CAP,
  announceActionFeedback,
  clearActionFeedback,
  normalizeActionFeedbackMessage,
  useActionFeedbackStore,
} from "./actionFeedback";

// KAR-006 / KAR-004. The persistent action-outcome feedback store: it normalizes
// and caps the announced line, and rides a monotonic token so an IDENTICAL
// consecutive outcome ("Copied." twice) still re-announces (the aria-live region
// keys its text node on the token to force a screen-reader-observed change).

describe("normalizeActionFeedbackMessage", () => {
  it("trims, rejects blanks/non-strings, and caps with an ellipsis", () => {
    expect(normalizeActionFeedbackMessage("  Copied.  ")).toBe("Copied.");
    expect(normalizeActionFeedbackMessage("   ")).toBeNull();
    expect(normalizeActionFeedbackMessage(42)).toBeNull();
    expect(normalizeActionFeedbackMessage(null)).toBeNull();

    const long = "x".repeat(ACTION_FEEDBACK_MESSAGE_CAP + 50);
    const capped = normalizeActionFeedbackMessage(long);
    expect(capped).toHaveLength(ACTION_FEEDBACK_MESSAGE_CAP);
    expect(capped?.endsWith("…")).toBe(true);
  });
});

describe("announceActionFeedback", () => {
  beforeEach(() => {
    useActionFeedbackStore.setState({ message: null, token: 0 });
  });

  it("sets the normalized message and bumps the token", () => {
    announceActionFeedback("  Done.  ");
    const state = useActionFeedbackStore.getState();
    expect(state.message).toBe("Done.");
    expect(state.token).toBe(1);
  });

  it("re-announces an IDENTICAL consecutive message by bumping the token", () => {
    announceActionFeedback("Copied.");
    const first = useActionFeedbackStore.getState().token;
    announceActionFeedback("Copied.");
    const second = useActionFeedbackStore.getState();
    expect(second.message).toBe("Copied.");
    expect(second.token).toBeGreaterThan(first);
  });

  it("ignores a blank announcement without disturbing state", () => {
    announceActionFeedback("Real.");
    const before = useActionFeedbackStore.getState();
    announceActionFeedback("   ");
    const after = useActionFeedbackStore.getState();
    expect(after.message).toBe("Real.");
    expect(after.token).toBe(before.token);
  });

  it("clear() drops the message but still bumps the token (a fresh change)", () => {
    announceActionFeedback("Copied.");
    const before = useActionFeedbackStore.getState().token;
    clearActionFeedback();
    const after = useActionFeedbackStore.getState();
    expect(after.message).toBeNull();
    expect(after.token).toBeGreaterThan(before);
  });
});
