import { beforeEach, describe, expect, it } from "vitest";

import { requestSelectionReveal, useSelectionRevealStore } from "./selectionReveal";

describe("selectionReveal (GS-003)", () => {
  beforeEach(() => {
    useSelectionRevealStore.setState({ target: null });
  });

  it("requests a reveal and monotonically bumps the nonce (so a repeat of the same id re-fires)", () => {
    requestSelectionReveal("doc:alpha");
    expect(useSelectionRevealStore.getState().target).toEqual({
      nodeId: "doc:alpha",
      nonce: 1,
    });

    // Re-requesting the SAME id must still change the target (a new nonce) so a
    // consumer that already handled nonce 1 re-reveals on the repeat.
    requestSelectionReveal("doc:alpha");
    expect(useSelectionRevealStore.getState().target).toEqual({
      nodeId: "doc:alpha",
      nonce: 2,
    });

    requestSelectionReveal("doc:beta");
    expect(useSelectionRevealStore.getState().target).toEqual({
      nodeId: "doc:beta",
      nonce: 3,
    });
  });

  it("ignores a blank / non-string id (no-op, target unchanged)", () => {
    requestSelectionReveal("doc:alpha");
    const before = useSelectionRevealStore.getState().target;
    requestSelectionReveal("");
    requestSelectionReveal(undefined as unknown as string);
    expect(useSelectionRevealStore.getState().target).toBe(before);
  });
});
