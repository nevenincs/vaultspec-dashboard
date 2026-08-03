// The panel's refusal vocabulary, reconciled against the ENGINE's declaration of
// it — read from the Rust source, not restated in TypeScript.
//
// Why this file exists. One enumerated vocabulary is now written down three
// times: the producing side resolves it, the engine models and persists it, and
// this package renders one remedy per member. Two of those three pairings are
// gated — the producing side's own suite reads the engine constant and requires
// member-for-member equality. This copy was the ungated leg, free to drift from
// both without anything going red.
//
// Every other check of the list here derives its fixture AND its expectation
// from `PROVIDER_CONDITIONS`: the adapter coverage loops over it, and the panel
// suite asserts its own table equals it. Rename a member in that array and all
// of them stay green while the rendered remedy stops matching any refusal the
// wire can actually carry. So this test takes its expectation from outside this
// package entirely.
//
// It reads the file rather than a running engine deliberately. Both trees live in
// ONE repository, so the read is unconditional — no environment variable, no
// live harness, no skip branch — which is why this belongs in the ordinary unit
// tier. It follows the idiom `clarification.contract.test.ts` established for the
// same contract module: resolve the path from this file, throw rather than
// default when the declaration is absent, and check that the Rust side still
// carries its own pin to the producing side.
//
// The one link no in-repo test can close: a simultaneous edit on both sides of
// the repository boundary. That is caught by a round-trip against a running
// sibling, not here.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PROVIDER_CONDITIONS } from "./providerCondition";

const CONTRACT_PATH = fileURLToPath(
  new URL(
    "../../../../../engine/crates/vaultspec-product/src/a2a_contract.rs",
    import.meta.url,
  ),
);

const CONTRACT_SOURCE = readFileSync(CONTRACT_PATH, "utf8");

/**
 * The members of one `pub const NAME: &[&str] = &[...];` in the contract module,
 * in declaration ORDER.
 *
 * Anchored on the declaration rather than on any array of string literals: that
 * module states the same nine spellings a second time, as the literal its own
 * pinning test holds the constant against. An unanchored reader could match that
 * copy instead and would then go green on the exact edit — one of the two
 * changed, the other not — this exists to catch.
 *
 * Throws rather than returning an empty list when the declaration is absent. A
 * missing declaration means the contract moved or was renamed, and an empty list
 * compared against an empty list is the shape a vacuous gate takes.
 */
export function contractVocabulary(source: string, name: string): string[] {
  const declaration = source.match(
    new RegExp(String.raw`pub const ${name}\s*:\s*&\[&str\]\s*=\s*&\[([^\]]*)\]\s*;`),
  );
  if (declaration === null) {
    throw new Error(
      `${name} is not declared as a string-slice constant in a2a_contract.rs — ` +
        `the shared vocabulary moved or was renamed, so the rendered remedies ` +
        `are reconciled against nothing`,
    );
  }
  return [...declaration[1]!.matchAll(/"([^"]*)"/gu)].map((member) => member[1]!);
}

/** Say which direction drifted and what that costs a reader, because the two
 *  directions fail differently and neither is legible from a diff of two lists. */
function driftReport(upstream: readonly string[], here: readonly string[]): string {
  const unrendered = upstream.filter((member) => !here.includes(member));
  const unreachable = here.filter((member) => !upstream.includes(member));
  const notes: string[] = [];
  if (unrendered.length > 0) {
    notes.push(
      `named upstream but missing here (${unrendered.join(", ")}): a run refused ` +
        `for one of these falls to the floor member, so the reader is shown a ` +
        `remedy for a refusal that did not happen`,
    );
  }
  if (unreachable.length > 0) {
    notes.push(
      `named here but not upstream (${unreachable.join(", ")}): an affordance no ` +
        `run can reach, which reads as implemented in review precisely because ` +
        `every other layer names it`,
    );
  }
  if (notes.length === 0) {
    notes.push(
      `the same members in a different order: this is one enumerated vocabulary ` +
        `and its order is part of it, so a reorder is a change to the contract`,
    );
  }
  return `refusal vocabulary drifted from the engine contract — ${notes.join("; ")}`;
}

describe("the panel's refusal vocabulary against the shared contract", () => {
  it("names exactly the members the engine declares, in the same order", () => {
    const upstream = contractVocabulary(CONTRACT_SOURCE, "A2A_PROVIDER_CONDITIONS");
    const here = [...PROVIDER_CONDITIONS];
    // Neither side may be empty. Equality between two empty lists is the way this
    // gate would pass while checking nothing at all.
    expect(upstream.length).toBeGreaterThan(0);
    expect(here.length).toBeGreaterThan(0);
    expect(here, driftReport(upstream, here)).toEqual(upstream);
  });

  it("reads a contract that still pins itself to the producing side", () => {
    // This chain is only worth having while the Rust side keeps its own pin. If
    // that assertion is deleted, the vocabulary is reconciled with a copy of
    // itself and nothing else, which is the state this leg was already in.
    expect(CONTRACT_SOURCE).toContain(
      "fn the_provider_conditions_are_pinned_to_the_members_a2a_emits",
    );
  });
});

describe("the contract reader itself", () => {
  // A reader that quietly matched nothing, or that returned a hard-coded answer,
  // would make the gate above green for the wrong reason. These drive it over
  // sources whose correct answer is known and is NOT the real vocabulary.
  const SYNTHETIC = [
    "pub const A2A_PROVIDER_CONDITIONS: &[&str] = &[",
    '    "first_member",',
    '    "second_member",',
    "];",
  ].join("\n");

  it("returns the declared members in order, not a fixed answer", () => {
    expect(contractVocabulary(SYNTHETIC, "A2A_PROVIDER_CONDITIONS")).toEqual([
      "first_member",
      "second_member",
    ]);
  });

  it("reads the declaration, not a later literal that restates it", () => {
    // The real module holds both shapes. Were the reader to match the second, a
    // constant edited alone would still compare equal to the copy it drifted from.
    const withRestatement = [
      SYNTHETIC,
      "    #[test]",
      "    fn pinned() {",
      "        assert_eq!(A2A_PROVIDER_CONDITIONS, [",
      '            "stale_member",',
      "        ]);",
      "    }",
    ].join("\n");
    expect(contractVocabulary(withRestatement, "A2A_PROVIDER_CONDITIONS")).toEqual([
      "first_member",
      "second_member",
    ]);
  });

  it("refuses to report an empty vocabulary when the declaration is gone", () => {
    expect(() =>
      contractVocabulary("// nothing here", "A2A_PROVIDER_CONDITIONS"),
    ).toThrow(/not declared as a string-slice constant/u);
    // A renamed constant is the same failure: the old name no longer resolves.
    expect(() => contractVocabulary(SYNTHETIC, "A2A_REFUSAL_CONDITIONS")).toThrow(
      /not declared as a string-slice constant/u,
    );
  });
});
