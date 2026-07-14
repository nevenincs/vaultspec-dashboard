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
  /(?:\u2014|\{\{|(?:frontend|backend|stack|token|wire|schema|debug|exception|development)\b)/iu;

function expectSafeVisibleMessage(message: string, rawKey: string): void {
  expect(message).not.toBe(rawKey);
  expect(message).not.toMatch(INTERNAL_COPY);
}

describe("localization runtime and messages", () => {
  it("initializes synchronously with isolated production resources", () => {
    const first = createLocalizationRuntime();
    const second = createLocalizationRuntime();

    expect(first.isInitialized).toBe(true);
    expect(second.isInitialized).toBe(true);
    expect(first.t("common:actions.retry")).toBe("Retry");

    first.addResource("en", "common", "actions.retry", "Try this isolated runtime");

    expect(first.t("common:actions.retry")).toBe("Try this isolated runtime");
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
