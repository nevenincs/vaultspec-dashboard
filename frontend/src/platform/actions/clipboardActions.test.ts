// @vitest-environment happy-dom
//
// Copy verb family (W02.P04.S20): the terminal handler writes to the clipboard
// and dispatches through the appDispatcher seam; copyAction builds a copy-section
// descriptor that routes the same verb.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { resolveMessageResult } from "../localization/fallback";
import {
  COPY_ACTION,
  copyAction,
  dispatchCopy,
  normalizeCopyPayload,
  normalizeCopyWhat,
} from "./clipboardActions";

const writeText = vi.fn().mockResolvedValue(undefined);
const execCommand = vi.fn().mockReturnValue(true);

beforeEach(() => {
  writeText.mockClear().mockResolvedValue(undefined);
  execCommand.mockClear().mockReturnValue(true);
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  // happy-dom doesn't implement execCommand; stub it so the non-secure-origin
  // fallback path is exercisable.
  (globalThis.document as unknown as { execCommand: typeof execCommand }).execCommand =
    execCommand;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("copy verb", () => {
  it("normalizes copy payloads without trimming copied text", () => {
    expect(normalizeCopyWhat("id")).toBe("id");
    expect(normalizeCopyWhat("unknown")).toBeUndefined();
    expect(normalizeCopyPayload({ text: "  node:alpha  ", what: "id" })).toEqual({
      text: "  node:alpha  ",
      what: "id",
    });
    expect(normalizeCopyPayload({ text: 42, what: "unknown" })).toEqual({
      text: "",
    });
  });

  it("writes the payload text to the clipboard and reports ok", async () => {
    const result = await dispatchCopy({ text: "node:alpha", what: "id" });
    expect(writeText).toHaveBeenCalledWith("node:alpha");
    expect(result.ok).toBe(true);
  });

  it("falls back to execCommand on a non-secure origin (navigator.clipboard undefined)", async () => {
    // The KAR-002 bug: on plain-http origins navigator.clipboard is undefined,
    // so the copy must fall through to the hidden-textarea execCommand path.
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    const result = await dispatchCopy({ text: "node:alpha", what: "id" });
    expect(writeText).not.toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(result.ok).toBe(true);
  });

  it("falls back to execCommand when the async clipboard write rejects", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    const result = await dispatchCopy({ text: "x" });
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(result.ok).toBe(true);
  });

  it("reports not-ok only when BOTH the clipboard write and execCommand fail", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    execCommand.mockReturnValue(false);
    const result = await dispatchCopy({ text: "x" });
    expect(result.ok).toBe(false);
  });

  it("normalizes direct dispatch payloads before writing", async () => {
    await dispatchCopy({ text: 42, what: "unknown" });
    expect(writeText).toHaveBeenCalledWith("");
  });

  it("copyAction builds a copy-section descriptor routed through the copy verb", () => {
    const action = copyAction({
      id: "copy-id",
      label: { key: "common:actions.copy" },
      text: "n1",
      what: "id",
    });
    expect(action.section).toBe("copy");
    expect(action.label).toEqual({ key: "common:actions.copy" });
    expect(action.dispatch?.type).toBe(COPY_ACTION);
    expect(action.dispatch?.payload).toEqual({ text: "n1", what: "id" });
    expect(action.run).toBeUndefined();
  });

  it("copyAction normalizes descriptor ingress values", () => {
    const action = copyAction({
      id: " copy-id ",
      label: { key: "common:actions.copyPath" },
      text: "  n1  ",
      what: "unknown",
    });

    expect(action.id).toBe("copy-id");
    expect(action.label).toEqual({ key: "common:actions.copyPath" });
    expect(action.dispatch?.payload).toEqual({ text: "  n1  " });
    expect(copyAction({ id: "   ", text: 1 }).id).toBe("copy");
  });

  it("copyAction falls back to the canonical copy label for invalid ingress", () => {
    const fallbackLabel = { key: "common:actions.copy" };

    expect(copyAction({ label: "Copy id" }).label).toEqual(fallbackLabel);
    expect(copyAction({ label: { key: "invalid key" } }).label).toEqual(fallbackLabel);
    expect(copyAction({ label: { key: "common:actions.open" } }).label).toEqual(
      fallbackLabel,
    );
    expect(
      copyAction({
        label: { key: "common:actions.copy", values: { item: "document" } },
      }).label,
    ).toEqual(fallbackLabel);
    expect(copyAction({}).label).toEqual(fallbackLabel);
  });

  it("resolves every canonical copy label through the real localization runtime", () => {
    const runtime = createTestLocalizationRuntime();
    const cases = [
      ["common:actions.copy", "Copy"],
      ["common:actions.copyDocumentName", "Copy document name"],
      ["common:actions.copyPath", "Copy path"],
      ["common:actions.copySummary", "Copy summary"],
      ["common:actions.copyTitle", "Copy title"],
    ] as const;

    for (const [key, expected] of cases) {
      const action = copyAction({ label: { key } });
      expect(resolveMessageResult(runtime, action.label)).toEqual({
        message: expected,
        usedFallback: false,
      });
    }
  });
});
