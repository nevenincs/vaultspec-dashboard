// @vitest-environment happy-dom
//
// Host-shell verbs (W02.P05.S23): without a host bridge they are
// disabled-with-reason and their handlers return a degraded result (no throw);
// with a bridge they are enabled and dispatch through the seam to the host.

import { afterEach, describe, expect, it, vi } from "vitest";

import { appDispatcher } from "../dispatch/middleware";
import {
  OPEN_IN_EDITOR_ACTION,
  REVEAL_ACTION,
  isHostShellAvailable,
  openInEditorAction,
  revealAction,
  type ShellResult,
} from "./shellActions";

afterEach(() => {
  delete window.vaultspecHost;
  vi.restoreAllMocks();
});

describe("host-shell verbs without a bridge (pure web)", () => {
  it("reports unavailable", () => {
    expect(isHostShellAvailable()).toBe(false);
  });

  it("builds disabled-with-reason descriptors", () => {
    const reveal = revealAction({ id: "reveal", path: "/a/b" });
    expect(reveal.disabled).toBe(true);
    expect(reveal.disabledReason).toBe("not available in the browser");
    const open = openInEditorAction({ id: "open", path: "/a/b" });
    expect(open.disabled).toBe(true);
  });

  it("the handler returns a degraded result rather than throwing", async () => {
    const result = (await appDispatcher.dispatch({
      type: REVEAL_ACTION,
      payload: { path: "/a/b" },
    })) as ShellResult;
    expect(result).toEqual({ ok: false, degraded: true });
  });
});

describe("host-shell verbs with a bridge installed", () => {
  it("are enabled and dispatch to the host through the seam", async () => {
    const reveal = vi.fn().mockResolvedValue(undefined);
    const openInEditor = vi.fn().mockResolvedValue(undefined);
    window.vaultspecHost = { reveal, openInEditor };

    expect(isHostShellAvailable()).toBe(true);
    expect(revealAction({ id: "reveal", path: "/a/b" }).disabled).toBe(false);

    const result = (await appDispatcher.dispatch({
      type: OPEN_IN_EDITOR_ACTION,
      payload: { path: "/a/b" },
    })) as ShellResult;
    expect(openInEditor).toHaveBeenCalledWith("/a/b");
    expect(result.ok).toBe(true);
  });
});
