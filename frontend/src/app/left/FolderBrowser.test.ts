// Pure resolver tests for folder browsing, breadcrumbs, typed paths, and shortcuts.

import { describe, expect, it } from "vitest";
import type { FsListResponse } from "../../stores/server/engine";
import {
  basename,
  parentDirectory,
  parseTypedPath,
  retreatTypedPathResolution,
} from "./AddProjectDialog";
import { deriveBreadcrumbs, deriveFolderBrowserView } from "./FolderBrowser";
import { derivePickerPlaces, pickerParentPath } from "./PickerPlacesRail";

const rootsResponse: FsListResponse = {
  path: null,
  parent: null,
  is_registered: false,
  entries: [
    {
      name: "C:",
      path: "C:/",
      is_managed: false,
      is_git: false,
      is_hidden: false,
      is_registered: false,
    },
    {
      name: "D:",
      path: "D:/",
      is_managed: false,
      is_git: false,
      is_hidden: false,
      is_registered: false,
    },
  ],
  places: [{ name: "Home", path: "C:/Users/octocat" }],
  truncated: false,
  tiers: {},
};

const dirResponse: FsListResponse = {
  path: "C:/code",
  parent: "C:/",
  is_registered: false,
  entries: [
    {
      name: "alpha",
      path: "C:/code/alpha",
      is_managed: true,
      is_git: false,
      is_hidden: false,
      is_registered: true,
    },
    {
      name: "beta",
      path: "C:/code/beta",
      is_managed: false,
      is_git: true,
      is_hidden: false,
      is_registered: false,
    },
    {
      name: ".cache",
      path: "C:/code/.cache",
      is_managed: false,
      is_git: false,
      is_hidden: true,
      is_registered: false,
    },
    {
      name: "gamma",
      path: "C:/code/gamma",
      is_managed: false,
      is_git: false,
      is_hidden: false,
      is_registered: false,
    },
  ],
  places: [],
  truncated: false,
  tiers: {},
};

describe("deriveFolderBrowserView", () => {
  it("renders the loading state with nothing browsable yet", () => {
    const view = deriveFolderBrowserView({
      data: undefined,
      loading: true,
      errored: false,
      filtered: false,
    });
    expect(view.state).toBe("loading");
    expect(view.currentPath).toBeNull();
    expect(view.rows).toEqual([]);
  });

  it("renders the error state honestly, never a thrown crash", () => {
    const view = deriveFolderBrowserView({
      data: undefined,
      loading: false,
      errored: true,
      filtered: false,
    });
    expect(view.state).toBe("error");
    expect(view.rows).toEqual([]);
  });

  it("lists the filesystem roots with only the roots crumb", () => {
    const view = deriveFolderBrowserView({
      data: rootsResponse,
      loading: false,
      errored: false,
      filtered: false,
    });
    expect(view.state).toBe("ready");
    expect(view.currentPath).toBeNull();
    expect(view.currentName).toBeNull();
    expect(view.breadcrumbs).toHaveLength(1);
    expect(view.rows.map((r) => r.label)).toEqual(["C:", "D:"]);
  });

  it("marks registered, project, git, and hidden rows with the right badges (registered wins)", () => {
    const view = deriveFolderBrowserView({
      data: dirResponse,
      loading: false,
      errored: false,
      filtered: false,
    });
    expect(view.currentPath).toBe("C:/code");
    expect(view.currentName).toBe("code");
    expect(view.rows.map((r) => [r.label, r.badge])).toEqual([
      ["alpha", "already-added"],
      ["beta", "git-repository"],
      [".cache", "hidden"],
      ["gamma", null],
    ]);
    expect(view.rows[0]!.isRegistered).toBe(true);
    expect(view.rows[2]!.isHidden).toBe(true);
  });

  it("derives the clickable trail with drive segments navigating through their root form", () => {
    const view = deriveFolderBrowserView({
      data: dirResponse,
      loading: false,
      errored: false,
      filtered: false,
    });
    expect(view.breadcrumbs.map((c) => c.path)).toEqual([null, "C:/", "C:/code"]);
  });

  it("states truncation honestly instead of silently dropping folders", () => {
    const view = deriveFolderBrowserView({
      data: { ...dirResponse, truncated: true },
      loading: false,
      errored: false,
      filtered: false,
    });
    expect(view.truncated).toBe(true);
  });

  it("distinguishes an empty level from an empty filter result", () => {
    const empty = deriveFolderBrowserView({
      data: { ...dirResponse, entries: [] },
      loading: false,
      errored: false,
      filtered: false,
    });
    expect(empty.emptyMessage).toEqual({
      key: "projects:folderBrowser.empty.noSubfolders",
    });
    const noMatch = deriveFolderBrowserView({
      data: { ...dirResponse, entries: [] },
      loading: false,
      errored: false,
      filtered: true,
    });
    expect(noMatch.emptyMessage).toEqual({
      key: "projects:folderBrowser.empty.noMatches",
    });
  });
});

describe("deriveBreadcrumbs", () => {
  it("builds a unix trail from the root", () => {
    expect(deriveBreadcrumbs("/home/octocat/code").map((c) => c.path)).toEqual([
      null,
      "/home",
      "/home/octocat",
      "/home/octocat/code",
    ]);
  });

  it("builds a windows trail whose drive crumb targets the drive root", () => {
    const crumbs = deriveBreadcrumbs("Y:/code/dashboard");
    expect(crumbs.map((c) => c.path)).toEqual([
      null,
      "Y:/",
      "Y:/code",
      "Y:/code/dashboard",
    ]);
    expect(crumbs[1]!.label).toBe("Y:");
  });

  it("preserves a UNC share root in its navigation targets", () => {
    expect(deriveBreadcrumbs("//server/share/project").map((c) => c.path)).toEqual([
      null,
      "//server",
      "//server/share",
      "//server/share/project",
    ]);
  });
});

describe("parseTypedPath", () => {
  it("splits a typed path into the parent level and the unfinished segment", () => {
    expect(parseTypedPath("Y:/code/vau")).toEqual({
      level: "Y:/code",
      filter: "vau",
    });
    expect(parseTypedPath("/home/octo")).toEqual({ level: "/home", filter: "octo" });
  });

  it("treats a trailing separator as a complete level with no filter", () => {
    expect(parseTypedPath("Y:/code/")).toEqual({ level: "Y:/code", filter: "" });
    expect(parseTypedPath("/")).toEqual({ level: "/", filter: "" });
  });

  it("requires a rooted drive path and keeps the drive-root form", () => {
    expect(parseTypedPath("Y:")).toBeNull();
    expect(parseTypedPath("Y:/")).toEqual({ level: "Y:/", filter: "" });
    expect(parseTypedPath("Y:/x")).toEqual({ level: "Y:/", filter: "x" });
  });

  it("normalizes backslashes and rejects relative fragments", () => {
    expect(parseTypedPath("Y:\\code\\dash")).toEqual({
      level: "Y:/code",
      filter: "dash",
    });
    expect(parseTypedPath("relative/path")).toBeNull();
    expect(parseTypedPath("Y:relative")).toBeNull();
    expect(parseTypedPath("   ")).toBeNull();
  });
});

describe("parentDirectory", () => {
  it("walks absolute paths to their roots", () => {
    expect(parentDirectory("Y:/code/dashboard")).toBe("Y:/code");
    expect(parentDirectory("Y:/code")).toBe("Y:/");
    expect(parentDirectory("Y:/")).toBeNull();
    expect(parentDirectory("/home/octocat")).toBe("/home");
    expect(parentDirectory("/home")).toBe("/");
    expect(parentDirectory("/")).toBeNull();
    expect(parentDirectory("//server/share/project")).toBe("//server/share");
    expect(parentDirectory("//server/share")).toBeNull();
  });
});

describe("retreatTypedPathResolution", () => {
  it("walks toward the deepest existing ancestor one bounded level at a time", () => {
    const first = retreatTypedPathResolution({
      level: "Y:/code/missing/deeper",
      filter: "folder",
      enterRequested: true,
    });
    expect(first).toEqual({
      level: "Y:/code/missing",
      filter: "deeper",
      enterRequested: true,
    });
    expect(retreatTypedPathResolution(first!)).toEqual({
      level: "Y:/code",
      filter: "missing",
      enterRequested: true,
    });
  });
});

describe("basename", () => {
  it("returns the final path component across separators", () => {
    expect(basename("Y:/code/dashboard")).toBe("dashboard");
    expect(basename("C:\\Users\\octocat")).toBe("octocat");
    expect(basename("/")).toBe("/");
  });
});

describe("derivePickerPlaces", () => {
  it("composes home, drives, registered projects, and deduped capped recents", () => {
    const sections = derivePickerPlaces({
      roots: rootsResponse,
      workspaces: [
        {
          id: "ws-1",
          label: "dashboard",
          path: "Y:/code/dashboard",
          is_launch: true,
          reachable: true,
          unreachable_reason: null,
        },
      ],
      recentScopes: [
        { workspace: "ws-1", scope: "Y:/code/dashboard/main" },
        { workspace: "ws-1", scope: "Y:/code/dashboard/main" },
        { workspace: "ws-1", scope: "Y:/code/dashboard/feature-a" },
        { workspace: "ws-1", scope: "Y:/code/dashboard/feature-b" },
        { workspace: "ws-1", scope: "Y:/code/dashboard/feature-c" },
      ],
    });
    expect(sections.map((s) => s.key)).toEqual(["top", "drives", "projects", "recent"]);
    expect(sections[0]!.rows[0]!.path).toBe("C:/Users/octocat");
    expect(sections[1]!.rows.map((r) => r.path)).toEqual(["C:/", "D:/"]);
    expect(sections[2]!.rows[0]!.label).toBe("dashboard");
    expect(sections[2]!.rows[0]!.path).toBe("Y:/code");
    // Deduplicated and capped at three, preserving order.
    expect(sections[3]!.rows.map((r) => r.label)).toEqual([
      "main",
      "feature-a",
      "feature-b",
    ]);
  });

  it("opens a registered project's parent so its marked row is visible", () => {
    expect(pickerParentPath("Y:/code/dashboard")).toBe("Y:/code");
    expect(pickerParentPath("/home/octocat/project")).toBe("/home/octocat");
    expect(pickerParentPath("//server/share/project")).toBe("//server/share");
  });

  it("omits empty sections instead of rendering hollow headings", () => {
    const sections = derivePickerPlaces({
      roots: undefined,
      workspaces: [],
      recentScopes: [],
    });
    expect(sections).toEqual([]);
  });
});
