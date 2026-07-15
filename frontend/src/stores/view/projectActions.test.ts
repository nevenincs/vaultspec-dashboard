import { describe, expect, it } from "vitest";

import { FolderGit2, FolderPlus } from "lucide-react";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import {
  PROJECT_BROWSE_ACTION_ID,
  PROJECT_CLEAR_HISTORY_ACTION_ID,
  PROJECT_OPEN_ACTION_ID,
  PROJECT_BROWSE_LABEL,
  PROJECT_OPEN_LABEL,
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
        label: PROJECT_OPEN_LABEL,
        group: { key: "projects:shortcutGroups.projects" },
        context: "global",
      },
      {
        id: PROJECT_BROWSE_ACTION_ID,
        defaultChord: "Mod+Alt+P",
        label: PROJECT_BROWSE_LABEL,
        group: { key: "projects:shortcutGroups.projects" },
        context: "global",
      },
    ]);
    // Clear History is a destructive verb — palette-only, no standing chord.
    expect(defs.map((b) => b.id)).not.toContain(PROJECT_CLEAR_HISTORY_ACTION_ID);
    expect(new Set(defs.map((b) => b.defaultChord)).size).toBe(2);
    expect(defs[0]?.label).toBe(PROJECT_OPEN_LABEL);
    expect(defs[1]?.label).toBe(PROJECT_BROWSE_LABEL);
    expect(defs[0]?.group).toBe(defs[1]?.group);
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
    expect(openProjectAction().label).toBe(PROJECT_OPEN_LABEL);
    expect(browseProjectsAction().label).toBe(PROJECT_BROWSE_LABEL);
  });

  it("resolves project navigation through the real localization runtime", () => {
    const runtimes = [
      createTestLocalizationRuntime(),
      createTestLocalizationRuntime(ltrTestLocale),
      createTestLocalizationRuntime(rtlTestLocale),
    ] as const;
    for (const action of [openProjectAction(), browseProjectsAction()]) {
      const messages = runtimes.map(
        (runtime) => resolveMessageResult(runtime, action.label).message,
      );
      expect(new Set(messages).size).toBe(3);
      expect(
        runtimes.every(
          (runtime) => !resolveMessageResult(runtime, action.label).usedFallback,
        ),
      ).toBe(true);
    }
  });
});
