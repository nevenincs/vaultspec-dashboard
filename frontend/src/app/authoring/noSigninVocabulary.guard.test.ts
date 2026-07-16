import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Structural guard for the agentic-authoring-ux ADR D5 review detangle.
//
// The review surface no longer gates on a fake "Sign in as reviewer" wall:
// provenance is ambient (the actor token mints transparently on the first
// mutating review intent), and the `ReviewerIdentity` component plus its entire
// Sign in / Sign out / Signing in vocabulary are DELETED — not relabelled, not
// kept as a fallback (no deprecation bridges). This test scans production source
// (including the localization catalogs) so a re-introduced sign-in string fails
// the gate instead of shipping green. It targets the USER-FACING phrase, not the
// internal token-lifecycle method names (`signOut`, `setActorToken`) which stay.

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(HERE, "..", ".."); // frontend/src
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name))) continue;
    if (entry.name.includes(".test.") || entry.name.includes(".stories.")) continue;
    out.push(path);
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const FILES = sourceFiles(SRC_ROOT).map((file) => ({
  rel: relative(SRC_ROOT, file).replaceAll("\\", "/"),
  body: stripComments(readFileSync(file, "utf8")),
}));

// The user-facing sign-in vocabulary: "Sign in", "Sign out", "Signed in",
// "Signing in", "Signing out". A required whitespace separator keeps the internal
// camelCase/kebab identifiers (`signOut`, `signInToAct`, `sign-in path`) out of
// the match — this is a guard against rendered strings, not method names.
const SIGNIN_VOCABULARY = /\bsign(?:ed|ing)?\s+(?:in|out)\b/i;

// The deleted component must never return.
const REVIEWER_IDENTITY = /\bReviewerIdentity\b|data-reviewer-sign/;

describe("agentic-authoring-ux D5: the review surface carries no sign-in gate", () => {
  it("has no Sign in / Sign out vocabulary anywhere in production source", () => {
    const offenders = FILES.filter((f) => SIGNIN_VOCABULARY.test(f.body)).map(
      (f) => f.rel,
    );
    expect(
      offenders,
      `sign-in vocabulary reappeared in ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("has no ReviewerIdentity sign-in component or its markers", () => {
    const offenders = FILES.filter((f) => REVIEWER_IDENTITY.test(f.body)).map(
      (f) => f.rel,
    );
    expect(
      offenders,
      `the deleted ReviewerIdentity surface reappeared in ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
