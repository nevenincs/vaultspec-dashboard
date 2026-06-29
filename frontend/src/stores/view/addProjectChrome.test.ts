import { beforeEach, describe, expect, it } from "vitest";

import {
  ADD_PROJECT_ERROR_MAX_CHARS,
  ADD_PROJECT_PATH_MAX_CHARS,
  normalizeAddProjectChromeView,
  normalizeAddProjectError,
  normalizeAddProjectPath,
  openAddProjectDialog,
  resetAddProjectChrome,
  setAddProjectError,
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

  it("normalizes the error to a non-empty bounded string or null", () => {
    expect(normalizeAddProjectError("   ")).toBeNull();
    expect(normalizeAddProjectError(7)).toBeNull();
    expect(normalizeAddProjectError("bad path")).toBe("bad path");
    const long = "x".repeat(ADD_PROJECT_ERROR_MAX_CHARS + 10);
    expect(normalizeAddProjectError(long)).toHaveLength(ADD_PROJECT_ERROR_MAX_CHARS);
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
      error: null,
    });
  });

  it("clears the error when the path changes (typing dismisses the refusal)", () => {
    openAddProjectDialog();
    setAddProjectError("path is not a readable directory");
    expect(useAddProjectChromeStore.getState().error).not.toBeNull();
    setAddProjectPath("/code/fixed");
    expect(useAddProjectChromeStore.getState().error).toBeNull();
  });

  it("projects a normalized chrome view from malformed state", () => {
    useAddProjectChromeStore.setState({
      open: "true",
      path: 99,
      error: "   ",
    } as unknown as Partial<ReturnType<typeof useAddProjectChromeStore.getState>>);
    expect(normalizeAddProjectChromeView(useAddProjectChromeStore.getState())).toEqual({
      open: false,
      path: "",
      error: null,
    });
  });
});
