import type { i18n } from "i18next";

import { resources, sourceLocale } from "../../locales/en";
import { logger } from "../logger/logger";

export const LOCALE_PREFERENCE_CACHE_KEY = "vaultspec-language";
export const LOCALE_TOKEN_MAX_CHARS = 128;
export const BROWSER_LANGUAGE_MAX_ITEMS = 16;
export const SHIPPED_LOCALE_MAX_ITEMS = 16;
const LISTENER_REMOVAL_ATTEMPTS = 2;
const RESERVED_LOCALES = new Set(["cimode", "dev"]);

export const supportedLocales = Object.freeze(
  Object.keys(resources) as (keyof typeof resources)[],
);
export type SupportedLocale = (typeof supportedLocales)[number];
export type LocalePreference = "system" | SupportedLocale;

export interface LocaleContract {
  readonly sourceLocale: string;
  readonly supportedLocales: readonly string[];
}

const localeLog = logger.child("localization.locale");

type LocaleDiagnosticReason =
  | "browser-read"
  | "cache-invalid"
  | "cache-read"
  | "cache-write"
  | "listener-add"
  | "listener-remove"
  | "runtime-change"
  | "runtime-fallback";

function reportLocaleFailure(reason: LocaleDiagnosticReason): void {
  localeLog.warn("Locale operation could not complete", { reason });
}

function canonicalLocale(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > LOCALE_TOKEN_MAX_CHARS ||
    value !== value.trim() ||
    RESERVED_LOCALES.has(value.toLowerCase())
  ) {
    return null;
  }
  try {
    const canonical = Intl.getCanonicalLocales(value);
    return canonical.length === 1 &&
      canonical[0]!.length <= LOCALE_TOKEN_MAX_CHARS &&
      !RESERVED_LOCALES.has(canonical[0]!.toLowerCase())
      ? canonical[0]!
      : null;
  } catch {
    return null;
  }
}

export function createLocaleContract(
  locales: unknown,
  fallbackLocale: unknown,
): LocaleContract {
  const normalized = normalizeBrowserLanguagePreferences(
    Array.isArray(locales) ? locales.slice(0, SHIPPED_LOCALE_MAX_ITEMS) : [],
  );
  const unique = [...new Set(normalized)];
  const fallback = canonicalLocale(fallbackLocale);
  const safeFallback =
    fallback !== null && unique.includes(fallback)
      ? fallback
      : (unique[0] ?? sourceLocale);
  const supported = unique.length > 0 ? unique : [sourceLocale];
  return Object.freeze({
    sourceLocale: safeFallback,
    supportedLocales: Object.freeze(supported),
  });
}

export const productionLocaleContract = createLocaleContract(
  supportedLocales,
  sourceLocale,
);

function normalizeLocalePreference(
  value: unknown,
  contract: LocaleContract,
): string | null {
  return value === "system" ||
    (typeof value === "string" && contract.supportedLocales.includes(value))
    ? value
    : null;
}

export function isLocalePreference(value: unknown): value is LocalePreference {
  return (
    value === "system" ||
    (typeof value === "string" &&
      (supportedLocales as readonly string[]).includes(value))
  );
}

export function normalizeBrowserLanguagePreferences(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const preferences: string[] = [];
  for (const candidate of value.slice(0, BROWSER_LANGUAGE_MAX_ITEMS)) {
    const canonical = canonicalLocale(candidate);
    if (canonical !== null) preferences.push(canonical);
  }
  return preferences;
}

export function readBrowserLanguagePreferences(): readonly string[] {
  try {
    if (typeof navigator === "undefined") return [];
    const raw = Array.isArray(navigator.languages)
      ? navigator.languages
      : [navigator.language];
    return normalizeBrowserLanguagePreferences(raw);
  } catch {
    reportLocaleFailure("browser-read");
    return [];
  }
}

export function resolveSystemLocale(browserPreferences: unknown): SupportedLocale {
  return resolveSystemLocaleFrom(
    browserPreferences,
    supportedLocales,
    sourceLocale,
  ) as SupportedLocale;
}

export function resolveSystemLocaleFrom(
  browserPreferences: unknown,
  shippedLocales: unknown,
  fallbackLocale: unknown,
): string {
  const normalizedShipped = normalizeBrowserLanguagePreferences(
    Array.isArray(shippedLocales)
      ? shippedLocales.slice(0, SHIPPED_LOCALE_MAX_ITEMS)
      : [],
  );
  const fallback = canonicalLocale(fallbackLocale);
  const safeFallback =
    fallback !== null && normalizedShipped.includes(fallback)
      ? fallback
      : (normalizedShipped[0] ?? sourceLocale);
  const candidates = normalizeBrowserLanguagePreferences(browserPreferences);
  for (const candidate of candidates) {
    const exact = normalizedShipped.find((locale) => locale === candidate);
    if (exact !== undefined) return exact;
    const base = candidate.split("-", 1)[0]!.toLowerCase();
    const sameBase = normalizedShipped.find(
      (locale) => locale.split("-", 1)[0]!.toLowerCase() === base,
    );
    if (sameBase !== undefined) return sameBase;
  }
  return safeFallback;
}

export function resolveLocalePreference(preference: LocalePreference): SupportedLocale {
  return resolveLocalePreferenceFor(
    preference,
    productionLocaleContract,
  ) as SupportedLocale;
}

function resolveLocalePreferenceFor(
  preference: string,
  contract: LocaleContract,
): string {
  return preference === "system"
    ? resolveSystemLocaleFrom(
        readBrowserLanguagePreferences(),
        contract.supportedLocales,
        contract.sourceLocale,
      )
    : (normalizeLocalePreference(preference, contract) ?? contract.sourceLocale);
}

export function readCachedLocalePreference(): LocalePreference {
  try {
    if (typeof localStorage === "undefined") return "system";
    const cached = localStorage.getItem(LOCALE_PREFERENCE_CACHE_KEY);
    if (cached === null) return "system";
    if (isLocalePreference(cached)) return cached;
    localStorage.removeItem(LOCALE_PREFERENCE_CACHE_KEY);
    reportLocaleFailure("cache-invalid");
    return sourceLocale;
  } catch {
    reportLocaleFailure("cache-read");
    return sourceLocale;
  }
}

export function reconcileCachedLocalePreference(preference: unknown): boolean {
  if (!isLocalePreference(preference)) return false;
  try {
    if (typeof localStorage === "undefined") return false;
    if (localStorage.getItem(LOCALE_PREFERENCE_CACHE_KEY) === preference) {
      return false;
    }
    localStorage.setItem(LOCALE_PREFERENCE_CACHE_KEY, preference);
    return true;
  } catch {
    reportLocaleFailure("cache-write");
    return false;
  }
}

export interface InitialLocaleResolution {
  readonly preference: string;
  readonly locale: string;
}

export interface ProductionInitialLocaleResolution extends InitialLocaleResolution {
  readonly preference: LocalePreference;
  readonly locale: SupportedLocale;
}

export function resolveInitialLocale(): ProductionInitialLocaleResolution {
  const preference = readCachedLocalePreference();
  return Object.freeze({ preference, locale: resolveLocalePreference(preference) });
}

export interface LocaleReconciliationOptions {
  readonly cache?: boolean;
}

export interface LocaleController {
  getPreference(): string;
  getResolvedLocale(): string;
  reconcilePreference(
    preference: unknown,
    options?: LocaleReconciliationOptions,
  ): Promise<void>;
  destroy(): void;
}

export function createLocaleController(
  runtime: i18n,
  initial: InitialLocaleResolution,
  suppliedContract: LocaleContract = productionLocaleContract,
): LocaleController {
  const contract = createLocaleContract(
    suppliedContract.supportedLocales,
    suppliedContract.sourceLocale,
  );
  let preference =
    normalizeLocalePreference(initial.preference, contract) ?? contract.sourceLocale;
  const initialLocale = canonicalLocale(initial.locale);
  let resolvedLocale =
    initialLocale !== null && contract.supportedLocales.includes(initialLocale)
      ? initialLocale
      : resolveLocalePreferenceFor(preference, contract);
  type LocaleRequest = Readonly<{ locale: string }>;
  const initialRequest: LocaleRequest = Object.freeze({ locale: resolvedLocale });
  let requested = initialRequest;
  let applied = initialRequest;
  let drain: Promise<void> | null = null;
  let observingSystem = false;
  let destroyed = false;

  const requestLocale = (locale: string): Promise<void> => {
    if (requested.locale === locale && (drain !== null || resolvedLocale === locale)) {
      return drain ?? Promise.resolve();
    }
    requested = Object.freeze({ locale });
    if (drain !== null) return drain;

    drain = (async () => {
      while (!destroyed && applied !== requested) {
        const current = requested;
        try {
          await runtime.changeLanguage(current.locale);
          if (current === requested) resolvedLocale = current.locale;
        } catch {
          reportLocaleFailure("runtime-change");
          if (current === requested) {
            try {
              await runtime.changeLanguage(contract.sourceLocale);
            } catch {
              reportLocaleFailure("runtime-fallback");
            }
            resolvedLocale = contract.sourceLocale;
          }
        }
        applied = current;
      }
    })().finally(() => {
      drain = null;
    });
    return drain;
  };

  const onBrowserLanguageChange = (): void => {
    if (preference === "system" && !destroyed) {
      void requestLocale(resolveLocalePreferenceFor(preference, contract));
    }
  };

  const removeBrowserLanguageListener = (): boolean => {
    if (typeof window === "undefined") return true;
    for (let attempt = 0; attempt < LISTENER_REMOVAL_ATTEMPTS; attempt += 1) {
      try {
        window.removeEventListener("languagechange", onBrowserLanguageChange);
        return true;
      } catch {
        continue;
      }
    }
    reportLocaleFailure("listener-remove");
    return false;
  };

  const synchronizeBrowserObservation = (): void => {
    const shouldObserve = preference === "system" && !destroyed;
    if (shouldObserve === observingSystem || typeof window === "undefined") return;
    try {
      if (shouldObserve) {
        window.addEventListener("languagechange", onBrowserLanguageChange);
        observingSystem = true;
      } else {
        if (removeBrowserLanguageListener()) observingSystem = false;
      }
    } catch {
      reportLocaleFailure("listener-add");
      if (shouldObserve) void requestLocale(contract.sourceLocale);
    }
  };

  synchronizeBrowserObservation();

  return {
    getPreference: () => preference,
    getResolvedLocale: () => resolvedLocale,
    reconcilePreference(value, options = {}) {
      if (destroyed) return Promise.resolve();
      const normalized = normalizeLocalePreference(value, contract);
      const valid = normalized !== null;
      preference = normalized ?? contract.sourceLocale;
      if (valid && options.cache !== false) {
        reconcileCachedLocalePreference(preference);
      }
      synchronizeBrowserObservation();
      return requestLocale(resolveLocalePreferenceFor(preference, contract));
    },
    destroy() {
      destroyed = true;
      requested = Object.freeze({ locale: requested.locale });
      if (observingSystem && removeBrowserLanguageListener()) observingSystem = false;
    },
  };
}
