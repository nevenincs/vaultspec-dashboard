import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { COMMAND_FAMILY_MESSAGES } from "./commandPaletteCommands";

const expected = {
  navigate: ["Navigation", "Navigation"],
  filters: ["Filters", "Filtres"],
  focus: ["Focus", "Focus"],
  window: ["Layout", "Disposition"],
  edit: ["Editing", "Modification"],
  reload: ["Refresh", "Actualisation"],
  settings: ["Settings", "Paramètres"],
  search: ["Search", "Recherche"],
  core: ["Workspace maintenance", "Maintenance de l’espace de travail"],
  rag: ["Search maintenance", "Maintenance de la recherche"],
  help: ["Help", "Aide"],
  app: ["General", "Général"],
} as const;

describe("localized command family headings", () => {
  it("resolves every exhaustive family descriptor without fallback", () => {
    const source = createTestLocalizationRuntime();
    const alternate = createTestLocalizationRuntime(ltrTestLocale);

    for (const family of Object.keys(expected) as (keyof typeof expected)[]) {
      const descriptor = COMMAND_FAMILY_MESSAGES[family];
      expect(resolveMessageResult(source, descriptor)).toEqual({
        message: expected[family][0],
        usedFallback: false,
      });
      expect(resolveMessageResult(alternate, descriptor)).toEqual({
        message: expected[family][1],
        usedFallback: false,
      });
    }
  });
});
