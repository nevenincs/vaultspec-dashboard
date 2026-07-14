import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import {
  deriveRegionCycleKeybindings,
  regionCycleAction,
} from "./regionCycleKeybindings";

describe("localized region-cycle keybindings", () => {
  it("preserves order and binding behavior under shared descriptors", () => {
    const bindings = deriveRegionCycleKeybindings();
    expect(bindings).toEqual([
      {
        id: "shell:cycle-region-next",
        defaultChord: "F6",
        label: { key: "common:actions.moveToNextPanel" },
        group: { key: "common:shortcutGroups.navigation" },
        context: "global",
      },
      {
        id: "shell:cycle-region-previous",
        defaultChord: "Shift+F6",
        label: { key: "common:actions.moveToPreviousPanel" },
        group: { key: "common:shortcutGroups.navigation" },
        context: "global",
      },
    ]);
    expect(regionCycleAction(1)).toMatchObject({
      id: bindings[0]!.id,
      label: bindings[0]!.label,
    });
    expect(regionCycleAction(-1)).toMatchObject({
      id: bindings[1]!.id,
      label: bindings[1]!.label,
    });
  });

  it("resolves labels through real source and alternate runtimes", () => {
    const source = createTestLocalizationRuntime();
    const alternate = createTestLocalizationRuntime(ltrTestLocale);
    const [next, previous] = deriveRegionCycleKeybindings();
    expect(resolveMessageResult(source, next!.label).message).toBe(
      "Move to the next panel",
    );
    expect(resolveMessageResult(alternate, next!.label).message).toBe(
      "Passer au panneau suivant",
    );
    expect(resolveMessageResult(source, previous!.label).message).toBe(
      "Move to the previous panel",
    );
    expect(resolveMessageResult(alternate, previous!.label).message).toBe(
      "Passer au panneau précédent",
    );
  });
});
