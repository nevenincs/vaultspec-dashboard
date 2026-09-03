// Catalog vocabulary guard (W06.P18): no shipped catalog value may contain the
// internal, development, or diagnostic vocabulary the architecture prohibits from
// user-facing copy. The sweep runs the production PROHIBITED_UI_TERMS table (the
// same word-boundary patterns the message policy enforces) over every source-locale
// value, and proves the patterns are word-boundary-safe so ordinary words that
// merely contain a prohibited substring (restore, store, webhook, telescope) do
// not false-positive.

import { describe, expect, it } from "vitest";

import { resources, sourceLocale } from "../locales/en";
import { PROHIBITED_TERM_EXEMPTIONS, PROHIBITED_UI_TERMS } from "./messagePolicy";

interface CatalogValue {
  readonly identity: string;
  readonly value: string;
}

function collectValues(
  node: unknown,
  path: readonly string[],
  out: CatalogValue[],
): void {
  if (typeof node === "string") {
    out.push({ identity: path.join("."), value: node });
    return;
  }
  if (node !== null && typeof node === "object") {
    for (const [segment, child] of Object.entries(node)) {
      collectValues(child, [...path, segment], out);
    }
  }
}

function sourceCatalogValues(): readonly CatalogValue[] {
  const out: CatalogValue[] = [];
  collectValues(resources[sourceLocale], [], out);
  return out;
}

/** A dotted catalog identity in message-key form (`ns.a.b` → `ns:a.b`), the
 *  shape the policy-layer exemption table is scoped by. */
function messageKeyOf(identity: string): string {
  const dot = identity.indexOf(".");
  return dot === -1 ? identity : `${identity.slice(0, dot)}:${identity.slice(dot + 1)}`;
}

function prohibitedHits(value: string, identity = ""): string[] {
  const key = messageKeyOf(identity);
  return PROHIBITED_UI_TERMS.filter(
    (term) =>
      term.pattern.test(value) &&
      // The same scoped narrowing the message policy applies: an exempted
      // term/namespace pair (the Advanced console's operator vocabulary) is not
      // an offender HERE either — one exemption table, two guards.
      !PROHIBITED_TERM_EXEMPTIONS[term.id]?.some((prefix) => key.startsWith(prefix)),
  ).map((term) => term.id);
}

describe("catalog vocabulary", () => {
  it("sweeps a non-empty source corpus against a non-empty prohibited table", () => {
    expect(sourceCatalogValues().length).toBeGreaterThan(0);
    expect(PROHIBITED_UI_TERMS.length).toBeGreaterThan(0);
  });

  it("contains no prohibited internal or development vocabulary", () => {
    const offenders = sourceCatalogValues()
      .filter(({ identity, value }) => prohibitedHits(value, identity).length > 0)
      .map(
        ({ identity, value }) =>
          `${identity}: "${value}" [${prohibitedHits(value, identity).join(", ")}]`,
      );

    expect(offenders).toEqual([]);
  });

  it("keeps the service exemption scoped to the advanced-console namespaces", () => {
    // The narrowing admits "service" only where the exemption table says so; an
    // identical value anywhere else stays an offender, and the package names
    // stay offenders even inside the exempted namespaces.
    expect(
      prohibitedHits("Pause service", "operations.searchMaintenance.actions.pause"),
    ).toEqual([]);
    expect(prohibitedHits("Pause service", "common.actions.pause")).toContain(
      "service",
    );
    expect(
      prohibitedHits(
        "Managed by vaultspec-rag",
        "operations.searchMaintenance.identity.title",
      ),
    ).toContain("internal-package");
  });

  it("flags each prohibited term family in an adverse value", () => {
    expect(prohibitedHits("The engine is unavailable")).toContain("engine");
    expect(prohibitedHits("Backend unavailable")).toContain("backend");
    expect(prohibitedHits("Token unavailable")).toContain("token");
    expect(prohibitedHits("Adapter unavailable")).toContain("adapter");
    expect(prohibitedHits("Schema unavailable")).toContain("schema");
    expect(prohibitedHits("Enable debug mode")).toContain("debug");
    expect(prohibitedHits("A development build")).toContain("development");
  });

  it("does not false-positive on ordinary words that contain a prohibited substring", () => {
    for (const safe of [
      "Restore the document",
      "Open the store",
      "Add a webhook",
      "Point the telescope",
      "Tokenized preview",
      "Componentry overview",
    ]) {
      expect(prohibitedHits(safe), safe).toEqual([]);
    }
  });
});
