import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { GRAPH_TOGGLE_ACTION_ID, toggleGraphAction } from "./chromeActions";
import { deriveGraphToggleKeybindings } from "./graphToggleKeybindings";
import { resetShellLayout, setShellCenterSlot } from "./shellLayout";

afterEach(resetShellLayout);

describe("localized graph-toggle keybinding", () => {
  it("preserves its binding contract and resolves through real runtimes", () => {
    const [binding] = deriveGraphToggleKeybindings();
    expect(binding).toEqual({
      id: GRAPH_TOGGLE_ACTION_ID,
      defaultChord: "Mod+Shift+G",
      label: { key: "common:actions.showOrHideGraph" },
      group: { key: "common:shortcutGroups.window" },
      context: "global",
    });

    const source = createTestLocalizationRuntime();
    const alternate = createTestLocalizationRuntime(ltrTestLocale);
    expect(resolveMessageResult(source, binding!.label).message).toBe(
      "Show or hide graph",
    );
    expect(resolveMessageResult(alternate, binding!.label).message).toBe(
      "Afficher ou masquer le graphe",
    );
    expect(resolveMessageResult(alternate, binding!.group).message).toBe("Fenêtre");
  });

  it("keeps the live action wording separate from the stable binding label", () => {
    setShellCenterSlot("none");
    expect(toggleGraphAction()).toMatchObject({
      id: GRAPH_TOGGLE_ACTION_ID,
      label: { key: "common:actions.showGraph" },
    });

    setShellCenterSlot("graph");
    expect(toggleGraphAction()).toMatchObject({
      id: GRAPH_TOGGLE_ACTION_ID,
      label: { key: "common:actions.hideGraph" },
    });
  });
});
