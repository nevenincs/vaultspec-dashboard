import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { RIGHT_RAIL_TABS } from "../../stores/view/shellLayout";
import {
  deriveRightRailKeybindings,
  normalizeRightRailKeybindingTab,
  rightRailTabAction,
  rightRailTabActionId,
  rightRailTabChord,
} from "../../stores/view/rightRailKeybindings";

describe("right-rail actions", () => {
  it("derives stable ids, chords, order, contexts, and the shared Window group", () => {
    expect(deriveRightRailKeybindings()).toEqual([
      {
        id: "right-rail:show-status",
        defaultChord: "Mod+1",
        label: { key: "common:actions.showStatus" },
        group: { key: "common:shortcutGroups.window" },
        context: "right-rail",
      },
      {
        id: "right-rail:show-changes",
        defaultChord: "Mod+2",
        label: { key: "common:actions.showChanges" },
        group: { key: "common:shortcutGroups.window" },
        context: "right-rail",
      },
    ]);
  });

  it("resolves complete action labels through real English, French, and Arabic runtimes", () => {
    const source = createTestLocalizationRuntime();
    const french = createTestLocalizationRuntime(ltrTestLocale);
    const arabic = createTestLocalizationRuntime(rtlTestLocale);
    const expected = [
      ["Show status", "Afficher l’état", "إظهار الحالة"],
      ["Show changes", "Afficher les modifications", "إظهار التغييرات"],
    ] as const;

    for (const [index, binding] of deriveRightRailKeybindings().entries()) {
      expect(resolveMessageResult(source, binding.label).message).toBe(
        expected[index]![0],
      );
      expect(resolveMessageResult(french, binding.label).message).toBe(
        expected[index]![1],
      );
      expect(resolveMessageResult(arabic, binding.label).message).toBe(
        expected[index]![2],
      );
      expect(resolveMessageResult(source, binding.label).usedFallback).toBe(false);
      expect(resolveMessageResult(french, binding.label).usedFallback).toBe(false);
      expect(resolveMessageResult(arabic, binding.label).usedFallback).toBe(false);
    }
  });

  it("routes exact tab actions with raw ids and rejects unsafe presentation inputs", () => {
    const selected: string[] = [];
    const bindings = deriveRightRailKeybindings();
    const status = rightRailTabAction("status", (tab) => selected.push(tab));
    const changes = rightRailTabAction("changes", (tab) => selected.push(tab));

    expect(status).toMatchObject({
      id: "right-rail:show-status",
      label: { key: "common:actions.showStatus" },
    });
    expect(changes).toMatchObject({
      id: "right-rail:show-changes",
      label: { key: "common:actions.showChanges" },
    });
    expect(status!.label).toBe(bindings[0]!.label);
    expect(changes!.label).toBe(bindings[1]!.label);
    status?.run?.();
    changes?.run?.();
    expect(selected).toEqual(["status", "changes"]);
    expect(rightRailTabAction(" status ", (tab) => selected.push(tab))).toBeNull();
    expect(rightRailTabAction("search", (tab) => selected.push(tab))).toBeNull();
    expect(rightRailTabAction(null, (tab) => selected.push(tab))).toBeNull();
  });

  it("preserves normalization and chord behavior for raw command identity", () => {
    expect(RIGHT_RAIL_TABS.map((tab) => tab.id)).toEqual(["status", "changes"]);
    expect(normalizeRightRailKeybindingTab(" changes ")).toBe("changes");
    expect(normalizeRightRailKeybindingTab({ tab: "changes" })).toBeNull();
    expect(rightRailTabActionId(" changes ")).toBe("right-rail:show-changes");
    expect(rightRailTabActionId({ tab: "changes" })).toBeNull();
    expect(rightRailTabChord(0)).toBe("Mod+1");
    expect(rightRailTabChord("0")).toBeNull();
    expect(rightRailTabChord(RIGHT_RAIL_TABS.length)).toBeNull();
  });
});
