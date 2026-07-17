// Catalog safety guard (W06.P18): no general-UI message may carry a raw exception,
// path, command, network origin, namespace-qualified key, or malformed placeholder
// as interpolated copy. The sweep runs the production validateEnglishMessage over
// every source-locale value and keeps only the interpolation-safety issue codes,
// then proves each detector fires on a crafted adverse value so the pass is not
// vacuous. Proper named interpolation ({{count, number}}) is parsed as data, never
// flagged.

import { describe, expect, it } from "vitest";

import { resources, sourceLocale } from "../locales/en";
import { validateEnglishMessage, type MessagePolicyIssueCode } from "./messagePolicy";
import { MESSAGE_KEYS, type MessageKey } from "../platform/localization/message";

const SAFETY_CODES: ReadonlySet<MessagePolicyIssueCode> = new Set([
  "diagnostic",
  "raw-key",
  "raw-placeholder",
  "nested-message",
]);

function lookup(key: string): unknown {
  const namespaceEnd = key.indexOf(":");
  const namespace = key.slice(0, namespaceEnd);
  const path = key.slice(namespaceEnd + 1);
  const source = resources[sourceLocale];
  let value: unknown = source[namespace as keyof typeof source];
  for (const segment of path.split(".")) {
    value =
      value !== null && typeof value === "object"
        ? (value as Readonly<Record<string, unknown>>)[segment]
        : undefined;
  }
  return value;
}

function catalogValue(key: string): string {
  const direct = lookup(key);
  if (typeof direct === "string") return direct;
  for (const suffix of ["_other", "_one"]) {
    const variant = lookup(`${key}${suffix}`);
    if (typeof variant === "string") return variant;
  }
  expect.fail(`${key} must resolve to a string resource`);
}

function safetyIssues(key: MessageKey, value: string): MessagePolicyIssueCode[] {
  return validateEnglishMessage(key, value)
    .map((issue) => issue.code)
    .filter((code) => SAFETY_CODES.has(code));
}

// A stable ordinary key used to exercise the detectors against crafted values.
const PROBE_KEY: MessageKey = "documents:viewer.reader.states.empty";

describe("catalog safety", () => {
  it("sweeps a non-empty corpus", () => {
    expect(MESSAGE_KEYS.length).toBeGreaterThan(0);
  });

  it("carries no raw diagnostic or unsafe interpolation in any message", () => {
    const offenders = MESSAGE_KEYS.map((key) => {
      const issues = safetyIssues(key, catalogValue(key));
      return issues.length > 0 ? `${key} [${issues.join(", ")}]` : null;
    }).filter((entry): entry is string => entry !== null);

    expect(offenders).toEqual([]);
  });

  it("flags a raw exception, path, command, and network origin", () => {
    expect(safetyIssues(PROBE_KEY, "Error: the run failed")).toContain("diagnostic");
    expect(safetyIssues(PROBE_KEY, "See /home/user/notes.md")).toContain("diagnostic");
    expect(safetyIssues(PROBE_KEY, "Run npm run build first")).toContain("diagnostic");
    expect(safetyIssues(PROBE_KEY, "Reach localhost:8767 to retry")).toContain(
      "diagnostic",
    );
  });

  it("flags a raw namespace-qualified key and a malformed placeholder", () => {
    expect(safetyIssues(PROBE_KEY, "Press common:retry to continue")).toContain(
      "raw-key",
    );
    expect(safetyIssues(PROBE_KEY, "Open {{document to continue")).toContain(
      "raw-placeholder",
    );
    expect(safetyIssues(PROBE_KEY, "See $t(errors:detail) for more")).toContain(
      "nested-message",
    );
  });

  it("does not flag proper named or count interpolation as unsafe", () => {
    expect(safetyIssues(PROBE_KEY, "Loading {{count, number}} rows")).toEqual([]);
    expect(safetyIssues(PROBE_KEY, "Open {{document}} to continue")).toEqual([]);
  });
});
