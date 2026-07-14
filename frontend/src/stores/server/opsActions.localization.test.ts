import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { OPS_WHITELIST, lookupOpsWhitelistEntry } from "./opsActions";

const expected = [
  [
    "core",
    "vault-check",
    "check-workspace",
    "operations:actions.checkWorkspace",
    "Check workspace",
    "Vérifier l’espace de travail",
  ],
  [
    "core",
    "vault-stats",
    "show-workspace-details",
    "operations:actions.showWorkspaceDetails",
    "Show workspace details",
    "Afficher les détails de l’espace de travail",
  ],
  [
    "rag",
    "server-start",
    "enable-search",
    "operations:actions.enableSearch",
    "Enable search",
    "Activer la recherche",
  ],
  [
    "rag",
    "server-stop",
    "disable-search",
    "operations:actions.disableSearch",
    "Disable search",
    "Désactiver la recherche",
  ],
  [
    "rag",
    "reindex",
    "refresh-search",
    "operations:actions.refreshSearch",
    "Refresh search",
    "Actualiser la recherche",
  ],
  [
    "rag",
    "watcher-reconfigure",
    "apply-search-settings",
    "operations:actions.applySearchSettings",
    "Apply search settings",
    "Appliquer les paramètres de recherche",
  ],
] as const;

describe("localized operation whitelist", () => {
  it("keeps one immutable ordered route, concept, and descriptor tuple", () => {
    expect(OPS_WHITELIST).toEqual(
      expected.map(([target, verb, concept, key]) => ({
        target,
        verb,
        concept,
        label: { key },
      })),
    );
    expect(Object.isFrozen(OPS_WHITELIST)).toBe(true);
    expect(OPS_WHITELIST.every(Object.isFrozen)).toBe(true);
    expect(OPS_WHITELIST.every((entry) => Object.isFrozen(entry.label))).toBe(true);
  });

  it("resolves the canonical normalized route to the same entry", () => {
    for (const entry of OPS_WHITELIST) {
      expect(lookupOpsWhitelistEntry(` ${entry.target} `, ` ${entry.verb} `)).toBe(
        entry,
      );
    }
    expect(lookupOpsWhitelistEntry("rag", "project-evict")).toBeNull();
    expect(lookupOpsWhitelistEntry("git", "vault-check")).toBeNull();
  });

  it("resolves every label through real English and French runtimes", () => {
    const source = createTestLocalizationRuntime();
    const alternate = createTestLocalizationRuntime(ltrTestLocale);
    for (const [index, entry] of OPS_WHITELIST.entries()) {
      expect(resolveMessageResult(source, entry.label)).toEqual({
        message: expected[index]![4],
        usedFallback: false,
      });
      expect(resolveMessageResult(alternate, entry.label)).toEqual({
        message: expected[index]![5],
        usedFallback: false,
      });
    }
  });
});
