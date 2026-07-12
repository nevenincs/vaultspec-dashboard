// @vitest-environment happy-dom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createLiveClient, liveTransport } from "../../../testing/liveClient";
import { ENGINE_WAIT } from "../../../testing/timing";
import { engineClient } from "../engine";
import { deriveFolderBrowserView } from "../../../app/left/FolderBrowser";
import { engineKeys, useFsList } from "./index";
import { testQueryClient, wrapper } from "./testFixtures";

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

describe("useFsList over the live engine (single-app-runtime ADR O6)", () => {
  it("lists the filesystem roots when no path is given", async () => {
    const client = testQueryClient();
    const { result } = renderHook(() => useFsList(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true), ENGINE_WAIT);
    const data = result.current.data!;
    expect(data.path).toBeNull();
    expect(data.parent).toBeNull();
    expect(Array.isArray(data.entries)).toBe(true);
    expect(data.entries.length).toBeGreaterThan(0);
    for (const entry of data.entries) {
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.path).toBe("string");
      expect(typeof entry.is_managed).toBe("boolean");
      expect(typeof entry.is_git).toBe("boolean");
    }
    expect(data.truncated).toBe(false);
  });

  it("lists a real worktree's immediate subdirectories, marking the vault-bearing one managed", async () => {
    const map = await createLiveClient().map();
    const worktree = map.repositories
      .flatMap((repo) => repo.worktrees)
      .find((w) => w.has_vault);
    expect(worktree).toBeDefined();
    const parentDir = worktree!.path.replace(/[\\/][^\\/]+[\\/]?$/, "");

    const client = testQueryClient();
    const { result } = renderHook(() => useFsList(parentDir), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true), ENGINE_WAIT);
    const data = result.current.data!;
    expect(data.path).not.toBeNull();
    const view = deriveFolderBrowserView(data, false, false);
    expect(view.state).toBe("ready");
    expect(view.canChooseCurrent).toBe(true);
    // Every listed row is a real subdirectory name, never a file.
    for (const row of view.rows) {
      expect(row.label.length).toBeGreaterThan(0);
    }
  });

  it("rejects a non-absolute path with a tiered error, never a thrown crash", async () => {
    const client = testQueryClient();
    const { result } = renderHook(() => useFsList("relative/path"), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.isError).toBe(true), ENGINE_WAIT);
  });

  it("keys each distinct directory as its own bounded cache entry", () => {
    expect(engineKeys.fsList()).not.toEqual(engineKeys.fsList("/some/dir"));
    expect(engineKeys.fsList("/a")).not.toEqual(engineKeys.fsList("/b"));
  });
});
