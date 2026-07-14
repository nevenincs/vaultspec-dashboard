import type { i18n, TOptions } from "i18next";

import { errors } from "../../locales/en/errors";
import {
  MESSAGE_VALUE_COUNT_MAX,
  normalizeCountMessageDescriptor,
  normalizeMessageDescriptor,
  type MessageKey,
  type MessageValues,
} from "./message";

export const SAFE_FALLBACK_MESSAGE_KEY =
  "errors:fallback.contentUnavailable" satisfies MessageKey;

export const SAFE_FALLBACK_SOURCE_MESSAGE = errors.fallback.contentUnavailable;

export type MessageTranslator = Pick<i18n, "exists" | "t">;

export interface MessageResolutionResult {
  readonly message: string;
  readonly usedFallback: boolean;
}

type SafeTranslationOptions = TOptions & {
  readonly returnObjects: false;
  readonly replace?: MessageValues;
};

type RawTemplateOptions = SafeTranslationOptions & {
  readonly skipInterpolation: true;
};

const RAW_TEMPLATE_MAX_CHARS = 16_384;
const INTERPOLATION_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

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

function rawTemplateOptions(values?: MessageValues): RawTemplateOptions {
  return Object.freeze({
    ...translationOptions(values),
    skipInterpolation: true,
  });
}

function validStringResult(value: unknown, key: MessageKey): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const namespaceEnd = key.indexOf(":");
  const unqualifiedKey = key.slice(namespaceEnd + 1);
  if (trimmed === key || trimmed === unqualifiedKey) return null;

  return value;
}

export function isSafeMessageTemplate(
  template: string,
  values?: MessageValues,
): boolean {
  if (template.length > RAW_TEMPLATE_MAX_CHARS || template.includes("$t(")) {
    return false;
  }

  let cursor = 0;
  let tokenCount = 0;
  while (cursor < template.length) {
    const opening = template.indexOf("{{", cursor);
    const closingBeforeOpening = template.indexOf("}}", cursor);
    if (
      closingBeforeOpening !== -1 &&
      (opening === -1 || closingBeforeOpening < opening)
    ) {
      return false;
    }
    if (opening === -1) return true;

    const closing = template.indexOf("}}", opening + 2);
    const nestedOpening = template.indexOf("{{", opening + 2);
    if (closing === -1 || (nestedOpening !== -1 && nestedOpening < closing)) {
      return false;
    }

    tokenCount += 1;
    if (tokenCount > MESSAGE_VALUE_COUNT_MAX) return false;

    const body = template.slice(opening + 2, closing).trim();
    const segments = body.split(",").map((segment) => segment.trim());
    if (segments.length > 2) return false;
    const [name, format] = segments;
    if (
      name === undefined ||
      !INTERPOLATION_NAME_PATTERN.test(name) ||
      (format !== undefined && format !== "number") ||
      values === undefined ||
      !Object.hasOwn(values, name) ||
      (format === "number" && typeof values[name] !== "number")
    ) {
      return false;
    }

    cursor = closing + 2;
  }

  return true;
}

function tryResolve(
  translator: MessageTranslator,
  key: MessageKey,
  values?: MessageValues,
): string | null {
  try {
    const options = translationOptions(values);
    if (translator.exists(key, options) !== true) return null;

    const rawTemplate = validStringResult(
      translator.t(key, rawTemplateOptions(values)),
      key,
    );
    if (rawTemplate === null || !isSafeMessageTemplate(rawTemplate, values)) {
      return null;
    }

    return validStringResult(translator.t(key, options), key);
  } catch {
    return null;
  }
}

/** Resolve an unknown descriptor and report whether the safe generic fallback was used. */
export function resolveMessageResult(
  translator: MessageTranslator,
  descriptor: unknown,
): MessageResolutionResult {
  const normalized =
    normalizeCountMessageDescriptor(descriptor) ??
    normalizeMessageDescriptor(descriptor);
  if (normalized !== null) {
    const resolved = tryResolve(translator, normalized.key, normalized.values);
    if (resolved !== null) {
      return Object.freeze({ message: resolved, usedFallback: false });
    }
  }

  return Object.freeze({
    message:
      tryResolve(translator, SAFE_FALLBACK_MESSAGE_KEY) ?? SAFE_FALLBACK_SOURCE_MESSAGE,
    usedFallback: true,
  });
}

/** Resolve an unknown descriptor without exposing failed translation state to the UI. */
export function resolveMessage(
  translator: MessageTranslator,
  descriptor: unknown,
): string {
  return resolveMessageResult(translator, descriptor).message;
}
