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
import {
  createLocaleController,
  resolveInitialLocale,
  supportedLocales,
  type SupportedLocale,
} from "./localeController";

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

export { supportedLocales, type SupportedLocale } from "./localeController";

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

/** Create a real, fully initialized runtime backed only by shipped resources. */
export function createLocalizationRuntime(
  language: SupportedLocale = sourceLocale,
): i18n {
  const instance = createInstance();
  instance.use(initReactI18next);
  void instance.init({
    ...localizationOptions,
    ns: [...localizationNamespaces],
    lng: language,
    resources: structuredClone(resources),
    supportedLngs: [...supportedLocales],
  });

  if (!instance.isInitialized) {
    throw new Error("Localization runtime did not initialize synchronously.");
  }

  return instance;
}

export interface ApplicationLocalizationRuntime {
  readonly initialLocale: ReturnType<typeof resolveInitialLocale>;
  readonly localization: i18n;
  readonly localeController: ReturnType<typeof createLocaleController>;
}

/** Construct the initialized runtime and controller from one synchronous cache read. */
export function createApplicationLocalizationRuntime(): ApplicationLocalizationRuntime {
  const initialLocale = resolveInitialLocale();
  const initializedRuntime = createLocalizationRuntime(initialLocale.locale);
  return Object.freeze({
    initialLocale,
    localization: initializedRuntime,
    localeController: createLocaleController(initializedRuntime, initialLocale),
  });
}

/** The application-lifetime localization runtime. */
export const applicationLocalizationRuntime = createApplicationLocalizationRuntime();
export const { localization, localeController } = applicationLocalizationRuntime;

if (import.meta.hot) {
  import.meta.hot.dispose(() => localeController.destroy());
}
