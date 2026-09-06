#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

import ts from "typescript";

import { scanDesignSystem } from "../../scan-design-system.mjs";

const fixtureRoot = dirname(fileURLToPath(import.meta.url));
const ZERO_NATIVE_COUNTS = Object.freeze({
  button: 0,
  input: 0,
  select: 0,
  textarea: 0,
});
const SOURCE_SCOPE = Object.freeze({
  roots: ["frontend/src/app", "frontend/src/platform"],
  extensions: [".ts", ".tsx"],
  excludedSuffixes: [".test.ts", ".test.tsx"],
});
const DISPOSITIONS = Object.freeze([
  "canonical-owner",
  "migrate",
  "retain-semantic-seam",
  "retain-exact-geometry",
  "repair-local-defect",
  "track-parity-debt",
]);
const OWNER_LAYERS = Object.freeze([
  "dtcg-foundation",
  "dtcg-component",
  "app-kit",
  "shared-chrome",
  "feature-surface",
  "store-policy",
  "platform-mechanism",
]);
const RATIONALE_FIELDS = Object.freeze({
  "canonical-owner": ["summary", "ownership"],
  migrate: ["summary", "equivalence", "replacement", "deletion"],
  "retain-semantic-seam": ["summary", "distinction"],
  "retain-exact-geometry": ["summary", "constraint", "exactValue"],
  "repair-local-defect": ["summary", "defect", "correction"],
  "track-parity-debt": ["summary", "unresolvedBinding", "reconciliation"],
});
const INVARIANT_PAIRS = Object.freeze([
  ["scene-source-byte-freeze", "scene-source"],
  ["graph-semantics-freeze", "graph-semantics"],
  ["store-policy-preservation", "store-policy"],
  ["wire-contract-preservation", "wire-contract"],
  ["responsive-mode-preservation", "responsive-mode"],
  ["no-figma-campaign-evidence", "figma-exclusion"],
]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function loadManifest() {
  const path = resolve(fixtureRoot, "manifest.ts");
  const result = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path,
  });
  const encoded = Buffer.from(result.outputText, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

function sourceKey(source) {
  if (
    typeof source?.path !== "string" ||
    !source.path.startsWith("frontend/") ||
    typeof source.owner !== "string" ||
    source.owner.trim() === "" ||
    typeof source.slot !== "string" ||
    source.slot.trim() === ""
  ) {
    throw new Error("Invalid fixture ledger source identity.");
  }
  return JSON.stringify([source.path, source.owner, source.slot]);
}

function nativeEntry(path, owner, slot = "retained-action") {
  return {
    source: { path, owner, slot },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path,
      name: owner,
      status: "existing",
    },
    rationale: {
      summary: "The fixture control is deliberately classified.",
      distinction: "Its semantic seam remains with the named fixture owner.",
    },
  };
}

function relativeEntry(path, owner) {
  return {
    source: { path, owner, slot: "compound-container-width" },
    expression: "w-[50cqw] max-w-[calc(100cqw-2rem)]",
    units: ["cqw", "rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path,
      name: owner,
      status: "existing",
    },
    rationale: {
      summary: "The fixture expression is deliberately classified.",
      constraint: "Container-relative geometry belongs to this fixture surface.",
      exactValue: "The complete calc expression remains unchanged.",
    },
  };
}

function invariants(evidencePath) {
  return INVARIANT_PAIRS.map(([id, boundary]) => ({
    id,
    boundary,
    statement:
      boundary === "figma-exclusion"
        ? "This fixture does not use Figma capture, makes no Figma-parity claim, and does not supersede Figma's separate long-term design authority."
        : `The ${boundary} fixture boundary remains frozen.`,
    rationale: `The ${boundary} boundary is explicit fixture evidence.`,
    evidence: [
      {
        path: evidencePath,
        owner: "FixtureEvidence",
        slot: id,
      },
    ],
  }));
}

function ledgerModuleFor(fixture) {
  let nativeControls = [];
  let relativeValues = [];
  let namingDebt = [];
  const target = fixture.targetPath;
  if (fixture.ledger === "classified-seams") {
    nativeControls = [nativeEntry(target, "ClassifiedSeams")];
    relativeValues = [relativeEntry(target, "ClassifiedSeams")];
  } else if (fixture.ledger === "stale-native") {
    nativeControls = [nativeEntry(target, "StaleNativeEntry")];
  } else if (fixture.ledger === "duplicate-native") {
    const entry = nativeEntry(target, "ClassifiedSeams");
    nativeControls = [entry, structuredClone(entry)];
    relativeValues = [relativeEntry(target, "ClassifiedSeams")];
  } else if (fixture.ledger === "malformed-source") {
    const entry = nativeEntry(target, "MalformedSource");
    entry.source.path = "../outside.ts";
    nativeControls = [entry];
  } else if (fixture.ledger === "malformed-ledger") {
    namingDebt = [
      {
        source: {
          path: target,
          owner: "InventedAlias",
          slot: "component-export-name",
        },
        debtKind: "invented-debt-kind",
        codeName: "",
        designAlias: "Invented design evidence",
        disposition: "track-parity-debt",
        canonicalOwner: {
          layer: "feature-surface",
          path: target,
          name: "InventedAlias",
          status: "bogus",
        },
        rationale: {
          summary: "Malformed fixture ledger entry.",
          unresolvedBinding: "Malformed fixture ledger entry.",
          reconciliation: "Malformed fixture ledger entry.",
        },
      },
    ];
  }

  const campaignInvariants = invariants(target);
  if (fixture.ledger === "invalid-no-figma") {
    campaignInvariants.at(-1).statement = "Figma evidence is permitted.";
  } else if (fixture.ledger === "invalid-scene-invariant") {
    campaignInvariants[0].boundary = "graph-semantics";
  }

  const baselineCounts = {
    nativeControlSites: nativeControls.length,
    arbitraryRelativeValueSites: relativeValues.length,
  };
  const ledger = {
    schemaVersion: 1,
    baselineCounts,
    sourceScope: SOURCE_SCOPE,
    nativeControls,
    relativeValues,
    namingDebt,
    invariants: campaignInvariants,
  };
  return {
    CANONICAL_OWNER_LAYERS: OWNER_LAYERS,
    CONSOLIDATION_BASELINE_COUNTS: baselineCounts,
    CONSOLIDATION_DISPOSITIONS: DISPOSITIONS,
    CONSOLIDATION_INVARIANT_BOUNDARIES: INVARIANT_PAIRS.map(([, boundary]) => boundary),
    CONSOLIDATION_LEDGER: ledger,
    CONSOLIDATION_LEDGER_SCHEMA_VERSION: 1,
    CONSOLIDATION_SOURCE_SCOPE: SOURCE_SCOPE,
    DISPOSITION_RATIONALE_FIELDS: RATIONALE_FIELDS,
    NATIVE_CONTROL_ELEMENTS: ["button", "input", "select", "textarea"],
    RELATIVE_VALUE_UNITS: ["rem", "em", "vw", "vh", "cqw", "%"],
    invariantEvidenceKey: (evidence) =>
      JSON.stringify([evidence.path, evidence.owner, evidence.slot]),
    ledgerSourceKey: sourceKey,
  };
}

export async function runFixtureCases() {
  const { DESIGN_SYSTEM_SCANNER_FIXTURES } = await loadManifest();
  const results = [];
  for (const fixture of DESIGN_SYSTEM_SCANNER_FIXTURES) {
    const temporaryRoot = mkdtempSync(
      join(tmpdir(), `vaultspec-design-system-${fixture.id}-`),
    );
    try {
      const frontendRoot = join(temporaryRoot, "frontend");
      const target = resolve(temporaryRoot, fixture.targetPath);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(resolve(fixtureRoot, fixture.fixture), target);
      const report = await scanDesignSystem({
        frontendRoot,
        ledgerModule: ledgerModuleFor(fixture),
        checkSceneFingerprint: false,
        duplicateSiteBindings: [],
        expectedNativeElementCounts:
          fixture.expectedNativeElementCounts ?? ZERO_NATIVE_COUNTS,
        relativeExceptions: [],
      });
      const codes = [...new Set(report.findings.map(({ code }) => code))].sort(
        compareText,
      );
      const expectedCodes = [...fixture.expectedCodes].sort(compareText);
      const passed =
        (fixture.validity === "valid" ? report.status === "clean" : true) &&
        JSON.stringify(codes) === JSON.stringify(expectedCodes);
      results.push({ id: fixture.id, passed, status: report.status, codes });
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  }
  return results;
}

async function run() {
  const results = await runFixtureCases();
  const failed = results.filter(({ passed }) => !passed);
  if (failed.length > 0) {
    process.stderr.write(`${JSON.stringify({ status: "failed", failed })}\n`);
    process.exitCode = 1;
    return;
  }
  const valid = results.filter(({ status }) => status === "clean").length;
  process.stdout.write(
    `design-system-fixtures: clean. ${results.length} cases (${valid} valid, ${results.length - valid} invalid).\n`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fixture harness failed.";
    process.stderr.write(`design-system-fixtures: ${message}\n`);
    process.exitCode = 1;
  }
}
