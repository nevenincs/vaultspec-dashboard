import { describe, expect, it } from "vitest";

import { FolderGit2, FolderPlus } from "lucide-react";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import {
  PROJECT_BROWSE_ACTION_ID,
  PROJECT_CLEAR_HISTORY_ACTION_ID,
  PROJECT_OPEN_ACTION_ID,
  browseProjectsAction,
  deriveProjectKeybindings,
  openProjectAction,
} from "./projectActions";

describe("project action group", () => {
  it("binds Open and Browse to the keymap with distinct chords; Clear History is palette-only", () => {
    const defs = deriveProjectKeybindings();
    expect(defs).toEqual([
      {
        id: PROJECT_OPEN_ACTION_ID,
        defaultChord: "Mod+Alt+O",
        label: "Project: Open",
        group: "Project",
        context: "global",
      },
      {
        id: PROJECT_BROWSE_ACTION_ID,
        defaultChord: "Mod+Alt+P",
        label: "Project: Browse or Switch",
        group: "Project",
        context: "global",
      },
    ]);
    // Clear History is a destructive verb — palette-only, no standing chord.
    expect(defs.map((b) => b.id)).not.toContain(PROJECT_CLEAR_HISTORY_ACTION_ID);
    expect(new Set(defs.map((b) => b.defaultChord)).size).toBe(2);
    expect(defs.every((b) => b.group === "Project")).toBe(true);
  });

  it("authors project navigation with canonical descriptors and stable behavior", () => {
    expect(openProjectAction()).toMatchObject({
      id: PROJECT_OPEN_ACTION_ID,
      label: { key: "projects:actions.add" },
      section: "transform",
      icon: FolderPlus,
    });
    expect(browseProjectsAction()).toMatchObject({
      id: PROJECT_BROWSE_ACTION_ID,
      label: { key: "projects:actions.switch" },
      section: "navigate",
      icon: FolderGit2,
    });
  });

  it("resolves project navigation through the real localization runtime", () => {
    const runtime = createTestLocalizationRuntime();
    const cases = [
      [openProjectAction(), "Add project…"],
      [browseProjectsAction(), "Switch project…"],
    ] as const;

    for (const [action, message] of cases) {
      expect(resolveMessageResult(runtime, action.label)).toEqual({
        message,
        usedFallback: false,
      });
    }
  });
});
