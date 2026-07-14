import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareAllowlist,
  FINDING_CODES,
  LIMITS,
  scanFiles,
  validateAllowlistEntries,
} from "./scan-localization.mjs";

const fixtureRoot = resolve(import.meta.dirname, "fixtures/localization");
const validFiles = [
  resolve(fixtureRoot, "valid/translation-bindings.tsx"),
  resolve(fixtureRoot, "valid/semantic-exclusions.ts"),
];
const allRulesFile = resolve(fixtureRoot, "invalid/all-rules.tsx");
const generatedCommentFile = resolve(fixtureRoot, "invalid/generated-comment.tsx");

function baselineFor(
  findings: ReturnType<typeof scanFiles>,
): Array<{ id: string; path: string; rule: string }> {
  return findings.map(({ code, id, path }) => ({ id, path, rule: code }));
}

describe("localization source scanner", () => {
  it("recognizes production translation bindings and semantic exclusions", () => {
    expect(scanFiles(validFiles)).toEqual([]);
  });

  it("reports every production finding code from real invalid source", () => {
    const findings = scanFiles([allRulesFile]);

    expect(new Set(findings.map(({ code }) => code))).toEqual(
      new Set(Object.values(FINDING_CODES)),
    );
    expect(
      findings.some(
        ({ code, snippet }) =>
          code === FINDING_CODES.jsxText && snippet.includes("conditionalMessage"),
      ),
    ).toBe(true);
    expect(findings.some(({ code }) => code === FINDING_CODES.fixedLocaleFormat)).toBe(
      true,
    );
    expect(findings.some(({ code }) => code === FINDING_CODES.directLocaleFormat)).toBe(
      true,
    );
    expect(
      findings.some(
        ({ code, snippet }) =>
          code === FINDING_CODES.dynamicMessageKey &&
          snippet.includes("props.messageKey"),
      ),
    ).toBe(true);
    expect(
      findings.some(
        ({ code, snippet }) =>
          code === FINDING_CODES.dynamicMessageKey &&
          snippet.includes("cyclicConfirmation"),
      ),
    ).toBe(true);
    expect(
      findings.some(
        ({ code, snippet }) =>
          code === FINDING_CODES.dynamicMessageKey &&
          snippet.includes("overrideMessageKey"),
      ),
    ).toBe(true);
    expect(
      findings.some(
        ({ code, snippet }) =>
          code === FINDING_CODES.presentationField &&
          snippet.includes("Raw confirmation body"),
      ),
    ).toBe(true);
  });

  it("does not accept a generated comment as a scanning bypass", () => {
    expect(scanFiles([generatedCommentFile]).map(({ code }) => code)).toContain(
      FINDING_CODES.jsxText,
    );
  });

  it("returns identical ordered findings and IDs across repeated scans", () => {
    const first = scanFiles([allRulesFile]);
    expect(scanFiles([allRulesFile])).toEqual(first);
    expect(first.map(({ id }) => id)).toEqual([
      "ddfbbbc3451009e6e64c94cd",
      "4a2e7fcfb8b325a010bd3f59",
      "e7b02641ec4724af326880b3",
      "4f17b6c0fdb8e62299b28f6c",
      "dd0f8dd99a7b822ec52c7ada",
      "adcb46be250028eebb8a951c",
      "4e27205c6418d45e05347497",
      "8fcc76ca0fde37f2ae260173",
      "f8668aef113cb459b9c3fbe3",
      "28e67bf40758439e28cf5076",
      "b8b455ed03729d27e63a6594",
      "ba833345be016286229ce2ed",
      "e0c9e9e892a51c91f2be815c",
      "0ce0163dfdc76fb7f3a1cde7",
      "befb64a7b32ef58615b03c31",
      "efd39eb35f00920207a45041",
    ]);
  });

  it("detects new, stale, and metadata-tampered baseline entries", () => {
    const findings = scanFiles([allRulesFile]);
    const baseline = validateAllowlistEntries(baselineFor(findings));
    expect(compareAllowlist(findings, baseline)).toEqual({
      metadataMismatches: [],
      newFindings: [],
      stale: [],
    });

    const withoutFirst = baseline.slice(1);
    expect(compareAllowlist(findings, withoutFirst).newFindings).toEqual([findings[0]]);

    const staleEntry = {
      id: "0".repeat(24),
      path: "scripts/fixtures/localization/invalid/stale.tsx",
      rule: FINDING_CODES.jsxText,
    };
    expect(compareAllowlist(findings, [...baseline, staleEntry]).stale).toEqual([
      staleEntry,
    ]);

    const first = baseline[0];
    if (first === undefined) throw new Error("Expected scanner findings.");
    const alternateRule = Object.values(FINDING_CODES).find(
      (rule) => rule !== first.rule,
    );
    if (alternateRule === undefined)
      throw new Error("Expected multiple scanner rules.");
    const tampered = [{ ...first, rule: alternateRule }, ...baseline.slice(1)];
    expect(compareAllowlist(findings, tampered).metadataMismatches).toEqual([
      findings[0],
    ]);
  });

  it("rejects invalid and out-of-root baseline metadata", () => {
    const findings = scanFiles([generatedCommentFile]);
    const entry = baselineFor(findings)[0];
    if (entry === undefined) throw new Error("Expected a scanner finding.");

    expect(() =>
      validateAllowlistEntries([{ ...entry, rule: "unknown-rule" }]),
    ).toThrowError("Localization allowlist contains an invalid entry.");
    expect(() =>
      validateAllowlistEntries([{ ...entry, path: "../outside.ts" }]),
    ).toThrowError("Localization allowlist contains an invalid entry.");
    for (const path of [
      "scripts\\outside.ts",
      "C:\\outside.ts",
      "\\\\server\\share\\outside.ts",
      "/outside.ts",
    ]) {
      expect(() => validateAllowlistEntries([{ ...entry, path }]), path).toThrowError(
        "Localization allowlist contains an invalid entry.",
      );
    }
    expect(() => validateAllowlistEntries([entry, entry])).toThrowError(
      "Localization allowlist contains an invalid entry.",
    );
  });

  it("fails closed at expression, file, and finding limits", () => {
    const directory = mkdtempSync(join(tmpdir(), "vaultspec-localization-"));
    const compositionDirectory = mkdtempSync(
      join(import.meta.dirname, ".localization-composition-"),
    );
    try {
      const partsFile = join(directory, "parts.ts");
      const parts = Array.from({ length: LIMITS.parts + 1 }, () => '${"part"}').join(
        "",
      );
      writeFileSync(partsFile, `export const value = \`${parts}\`;\n`, "utf8");
      expect(() => scanFiles([partsFile])).toThrowError(
        "Localization constant resolution part limit exceeded.",
      );

      const largeFile = join(directory, "large.ts");
      writeFileSync(largeFile, `//${"x".repeat(LIMITS.fileBytes)}\n`, "utf8");
      expect(() => scanFiles([largeFile])).toThrowError(
        "Localization file limit exceeded",
      );

      const findingsFile = join(directory, "findings.ts");
      writeFileSync(
        findingsFile,
        'alert("Visible fixture message");\n'.repeat(LIMITS.findings + 1),
        "utf8",
      );
      expect(() => scanFiles([findingsFile])).toThrowError(
        "Localization finding limit exceeded.",
      );

      const compositionFile = join(compositionDirectory, "confirmation.ts");
      const fields = Array.from(
        { length: LIMITS.parts + 1 },
        (_, index) => `field${index}: { key: "common:actions.retry" as const }`,
      ).join(",\n");
      writeFileSync(
        compositionFile,
        [
          'import { createConfirmationDescriptor } from "../../src/platform/localization/message";',
          `const fields = { ${fields} };`,
          "createConfirmationDescriptor({ ...fields });",
        ].join("\n"),
        "utf8",
      );
      expect(() => scanFiles([compositionFile])).toThrowError(
        "Localization constant resolution part limit exceeded.",
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
      rmSync(compositionDirectory, { force: true, recursive: true });
    }
  }, 60_000);

  it("refuses to overwrite the checked-in baseline", () => {
    const result = spawnSync(
      process.execPath,
      [resolve(import.meta.dirname, "scan-localization.mjs"), "--init"],
      {
        cwd: resolve(import.meta.dirname, ".."),
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Localization allowlist already exists; initialization cannot overwrite it.",
    );
  }, 30_000);
});
