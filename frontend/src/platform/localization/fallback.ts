import type { i18n, TOptions } from "i18next";

import { errors } from "../../locales/en/errors";
import {
  normalizeMessageDescriptor,
  type MessageKey,
  type MessageValues,
} from "./message";

export const SAFE_FALLBACK_MESSAGE_KEY =
  "errors:fallback.contentUnavailable" satisfies MessageKey;

export const SAFE_FALLBACK_SOURCE_MESSAGE = errors.fallback.contentUnavailable;

export type MessageTranslator = Pick<i18n, "exists" | "t">;

type SafeTranslationOptions = TOptions & {
  readonly returnObjects: false;
  readonly replace?: MessageValues;
};

function translationOptions(values?: MessageValues): SafeTranslationOptions {
  if (values === undefined) return Object.freeze({ returnObjects: false });

  const options: SafeTranslationOptions = {
    replace: values,
    returnObjects: false,
  };
  const count = values.count;
  if (typeof count === "number") options.count = count;

  const context = values.context;
  if (typeof context === "string") options.context = context;

  return Object.freeze(options);
}

function validTranslation(value: unknown, key: MessageKey): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const namespaceEnd = key.indexOf(":");
  const unqualifiedKey = key.slice(namespaceEnd + 1);
  if (trimmed === key || trimmed === unqualifiedKey) return null;

  if (trimmed.includes("{{") || trimmed.includes("}}") || trimmed.includes("$t(")) {
    return null;
  }

  return value;
}

function tryResolve(
  translator: MessageTranslator,
  key: MessageKey,
  values?: MessageValues,
): string | null {
  try {
    const options = translationOptions(values);
    if (translator.exists(key, options) !== true) return null;
    return validTranslation(translator.t(key, options), key);
  } catch {
    return null;
  }
}

/** Resolve an unknown descriptor without exposing failed translation state to the UI. */
export function resolveMessage(
  translator: MessageTranslator,
  descriptor: unknown,
): string {
  const normalized = normalizeMessageDescriptor(descriptor);
  if (normalized !== null) {
    const resolved = tryResolve(translator, normalized.key, normalized.values);
    if (resolved !== null) return resolved;
  }

  return (
    tryResolve(translator, SAFE_FALLBACK_MESSAGE_KEY) ?? SAFE_FALLBACK_SOURCE_MESSAGE
  );
}
