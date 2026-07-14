import { describe, expect, it } from "vitest";

import { en } from "../locales/en";
import { MESSAGE_KEYS, type MessageKey } from "../platform/localization/message";
import {
  ENGLISH_MESSAGE_POLICY,
  type MessagePolicyIssueCode,
  staticMessageParts,
  validateEnglishMessage,
} from "./messagePolicy";

function catalogMessages(): ReadonlyMap<MessageKey, string> {
  const messages = new Map<MessageKey, string>();
  const visit = (namespace: string, path: readonly string[], value: unknown): void => {
    if (typeof value === "string") {
      messages.set(`${namespace}:${path.join(".")}` as MessageKey, value);
      return;
    }
    for (const [segment, child] of Object.entries(
      value as Readonly<Record<string, unknown>>,
    )) {
      visit(namespace, [...path, segment], child);
    }
  };

  for (const [namespace, catalog] of Object.entries(en)) {
    visit(namespace, [], catalog);
  }
  return messages;
}

const CASES = {
  empty: ["common:actions.retry", "   "],
  "too-long": ["common:actions.retry", `Retry ${"carefully ".repeat(10)}`],
  "em-dash": ["errors:unexpectedApplication.title", "Something went wrong — again"],
  "nested-message": [
    "errors:unexpectedApplication.title",
    "$t(errors:fallback.contentUnavailable)",
  ],
  "raw-key": [
    "errors:unexpectedApplication.title",
    "Show errors:fallback.contentUnavailable",
  ],
  "raw-placeholder": ["errors:unexpectedApplication.title", "Show {{ broken"],
  diagnostic: ["errors:unexpectedApplication.title", "TypeError: Cannot read value"],
  "prohibited-term": ["errors:unexpectedApplication.title", "Backend unavailable"],
  "term-casing": ["common:actions.close", "Close Github"],
  "sentence-case": ["errors:unexpectedApplication.title", "something went wrong"],
  "title-case": ["errors:unexpectedApplication.title", "Something Went Wrong"],
  "non-imperative-action": ["common:actions.retry", "Another try"],
  "non-destructive-verb": [
    "common:destructiveActions.discardChanges",
    "Confirm changes",
  ],
  "action-punctuation": ["common:actions.retry", "Retry."],
  "not-actionable": [
    "errors:unexpectedApplication.message",
    "This content is unavailable.",
  ],
} as const satisfies Record<MessagePolicyIssueCode, readonly [string, string]>;

describe("source-locale message policy", () => {
  it("classifies exactly every production message key", () => {
    expect(Object.keys(ENGLISH_MESSAGE_POLICY).sort()).toEqual(
      [...MESSAGE_KEYS].sort(),
    );
  });

  it("accepts every production English catalog value", () => {
    const messages = catalogMessages();
    expect([...messages.keys()].sort()).toEqual([...MESSAGE_KEYS].sort());

    for (const key of MESSAGE_KEYS) {
      const template = messages.get(key);
      expect(template, key).toEqual(expect.any(String));
      expect(validateEnglishMessage(key, template!), key).toEqual([]);
    }
  });

  it("reports each stable policy issue from an adverse literal", () => {
    for (const [expectedCode, [rawKey, template]] of Object.entries(CASES)) {
      const key = rawKey as MessageKey;
      expect(
        validateEnglishMessage(key, template).map((item) => item.code),
        expectedCode,
      ).toContain(expectedCode);
    }
  });

  it("treats valid interpolation values as opaque user data", () => {
    const template = "Retry {{backend}}.";
    expect(staticMessageParts(template)).toEqual([
      { kind: "text", value: "Retry " },
      { kind: "value", name: "backend" },
      { kind: "text", value: "." },
    ]);
    expect(
      validateEnglishMessage("errors:unexpectedSection.message", template),
    ).toEqual([]);

    expect(
      staticMessageParts(template).some(
        (part) => part.kind === "text" && part.value.includes("backend"),
      ),
    ).toBe(false);
  });
});
