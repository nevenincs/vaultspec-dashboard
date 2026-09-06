export const CONSOLIDATION_LEDGER_SCHEMA_VERSION = 1 as const;

export const CONSOLIDATION_BASELINE_COUNTS = {
  nativeControlSites: 128,
  arbitraryRelativeValueSites: 106,
} as const;

export const CONSOLIDATION_SOURCE_SCOPE = {
  roots: ["frontend/src/app", "frontend/src/platform"],
  extensions: [".ts", ".tsx"],
  excludedSuffixes: [".test.ts", ".test.tsx"],
} as const;

export const CONSOLIDATION_DISPOSITIONS = [
  "canonical-owner",
  "migrate",
  "retain-semantic-seam",
  "retain-exact-geometry",
  "repair-local-defect",
  "track-parity-debt",
] as const;

export type ConsolidationDisposition = (typeof CONSOLIDATION_DISPOSITIONS)[number];

export const CANONICAL_OWNER_LAYERS = [
  "dtcg-foundation",
  "dtcg-component",
  "app-kit",
  "shared-chrome",
  "feature-surface",
  "store-policy",
  "platform-mechanism",
] as const;

export type CanonicalOwnerLayer = (typeof CANONICAL_OWNER_LAYERS)[number];

export type FrontendRepositoryPath = `frontend/${string}`;

/**
 * A source identity deliberately excludes line and column numbers. The owning symbol
 * and semantic slot remain stable when formatting or unrelated code moves around it.
 */
export interface LedgerSourceIdentity {
  readonly path: FrontendRepositoryPath;
  readonly owner: string;
  readonly slot: string;
}

function assertLedgerSourceIdentity(source: LedgerSourceIdentity): void {
  const pathSegments = source.path.split("/");
  if (
    !source.path.startsWith("frontend/") ||
    source.path.includes("\\") ||
    pathSegments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new Error(`Invalid ledger source path: ${source.path}`);
  }
  if (source.owner.trim() === "" || source.slot.trim() === "") {
    throw new Error("Ledger source owner and slot must be non-empty");
  }
}

export function ledgerSourceKey(source: LedgerSourceIdentity): string {
  assertLedgerSourceIdentity(source);
  return JSON.stringify([source.path, source.owner, source.slot]);
}

export interface CanonicalOwner {
  readonly layer: CanonicalOwnerLayer;
  readonly path: FrontendRepositoryPath;
  readonly name: string;
  readonly status: "existing" | "planned";
}

export const DISPOSITION_RATIONALE_FIELDS = {
  "canonical-owner": ["summary", "ownership"],
  migrate: ["summary", "equivalence", "replacement", "deletion"],
  "retain-semantic-seam": ["summary", "distinction"],
  "retain-exact-geometry": ["summary", "constraint", "exactValue"],
  "repair-local-defect": ["summary", "defect", "correction"],
  "track-parity-debt": ["summary", "unresolvedBinding", "reconciliation"],
} as const satisfies Record<ConsolidationDisposition, readonly string[]>;

export type RationaleByDisposition = {
  readonly [D in ConsolidationDisposition]: {
    readonly [K in (typeof DISPOSITION_RATIONALE_FIELDS)[D][number]]: string;
  };
};

type DecisionFor<D extends ConsolidationDisposition> = D extends D
  ? {
      readonly disposition: D;
      readonly canonicalOwner: CanonicalOwner;
      readonly rationale: RationaleByDisposition[D];
    }
  : never;

interface LedgerEntryBase {
  readonly source: LedgerSourceIdentity;
}

export const NATIVE_CONTROL_ELEMENTS = [
  "button",
  "input",
  "select",
  "textarea",
] as const;

export type NativeControlElement = (typeof NATIVE_CONTROL_ELEMENTS)[number];

type NativeControlDisposition = Exclude<
  ConsolidationDisposition,
  "retain-exact-geometry" | "track-parity-debt"
>;

export type NativeControlLedgerEntry = LedgerEntryBase &
  DecisionFor<NativeControlDisposition> & {
    readonly element: NativeControlElement;
  };

type RelativeValueDisposition = Exclude<
  ConsolidationDisposition,
  "retain-semantic-seam" | "track-parity-debt"
>;

export const RELATIVE_VALUE_UNITS = ["rem", "em", "vw", "vh", "%"] as const;

export type RelativeValueUnit = (typeof RELATIVE_VALUE_UNITS)[number];

export type RelativeValueLedgerEntry = LedgerEntryBase &
  DecisionFor<RelativeValueDisposition> & {
    readonly expression: string;
    readonly units: readonly [RelativeValueUnit, ...RelativeValueUnit[]];
  };

export type NamingDebtKind = "code-only-name" | "unresolved-design-alias";

export type NamingDebtLedgerEntry = LedgerEntryBase &
  DecisionFor<"track-parity-debt"> & {
    readonly debtKind: NamingDebtKind;
    readonly codeName: string;
    readonly designAlias: string | null;
  };

export const CONSOLIDATION_INVARIANT_BOUNDARIES = [
  "scene-source",
  "graph-semantics",
  "store-policy",
  "wire-contract",
  "responsive-mode",
  "figma-exclusion",
] as const;

export type ConsolidationInvariantBoundary =
  (typeof CONSOLIDATION_INVARIANT_BOUNDARIES)[number];

export interface ConsolidationInvariant {
  readonly id: string;
  readonly boundary: ConsolidationInvariantBoundary;
  readonly statement: string;
  readonly rationale: string;
  readonly evidence: readonly [LedgerSourceIdentity, ...LedgerSourceIdentity[]];
}

export interface ConsolidationLedger {
  readonly schemaVersion: typeof CONSOLIDATION_LEDGER_SCHEMA_VERSION;
  readonly baselineCounts: typeof CONSOLIDATION_BASELINE_COUNTS;
  readonly sourceScope: typeof CONSOLIDATION_SOURCE_SCOPE;
  readonly nativeControls: readonly NativeControlLedgerEntry[];
  readonly relativeValues: readonly RelativeValueLedgerEntry[];
  readonly namingDebt: readonly NamingDebtLedgerEntry[];
  readonly invariants: readonly ConsolidationInvariant[];
}

export const NATIVE_CONTROL_LEDGER: readonly NativeControlLedgerEntry[] = [];
export const RELATIVE_VALUE_LEDGER: readonly RelativeValueLedgerEntry[] = [];
export const NAMING_DEBT_LEDGER: readonly NamingDebtLedgerEntry[] = [];
export const CONSOLIDATION_INVARIANTS: readonly ConsolidationInvariant[] = [];

export const CONSOLIDATION_LEDGER = {
  schemaVersion: CONSOLIDATION_LEDGER_SCHEMA_VERSION,
  baselineCounts: CONSOLIDATION_BASELINE_COUNTS,
  sourceScope: CONSOLIDATION_SOURCE_SCOPE,
  nativeControls: NATIVE_CONTROL_LEDGER,
  relativeValues: RELATIVE_VALUE_LEDGER,
  namingDebt: NAMING_DEBT_LEDGER,
  invariants: CONSOLIDATION_INVARIANTS,
} as const satisfies ConsolidationLedger;
