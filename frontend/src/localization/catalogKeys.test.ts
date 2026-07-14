import { describe, expect, it } from "vitest";

import { en, resources, sourceLocale, type EnglishResources } from "../locales/en";
import {
  isMessageKey,
  MESSAGE_KEYS,
  type MessageKey,
} from "../platform/localization/message";
import {
  createLocalizationRuntime,
  localizationNamespaces,
  supportedLocales,
} from "../platform/localization/runtime";

function splitMessageKey(key: MessageKey): {
  namespace: keyof EnglishResources & string;
  path: string;
} {
  const separator = key.indexOf(":");
  return {
    namespace: key.slice(0, separator) as keyof EnglishResources & string,
    path: key.slice(separator + 1),
  };
}

describe("shipped localization catalog keys", () => {
  it("uses unique, structurally valid namespace-qualified keys", () => {
    expect(new Set(localizationNamespaces).size).toBe(localizationNamespaces.length);
    expect(new Set(MESSAGE_KEYS).size).toBe(MESSAGE_KEYS.length);
    expect(MESSAGE_KEYS.length).toBeGreaterThan(0);

    const namespaces = new Set<string>(localizationNamespaces);
    for (const key of MESSAGE_KEYS) {
      const { namespace, path } = splitMessageKey(key);
      expect(isMessageKey(key), key).toBe(true);
      expect(namespaces.has(namespace), key).toBe(true);
      expect(
        path.split(".").every((segment) => segment.length > 0),
        key,
      ).toBe(true);
    }

    const sortedKeys = [...MESSAGE_KEYS].sort();
    for (let index = 1; index < sortedKeys.length; index += 1) {
      expect(
        sortedKeys[index]?.startsWith(`${sortedKeys[index - 1]}.`),
        `${sortedKeys[index - 1]} cannot also be a parent message`,
      ).toBe(false);
    }
  });

  it("keeps shipped locale and namespace aggregates aligned with the source catalog", () => {
    expect(resources[sourceLocale]).toBe(en);
    expect([...supportedLocales].sort()).toEqual(Object.keys(resources).sort());
    expect([...localizationNamespaces].sort()).toEqual(Object.keys(en).sort());

    for (const [locale, catalog] of Object.entries(resources)) {
      expect(Object.keys(catalog).sort(), locale).toEqual(
        [...localizationNamespaces].sort(),
      );
    }
  });

  it("provides every required message directly in every shipped locale", () => {
    const runtime = createLocalizationRuntime();

    for (const locale of supportedLocales) {
      for (const key of MESSAGE_KEYS) {
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
