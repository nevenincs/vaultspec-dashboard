// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
  testResources,
} from "../../localization/testing";
import { sourceLocale } from "../../locales/en";
import {
  BROWSER_LANGUAGE_MAX_ITEMS,
  createLocaleContract,
  createLocaleController,
  LOCALE_PREFERENCE_CACHE_KEY,
  normalizeBrowserLanguagePreferences,
  readCachedLocalePreference,
  reconcileCachedLocalePreference,
  resolveInitialLocale,
  resolveSystemLocale,
  resolveSystemLocaleFrom,
  type LocaleController,
} from "./localeController";

const activeControllers: LocaleController[] = [];

function trackController(controller: LocaleController): LocaleController {
  activeControllers.push(controller);
  return controller;
}

afterEach(() => {
  for (const controller of activeControllers.splice(0)) controller.destroy();
  localStorage.clear();
});

describe("locale preference resolution", () => {
  it("resolves exact, base-language, malformed, and bounded browser preferences", () => {
    expect(resolveSystemLocale(["en"])).toBe("en");
    expect(resolveSystemLocale(["en-US"])).toBe("en");
    expect(resolveSystemLocale(["not a locale", "en-GB"])).toBe("en");
    expect(resolveSystemLocale(["fr-CA"])).toBe(sourceLocale);
    expect(resolveSystemLocaleFrom(["fr-CA"], ["en", "fr"], "en")).toBe("fr");
    expect(resolveSystemLocaleFrom(["pt-BR"], ["en", "pt-PT"], "en")).toBe("pt-PT");

    const beyondInspectionBound = [
      ...Array.from({ length: BROWSER_LANGUAGE_MAX_ITEMS }, () => "fr"),
      "en",
    ];
    const normalized = normalizeBrowserLanguagePreferences(beyondInspectionBound);
    expect(normalized).toHaveLength(BROWSER_LANGUAGE_MAX_ITEMS);
    expect(normalized).not.toContain("en");
    expect(normalizeBrowserLanguagePreferences(["dev", "CIMODE", "en"])).toEqual([
      "en",
    ]);
  });

  it("reads only validated preference tokens from the synchronous cache", () => {
    expect(readCachedLocalePreference()).toBe("system");

    localStorage.setItem(LOCALE_PREFERENCE_CACHE_KEY, "en");
    expect(readCachedLocalePreference()).toBe("en");
    expect(resolveInitialLocale()).toEqual({ preference: "en", locale: "en" });

    localStorage.setItem(LOCALE_PREFERENCE_CACHE_KEY, " en ");
    expect(readCachedLocalePreference()).toBe(sourceLocale);
    expect(localStorage.getItem(LOCALE_PREFERENCE_CACHE_KEY)).toBeNull();
  });

  it("populates a missing cache once and leaves an exact token unchanged", () => {
    expect(localStorage.getItem(LOCALE_PREFERENCE_CACHE_KEY)).toBeNull();
    expect(reconcileCachedLocalePreference("system")).toBe(true);
    expect(localStorage.getItem(LOCALE_PREFERENCE_CACHE_KEY)).toBe("system");

    expect(reconcileCachedLocalePreference("system")).toBe(false);
    expect(localStorage.getItem(LOCALE_PREFERENCE_CACHE_KEY)).toBe("system");
    expect(reconcileCachedLocalePreference("fr")).toBe(false);
    expect(localStorage.getItem(LOCALE_PREFERENCE_CACHE_KEY)).toBe("system");
  });
});

describe("locale controller", () => {
  it("reconciles validated authority, preserves system, and does not cache fallback", async () => {
    const runtime = createTestLocalizationRuntime();
    const controller = trackController(
      createLocaleController(runtime, {
        preference: "system",
        locale: sourceLocale,
      }),
    );

    await controller.reconcilePreference("en", { cache: true });
    expect(controller.getPreference()).toBe("en");
    expect(controller.getResolvedLocale()).toBe("en");
    expect(localStorage.getItem(LOCALE_PREFERENCE_CACHE_KEY)).toBe("en");

    await controller.reconcilePreference("system", { cache: true });
    expect(controller.getPreference()).toBe("system");
    expect(localStorage.getItem(LOCALE_PREFERENCE_CACHE_KEY)).toBe("system");

    await controller.reconcilePreference("fr", { cache: false });
    expect(controller.getPreference()).toBe(sourceLocale);
    expect(controller.getResolvedLocale()).toBe(sourceLocale);
    expect(localStorage.getItem(LOCALE_PREFERENCE_CACHE_KEY)).toBe("system");
  });

  it("coalesces overlapping runtime requests and leaves the latest preference active", async () => {
    const runtime = createTestLocalizationRuntime();
    const contract = createLocaleContract(Object.keys(testResources), sourceLocale);
    const controller = trackController(
      createLocaleController(
        runtime,
        {
          preference: sourceLocale,
          locale: sourceLocale,
        },
        contract,
      ),
    );

    const first = controller.reconcilePreference(ltrTestLocale, { cache: false });
    const second = controller.reconcilePreference(rtlTestLocale, { cache: false });
    await Promise.all([first, second]);

    expect(controller.getPreference()).toBe(rtlTestLocale);
    expect(controller.getResolvedLocale()).toBe(rtlTestLocale);
    expect(runtime.resolvedLanguage).toBe(rtlTestLocale);

    await controller.reconcilePreference(ltrTestLocale, { cache: false });
    window.dispatchEvent(new Event("languagechange"));
    await Promise.resolve();
    expect(runtime.resolvedLanguage).toBe(ltrTestLocale);

    await controller.reconcilePreference("system", { cache: false });
    expect(controller.getPreference()).toBe("system");
    expect(runtime.resolvedLanguage).toBe(sourceLocale);

    controller.destroy();
    controller.destroy();
    await runtime.changeLanguage(ltrTestLocale);
    window.dispatchEvent(new Event("languagechange"));
    await controller.reconcilePreference(rtlTestLocale, { cache: false });
    expect(runtime.resolvedLanguage).toBe(ltrTestLocale);
  });

  it("keeps duplicate same-target reconciliation idempotent", async () => {
    const runtime = createTestLocalizationRuntime();
    const contract = createLocaleContract(Object.keys(testResources), sourceLocale);
    const controller = trackController(
      createLocaleController(
        runtime,
        { preference: sourceLocale, locale: sourceLocale },
        contract,
      ),
    );
    let languageChanges = 0;
    const countLanguageChange = (): void => {
      languageChanges += 1;
    };
    runtime.on("languageChanged", countLanguageChange);

    const first = controller.reconcilePreference(ltrTestLocale, { cache: false });
    const second = controller.reconcilePreference(ltrTestLocale, { cache: false });
    await Promise.all([first, second]);

    expect(controller.getPreference()).toBe(ltrTestLocale);
    expect(controller.getResolvedLocale()).toBe(ltrTestLocale);
    expect(runtime.resolvedLanguage).toBe(ltrTestLocale);
    expect(languageChanges).toBe(1);
    runtime.off("languageChanged", countLanguageChange);
  });

  it("rejects a canonical but unsupported initial runtime locale", () => {
    const runtime = createTestLocalizationRuntime();
    const controller = trackController(
      createLocaleController(runtime, {
        preference: sourceLocale,
        locale: "de-DE",
      }),
    );

    expect(controller.getPreference()).toBe(sourceLocale);
    expect(controller.getResolvedLocale()).toBe(sourceLocale);
  });
});
