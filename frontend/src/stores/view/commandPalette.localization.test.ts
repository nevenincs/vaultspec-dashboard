import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import {
  COMMAND_PALETTE_KEYBINDING,
  DOCUMENT_SEARCH_KEYBINDING,
  SEARCH_PALETTE_KEYBINDING,
} from "./commandPalette";
import {
  KEYBOARD_SHORTCUTS_TOGGLE_BINDING,
  deriveKeyboardShortcutGroups,
} from "./keyboardShortcuts";
import {
  RELOAD_REFRESH_DATA_ACTION_ID,
  RELOAD_REFRESH_DATA_LABEL,
  deriveReloadKeybindings,
  refreshDataAction,
} from "./reloadKeybindings";

const paletteBindings = [
  COMMAND_PALETTE_KEYBINDING,
  SEARCH_PALETTE_KEYBINDING,
  DOCUMENT_SEARCH_KEYBINDING,
] as const;

const expectedPaletteBindings = [
  {
    id: "app:command-palette",
    defaultChord: "Mod+K",
    key: "common:actions.openCommandPalette",
    source: "Open command palette…",
    alternate: "Ouvrir la palette de commandes…",
  },
  {
    id: "app:search",
    defaultChord: "Mod+Alt+S",
    key: "common:actions.searchDocumentsAndCode",
    source: "Search documents and code…",
    alternate: "Rechercher dans les documents et le code…",
  },
  {
    id: "app:document-search",
    defaultChord: "Mod+Alt+F",
    key: "documents:actions.findByName",
    source: "Find a document by name…",
    alternate: "Rechercher un document par nom…",
  },
] as const;

describe("localized command-palette keybindings", () => {
  it("preserves palette ids, order, chords, contexts, and typed copy", () => {
    expect(paletteBindings).toEqual(
      expectedPaletteBindings.map(({ id, defaultChord, key }) => ({
        id,
        defaultChord,
        label: { key },
        group: { key: "common:shortcutGroups.general" },
        context: "global",
      })),
    );
  });

  it("resolves palette copy through real English and French runtimes", () => {
    const source = createTestLocalizationRuntime();
    const alternate = createTestLocalizationRuntime(ltrTestLocale);

    for (const [index, binding] of paletteBindings.entries()) {
      const expected = expectedPaletteBindings[index]!;
      expect(resolveMessageResult(source, binding.label)).toEqual({
        message: expected.source,
        usedFallback: false,
      });
      expect(resolveMessageResult(alternate, binding.label)).toEqual({
        message: expected.alternate,
        usedFallback: false,
      });
    }
  });

  it("converges all General producers into one localized legend section", () => {
    const defs = [
      ...paletteBindings,
      KEYBOARD_SHORTCUTS_TOGGLE_BINDING,
      ...deriveReloadKeybindings(),
    ];
    const groups = deriveKeyboardShortcutGroups(defs, {}, false);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toEqual({ key: "common:shortcutGroups.general" });
    expect(groups[0]?.shortcuts.map(({ id }) => id)).toEqual([
      "app:command-palette",
      "app:search",
      "app:document-search",
      "app:keyboard-shortcuts",
      "reload:refresh-data",
    ]);

    const alternate = createTestLocalizationRuntime(ltrTestLocale);
    expect(resolveMessageResult(alternate, groups[0]!.label)).toEqual({
      message: "Général",
      usedFallback: false,
    });
  });

  it("shares one refresh descriptor across action and keybinding in every test locale", () => {
    const action = refreshDataAction();
    const [binding] = deriveReloadKeybindings();

    expect(action).toMatchObject({
      id: RELOAD_REFRESH_DATA_ACTION_ID,
      label: RELOAD_REFRESH_DATA_LABEL,
    });
    expect(action.label).toBe(RELOAD_REFRESH_DATA_LABEL);
    expect(binding).toEqual({
      id: RELOAD_REFRESH_DATA_ACTION_ID,
      defaultChord: "Mod+Shift+R",
      label: RELOAD_REFRESH_DATA_LABEL,
      group: { key: "common:shortcutGroups.general" },
      context: "global",
    });
    expect(binding?.label).toBe(RELOAD_REFRESH_DATA_LABEL);
    expect(Object.isFrozen(RELOAD_REFRESH_DATA_LABEL)).toBe(true);

    for (const [locale, expectedRefresh, expectedReload] of [
      [undefined, "Refresh data", "Reload page"],
      [ltrTestLocale, "Actualiser les données", "Recharger la page"],
      [rtlTestLocale, "تحديث البيانات", "إعادة تحميل الصفحة"],
    ] as const) {
      const runtime = createTestLocalizationRuntime(locale);
      expect(resolveMessageResult(runtime, RELOAD_REFRESH_DATA_LABEL)).toEqual({
        message: expectedRefresh,
        usedFallback: false,
      });
      expect(
        resolveMessageResult(runtime, { key: "common:actions.reloadPage" }),
      ).toEqual({ message: expectedReload, usedFallback: false });
    }
  });
});
