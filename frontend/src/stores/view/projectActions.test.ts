import { describe, expect, it } from "vitest";

import {
  PROJECT_BROWSE_ACTION_ID,
  PROJECT_CLEAR_HISTORY_ACTION_ID,
  PROJECT_OPEN_ACTION_ID,
  browseProjectsAction,
  clearHistoryAction,
  deriveProjectKeybindings,
  openProjectAction,
} from "./projectActions";

describe("project action group", () => {
  it("binds Open and Browse to the keymap with distinct chords; Clear History is palette-only", () => {
    const defs = deriveProjectKeybindings();
    expect(defs.map((b) => b.id)).toEqual([
      PROJECT_OPEN_ACTION_ID,
      PROJECT_BROWSE_ACTION_ID,
    ]);
    // Clear History is a destructive verb — palette-only, no standing chord.
    expect(defs.map((b) => b.id)).not.toContain(PROJECT_CLEAR_HISTORY_ACTION_ID);
    expect(new Set(defs.map((b) => b.defaultChord)).size).toBe(2);
    expect(defs.every((b) => b.group === "Project")).toBe(true);
  });

  it("authors each verb once under the project namespace with its Project: label", () => {
    expect(openProjectAction()).toMatchObject({
      id: PROJECT_OPEN_ACTION_ID,
      label: "Project: Open",
    });
    expect(browseProjectsAction()).toMatchObject({
      id: PROJECT_BROWSE_ACTION_ID,
      label: "Project: Browse or Switch",
    });
  });

  it("runs the injected clear effect from the Clear History descriptor", () => {
    let cleared = 0;
    const action = clearHistoryAction(() => {
      cleared += 1;
    });
    expect(action).toMatchObject({
      id: PROJECT_CLEAR_HISTORY_ACTION_ID,
      label: "Project: Clear History",
    });
    action.run?.();
    expect(cleared).toBe(1);
  });
});
