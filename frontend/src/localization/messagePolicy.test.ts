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

const PROHIBITED_BOUNDARIES = [
  "Engine unavailable",
  "Token unavailable",
  "Adapter unavailable",
  "Schema unavailable",
  "Identifier unavailable",
  "WebGL unavailable",
  "GPU unavailable",
  "CLI unavailable",
  "Implementation is difficult",
  "This is difficult to implement",
  "Service lifecycle unavailable",
  "Service unavailable",
  "Command line unavailable",
  "Internal path unavailable",
  "Internal state unavailable",
  "Development unavailable",
  "Development control unavailable",
  "Route unavailable",
  "Parameter name unavailable",
  "Parameter unavailable",
  "Physics unavailable",
  "Graph theory unavailable",
  "Node ID unavailable",
  "Node unavailable",
] as const;

const DIAGNOSTIC_BOUNDARIES = [
  "Error: request failed",
  "Open src/app.ts",
  "Open .vault/plan/example.md",
  "Run npm run build",
  "Run cargo test",
  "Run git status",
] as const;

const RAW_KEY_BOUNDARIES = [
  "Show common:retry",
  "Show common:actions.retry",
  "Show errors:fallback.x",
  "The value (common:retry) is unavailable",
] as const;

const FALSE_RECOVERY_STATEMENTS = [
  "Retry failed.",
  "Retry did not work.",
  "Retry will fail.",
  "Try is unavailable.",
  "Try again failed.",
  "Check has failed.",
  "Reload.",
] as const;

const DISABLED_REASON_KEYS = [
  "common:disabledReasons.currentVersionRequired",
  "common:disabledReasons.desktopEditorRequired",
  "common:disabledReasons.desktopFileManagerRequired",
  "common:disabledReasons.selectItemToOpen",
  "documents:disabledReasons.selectDifferentDocument",
  "documents:disabledReasons.selectDocument",
  "features:disabledReasons.selectFeature",
] as const satisfies readonly MessageKey[];

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

  it("rejects bounded internal language without substring matches", () => {
    for (const template of PROHIBITED_BOUNDARIES) {
      expect(
        validateEnglishMessage("errors:unexpectedApplication.title", template).map(
          (item) => item.code,
        ),
        template,
      ).toContain("prohibited-term");
    }

    const safe =
      "Restore the document in the store. Check the webhook with a telescope and keep tokenized text.";
    expect(
      validateEnglishMessage("errors:unexpectedApplication.message", safe),
    ).toEqual([]);
  });

  it("rejects diagnostic paths and commands while allowing normal punctuation", () => {
    for (const template of DIAGNOSTIC_BOUNDARIES) {
      expect(
        validateEnglishMessage("errors:unexpectedApplication.title", template).map(
          (item) => item.code,
        ),
        template,
      ).toContain("diagnostic");
    }

    expect(
      validateEnglishMessage(
        "errors:unexpectedApplication.message",
        "Help: https://example.com. Retry this section.",
      ),
    ).toEqual([]);
  });

  it("rejects bounded namespace keys with any path depth", () => {
    for (const template of RAW_KEY_BOUNDARIES) {
      expect(
        validateEnglishMessage("errors:unexpectedApplication.title", template).map(
          (item) => item.code,
        ),
        template,
      ).toContain("raw-key");
    }

    for (const template of [
      "Open mailto:help@example.com",
      "Open https://example.com",
      "Call tel:+123456",
      "Show custom:value",
      "Status: ready",
    ]) {
      expect(
        validateEnglishMessage("errors:unexpectedApplication.title", template),
        template,
      ).toEqual([]);
    }
  });

  it("requires a plausible imperative recovery clause", () => {
    for (const template of FALSE_RECOVERY_STATEMENTS) {
      expect(
        validateEnglishMessage("errors:unexpectedApplication.message", template).map(
          (item) => item.code,
        ),
        template,
      ).toContain("not-actionable");
    }

    for (const template of [
      "This section is unavailable. Retry this section.",
      "This section is unavailable; retry this section.",
      "Open {{document}}.",
      "Try again.",
      "Ask for access.",
      "Check your connection.",
      "Save to another folder.",
      "{{item}} is unavailable. Retry this section.",
    ]) {
      expect(
        validateEnglishMessage("errors:unexpectedApplication.message", template),
        template,
      ).toEqual([]);
    }
  });

  it("requires actionable disabled reasons and accepts every production reason", () => {
    expect(
      validateEnglishMessage(
        "common:disabledReasons.selectItemToOpen",
        "This item cannot be opened.",
      ).map((item) => item.code),
    ).toContain("not-actionable");

    const messages = catalogMessages();
    for (const key of DISABLED_REASON_KEYS) {
      expect(ENGLISH_MESSAGE_POLICY[key].role, key).toBe("disabled-reason");
      expect(validateEnglishMessage(key, messages.get(key)!), key).toEqual([]);
    }
  });

  it("accepts approved terminology only with canonical casing", () => {
    expect(validateEnglishMessage("common:actions.close", "Open GitHub")).toEqual([]);
    expect(
      validateEnglishMessage("common:actions.close", "Open Github").map(
        (item) => item.code,
      ),
    ).toContain("term-casing");
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
