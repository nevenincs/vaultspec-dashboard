// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import { LOCALE_PREFERENCE_CACHE_KEY } from "./localeController";

afterEach(() => {
  localStorage.clear();
});

describe("application localization runtime factory", () => {
  it("constructs initialized runtime authority from the synchronous cache", async () => {
    localStorage.setItem(LOCALE_PREFERENCE_CACHE_KEY, "en");
    const runtimeModule = await import("./runtime");
    const created = runtimeModule.createApplicationLocalizationRuntime();

    expect(created.initialLocale).toEqual({ preference: "en", locale: "en" });
    expect(created.localization.isInitialized).toBe(true);
    expect(created.localization.resolvedLanguage).toBe("en");
    expect(created.localeController.getPreference()).toBe("en");
    expect(created.localeController.getResolvedLocale()).toBe("en");

    created.localeController.destroy();
    runtimeModule.localeController.destroy();
  });
});
