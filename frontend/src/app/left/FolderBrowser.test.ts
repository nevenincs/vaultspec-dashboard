// Pure resolver test for the add-project folder picker (single-app-runtime ADR
// O6): wire-free per the FolderBrowser component's split (`deriveFolderBrowserView`
// is a pure function over a `FsListResponse`, unit-tested here without mounting
// React or touching the wire — the live `/fs/list` shape is exercised by
// `queries/fsBrowse.test.ts`).

import { describe, expect, it } from "vitest";
import type { FsListResponse } from "../../stores/server/engine";
import { deriveFolderBrowserView } from "./FolderBrowser";

const rootsResponse: FsListResponse = {
  path: null,
  parent: null,
  entries: [
    { name: "C:", path: "C:/", is_managed: false, is_git: false },
    { name: "D:", path: "D:/", is_managed: false, is_git: false },
  ],
  truncated: false,
  tiers: {},
};

const dirResponse: FsListResponse = {
  path: "C:/code",
  parent: "C:/",
  entries: [
    { name: "alpha", path: "C:/code/alpha", is_managed: true, is_git: false },
    { name: "beta", path: "C:/code/beta", is_managed: false, is_git: true },
    { name: "gamma", path: "C:/code/gamma", is_managed: false, is_git: false },
  ],
  truncated: false,
  tiers: {},
};

describe("deriveFolderBrowserView", () => {
  it("renders the loading state with nothing choosable yet", () => {
    const view = deriveFolderBrowserView(undefined, true, false);
    expect(view.state).toBe("loading");
    expect(view.canChooseCurrent).toBe(false);
    expect(view.rows).toEqual([]);
  });

  it("renders the error state honestly, never a thrown crash", () => {
    const view = deriveFolderBrowserView(undefined, false, true);
    expect(view.state).toBe("error");
    expect(view.rows).toEqual([]);
  });

  it("lists the filesystem roots with no up row and nothing choosable", () => {
    const view = deriveFolderBrowserView(rootsResponse, false, false);
    expect(view.state).toBe("ready");
    expect(view.headerLabel).toBe("This computer");
    expect(view.canChooseCurrent).toBe(false);
    expect(view.rows.map((r) => r.label)).toEqual(["C:", "D:"]);
    expect(view.rows.every((r) => !r.isUp)).toBe(true);
  });

  it("lists a directory's subfolders with a leading up row and badges", () => {
    const view = deriveFolderBrowserView(dirResponse, false, false);
    expect(view.state).toBe("ready");
    expect(view.headerLabel).toBe("C:/code");
    expect(view.canChooseCurrent).toBe(true);
    expect(view.rows[0]).toMatchObject({ isUp: true, path: "C:/", label: ".." });
    expect(view.rows.slice(1).map((r) => [r.label, r.badge])).toEqual([
      ["alpha", "Project"],
      ["beta", "Git repository"],
      ["gamma", null],
    ]);
  });

  it("omits the up row when the directory has no parent (should not occur below roots, but stays honest)", () => {
    const view = deriveFolderBrowserView(
      { ...dirResponse, parent: null },
      false,
      false,
    );
    expect(view.rows.every((r) => !r.isUp)).toBe(true);
  });

  it("states truncation honestly instead of silently dropping folders", () => {
    const view = deriveFolderBrowserView(
      { ...dirResponse, truncated: true },
      false,
      false,
    );
    expect(view.truncatedMessage).toBe("Showing the first 256 folders.");
  });

  it("reports an honest empty message for a directory with no subfolders", () => {
    const view = deriveFolderBrowserView(
      { ...dirResponse, parent: null, entries: [] },
      false,
      false,
    );
    expect(view.emptyMessage).toBe("No subfolders here.");
  });
});
