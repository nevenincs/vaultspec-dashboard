import { describe, expect, it } from "vitest";

import {
  ltrTestLocale,
  ltrTestResources,
  createTestLocalizationRuntime,
} from "../../localization/testing";
import { errors } from "../../locales/en/errors";
import { SAFE_FALLBACK_SOURCE_MESSAGE, resolveMessage } from "./fallback";
import {
  createMessageDescriptor,
  MESSAGE_VALUE_COUNT_MAX,
  normalizeMessageDescriptor,
} from "./message";
import { createLocalizationRuntime } from "./runtime";

const INTERNAL_COPY =
  /(?:\u2014|\{\{|\}\}|(?:frontend|backend|engine|rag|tier|wire|schema|token|adapter|seam|webgl|gpu|cli|route|stack|trace|debug|exception|development|implementation|lifecycle|command|internal)\b)/iu;
const RAW_MESSAGE_KEY = /\b[a-z][a-zA-Z0-9]*:[a-z][a-zA-Z0-9.]*\b/u;

function expectSafeVisibleMessage(message: string, rawKey: string): void {
  expect(message).not.toBe(rawKey);
  expect(message).not.toMatch(INTERNAL_COPY);
  expect(message).not.toMatch(RAW_MESSAGE_KEY);
}

describe("localization runtime and messages", () => {
  it("initializes synchronously with add, replace, and remove isolation", () => {
    const first = createLocalizationRuntime();
    const second = createLocalizationRuntime();

    expect(first.isInitialized).toBe(true);
    expect(second.isInitialized).toBe(true);
    expect(first.t("common:actions.retry")).toBe("Retry");

    first.removeResourceBundle("en", "common");
    expect(first.hasResourceBundle("en", "common")).toBe(false);
    expect(second.hasResourceBundle("en", "common")).toBe(true);

    first.addResourceBundle(
      "en",
      "common",
      { actions: { retry: "Added message" } },
      true,
      true,
    );
    expect(first.t("common:actions.retry")).toBe("Added message");

    first.addResourceBundle(
      "en",
      "common",
      { actions: { retry: "Replacement message" } },
      true,
      true,
    );
    expect(first.t("common:actions.retry")).toBe("Replacement message");
    expect(second.t("common:actions.retry")).toBe("Retry");

    first.removeResourceBundle("en", "common");
    expect(first.hasResourceBundle("en", "common")).toBe(false);
    expect(second.t("common:actions.retry")).toBe("Retry");
  });

  it("normalizes bounded descriptors and resolves named interpolation", () => {
    const descriptor = createMessageDescriptor("errors:unexpectedSection.message", {
      section: "history",
    });
    const runtime = createTestLocalizationRuntime(ltrTestLocale);

    expect(descriptor).not.toBeNull();
    expect(descriptor).toEqual({
      key: "errors:unexpectedSection.message",
      values: { section: "history" },
    });
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor?.values)).toBe(true);
    expect(resolveMessage(runtime, descriptor)).toBe("Réessayez history.");

    const tooManyValues = Object.fromEntries(
      Array.from({ length: MESSAGE_VALUE_COUNT_MAX + 1 }, (_, index) => [
        `value${index}`,
        index,
      ]),
    );
    expect(
      normalizeMessageDescriptor({
        key: "common:actions.retry",
        values: tooManyValues,
      }),
    ).toBeNull();
    expect(
      normalizeMessageDescriptor({
        key: "common:actions.retry",
        get values() {
          return {};
        },
      }),
    ).toBeNull();
  });

  it("uses safe catalog copy for missing, malformed, and incomplete messages", () => {
    const runtime = createTestLocalizationRuntime();
    const missingKey = "common:actions.retry";
    runtime.removeResourceBundle("en", "common");

    const missing = resolveMessage(runtime, { key: missingKey });
    expect(missing).toBe(SAFE_FALLBACK_SOURCE_MESSAGE);
    expectSafeVisibleMessage(missing, missingKey);

    const malformedKey = "errors:diagnostics.stackTrace";
    const malformed = resolveMessage(runtime, { key: malformedKey });
    expect(malformed).toBe(SAFE_FALLBACK_SOURCE_MESSAGE);
    expectSafeVisibleMessage(malformed, malformedKey);

    const incompleteRuntime = createTestLocalizationRuntime(ltrTestLocale);
    const incompleteKey = "errors:unexpectedSection.message";
    const incomplete = resolveMessage(incompleteRuntime, { key: incompleteKey });
    expect(incomplete).toBe(ltrTestResources.errors.fallback.contentUnavailable);
    expectSafeVisibleMessage(incomplete, incompleteKey);
  });

  it("rejects catalog nesting and preserves translation-like user data", () => {
    const nestedRuntime = createTestLocalizationRuntime();
    const nestedKey = "errors:unexpectedApplication.title";
    nestedRuntime.addResource(
      "en",
      "errors",
      "unexpectedApplication.title",
      "$t(common:actions.retry)",
    );

    const nested = resolveMessage(nestedRuntime, { key: nestedKey });
    expect(nested).toBe(SAFE_FALLBACK_SOURCE_MESSAGE);
    expectSafeVisibleMessage(nested, nestedKey);

    const userDataRuntime = createTestLocalizationRuntime(ltrTestLocale);
    const userValue = "literal $t(common:actions.retry) and {{untouched}}";
    expect(
      resolveMessage(userDataRuntime, {
        key: "errors:unexpectedSection.message",
        values: { section: userValue },
      }),
    ).toBe(`Réessayez ${userValue}.`);
  });

  it("does not expose invalid descriptor metadata in fallback copy", () => {
    const rawKey = "errors:unexpectedSection.message";
    const diagnostic = "frontend stack trace /internal/path action.open";
    const message = resolveMessage(createLocalizationRuntime(), {
      diagnostic,
      key: rawKey,
      values: { section: diagnostic },
    });

    expect(message).toBe(SAFE_FALLBACK_SOURCE_MESSAGE);
    expect(message).not.toContain(diagnostic);
    expectSafeVisibleMessage(message, rawKey);
  });

  it("falls back to the safe source sentence when the runtime cannot resolve it", () => {
    const runtime = createLocalizationRuntime();
    runtime.removeResourceBundle("en", "errors");

    const message = resolveMessage(runtime, {
      key: "errors:unexpectedApplication.title",
    });

    expect(message).toBe(errors.fallback.contentUnavailable);
    expectSafeVisibleMessage(message, "errors:unexpectedApplication.title");
  });
});
