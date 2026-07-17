import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { FINDING_CODES, LIMITS, scanFiles } from "./scan-localization.mjs";

const fixtureRoot = resolve(import.meta.dirname, "fixtures/localization");
const validFiles = [
  resolve(fixtureRoot, "valid/translation-bindings.tsx"),
  resolve(fixtureRoot, "valid/semantic-exclusions.ts"),
  resolve(fixtureRoot, "valid/authored-case-exclusions.tsx"),
  resolve(fixtureRoot, "valid/authored-case-exclusions.css"),
  resolve(fixtureRoot, "valid/canonical-display-semantics.tsx"),
];
const allRulesFile = resolve(fixtureRoot, "invalid/all-rules.tsx");
const punctuationFile = resolve(fixtureRoot, "invalid/punctuation.tsx");
const authoredCaseTransformFiles = [
  resolve(fixtureRoot, "invalid/authored-case-transform.tsx"),
  resolve(fixtureRoot, "invalid/authored-case-transform.css"),
];
const expandedAuthoredCaseTransformFiles = [
  resolve(fixtureRoot, "invalid/authored-case-transform-expanded.tsx"),
  resolve(fixtureRoot, "invalid/authored-case-transform-expanded.css"),
];
const excludedAuthoredCaseFiles = [
  resolve(fixtureRoot, "valid/authored-case-excluded.test.tsx"),
  resolve(fixtureRoot, "valid/authored-case-excluded.test.css"),
  resolve(import.meta.dirname, "../src/locales/en/common.ts"),
];
const generatedCommentFile = resolve(fixtureRoot, "invalid/generated-comment.tsx");
const rawKeybindingPresentationFile = resolve(
  fixtureRoot,
  "invalid/raw-keybinding-presentation.ts",
);
const canonicalDisplayBypassFile = resolve(
  fixtureRoot,
  "invalid/canonical-display-bypass.tsx",
);
const dynamicPresentationBlindspotsFile = resolve(
  fixtureRoot,
  "invalid/dynamic-presentation-blindspots.tsx",
);
const historyPipelineIdentityLeaksFile = resolve(
  fixtureRoot,
  "invalid/history-pipeline-identity-leaks.tsx",
);

describe("localization source scanner", () => {
  it("recognizes production translation bindings and semantic exclusions", () => {
    expect(scanFiles(validFiles)).toEqual([]);
  });

  it("accepts only canonical display semantics and rejects local bypasses", () => {
    expect(
      scanFiles([resolve(fixtureRoot, "valid/canonical-display-semantics.tsx")]),
    ).toEqual([]);
    const findings = scanFiles([canonicalDisplayBypassFile]);
    expect(
      findings.filter(({ code }) => code === FINDING_CODES.directLocaleFormat),
    ).toHaveLength(2);
    expect(findings.some(({ code }) => code === FINDING_CODES.jsxText)).toBe(true);
  });

  it("detects camel-case aria fields, error arrays, setters, and raw identities", () => {
    const findings = scanFiles([dynamicPresentationBlindspotsFile]);
    expect(
      findings.filter(({ code }) => code === FINDING_CODES.unsafeDynamicPresentation),
    ).toHaveLength(3);
    expect(
      findings.filter(({ code }) => code === FINDING_CODES.presentationField),
    ).toHaveLength(2);
    expect(findings.some(({ code }) => code === FINDING_CODES.jsxAttribute)).toBe(true);
  });

  it("detects history hashes, pipeline ids, and raw lower-case action grammar", () => {
    const findings = scanFiles([historyPipelineIdentityLeaksFile]);
    expect(
      findings.filter(({ code }) => code === FINDING_CODES.unsafeDynamicPresentation)
        .length,
    ).toBeGreaterThanOrEqual(4);
    expect(
      findings.filter(({ code }) => code === FINDING_CODES.presentationField).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("excludes exact catalog fixtures while scanning production titles", () => {
    for (const fixture of [
      "agentResources.ts",
      "graphResources.ts",
      "settingsResources.ts",
      "threeLabResources.ts",
    ]) {
      expect(
        scanFiles([
          resolve(import.meta.dirname, `../src/localization/testing/${fixture}`),
        ]),
      ).toEqual([]);
    }
    expect(
      scanFiles([allRulesFile]).some(
        ({ code, snippet }) =>
          code === FINDING_CODES.presentationField && snippet.includes("title:"),
      ),
    ).toBe(true);
  });

  it("reports every production finding code from real invalid source", () => {
    const findings = scanFiles([allRulesFile]);
    const rawKeybindingFindings = scanFiles([rawKeybindingPresentationFile]);
    const authoredCaseFindings = scanFiles(authoredCaseTransformFiles);
    const dynamicPresentationFindings = scanFiles([dynamicPresentationBlindspotsFile]);
    const punctuationFindings = scanFiles([punctuationFile]);

    expect(
      new Set(
        [
          ...findings,
          ...rawKeybindingFindings,
          ...authoredCaseFindings,
          ...dynamicPresentationFindings,
          ...punctuationFindings,
        ].map(({ code }) => code),
      ),
    ).toEqual(new Set(Object.values(FINDING_CODES)));
    // The punctuation rule fires for BOTH prohibited forms and BOTH carrier
    // positions: the em dash in jsx text and the hand-typed ellipsis in an
    // attribute (each also reported as an untranslated literal — the rule is
    // additive, never a replacement).
    expect(
      punctuationFindings.filter(({ code }) => code === FINDING_CODES.punctuation)
        .length,
    ).toBeGreaterThanOrEqual(2);
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

  it("rejects authored case transforms in TSX and CSS", () => {
    const allFindings = scanFiles(authoredCaseTransformFiles);
    const findings = allFindings.filter(
      ({ code }) => code === FINDING_CODES.authoredCaseTransform,
    );

    expect(allFindings.filter(({ code }) => code === FINDING_CODES.jsxText)).toEqual(
      [],
    );
    expect(findings).toHaveLength(22);
    expect(findings.map(({ snippet }) => snippet)).toEqual([
      "text-transform: uppercase",
      "text-transform: lowercase",
      "text-transform: capitalize",
      "font-variant: small-caps",
      "font-variant-caps: all-small-caps",
      'HEADER_CLASS = "text-caption lowercase"',
      'rowClassName = joinClasses("capitalize", "font-medium")',
      'sectionButtonClassName: "uppercase tracking-wide"',
      'className: "lowercase"',
      'className="uppercase"',
      'className={props.compact ? lowerClass : "normal-case"}',
      'className={joinClasses("capitalize", "font-medium")}',
      'textTransform: "uppercase"',
      'textTransform: props.compact ? "lowercase" : "none"',
      'textTransform: "capitalize"',
      'className="uppercase"',
      'textTransform: "capitalize"',
      "className={HEADER_CLASS}",
      "className={rowClassName}",
      "className={presentation.sectionButtonClassName}",
      "className={itemPresentation.className}",
      "textTransform",
    ]);
  });

  it("excludes test and locale sources from authored case scanning", () => {
    expect(scanFiles(excludedAuthoredCaseFiles)).toEqual([]);
  });

  it("fails closed for dynamic and extended authored case transforms", () => {
    const findings = scanFiles(expandedAuthoredCaseTransformFiles).filter(
      ({ code }) => code === FINDING_CODES.authoredCaseTransform,
    );
    const snippets = findings.map(({ snippet }) => snippet);

    expect(snippets).toEqual(
      expect.arrayContaining([
        "text-transform: var(--case-mode)",
        "text-transform: full-size-kana",
        "font-variant-caps: var(--caps-mode)",
        "font-variant: var(--font-variant)",
        "@apply uppercase",
        "@apply hover:lowercase",
        "@apply focus:[text-transform:math-auto]",
        "textTransform: fullWidth",
        'textTransform: "full-size-kana"',
        'textTransform: "math-auto"',
        "textTransform",
        'fontVariant: "small-caps"',
        "fontVariant",
        "fontVariantCaps",
        "textTransform={props.textMode}",
        'fontVariant="small-caps"',
        "fontVariantCaps={props.capsMode}",
        'className="hover:[text-transform:full-width]"',
        'className="[font-variant-caps:small-caps]"',
      ]),
    );
  });

  it("rejects raw keybinding label and group fields without a compatibility helper", () => {
    const findings = scanFiles([rawKeybindingPresentationFile]);

    expect(findings).toMatchObject([
      {
        code: FINDING_CODES.presentationField,
        snippet: 'label: "Raw shortcut label"',
      },
      {
        code: FINDING_CODES.presentationField,
        snippet: 'group: "Raw shortcut group"',
      },
    ]);
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

  it("assigns attribute expressions to the attribute scanner", () => {
    const directory = mkdtempSync(join(tmpdir(), "vaultspec-localization-jsx-"));
    try {
      const file = join(directory, "attribute-ownership.tsx");
      writeFileSync(
        file,
        [
          'const baseId = "result";',
          'const tone = "ready";',
          "const cond = true;",
          "export const Fixture = () => (",
          "  <>",
          "    <div id={`${baseId}-live`} data-state={tone} />",
          "    <button aria-label={cond ? 'Save' : 'Cancel'} />",
          '    <SegmentedToggle ariaLabel="Search scope" />',
          "    <div>{cond ? 'Visible' : 'Hidden'}</div>",
          "  </>",
          ");",
        ].join("\n"),
        "utf8",
      );

      const findings = scanFiles([file]);
      const attributeFindings = findings.filter(
        ({ code }) => code === FINDING_CODES.jsxAttribute,
      );
      const textFindings = findings.filter(
        ({ code }) => code === FINDING_CODES.jsxText,
      );

      expect(attributeFindings).toHaveLength(3);
      expect(attributeFindings.map(({ snippet }) => snippet)).toEqual([
        "aria-label={cond ? 'Save' : 'Cancel'}",
        "aria-label={cond ? 'Save' : 'Cancel'}",
        'ariaLabel="Search scope"',
      ]);
      expect(textFindings).toHaveLength(2);
      expect(textFindings.map(({ snippet }) => snippet)).toEqual([
        "{cond ? 'Visible' : 'Hidden'}",
        "{cond ? 'Visible' : 'Hidden'}",
      ]);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
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
});
