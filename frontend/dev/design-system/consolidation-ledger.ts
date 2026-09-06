export const CONSOLIDATION_LEDGER_SCHEMA_VERSION = 1 as const;

export const CONSOLIDATION_BASELINE_COUNTS = {
  nativeControlSites: 125,
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

export const NATIVE_CONTROL_LEDGER = [
  {
    source: {
      path: "frontend/src/app/kit/Breadcrumb.tsx",
      owner: "Breadcrumb",
      slot: "ancestor-navigation",
    },
    element: "button",
    disposition: "canonical-owner",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Breadcrumb.tsx",
      name: "Breadcrumb",
      status: "existing",
    },
    rationale: {
      summary: "Breadcrumb owns its ancestor-navigation control.",
      ownership:
        "The button is integral to ordered breadcrumb navigation and its current-page sibling semantics.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/Button.tsx",
      owner: "Button",
      slot: "button-root",
    },
    element: "button",
    disposition: "canonical-owner",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Button.tsx",
      name: "Button",
      status: "existing",
    },
    rationale: {
      summary: "Button owns the shared text-button element.",
      ownership:
        "This root element defines the canonical variants, focus treatment, disabled treatment, and native button prop contract.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/DropdownButton.tsx",
      owner: "DropdownButton",
      slot: "menu-trigger",
    },
    element: "button",
    disposition: "canonical-owner",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/DropdownButton.tsx",
      name: "DropdownButton",
      status: "existing",
    },
    rationale: {
      summary: "DropdownButton owns the menu-trigger element.",
      ownership:
        "The composite owns popup relationships, expanded state, trigger labeling, and chevron treatment beyond a generic button.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/FacetRow.tsx",
      owner: "FacetRow",
      slot: "selection-input",
    },
    element: "input",
    disposition: "canonical-owner",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/FacetRow.tsx",
      name: "FacetRow",
      status: "existing",
    },
    rationale: {
      summary: "FacetRow owns its checkbox or radio input.",
      ownership:
        "The visually hidden native input supplies checked semantics and focus state to the canonical facet-row composite.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/FoldSection.tsx",
      owner: "FoldSection",
      slot: "disclosure-trigger",
    },
    element: "button",
    disposition: "canonical-owner",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/FoldSection.tsx",
      name: "FoldSection",
      status: "existing",
    },
    rationale: {
      summary: "FoldSection owns its disclosure trigger.",
      ownership:
        "The button carries the controlled expanded relationship and roving-focus passthrough for the shared fold composite.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/IconButton.tsx",
      owner: "IconButton",
      slot: "button-root",
    },
    element: "button",
    disposition: "canonical-owner",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/IconButton.tsx",
      name: "IconButton",
      status: "existing",
    },
    rationale: {
      summary: "IconButton owns the shared glyph-action element.",
      ownership:
        "This root element defines the canonical accessible-name, pressed-state, focus, size, and disabled contracts for icon actions.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/SearchField.tsx",
      owner: "SearchField",
      slot: "query-input",
    },
    element: "input",
    disposition: "canonical-owner",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/SearchField.tsx",
      name: "SearchField",
      status: "existing",
    },
    rationale: {
      summary: "SearchField owns its query input.",
      ownership:
        "The native input participates in the search-specific value, autocomplete, active-descendant, focus, and clear-action contract.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/SearchField.tsx",
      owner: "SearchField",
      slot: "clear-action",
    },
    element: "button",
    disposition: "canonical-owner",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/SearchField.tsx",
      name: "SearchField",
      status: "existing",
    },
    rationale: {
      summary: "SearchField owns its conditional clear action.",
      ownership:
        "The localized clear button is coupled to query presence and the disabled state of the canonical search composite.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/Segment.tsx",
      owner: "Segment",
      slot: "radio-option",
    },
    element: "button",
    disposition: "canonical-owner",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Segment.tsx",
      name: "Segment",
      status: "existing",
    },
    rationale: {
      summary: "Segment owns the segmented-radio option element.",
      ownership:
        "The button consumes the shared segmented context for selection, roving focus, group disabling, and full-width composition.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/Slider.tsx",
      owner: "Slider",
      slot: "range-input",
    },
    element: "input",
    disposition: "canonical-owner",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Slider.tsx",
      name: "Slider",
      status: "existing",
    },
    rationale: {
      summary: "Slider owns the shared range input.",
      ownership:
        "The native input supplies bounded drag and keyboard behavior while Slider owns labeling, value text, sizing, and readout treatment.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/Switch.tsx",
      owner: "Switch",
      slot: "switch-trigger",
    },
    element: "button",
    disposition: "canonical-owner",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Switch.tsx",
      name: "Switch",
      status: "existing",
    },
    rationale: {
      summary: "Switch owns the shared binary-toggle element.",
      ownership:
        "The button defines the canonical switch role, checked state, labeling, disabled treatment, and shape-based state cue.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/Tab.tsx",
      owner: "Tab",
      slot: "tab-trigger",
    },
    element: "button",
    disposition: "canonical-owner",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Tab.tsx",
      name: "Tab",
      status: "existing",
    },
    rationale: {
      summary: "Tab owns the shared tab element.",
      ownership:
        "The button exposes tab selection while forwarding the composing tablist's roving-focus and panel-relationship props.",
    },
  },
  {
    source: {
      path: "frontend/src/app/settings/controls/EnumControl.tsx",
      owner: "EnumControl",
      slot: "enum-option",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Segment.tsx",
      name: "Segment",
      status: "existing",
    },
    rationale: {
      summary: "EnumControl duplicates the canonical segmented-radio option.",
      equivalence:
        "Both controls are controlled radio buttons with selected state, disabled state, click selection, and arrow-key roving focus.",
      replacement:
        "Compose SegmentedToggle and Segment while retaining settings value derivation and string commits.",
      deletion:
        "Remove the native option button, local element registry, local keyboard loop, and store-provided segment classes in the settings migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/settings/controls/NumberControl.tsx",
      owner: "NumberControl",
      slot: "range-input",
    },
    element: "input",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Slider.tsx",
      name: "Slider",
      status: "existing",
    },
    rationale: {
      summary: "NumberControl duplicates the canonical Slider range input.",
      equivalence:
        "Both controls expose the same bounded native range behavior, labeling, value text, disabled state, width, and tabular readout.",
      replacement:
        "Compose Slider while retaining settings bounds, integer parsing, unit formatting, and decimal-string wire commits.",
      deletion:
        "Remove the settings-owned range element, readout markup, and duplicated visual classes in the settings migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/settings/controls/SwitchControl.tsx",
      owner: "SwitchControl",
      slot: "switch-trigger",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Switch.tsx",
      name: "Switch",
      status: "existing",
    },
    rationale: {
      summary: "SwitchControl duplicates the canonical Switch.",
      equivalence:
        "Both controls expose the same controlled switch role, checked state, accessible label, disabled behavior, and shape-based state treatment.",
      replacement:
        "Compose Switch while retaining conversion between boolean UI state and the settings string wire value.",
      deletion:
        "Remove the settings-owned switch button, knob markup, and store-provided class recipes in the settings migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/settings/controls/TextControl.tsx",
      owner: "TextControl",
      slot: "text-input",
    },
    element: "input",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/TextField.tsx",
      name: "TextField",
      status: "planned",
    },
    rationale: {
      summary: "TextControl is a direct candidate for the planned ordinary TextField.",
      equivalence:
        "The settings control needs the ordinary single-line text contract: controlled value, label, placeholder, disabled state, length cap, and change propagation.",
      replacement:
        "Compose TextField after its canonical contract lands while retaining schema-derived maximum length and raw string commits.",
      deletion:
        "Remove the native input and store-provided field class recipe in the settings migration.",
    },
  },
] as const satisfies readonly NativeControlLedgerEntry[];
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
