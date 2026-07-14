import { createInstance, type i18n, type InitOptions } from "i18next";
import { initReactI18next } from "react-i18next";

import {
  defaultNS,
  en,
  resources,
  sourceLocale,
  type EnglishResources,
} from "../../locales/en";
import { SAFE_FALLBACK_SOURCE_MESSAGE } from "./fallback";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: EnglishResources;
    returnNull: false;
    strictKeyChecks: true;
  }
}

export const localizationNamespaces = Object.freeze(
  Object.keys(en) as (keyof EnglishResources)[],
);

export const supportedLocales = Object.freeze(
  Object.keys(resources) as (keyof typeof resources)[],
);

export type SupportedLocale = (typeof supportedLocales)[number];

const safeMissingMessage = (): string => SAFE_FALLBACK_SOURCE_MESSAGE;

const localizationOptions = {
  appendNamespaceToMissingKey: false,
  debug: false,
  defaultNS,
  fallbackLng: sourceLocale,
  fallbackNS: false,
  initAsync: false,
  interpolation: {
    escapeValue: false,
  },
  lng: sourceLocale,
  load: "currentOnly",
  missingInterpolationHandler: safeMissingMessage,
  missingKeyHandler: false,
  missingKeyNoValueFallbackToKey: true,
  nonExplicitSupportedLngs: false,
  ns: localizationNamespaces,
  parseMissingKeyHandler: safeMissingMessage,
  partialBundledLanguages: false,
  react: {
    useSuspense: false,
  },
  resources,
  returnDetails: false,
  returnEmptyString: false,
  returnNull: false,
  returnObjects: false,
  returnedObjectHandler: safeMissingMessage,
  saveMissing: false,
  saveMissingPlurals: false,
  supportedLngs: supportedLocales,
  updateMissing: false,
} satisfies InitOptions;

/** Create a real, fully initialized runtime backed only by shipped resources. */
export function createLocalizationRuntime(): i18n {
  const instance = createInstance();
  instance.use(initReactI18next);
  void instance.init(localizationOptions);

  if (!instance.isInitialized) {
    throw new Error("Localization runtime did not initialize synchronously.");
  }

  return instance;
}

/** The application-lifetime localization runtime. */
export const localization = createLocalizationRuntime();
