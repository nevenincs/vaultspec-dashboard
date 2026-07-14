import { describe, expect, it } from "vitest";

import { en, resources, sourceLocale, type EnglishResources } from "../locales/en";
import {
  isMessageKey,
  isPluralMessageKey,
  MESSAGE_KEYS,
  PHYSICAL_MESSAGE_KEYS,
  PLURAL_MESSAGE_KEYS,
  type MessageKey,
  type PhysicalMessageKey,
} from "../platform/localization/message";
import {
  createLocalizationRuntime,
  localizationNamespaces,
  supportedLocales,
} from "../platform/localization/runtime";

const EXPECTED_SHIPPED_LOCALES = ["en"] as const;
const EXPECTED_NAMESPACES = [
  "common",
  "documents",
  "errors",
  "features",
  "graph",
  "operations",
  "projects",
] as const;
const EXPECTED_CATALOG_KEYS = [
  "common:accessibility.actionsMenu",
  "common:accessibility.confirmAction",
  "common:accessibility.recordShortcut",
  "common:accessibility.resetShortcut",
  "common:actions.cancel",
  "common:actions.close",
  "common:actions.copy",
  "common:actions.copyDocumentName",
  "common:actions.copyPath",
  "common:actions.copySummary",
  "common:actions.copyTitle",
  "common:actions.disableFollowMode",
  "common:actions.enableFollowMode",
  "common:actions.hideApprovals",
  "common:actions.hideGraph",
  "common:actions.hideProjectHealth",
  "common:actions.hideSearchStatus",
  "common:actions.hideSystemStatus",
  "common:actions.moveToNextPanel",
  "common:actions.moveToPreviousPanel",
  "common:actions.open",
  "common:actions.openCommandPalette",
  "common:actions.openInEditor",
  "common:actions.openSettings",
  "common:actions.refreshData",
  "common:actions.reloadPage",
  "common:actions.reset",
  "common:actions.resetLayout",
  "common:actions.retry",
  "common:actions.searchDocumentsAndCode",
  "common:actions.showApprovals",
  "common:actions.showGraph",
  "common:actions.showOrHideGraph",
  "common:actions.showInFileManager",
  "common:actions.showKeyboardShortcuts",
  "common:actions.showProjectHealth",
  "common:actions.showSearchStatus",
  "common:actions.showSystemStatus",
  "common:commandFamilies.editing",
  "common:commandFamilies.filters",
  "common:commandFamilies.focus",
  "common:commandFamilies.general",
  "common:commandFamilies.help",
  "common:commandFamilies.layout",
  "common:commandFamilies.navigation",
  "common:commandFamilies.refresh",
  "common:commandFamilies.search",
  "common:commandFamilies.searchMaintenance",
  "common:commandFamilies.settings",
  "common:commandFamilies.workspaceMaintenance",
  "common:disabledReasons.actionUnavailable",
  "common:disabledReasons.currentVersionRequired",
  "common:disabledReasons.desktopEditorRequired",
  "common:disabledReasons.desktopFileManagerRequired",
  "common:disabledReasons.selectItemToOpen",
  "common:feedback.actionUnavailable",
  "common:destructiveActions.discardChanges",
  "common:shortcutDialog.description",
  "common:shortcutDialog.title",
  "common:shortcutSettings.conflict",
  "common:shortcutSettings.empty",
  "common:shortcutSettings.recording",
  "common:shortcutGroups.navigation",
  "common:shortcutGroups.general",
  "common:shortcutGroups.graph",
  "common:shortcutGroups.window",
  "common:keycaps.alt",
  "common:keycaps.arrowDown",
  "common:keycaps.arrowLeft",
  "common:keycaps.arrowRight",
  "common:keycaps.arrowUp",
  "common:keycaps.backspace",
  "common:keycaps.control",
  "common:keycaps.delete",
  "common:keycaps.end",
  "common:keycaps.enter",
  "common:keycaps.escape",
  "common:keycaps.home",
  "common:keycaps.insert",
  "common:keycaps.pageDown",
  "common:keycaps.pageUp",
  "common:keycaps.shift",
  "common:keycaps.space",
  "common:keycaps.tab",
  "common:palette.commandCount_one",
  "common:palette.commandCount_other",
  "common:statuses.noActionsAvailable",
  "documents:accessibility.switchReadingAndEditingShortcut",
  "documents:actions.addToFeature",
  "documents:actions.clearFilter",
  "documents:actions.collapseTree",
  "documents:actions.copyLink",
  "documents:actions.expandTree",
  "documents:actions.findByName",
  "documents:actions.finishEditing",
  "documents:actions.focusFilter",
  "documents:actions.linkToSelectedDocument",
  "documents:actions.resetFilters",
  "documents:actions.save",
  "documents:actions.showOrHideFilterOptions",
  "documents:actions.showOrHideChanges",
  "documents:actions.switchReadingAndEditing",
  "documents:actions.switchView",
  "documents:disabledReasons.copyChangesBeforeReopening",
  "documents:disabledReasons.openForEditing",
  "documents:disabledReasons.selectDifferentDocument",
  "documents:disabledReasons.selectDocument",
  "documents:disabledReasons.tryAfterSaving",
  "documents:disabledReasons.updateBeforeSaving",
  "documents:shortcutGroups.editing",
  "errors:fallback.contentUnavailable",
  "errors:unexpectedApplication.message",
  "errors:unexpectedApplication.title",
  "errors:unexpectedSection.message",
  "errors:unexpectedSection.title",
  "features:confirmations.archive.body",
  "features:confirmations.archive.title",
  "features:confirmations.repair.body",
  "features:confirmations.repair.title",
  "features:destructiveActions.archive",
  "features:disabledReasons.selectFeature",
  "features:guardedActions.repair",
  "graph:actions.clearSelection",
  "graph:actions.expandFocusedItem",
  "graph:actions.moveToNextConnectedItem",
  "graph:actions.moveToPreviousConnectedItem",
  "graph:actions.openFocusedItem",
  "operations:actions.applySearchSettings",
  "operations:actions.checkWorkspace",
  "operations:actions.disableSearch",
  "operations:actions.enableSearch",
  "operations:actions.refreshSearch",
  "operations:actions.showWorkspaceDetails",
  "operations:feedback.applySearchSettings.failed",
  "operations:feedback.applySearchSettings.running",
  "operations:feedback.applySearchSettings.succeeded",
  "operations:feedback.applySearchSettings.unavailable",
  "operations:feedback.checkWorkspace.failed",
  "operations:feedback.checkWorkspace.running",
  "operations:feedback.checkWorkspace.succeeded",
  "operations:feedback.disableSearch.failed",
  "operations:feedback.disableSearch.running",
  "operations:feedback.disableSearch.succeeded",
  "operations:feedback.enableSearch.failed",
  "operations:feedback.enableSearch.running",
  "operations:feedback.enableSearch.succeeded",
  "operations:feedback.enableSearch.unavailable",
  "operations:feedback.refreshSearch.failed",
  "operations:feedback.refreshSearch.running",
  "operations:feedback.refreshSearch.succeeded",
  "operations:feedback.refreshSearch.unavailable",
  "operations:feedback.showWorkspaceDetails.failed",
  "operations:feedback.showWorkspaceDetails.running",
  "operations:feedback.showWorkspaceDetails.succeeded",
  "projects:actions.add",
  "projects:actions.clearHistory",
  "projects:actions.switch",
] as const satisfies readonly PhysicalMessageKey[];

const EXPECTED_PUBLIC_MESSAGE_KEYS = [
  ...EXPECTED_CATALOG_KEYS.filter(
    (key) => !/^common:palette\.commandCount_(?:one|other)$/u.test(key),
  ),
  "common:palette.commandCount",
] as readonly MessageKey[];

function splitMessageKey(key: PhysicalMessageKey): {
  namespace: keyof EnglishResources & string;
  path: string;
} {
  const separator = key.indexOf(":");
  return {
    namespace: key.slice(0, separator) as keyof EnglishResources & string,
    path: key.slice(separator + 1),
  };
}

function discoverLeafKeys(catalog: Readonly<Record<string, unknown>>): string[] {
  const keys: string[] = [];

  const visit = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      keys.push(path);
      return;
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      keys.push(`${path}:invalid-leaf`);
      return;
    }
    for (const [segment, child] of Object.entries(value)) {
      visit(child, path.length === 0 ? segment : `${path}.${segment}`);
    }
  };

  for (const [namespace, bundle] of Object.entries(catalog)) {
    if (bundle === null || typeof bundle !== "object" || Array.isArray(bundle)) {
      keys.push(`${namespace}:invalid-bundle`);
      continue;
    }
    for (const [segment, child] of Object.entries(bundle)) {
      visit(child, `${namespace}:${segment}`);
    }
  }
  return keys.sort();
}

describe("shipped localization catalog keys", () => {
  it("matches the explicit namespace-qualified leaf-key contract", () => {
    expect([...PHYSICAL_MESSAGE_KEYS].sort()).toEqual(
      [...EXPECTED_CATALOG_KEYS].sort(),
    );
    expect([...MESSAGE_KEYS].sort()).toEqual([...EXPECTED_PUBLIC_MESSAGE_KEYS].sort());
    expect(PLURAL_MESSAGE_KEYS).toEqual(["common:palette.commandCount"]);
    expect(isPluralMessageKey("common:palette.commandCount")).toBe(true);
    expect(isMessageKey("common:palette.commandCount_one")).toBe(false);
    for (const key of EXPECTED_PUBLIC_MESSAGE_KEYS) {
      expect(isMessageKey(key), key).toBe(true);
    }

    for (const [locale, catalog] of Object.entries(resources)) {
      expect(discoverLeafKeys(catalog), locale).toEqual(
        [...EXPECTED_CATALOG_KEYS].sort(),
      );
    }
  });

  it("keeps shipped locale and namespace aggregates aligned with the source catalog", () => {
    expect(resources[sourceLocale]).toBe(en);
    expect([...supportedLocales].sort()).toEqual([...EXPECTED_SHIPPED_LOCALES].sort());
    expect(Object.keys(resources).sort()).toEqual([...EXPECTED_SHIPPED_LOCALES].sort());
    expect([...localizationNamespaces].sort()).toEqual([...EXPECTED_NAMESPACES].sort());
    expect(Object.keys(en).sort()).toEqual([...EXPECTED_NAMESPACES].sort());

    for (const [locale, catalog] of Object.entries(resources)) {
      expect(Object.keys(catalog).sort(), locale).toEqual(
        [...EXPECTED_NAMESPACES].sort(),
      );
    }
  });

  it("provides every required message directly in every shipped locale", () => {
    const runtime = createLocalizationRuntime();

    for (const locale of supportedLocales) {
      for (const key of EXPECTED_CATALOG_KEYS) {
        const { namespace, path } = splitMessageKey(key);
        const value = runtime.getResource(locale, namespace, path);
        expect(typeof value, `${locale}:${key}`).toBe("string");
        expect((value as string).trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("initializes the source locale from the exported source catalog", () => {
    const runtime = createLocalizationRuntime();

    for (const namespace of localizationNamespaces) {
      expect(runtime.getResourceBundle(sourceLocale, namespace)).toEqual(en[namespace]);
    }
  });
});
