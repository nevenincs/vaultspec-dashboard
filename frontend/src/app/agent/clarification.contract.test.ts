// The card's clarification caps, reconciled against the ENGINE's declaration of
// a2a's bounds — read from the Rust source, not restated in TypeScript.
//
// Why this file exists. `clarification.test.ts` proves the card BEHAVES like a
// capped field: it feeds `boundedAnswer` a string sized from
// `CLARIFICATION_MAX_ANSWER_CHARS` and expects a result of that same length. That
// is a correct behaviour test and a worthless value test — set the constant to
// 4096, to 2048, or to a million and it stays green, because its input and its
// expectation move together. It did stay green: the card admitted 4096-char
// answers against a sibling that hard-refuses at 2048, so a pasted paragraph
// sailed through the local gate, sailed through the engine, and came back a 422
// the user saw only as an unexplained submit failure on a still-parked run.
//
// A cap declared on two sides of a language boundary needs one of them to read
// the other, or neither is checking anything. So this test reads
// `engine/crates/vaultspec-product/src/a2a_contract.rs` — the single declaration
// the engine's own boundary imports — and requires the TypeScript constants to
// equal it. Change either side alone and this fails, naming both values.
//
// The chain this closes, and its one remaining link: TS is pinned here to Rust,
// and Rust is pinned to a2a by exactly one assertion in that same module
// (`the_clarification_bounds_are_pinned_to_the_numbers_a2a_enforces`), which
// states each number as a literal beside the a2a symbol that enforces it. No
// in-repo test can read a2a itself; a simultaneous change on both sides of the
// repository boundary is caught only by a round-trip against a running sibling.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CLARIFICATION_MAX_ANSWER_CHARS,
  CLARIFICATION_MAX_OPTIONS,
  CLARIFICATION_MAX_QUESTIONS,
} from "./clarification";

const CONTRACT_PATH = fileURLToPath(
  new URL(
    "../../../../engine/crates/vaultspec-product/src/a2a_contract.rs",
    import.meta.url,
  ),
);

const CONTRACT_SOURCE = readFileSync(CONTRACT_PATH, "utf8");

/**
 * The value of one `pub const NAME: usize = N;` in the contract module.
 *
 * Throws rather than returning a default when the constant is absent: a missing
 * declaration means the contract moved or was renamed, and a test that silently
 * substituted `undefined` would go green on exactly the drift it exists to catch.
 */
function contractConst(name: string): number {
  const match = CONTRACT_SOURCE.match(
    new RegExp(String.raw`pub const ${name}\s*:\s*usize\s*=\s*(\d+)\s*;`),
  );
  if (match === null) {
    throw new Error(
      `${name} is not declared in a2a_contract.rs — the shared clarification ` +
        `contract moved or was renamed, so the card's caps are reconciled ` +
        `against nothing`,
    );
  }
  return Number(match[1]);
}

describe("the card's clarification caps against the shared a2a contract", () => {
  it("caps an answer at exactly the number the engine imports from the contract", () => {
    // The finding, in one assertion: this was 4096 against a contract of 2048.
    expect(CLARIFICATION_MAX_ANSWER_CHARS).toBe(
      contractConst("A2A_MAX_CLARIFICATION_ANSWER_CHARS"),
    );
  });

  it("caps the question and option counts at the contract's numbers", () => {
    expect(CLARIFICATION_MAX_QUESTIONS).toBe(
      contractConst("A2A_MAX_CLARIFICATION_QUESTIONS"),
    );
    expect(CLARIFICATION_MAX_OPTIONS).toBe(
      contractConst("A2A_MAX_CLARIFICATION_OPTIONS"),
    );
  });

  it("reads a contract that still pins itself to a2a", () => {
    // The link above is only worth having while the Rust side keeps its own pin
    // to the sibling. If that assertion is deleted, this chain reconciles the
    // dashboard with itself and nothing else — which is the state the finding
    // described. Fail loudly rather than inherit a broken chain silently.
    expect(CONTRACT_SOURCE).toContain(
      "fn the_clarification_bounds_are_pinned_to_the_numbers_a2a_enforces",
    );
    // And it must name the sibling module that owns the numbers, so a reader of
    // either side can find the authority without guessing.
    expect(CONTRACT_SOURCE).toContain("thread/clarification.py");
  });
});
