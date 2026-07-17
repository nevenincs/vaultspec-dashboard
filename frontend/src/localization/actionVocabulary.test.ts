// Action vocabulary contract (W06.P18): every action-role catalog value leads
// with a canonical imperative verb, and each operation that carries synonym-drift
// risk uses exactly one verb across every action id (the recovery-verb-drift class
// the audit caught: page recovery is always "Reload", never "Refresh"). The test
// enumerates the real production catalog and the production verb table, so it
// cannot pass over a shrinking corpus, and proves the inventory rejects a crafted
// divergent synonym.

import { describe, expect, it } from "vitest";

import { resources, sourceLocale } from "../locales/en";
import {
  ENGLISH_MESSAGE_POLICY,
  IMPERATIVE_ACTION_VERBS,
  type MessageRole,
} from "./messagePolicy";

const ACTION_ROLES: ReadonlySet<MessageRole> = new Set([
  "action",
  "destructive-action",
]);
const IMPERATIVE_VERB_SET: ReadonlySet<string> = new Set(IMPERATIVE_ACTION_VERBS);
const VALUE_TOKEN = /\{\{[^}]*\}\}/gu;

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
  // A plural logical key (e.g. a count action) resolves under its CLDR-suffixed
  // physical variants; any category shares the same leading verb.
  for (const suffix of ["_other", "_one"]) {
    const variant = lookup(`${key}${suffix}`);
    if (typeof variant === "string") return variant;
  }
  expect.fail(`${key} must resolve to a string resource`);
}

/** The leading imperative word of an action label, ignoring interpolation. */
function leadingVerb(value: string): string | null {
  const withoutTokens = value.replace(VALUE_TOKEN, " ").trimStart();
  const match = withoutTokens.match(/^([A-Za-z]+)/u);
  return match ? match[1]! : null;
}

const ACTION_KEYS: readonly string[] = Object.entries(ENGLISH_MESSAGE_POLICY)
  .filter(([, entry]) => ACTION_ROLES.has(entry.role))
  .map(([key]) => key)
  .sort();

/**
 * The one canonical leading verb for each operation with synonym-drift risk. An
 * action id naming the operation must lead with `verb`; the operation's forbidden
 * synonyms must never lead one of its action messages.
 */
const CANONICAL_OPERATION_VERBS: readonly {
  readonly operation: string;
  readonly verb: string;
  readonly forbidden: readonly string[];
  readonly ownsKey: (key: string) => boolean;
}[] = [
  {
    operation: "page reload",
    verb: "Reload",
    forbidden: ["Refresh"],
    ownsKey: (key) => /reload/iu.test(key),
  },
  {
    operation: "data refresh",
    verb: "Refresh",
    forbidden: ["Reload"],
    ownsKey: (key) => /refresh/iu.test(key),
  },
];

function operationVerbIssue(key: string, value: string): string | null {
  const verb = leadingVerb(value);
  for (const operation of CANONICAL_OPERATION_VERBS) {
    if (!operation.ownsKey(key)) continue;
    if (verb === operation.verb) continue;
    return `${key} ("${value}") must lead the ${operation.operation} operation with "${operation.verb}", not "${verb ?? ""}"`;
  }
  return null;
}

describe("action vocabulary", () => {
  it("covers a non-empty action-role corpus", () => {
    expect(ACTION_KEYS.length).toBeGreaterThan(0);
  });

  it("leads every action-role label with a canonical imperative verb", () => {
    const offenders = ACTION_KEYS.filter((key) => {
      const verb = leadingVerb(catalogValue(key));
      return verb === null || !IMPERATIVE_VERB_SET.has(verb);
    });
    expect(offenders).toEqual([]);
  });

  it("uses one canonical verb per synonym-drift operation across every action id", () => {
    const offenders = ACTION_KEYS.map((key) =>
      operationVerbIssue(key, catalogValue(key)),
    ).filter((issue): issue is string => issue !== null);
    expect(offenders).toEqual([]);
  });

  it("keeps the canonical inventory active — each operation owns real action ids", () => {
    for (const operation of CANONICAL_OPERATION_VERBS) {
      const owned = ACTION_KEYS.filter((key) => operation.ownsKey(key));
      expect(
        owned.length,
        `${operation.operation} must own at least one action id`,
      ).toBeGreaterThan(0);
      for (const key of owned) {
        expect(leadingVerb(catalogValue(key))).toBe(operation.verb);
      }
    }
  });

  it("rejects a divergent synonym for an operation", () => {
    // A page-reload id whose label leads with the forbidden "Refresh" synonym is
    // exactly the recovery-verb drift the audit caught.
    expect(operationVerbIssue("common:actions.reloadPage", "Refresh page")).toContain(
      "Reload",
    );
    // The canonical form passes.
    expect(operationVerbIssue("common:actions.reloadPage", "Reload page")).toBeNull();
    // An interpolation-leading label resolves to its first real word.
    expect(leadingVerb('Repair "{{feature}}" conformance')).toBe("Repair");
  });
});
