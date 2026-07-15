import { beforeEach, describe, expect, it } from "vitest";

import {
  ADD_PROJECT_PATH_MAX_CHARS,
  normalizeAddProjectChromeView,
  normalizeAddProjectPath,
  openAddProjectDialog,
  resetAddProjectChrome,
  setAddProjectIssue,
  setAddProjectPath,
  toggleAddProjectDialog,
  useAddProjectChromeStore,
} from "./addProjectChrome";

describe("add-project chrome store", () => {
  beforeEach(() => resetAddProjectChrome());

  it("normalizes the path draft at the store boundary and bounds its length", () => {
    expect(normalizeAddProjectPath(42)).toBe("");
    expect(normalizeAddProjectPath("  /repo  ")).toBe("  /repo  ");
    const long = "x".repeat(ADD_PROJECT_PATH_MAX_CHARS + 10);
    expect(normalizeAddProjectPath(long)).toHaveLength(ADD_PROJECT_PATH_MAX_CHARS);
  });

  it("stores only closed add-project issues", () => {
    for (const issue of [
      "pathRequired",
      "folderUnavailable",
      "notGitProject",
      "alreadyAdded",
      "addFailed",
    ] as const) {
      setAddProjectIssue(issue);
      expect(useAddProjectChromeStore.getState().issue).toBe(issue);
    }
    setAddProjectIssue("raw engine diagnostic");
    expect(useAddProjectChromeStore.getState().issue).toBeNull();
    setAddProjectIssue({ issue: "addFailed" });
    expect(useAddProjectChromeStore.getState().issue).toBeNull();
  });

  it("opens idempotently and resets on toggle-closed", () => {
    openAddProjectDialog();
    expect(useAddProjectChromeStore.getState().open).toBe(true);
    // setting a path then opening again must NOT clobber the draft (idempotent-open).
    setAddProjectPath("/code/project");
    openAddProjectDialog();
    expect(useAddProjectChromeStore.getState().path).toBe("/code/project");
    // toggling an open dialog closes AND resets the draft.
    toggleAddProjectDialog();
    expect(useAddProjectChromeStore.getState()).toMatchObject({
      open: false,
      path: "",
      issue: null,
    });
  });

  it("clears the error when the path changes (typing dismisses the refusal)", () => {
    openAddProjectDialog();
    setAddProjectIssue("pathRequired");
    expect(useAddProjectChromeStore.getState().issue).toBe("pathRequired");
    setAddProjectPath("/code/fixed");
    expect(useAddProjectChromeStore.getState().issue).toBeNull();
  });

  it("projects a normalized chrome view from malformed state", () => {
    useAddProjectChromeStore.setState({
      open: "true",
      path: 99,
      issue: "raw engine diagnostic",
    } as unknown as Partial<ReturnType<typeof useAddProjectChromeStore.getState>>);
    expect(normalizeAddProjectChromeView(useAddProjectChromeStore.getState())).toEqual({
      open: false,
      path: "",
      issue: null,
    });
  });
});
