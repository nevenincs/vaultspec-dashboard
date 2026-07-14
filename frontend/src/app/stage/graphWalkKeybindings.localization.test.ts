import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { GRAPH_WALK_KEYBINDING_DEFS } from "./graphWalkKeybindings";

const expectedBindings = [
  [
    "graph:walk-forward-arrow-right",
    "ArrowRight",
    "graph:actions.moveToNextConnectedItem",
    "Move to the next connected item",
    "Passer à l’élément connecté suivant",
  ],
  [
    "graph:walk-forward-arrow-down",
    "ArrowDown",
    "graph:actions.moveToNextConnectedItem",
    "Move to the next connected item",
    "Passer à l’élément connecté suivant",
  ],
  [
    "graph:walk-backward-arrow-left",
    "ArrowLeft",
    "graph:actions.moveToPreviousConnectedItem",
    "Move to the previous connected item",
    "Passer à l’élément connecté précédent",
  ],
  [
    "graph:walk-backward-arrow-up",
    "ArrowUp",
    "graph:actions.moveToPreviousConnectedItem",
    "Move to the previous connected item",
    "Passer à l’élément connecté précédent",
  ],
  [
    "graph:open",
    "Enter",
    "graph:actions.openFocusedItem",
    "Open the focused item",
    "Ouvrir l’élément actif",
  ],
  [
    "graph:expand",
    "e",
    "graph:actions.expandFocusedItem",
    "Expand focused item into working set",
    "Développer l’élément actif dans l’espace de travail",
  ],
  [
    "graph:clear",
    "Escape",
    "graph:actions.clearSelection",
    "Clear the graph selection",
    "Effacer la sélection du graphe",
  ],
] as const;

describe("localized graph-walk keybindings", () => {
  it("preserves ids, chords, order, canvas context, and shared direction labels", () => {
    expect(GRAPH_WALK_KEYBINDING_DEFS).toEqual(
      expectedBindings.map(([id, defaultChord, key]) => ({
        id,
        defaultChord,
        label: { key },
        group: { key: "common:shortcutGroups.graph" },
        context: "canvas",
      })),
    );
    expect(GRAPH_WALK_KEYBINDING_DEFS[0]?.label).toBe(
      GRAPH_WALK_KEYBINDING_DEFS[1]?.label,
    );
    expect(GRAPH_WALK_KEYBINDING_DEFS[2]?.label).toBe(
      GRAPH_WALK_KEYBINDING_DEFS[3]?.label,
    );
  });

  it("resolves labels and groups through real source and alternate runtimes", () => {
    const source = createTestLocalizationRuntime();
    const alternate = createTestLocalizationRuntime(ltrTestLocale);
    for (const [index, binding] of GRAPH_WALK_KEYBINDING_DEFS.entries()) {
      const expected = expectedBindings[index]!;
      expect(resolveMessageResult(source, binding.label).message).toBe(expected[3]);
      expect(resolveMessageResult(alternate, binding.label).message).toBe(expected[4]);
      expect(resolveMessageResult(source, binding.group).message).toBe("Graph");
      expect(resolveMessageResult(alternate, binding.group).message).toBe("Graphe");
    }
  });
});
