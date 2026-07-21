import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { CONTROL_PANEL_IDS } from "./controlPanels";
import {
  CONTROL_PANEL_VOCABULARY,
  controlPanelVocabulary,
} from "./controlPanelVocabulary";

describe("control panel vocabulary", () => {
  it("is exhaustive, frozen, and exact for every stable panel id", () => {
    // The vocabulary covers every control SURFACE: the modal panels
    // (`CONTROL_PANEL_IDS`) plus the footer-only review chip (`approvals`, a
    // FooterChipId that opens the Agent pending view, review-surface-flow ADR F1).
    // The agent-service panel (a2a-product-provisioning W05.P12) is the fourth modal.
    expect(Object.keys(CONTROL_PANEL_VOCABULARY)).toEqual([
      "search-service",
      "approvals",
      "backend-health",
      "vault-health",
      "agent-service",
    ]);
    expect(Object.isFrozen(CONTROL_PANEL_VOCABULARY)).toBe(true);

    for (const id of CONTROL_PANEL_IDS) {
      const vocabulary = CONTROL_PANEL_VOCABULARY[id];
      expect(vocabulary.id).toBe(id);
      expect(Object.isFrozen(vocabulary)).toBe(true);
      expect(controlPanelVocabulary(id)).toBe(vocabulary);
      for (const descriptor of [
        vocabulary.label,
        vocabulary.showLabel,
        vocabulary.hideLabel,
        vocabulary.unavailableTitle,
      ]) {
        expect(Object.isFrozen(descriptor)).toBe(true);
      }
    }
  });

  it("rejects non-exact and unknown identities", () => {
    expect(controlPanelVocabulary(" search-service ")).toBeNull();
    expect(controlPanelVocabulary("search")).toBeNull();
    expect(controlPanelVocabulary("")).toBeNull();
    expect(controlPanelVocabulary(null)).toBeNull();
  });

  it("resolves every descriptor through real English, French, and Arabic catalogs", () => {
    const english = createTestLocalizationRuntime();
    const french = createTestLocalizationRuntime(ltrTestLocale);
    const arabic = createTestLocalizationRuntime(rtlTestLocale);

    for (const id of CONTROL_PANEL_IDS) {
      const vocabulary = CONTROL_PANEL_VOCABULARY[id];
      for (const descriptor of [
        vocabulary.label,
        vocabulary.showLabel,
        vocabulary.hideLabel,
        vocabulary.unavailableTitle,
      ]) {
        const source = resolveMessageResult(english, descriptor);
        const ltr = resolveMessageResult(french, descriptor);
        const rtl = resolveMessageResult(arabic, descriptor);
        expect(source.usedFallback, descriptor.key).toBe(false);
        expect(ltr.usedFallback, descriptor.key).toBe(false);
        expect(rtl.usedFallback, descriptor.key).toBe(false);
        expect(ltr.message, descriptor.key).not.toBe(source.message);
        expect(rtl.message, descriptor.key).not.toBe(source.message);
      }
    }

    expect(
      CONTROL_PANEL_IDS.map((id) => {
        const vocabulary = CONTROL_PANEL_VOCABULARY[id];
        return {
          label: resolveMessageResult(english, vocabulary.label).message,
          show: resolveMessageResult(english, vocabulary.showLabel).message,
          hide: resolveMessageResult(english, vocabulary.hideLabel).message,
          unavailable: resolveMessageResult(english, vocabulary.unavailableTitle)
            .message,
        };
      }),
    ).toEqual([
      {
        label: "Search",
        show: "Show search",
        hide: "Hide search",
        unavailable: "Search unavailable",
      },
      {
        label: "System status",
        show: "Show system status",
        hide: "Hide system status",
        unavailable: "System status unavailable",
      },
      {
        label: "Project health",
        show: "Show project health",
        hide: "Hide project health",
        unavailable: "Project health unavailable",
      },
      {
        label: "Agents",
        show: "Show agents",
        hide: "Hide agents",
        unavailable: "Agents unavailable",
      },
    ]);
  });
});
