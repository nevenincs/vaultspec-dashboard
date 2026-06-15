// @vitest-environment happy-dom
//
// Copy verb family (W02.P04.S20): the terminal handler writes to the clipboard
// and dispatches through the appDispatcher seam; copyAction builds a copy-section
// descriptor that routes the same verb.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COPY_ACTION, copyAction, dispatchCopy } from "./clipboardActions";

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("copy verb", () => {
  it("writes the payload text to the clipboard and reports ok", async () => {
    const result = await dispatchCopy({ text: "node:alpha", what: "id" });
    expect(writeText).toHaveBeenCalledWith("node:alpha");
    expect(result.ok).toBe(true);
  });

  it("reports not-ok when the clipboard write rejects (degrades, no throw)", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    const result = await dispatchCopy({ text: "x" });
    expect(result.ok).toBe(false);
  });

  it("copyAction builds a copy-section descriptor routed through the copy verb", () => {
    const action = copyAction({
      id: "copy-id",
      label: "Copy id",
      text: "n1",
      what: "id",
    });
    expect(action.section).toBe("copy");
    expect(action.dispatch?.type).toBe(COPY_ACTION);
    expect(action.dispatch?.payload).toEqual({ text: "n1", what: "id" });
    expect(action.run).toBeUndefined();
  });
});
