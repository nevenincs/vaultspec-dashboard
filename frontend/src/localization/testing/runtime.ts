import { createInstance, type i18n, type InitOptions } from "i18next";
import { initReactI18next } from "react-i18next";

import { defaultNS, en, sourceLocale } from "../../locales/en";
import { SAFE_FALLBACK_SOURCE_MESSAGE } from "../../platform/localization/fallback";
import { testResources, type TestLocale } from "./resources";

const testNamespaces = Object.freeze(Object.keys(en));
const testLocales = Object.freeze(Object.keys(testResources) as TestLocale[]);
const safeMissingMessage = (): string => SAFE_FALLBACK_SOURCE_MESSAGE;

const testRuntimeOptions = {
  appendNamespaceToMissingKey: false,
  debug: false,
  defaultNS,
  fallbackLng: sourceLocale,
  fallbackNS: false,
  initAsync: false,
  interpolation: {
    escapeValue: false,
  },
  load: "currentOnly",
  missingInterpolationHandler: safeMissingMessage,
  missingKeyHandler: false,
  missingKeyNoValueFallbackToKey: true,
  nonExplicitSupportedLngs: false,
  parseMissingKeyHandler: safeMissingMessage,
  partialBundledLanguages: false,
  react: {
    useSuspense: false,
  },
  returnDetails: false,
  returnEmptyString: false,
  returnNull: false,
  returnObjects: false,
  returnedObjectHandler: safeMissingMessage,
  saveMissing: false,
  saveMissingPlurals: false,
  updateMissing: false,
} satisfies InitOptions;

/** Create a real localization runtime with bounded alternate-locale resources. */
export function createTestLocalizationRuntime(
  language: TestLocale = sourceLocale,
): i18n {
  const instance = createInstance();
  instance.use(initReactI18next);
  void instance.init({
    ...testRuntimeOptions,
    lng: language,
    ns: [...testNamespaces],
    resources: structuredClone(testResources),
    supportedLngs: [...testLocales],
  });

  if (!instance.isInitialized) {
    throw new Error("Localization could not start.");
  }

  return instance;
}
