import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import {
  LEFT_RAIL_CYCLE_MODE_ACTION_ID,
  LEFT_RAIL_CYCLE_MODE_LABEL,
  LEFT_RAIL_FOCUS_FILTER_ACTION_ID,
  LEFT_RAIL_FOCUS_FILTER_LABEL,
  LEFT_RAIL_NEW_DOC_ACTION_ID,
  LEFT_RAIL_NEW_DOC_LABEL,
  LEFT_RAIL_TOGGLE_FACETS_ACTION_ID,
  LEFT_RAIL_TOGGLE_FACETS_LABEL,
  browseModeAction,
  cycleBrowserModeAction,
  deriveLeftRailKeybindings,
  focusFilterAction,
  newDocumentAction,
  toggleFacetsAction,
} from "./leftRailKeybindings";

const expectedBindings = [
  {
    id: "left-rail:cycle-browser-mode",
    defaultChord: "Mod+B",
    context: "left-rail",
    key: "documents:actions.switchView",
    source: "Switch between documents and files",
    alternate: "Basculer entre les documents et les fichiers",
  },
  {
    id: "left-rail:focus-filter",
    defaultChord: "Mod+Shift+F",
    context: "global",
    key: "documents:actions.focusFilter",
    source: "Focus the document filter",
    alternate: "Activer le filtre des documents",
  },
  {
    id: "left-rail:clear-filter",
    defaultChord: "Mod+Shift+X",
    context: "global",
    key: "documents:actions.clearFilter",
    source: "Clear the document filter",
    alternate: "Effacer le filtre des documents",
  },
  {
    id: "left-rail:new-document",
    defaultChord: "Mod+Alt+N",
    context: "global",
    key: "documents:actions.addToFeature",
    source: "Add to a feature…",
    alternate: "Ajouter à une fonctionnalité…",
  },
  {
    id: "left-rail:expand-tree",
    defaultChord: "Mod+Alt+]",
    context: "left-rail",
    key: "documents:actions.expandTree",
    source: "Expand document tree",
    alternate: "Développer l’arborescence des documents",
  },
  {
    id: "left-rail:collapse-tree",
    defaultChord: "Mod+Alt+[",
    context: "left-rail",
    key: "documents:actions.collapseTree",
    source: "Collapse document tree",
    alternate: "Réduire l’arborescence des documents",
  },
  {
    id: "left-rail:toggle-facets",
    defaultChord: "Mod+Shift+L",
    context: "global",
    key: "documents:actions.showOrHideFilterOptions",
    source: "Show or hide filter options",
    alternate: "Afficher ou masquer les options de filtre",
  },
  {
    id: "left-rail:reset-filters",
    defaultChord: "Mod+Alt+0",
    context: "global",
    key: "documents:actions.resetFilters",
    source: "Reset filters",
    alternate: "Réinitialiser les filtres",
  },
] as const;

describe("left-rail localized keybindings", () => {
  it("keeps the approved ids, chords, contexts, order, and message keys", () => {
    expect(deriveLeftRailKeybindings()).toEqual(
      expectedBindings.map(({ id, defaultChord, context, key }) => ({
        id,
        defaultChord,
        context,
        label: { key },
        group: { key: "common:shortcutGroups.navigation" },
      })),
    );
  });

  it("resolves every label through the real source and alternate runtimes", () => {
    const sourceRuntime = createTestLocalizationRuntime();
    const alternateRuntime = createTestLocalizationRuntime(ltrTestLocale);

    for (const [index, binding] of deriveLeftRailKeybindings().entries()) {
      const expected = expectedBindings[index]!;
      expect(resolveMessageResult(sourceRuntime, binding.label)).toEqual({
        message: expected.source,
        usedFallback: false,
      });
      expect(resolveMessageResult(alternateRuntime, binding.label)).toEqual({
        message: expected.alternate,
        usedFallback: false,
      });
      expect(resolveMessageResult(sourceRuntime, binding.group)).toEqual({
        message: "Navigation",
        usedFallback: false,
      });
    }
  });

  it("shares canonical labels with same-id action descriptors", () => {
    expect(cycleBrowserModeAction()).toMatchObject({
      id: LEFT_RAIL_CYCLE_MODE_ACTION_ID,
      label: LEFT_RAIL_CYCLE_MODE_LABEL,
    });
    expect(focusFilterAction()).toMatchObject({
      id: LEFT_RAIL_FOCUS_FILTER_ACTION_ID,
      label: LEFT_RAIL_FOCUS_FILTER_LABEL,
    });
    expect(newDocumentAction()).toMatchObject({
      id: LEFT_RAIL_NEW_DOC_ACTION_ID,
      label: LEFT_RAIL_NEW_DOC_LABEL,
    });
    expect(toggleFacetsAction()).toMatchObject({
      id: LEFT_RAIL_TOGGLE_FACETS_ACTION_ID,
      label: LEFT_RAIL_TOGGLE_FACETS_LABEL,
    });
  });

  it("provides complete localized browse actions and rejects unknown modes", () => {
    const sourceRuntime = createTestLocalizationRuntime();
    const alternateRuntime = createTestLocalizationRuntime(ltrTestLocale);
    const rtlRuntime = createTestLocalizationRuntime(rtlTestLocale);
    const documents = browseModeAction("vault");
    const files = browseModeAction("code");

    expect(documents).toMatchObject({
      id: "left-rail:browse-vault",
      label: { key: "documents:actions.browseDocuments" },
    });
    expect(files).toMatchObject({
      id: "left-rail:browse-code",
      label: { key: "documents:actions.browseFiles" },
    });
    expect(resolveMessageResult(sourceRuntime, documents?.label)).toEqual({
      message: "Browse documents",
      usedFallback: false,
    });
    expect(resolveMessageResult(alternateRuntime, documents?.label)).toEqual({
      message: "Parcourir les documents",
      usedFallback: false,
    });
    expect(resolveMessageResult(sourceRuntime, files?.label)).toEqual({
      message: "Browse files",
      usedFallback: false,
    });
    expect(resolveMessageResult(alternateRuntime, files?.label)).toEqual({
      message: "Parcourir les fichiers",
      usedFallback: false,
    });
    expect(resolveMessageResult(rtlRuntime, documents?.label)).toEqual({
      message: "تصفح المستندات",
      usedFallback: false,
    });
    expect(resolveMessageResult(rtlRuntime, files?.label)).toEqual({
      message: "تصفح الملفات",
      usedFallback: false,
    });
    expect(browseModeAction(" vault ")).toBeNull();
    expect(browseModeAction("tree")).toBeNull();
    expect(browseModeAction(null)).toBeNull();
  });
});
