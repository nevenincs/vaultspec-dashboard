import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as ledgerModule from "../design-system/consolidation-ledger";
import { DESIGN_SYSTEM_SCANNER_FIXTURES } from "./fixtures/design-system/manifest";
import { runFixtureCases } from "./fixtures/design-system/run-fixtures.mjs";
import {
  DOCUMENTED_RELATIVE_VALUE_EXAMPLE,
  KNOWN_RELATIVE_SCANNER_DEFECTS,
  REPORT_SCHEMA,
  scanDesignSystem,
  type DesignSystemFinding,
  type DesignSystemScanReport,
} from "./scan-design-system.mjs";

const SCENE_FINGERPRINT = "30817224d9b653c7858a39d9a7458252dbca682f";
const EXPECTED_FIXTURE_CODES = Object.fromEntries(
  DESIGN_SYSTEM_SCANNER_FIXTURES.map(({ id, expectedCodes }) => [
    id,
    [...expectedCodes].sort(),
  ]),
);

function findingOrder(left: DesignSystemFinding, right: DesignSystemFinding): number {
  return (
    left.path.localeCompare(right.path) ||
    left.line - right.line ||
    left.column - right.column ||
    left.code.localeCompare(right.code) ||
    left.detail.localeCompare(right.detail)
  );
}

function uniqueCodes(report: DesignSystemScanReport): string[] {
  return [...new Set(report.findings.map(({ code }) => code))].sort();
}

function clonedLedger(): Record<string, unknown> {
  return structuredClone(ledgerModule.CONSOLIDATION_LEDGER) as unknown as Record<
    string,
    unknown
  >;
}

describe("design-system scanner", () => {
  it("keeps every fixture case deterministic and enforces its exact finding-code set", async () => {
    const first = await runFixtureCases();
    const second = await runFixtureCases();

    expect(second).toEqual(first);
    expect(first).toHaveLength(19);
    expect(first.filter(({ status }) => status === "clean")).toHaveLength(3);
    expect(first.filter(({ status }) => status === "violations")).toHaveLength(16);
    expect(new Set(first.map(({ id }) => id)).size).toBe(first.length);
    expect(Object.fromEntries(first.map(({ id, codes }) => [id, codes]))).toEqual(
      EXPECTED_FIXTURE_CODES,
    );
    expect(first.every(({ passed }) => passed)).toBe(true);
  }, 60_000);

  it("proves each ownership, ledger, parsing, facade, and invariant rule can fail", async () => {
    const results = Object.fromEntries(
      (await runFixtureCases()).map((result) => [result.id, result]),
    );

    expect(results["invalid-missing-native-entry"]?.codes).toEqual([
      "native-control-missing",
    ]);
    expect(results["invalid-missing-relative-entry"]?.codes).toEqual([
      "relative-value-missing",
    ]);
    expect(results["invalid-stale-native-entry"]?.codes).toEqual([
      "native-control-stale",
    ]);
    expect(results["invalid-duplicate-ledger-identity"]?.codes).toEqual([
      "ledger-duplicate",
      "native-control-stale",
    ]);
    expect(results["invalid-malformed-source"]?.codes).toEqual([
      "ledger-invalid",
      "native-control-missing",
      "native-control-stale",
    ]);
    expect(results["invalid-malformed-ledger-shape"]?.codes).toEqual([
      "ledger-invalid",
    ]);
    expect(results["invalid-deep-kit-import"]?.codes).toEqual(["kit-deep-import"]);
    expect(results["invalid-duplicate-deep-import-ratchet"]?.codes).toEqual([
      "kit-deep-import",
    ]);
    expect(results["invalid-store-to-kit-import"]?.codes).toEqual(["layer-direction"]);
    expect(results["invalid-platform-to-kit-import"]?.codes).toEqual([
      "layer-direction",
    ]);
    for (const id of [
      "invalid-direct-reexport-facade",
      "invalid-local-reexport-facade",
      "invalid-export-assignment-facade",
      "invalid-forwarding-wrapper-facade",
    ]) {
      expect(results[id]?.codes).toEqual(["compatibility-facade"]);
    }
    expect(results["invalid-no-figma-invariant"]?.codes).toEqual(["invariant-invalid"]);
    expect(results["invalid-scene-invariant"]?.codes).toEqual(["invariant-stale"]);

    expect(results["valid-classified-seams"]).toMatchObject({
      status: "clean",
      codes: [],
    });
    expect(results["valid-comment-and-unitless-exclusions"]).toMatchObject({
      status: "clean",
      codes: [],
    });
    expect(results["valid-behavior-bearing-wrapper"]).toMatchObject({
      status: "clean",
      codes: [],
    });
  }, 45_000);

  it("reports the accepted production baseline with a stable JSON contract", async () => {
    const first = await scanDesignSystem();
    const second = await scanDesignSystem();

    expect(second).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(Object.keys(first)).toEqual(["schema", "status", "summary", "findings"]);
    expect(Object.keys(first.summary)).toEqual([
      "classificationFiles",
      "nativeControls",
      "relativeExecutableSites",
      "relativeClassifiedExceptions",
      "ownershipFiles",
      "pendingAppKitDeepImports",
      "pendingLowerLayerKitImports",
      "findings",
      "sceneFingerprint",
    ]);
    expect(first).toMatchObject({
      schema: REPORT_SCHEMA,
      status: "clean",
      summary: {
        nativeControls: 126,
        relativeExecutableSites: 100,
        relativeClassifiedExceptions: 6,
        pendingAppKitDeepImports: 12,
        pendingLowerLayerKitImports: 1,
        findings: 0,
        sceneFingerprint: SCENE_FINGERPRINT,
      },
      findings: [],
    });
    expect(first.summary.classificationFiles).toBeGreaterThan(0);
    expect(first.summary.ownershipFiles).toBeGreaterThanOrEqual(
      first.summary.classificationFiles,
    );
  }, 45_000);

  it("fails closed on a malformed ledger mutation and orders findings deterministically", async () => {
    type MutableInvariant = {
      id: string;
      boundary: string;
      statement: string;
      rationale: string;
      evidence: Array<{ path: string; owner: string; slot: string }>;
    };
    type MutableLedger = Omit<
      typeof ledgerModule.CONSOLIDATION_LEDGER,
      "invariants"
    > & { invariants: MutableInvariant[] };
    const ledger = structuredClone(
      ledgerModule.CONSOLIDATION_LEDGER,
    ) as unknown as MutableLedger;
    const noFigma = ledger.invariants.find(
      ({ id }) => id === "no-figma-campaign-evidence",
    );
    expect(noFigma).toBeDefined();
    if (noFigma === undefined) throw new Error("Missing no-Figma invariant");
    noFigma.statement = "Figma evidence is permitted.";
    noFigma.evidence.push(structuredClone(noFigma.evidence[0]));

    const options = {
      checkSceneFingerprint: false,
      ledgerModule: { ...ledgerModule, CONSOLIDATION_LEDGER: ledger },
    } as const;
    const first = await scanDesignSystem(options);
    const second = await scanDesignSystem(options);

    expect(second).toEqual(first);
    expect(first.status).toBe("violations");
    expect(uniqueCodes(first)).toEqual(["invariant-invalid"]);
    expect(first.findings).toEqual([...first.findings].sort(findingOrder));
    expect(first.summary.findings).toBe(first.findings.length);
    expect(first.summary.sceneFingerprint).toBeNull();
  }, 45_000);

  it("rejects loss of the repeated-native-site binding policy", async () => {
    const report = await scanDesignSystem({
      checkSceneFingerprint: false,
      duplicateSiteBindings: [],
    });

    expect(report.status).toBe("violations");
    expect(uniqueCodes(report)).toEqual([
      "native-binding-missing",
      "native-control-missing",
      "native-control-stale",
    ]);
  }, 45_000);

  it("fails every remaining baseline, staleness, and scene-preimage rule", async () => {
    const schemaReport = await scanDesignSystem({
      checkSceneFingerprint: false,
      ledgerModule: {
        ...ledgerModule,
        CONSOLIDATION_LEDGER_SCHEMA_VERSION: 2,
      },
    });
    expect(uniqueCodes(schemaReport)).toEqual(["ledger-schema"]);

    const staleLedger = clonedLedger();
    const staleNativeControls = staleLedger.nativeControls as Array<{
      canonicalOwner: { path: string };
    }>;
    staleNativeControls[0].canonicalOwner.path =
      "frontend/src/app/kit/MissingCanonicalOwner.tsx";
    const staleLedgerReport = await scanDesignSystem({
      checkSceneFingerprint: false,
      ledgerModule: { ...ledgerModule, CONSOLIDATION_LEDGER: staleLedger },
    });
    expect(uniqueCodes(staleLedgerReport)).toEqual(["ledger-stale"]);

    const nativeBaselineReport = await scanDesignSystem({
      checkSceneFingerprint: false,
      expectedNativeElementCounts: {
        button: 99,
        input: 20,
        select: 1,
        textarea: 5,
      },
    });
    expect(uniqueCodes(nativeBaselineReport)).toEqual(["native-baseline"]);

    const relativeExceptions = [
      ...structuredClone(KNOWN_RELATIVE_SCANNER_DEFECTS),
      structuredClone(DOCUMENTED_RELATIVE_VALUE_EXAMPLE),
    ] as Array<{ path: string; owner: string; slot: string; expression: string }>;
    relativeExceptions[0].expression = "h-[999rem]";
    const exceptionReport = await scanDesignSystem({
      checkSceneFingerprint: false,
      relativeExceptions,
    });
    expect(uniqueCodes(exceptionReport)).toEqual(["relative-exception-stale"]);

    const relativeLedger = clonedLedger();
    const relativeValues = relativeLedger.relativeValues as Array<{
      expression: string;
    }>;
    relativeValues[0].expression = "h-[0.126rem]";
    const relativeStaleReport = await scanDesignSystem({
      checkSceneFingerprint: false,
      ledgerModule: { ...ledgerModule, CONSOLIDATION_LEDGER: relativeLedger },
    });
    expect(uniqueCodes(relativeStaleReport)).toEqual([
      "relative-value-missing",
      "relative-value-stale",
    ]);

    type MutableSceneBaseline = {
      files: Array<{ worktree: { sha256: string } | null }>;
    };
    const sceneBaseline = JSON.parse(
      readFileSync(
        new URL("../design-system/scene-freeze-baseline.json", import.meta.url),
        "utf8",
      ),
    ) as MutableSceneBaseline;
    const firstWorktree = sceneBaseline.files.find(
      ({ worktree }) => worktree !== null,
    )?.worktree;
    expect(firstWorktree).toBeDefined();
    if (firstWorktree === undefined || firstWorktree === null)
      throw new Error("Scene baseline has no worktree preimage");
    firstWorktree.sha256 = "0".repeat(64);
    const sceneReport = await scanDesignSystem({ sceneBaseline });
    expect(uniqueCodes(sceneReport)).toEqual(["scene-freeze-drift"]);
  }, 90_000);
});
