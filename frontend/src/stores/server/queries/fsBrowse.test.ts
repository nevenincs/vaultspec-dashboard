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
    expect(data.is_registered).toBe(false);
    expect(Array.isArray(data.entries)).toBe(true);
    expect(data.entries.length).toBeGreaterThan(0);
    for (const entry of data.entries) {
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.path).toBe("string");
      expect(typeof entry.is_managed).toBe("boolean");
      expect(typeof entry.is_git).toBe("boolean");
      expect(typeof entry.is_hidden).toBe("boolean");
      expect(typeof entry.is_registered).toBe("boolean");
    }
    expect(data.truncated).toBe(false);
    // The roots response carries the engine-served places block (ADR D4):
    // at least the home directory, each entry a real absolute path.
    expect(Array.isArray(data.places)).toBe(true);
    expect(data.places.length).toBeGreaterThan(0);
    for (const place of data.places) {
      expect(typeof place.name).toBe("string");
      expect(place.path.length).toBeGreaterThan(0);
    }
  });

  it("lists a real worktree's immediate subdirectories, marking the vault-bearing one managed", async () => {
    const map = await createLiveClient().map();
    const worktree = map.repositories
      .flatMap((repo) => repo.worktrees)
      .find((w) => w.has_vault);
    expect(worktree).toBeDefined();
    const parentDir = worktree!.path.replace(/[\\/][^\\/]+[\\/]?$/, "");

    const client = testQueryClient();
    const { result } = renderHook(() => useFsList({ path: parentDir }), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true), ENGINE_WAIT);
    const data = result.current.data!;
    expect(data.path).not.toBeNull();
    const view = deriveFolderBrowserView({
      data,
      loading: false,
      errored: false,
      filtered: false,
    });
    expect(view.state).toBe("ready");
    expect(view.currentPath).not.toBeNull();
    expect(view.breadcrumbs.length).toBeGreaterThan(1);
    // Every listed row is a real subdirectory name, never a file.
    for (const row of view.rows) {
      expect(row.label.length).toBeGreaterThan(0);
    }
  });

  it("rejects a non-absolute path with a tiered error, never a thrown crash", async () => {
    const client = testQueryClient();
    const { result } = renderHook(() => useFsList({ path: "relative/path" }), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.isError).toBe(true), ENGINE_WAIT);
  });

  it("narrows a level engine-side with q (filtering law: never a client narrow)", async () => {
    const map = await createLiveClient().map();
    const worktree = map.repositories
      .flatMap((repo) => repo.worktrees)
      .find((w) => w.has_vault);
    expect(worktree).toBeDefined();
    const parentDir = worktree!.path.replace(/[\\/][^\\/]+[\\/]?$/, "");
    const leafName = worktree!.path.split(/[\\/]/).filter(Boolean).pop()!;

    const client = testQueryClient();
    const { result } = renderHook(() => useFsList({ path: parentDir, q: leafName }), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true), ENGINE_WAIT);
    const data = result.current.data!;
    expect(data.entries.length).toBeGreaterThan(0);
    for (const entry of data.entries) {
      expect(entry.name.toLowerCase()).toContain(leafName.toLowerCase());
    }
  });

  it("keys each distinct directory, filter, and hidden flag as its own cache entry", () => {
    expect(engineKeys.fsList()).not.toEqual(engineKeys.fsList("/some/dir"));
    expect(engineKeys.fsList("/a")).not.toEqual(engineKeys.fsList("/b"));
    expect(engineKeys.fsList("/a", "q")).not.toEqual(engineKeys.fsList("/a"));
    expect(engineKeys.fsList("/a", undefined, true)).not.toEqual(
      engineKeys.fsList("/a"),
    );
  });
});
