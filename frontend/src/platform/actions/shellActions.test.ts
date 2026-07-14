// @vitest-environment happy-dom
//
// Host-shell verbs (W02.P05.S23): without a host bridge they are
// disabled-with-reason and their handlers return a degraded result (no throw);
// with a bridge they are enabled and dispatch through the seam to the host.

import { describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { appDispatcher } from "../dispatch/middleware";
import { resolveMessageResult } from "../localization/fallback";
import {
  REVEAL_ACTION,
  isHostShellAvailable,
  normalizeShellPath,
  normalizeShellPayload,
  openInEditorAction,
  revealAction,
  type ShellResult,
} from "./shellActions";

describe("host-shell verbs without a bridge (pure web)", () => {
  it("reports unavailable", () => {
    expect(isHostShellAvailable()).toBe(false);
  });

  it("normalizes shell payloads without trimming paths", () => {
    expect(normalizeShellPath(" /a/b ")).toBe(" /a/b ");
    expect(normalizeShellPath(42)).toBe("");
    expect(normalizeShellPayload({ path: " /a/b " })).toEqual({ path: " /a/b " });
    expect(normalizeShellPayload({ path: null })).toEqual({ path: "" });
  });

  it("builds disabled-with-reason descriptors", () => {
    const reveal = revealAction({ id: "reveal", path: "/a/b" });
    expect(reveal.disabled).toBe(true);
    expect(reveal.label).toEqual({ key: "common:actions.showInFileManager" });
    expect(reveal.disabledReason).toEqual({
      key: "common:disabledReasons.desktopFileManagerRequired",
    });
    const open = openInEditorAction({ id: "open", path: "/a/b" });
    expect(open.disabled).toBe(true);
    expect(open.label).toEqual({ key: "common:actions.openInEditor" });
    expect(open.disabledReason).toEqual({
      key: "common:disabledReasons.desktopEditorRequired",
    });
  });

  it("resolves shell labels and actionable reasons through the real localization runtime", () => {
    const runtime = createTestLocalizationRuntime();
    const reveal = revealAction({ id: "reveal", path: "/a/b" });
    const open = openInEditorAction({ id: "open", path: "/a/b" });

    for (const [descriptor, message] of [
      [reveal.label, "Show in file manager"],
      [reveal.disabledReason, "Open the desktop app to show this item."],
      [open.label, "Open in editor"],
      [open.disabledReason, "Open the desktop app to edit this file."],
    ] as const) {
      expect(resolveMessageResult(runtime, descriptor)).toEqual({
        message,
        usedFallback: false,
      });
    }
  });

  it("normalizes descriptor ids and payload paths at construction", () => {
    const reveal = revealAction({ id: " reveal ", path: " /a/b " });
    expect(reveal.id).toBe("reveal");
    expect(reveal.dispatch?.payload).toEqual({ path: " /a/b " });

    const open = openInEditorAction({ id: "   ", path: 42 });
    expect(open.id).toBe("open-in-editor");
    expect(open.dispatch?.payload).toEqual({ path: "" });
  });

  it("the handler returns a degraded result rather than throwing", async () => {
    const result = (await appDispatcher.dispatch({
      type: REVEAL_ACTION,
      payload: { path: "/a/b" },
    })) as ShellResult;
    expect(result).toEqual({ ok: false, degraded: true });
  });

  it("the handler normalizes malformed runtime payloads", async () => {
    const result = (await appDispatcher.dispatch({
      type: REVEAL_ACTION,
      payload: { path: 42 },
    })) as ShellResult;
    expect(result).toEqual({ ok: false, degraded: true });
  });
});
