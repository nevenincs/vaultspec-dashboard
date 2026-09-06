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
  {
    source: {
      path: "frontend/src/app/left/AddProjectDialog.tsx",
      owner: "AddProjectDialogBody",
      slot: "project-path-input",
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
      summary: "AddProjectDialog uses an ordinary single-line project-path field.",
      equivalence:
        "The field needs the planned TextField contract for a controlled value, accessible label, placeholder, disabled state, and focus treatment; path parsing remains dialog behavior.",
      replacement:
        "Compose TextField while retaining the monospaced presentation, spellcheck policy, debounced path resolution, Enter handling, and registration flow.",
      deletion:
        "Remove the dialog-owned native input and duplicated field-state classes during the project-path migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/CreateDocDialog.tsx",
      owner: "DocumentStage",
      slot: "document-title-input",
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
      summary: "DocumentStage uses an ordinary single-line document-title field.",
      equivalence:
        "The field needs the planned TextField contract for a controlled value, visible and accessible labeling, placeholder, and focus treatment.",
      replacement:
        "Compose TextField while retaining create-draft updates and the dialog-specific Enter-to-submit behavior.",
      deletion:
        "Remove the document-stage native input and duplicated field-state classes during the title-field migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/ClarificationCard.tsx",
      owner: "ClarificationCard",
      slot: "choice-other-text-input",
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
      summary:
        "ClarificationCard uses an ordinary single-line field for a choice outside the offered options.",
      equivalence:
        "The field needs the planned TextField contract for a controlled bounded value, accessible label, placeholder, and focus treatment.",
      replacement:
        "Compose TextField while retaining choice-versus-free-text draft derivation, maximum length, and Enter submission semantics.",
      deletion:
        "Remove the choice fallback's native input and duplicated field-state classes during clarification migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/ClarificationCard.tsx",
      owner: "ClarificationCard",
      slot: "free-text-input",
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
      summary:
        "ClarificationCard uses an ordinary single-line field for bounded text answers.",
      equivalence:
        "The field needs the planned TextField contract for a controlled bounded value, accessible label, placeholder, and focus treatment.",
      replacement:
        "Compose TextField while retaining the engine-required single-line answer contract, maximum length, draft updates, and submission gating.",
      deletion:
        "Remove the free-text answer's native input and duplicated field-state classes during clarification migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/PropertiesPopover.tsx",
      owner: "PropertiesPopover",
      slot: "document-name-input",
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
      summary: "PropertiesPopover uses an ordinary single-line document-name field.",
      equivalence:
        "The field needs the planned TextField contract for a controlled value, accessible label, spellcheck policy, compact sizing, and focus treatment.",
      replacement:
        "Compose TextField while retaining rename-draft updates, save eligibility, and the adjacent rename action.",
      deletion:
        "Remove the properties-owned native name input and duplicated field-state classes during property migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/PropertiesPopover.tsx",
      owner: "PropertiesPopover",
      slot: "document-date-input",
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
      summary: "PropertiesPopover uses an ordinary text field for date metadata.",
      equivalence:
        "The field is a controlled string input with accessible labeling, placeholder, numeric keyboard hint, spellcheck policy, compact sizing, and ordinary focus treatment rather than a native date picker.",
      replacement:
        "Compose TextField while retaining raw metadata updates, the numeric input mode, and the existing placeholder and labeling.",
      deletion:
        "Remove the properties-owned native date text input and duplicated field-state classes during property migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/authoring/ReviewStation.tsx",
      owner: "RequestChangesComposer",
      slot: "request-changes-comment",
    },
    element: "textarea",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/TextArea.tsx",
      name: "TextArea",
      status: "planned",
    },
    rationale: {
      summary: "RequestChangesComposer uses an ordinary review-authoring textarea.",
      equivalence:
        "The field needs the planned TextArea contract for a controlled multiline value, visible labeling, focus treatment, resize policy, rows, autofocus, and validation relationships.",
      replacement:
        "Compose TextArea while retaining trimmed required-comment validation and Control-or-Command-plus-Enter submission.",
      deletion:
        "Remove the review composer's native textarea and duplicated field-state classes during review-authoring migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/CommentThreadPanel.tsx",
      owner: "CommentRow",
      slot: "edit-comment-textarea",
    },
    element: "textarea",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/TextArea.tsx",
      name: "TextArea",
      status: "planned",
    },
    rationale: {
      summary: "CommentRow uses an ordinary textarea for editing a comment.",
      equivalence:
        "The field needs the planned TextArea contract for a controlled multiline value, accessible label, rows, vertical resize, and focus treatment.",
      replacement:
        "Compose TextArea while retaining edit-draft reset, trimmed save gating, cancellation, and comment mutation behavior.",
      deletion:
        "Remove the comment row's native edit textarea and duplicated field-state classes during comment-authoring migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/CommentThreadPanel.tsx",
      owner: "ComposeBox",
      slot: "new-comment-textarea",
    },
    element: "textarea",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/TextArea.tsx",
      name: "TextArea",
      status: "planned",
    },
    rationale: {
      summary: "ComposeBox uses an ordinary textarea for new comments.",
      equivalence:
        "The field needs the planned TextArea contract for a controlled multiline value, accessible label, placeholder, rows, vertical resize, and focus treatment.",
      replacement:
        "Compose TextArea while retaining actor-readiness gating, trimmed submit behavior, anchor creation, and post-submit reset.",
      deletion:
        "Remove the comment compose box's native textarea and duplicated field-state classes during comment-authoring migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/ComposerModelPicker.tsx",
      owner: "ProviderModelRow",
      slot: "model-option",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/OptionRow.tsx",
      name: "OptionRow",
      status: "planned",
    },
    rationale: {
      summary: "ProviderModelRow is a behaviorally ordinary selectable option row.",
      equivalence:
        "The row needs the planned OptionRow contract for selection, activation, disabled state, accessible pressed state, leading or trailing content, and forwarded focus props.",
      replacement:
        "Compose OptionRow while retaining catalog freshness, provider and model identity, health reasons, selection derivation, and popover dismissal.",
      deletion:
        "Remove the provider model row's native button and duplicated option-state classes during model-picker migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/menu/ContextMenuHost.tsx",
      owner: "ContextMenuHost",
      slot: "context-menu-command",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/OptionRow.tsx",
      name: "OptionRow",
      status: "planned",
    },
    rationale: {
      summary: "ContextMenuHost renders behaviorally ordinary command option rows.",
      equivalence:
        "The rows need the planned OptionRow contract for activation, disabled state, leading and trailing content, and forwarded role, tab stop, pointer, and keyboard props.",
      replacement:
        "Compose OptionRow while retaining menuitem semantics, focus-zone cursoring, destructive confirmation, resolver dispatch, shortcuts, and dismissal.",
      deletion:
        "Remove the context menu's native command button and duplicated row-state classes during context-menu migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/timeline/DateBasisSelect.tsx",
      owner: "DateBasisSelect",
      slot: "date-basis-option",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/OptionRow.tsx",
      name: "OptionRow",
      status: "planned",
    },
    rationale: {
      summary:
        "DateBasisSelect renders behaviorally ordinary single-choice option rows.",
      equivalence:
        "The rows need the planned OptionRow contract for selection, activation, disabled state, and forwarded menuitemradio, checked, focus-zone, keyboard, and title props.",
      replacement:
        "Compose OptionRow while retaining the portaled menu, date-criterion identity, roving focus, activation-only selection, and close behavior.",
      deletion:
        "Remove the date-basis native option button and duplicated row-state classes during option-row migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/FilterMenu.tsx",
      owner: "FilterChip",
      slot: "compact-facet-option",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/stage/FilterMenu.tsx",
      name: "FilterChip",
      status: "existing",
    },
    rationale: {
      summary: "FilterChip owns the compact filter sheet's pressed facet control.",
      distinction:
        "Its wrapped pill geometry and independent multi-select pressed semantics are integral to the compact filter composition and do not match the desktop FacetRow or ordinary row-shaped OptionRow contract.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/FilterMenu.tsx",
      owner: "ChipsBody",
      slot: "reset-filters-action",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Button.tsx",
      name: "Button",
      status: "existing",
    },
    rationale: {
      summary: "ChipsBody duplicates an ordinary text reset action.",
      equivalence:
        "The action needs the canonical Button contract for activation, accessible text, focus treatment, and a quiet visual variant.",
      replacement:
        "Compose Button while retaining conditional visibility, reset intent, compact typography, and the existing text-action emphasis.",
      deletion:
        "Remove the compact filter body's native reset button and duplicated action-state classes during filter migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/FilterMenu.tsx",
      owner: "ChipsBody",
      slot: "show-results-action",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Button.tsx",
      name: "Button",
      status: "existing",
    },
    rationale: {
      summary: "ChipsBody duplicates an ordinary primary apply action.",
      equivalence:
        "The action needs the canonical Button contract for activation, accessible text, focus treatment, full-width layout, and primary visual state.",
      replacement:
        "Compose Button while retaining optional rendering, apply-and-close intent, full-width compact layout, and current label.",
      deletion:
        "Remove the compact filter body's native show-results button and duplicated primary-action classes during filter migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/FilterMenu.tsx",
      owner: "FilterMenu",
      slot: "reset-filters-action",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Button.tsx",
      name: "Button",
      status: "existing",
    },
    rationale: {
      summary: "FilterMenu duplicates an ordinary text reset action.",
      equivalence:
        "The action needs the canonical Button contract for activation, accessible text, focus treatment, and a quiet visual variant.",
      replacement:
        "Compose Button while retaining conditional visibility, reset intent, regular-menu density, and the existing text-action emphasis.",
      deletion:
        "Remove the regular filter menu's native reset button and duplicated action-state classes during filter migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/palette/CommandPalette.tsx",
      owner: "CommandPaletteSurface",
      slot: "command-option",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/OptionRow.tsx",
      name: "OptionRow",
      status: "planned",
    },
    rationale: {
      summary:
        "CommandPaletteSurface renders behaviorally ordinary command option rows.",
      equivalence:
        "The rows need the planned OptionRow contract for selection, activation, disabled state, leading and trailing content, and forwarded listbox-option and pointer props.",
      replacement:
        "Compose OptionRow while retaining command scoring, active-descendant cursoring, confirmation state, shortcuts, dispatch, and dismissal.",
      deletion:
        "Remove the command palette's native option button and duplicated row-state classes during command migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/palette/SearchPaletteSurface.tsx",
      owner: "SearchPaletteSurface",
      slot: "compact-cancel-action",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Button.tsx",
      name: "Button",
      status: "existing",
    },
    rationale: {
      summary: "SearchPaletteSurface duplicates an ordinary compact cancel action.",
      equivalence:
        "The text action needs the canonical Button contract for activation, accessible text, focus treatment, and quiet emphasis.",
      replacement:
        "Compose Button while retaining compact-only placement, palette dismissal, and the existing cancel label and emphasis.",
      deletion:
        "Remove the compact search palette's native cancel button and duplicated action-state classes during search-surface migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/palette/SearchPaletteSurface.tsx",
      owner: "SearchPaletteSurface",
      slot: "compact-search-result",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/OptionRow.tsx",
      name: "OptionRow",
      status: "planned",
    },
    rationale: {
      summary:
        "SearchPaletteSurface renders compact search results as ordinary option rows.",
      equivalence:
        "The rows need the planned OptionRow contract for activation, disabled state, result content, and forwarded listbox-option state.",
      replacement:
        "Compose OptionRow while retaining result identity, permanent entity activation, frame intent, error containment, and palette dismissal.",
      deletion:
        "Remove the compact search result's native button and duplicated row wrapper during search-result migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/palette/SearchPaletteSurface.tsx",
      owner: "SearchPaletteSurface",
      slot: "split-search-result",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/OptionRow.tsx",
      name: "OptionRow",
      status: "planned",
    },
    rationale: {
      summary:
        "SearchPaletteSurface renders split-preview search results as ordinary option rows.",
      equivalence:
        "The rows need the planned OptionRow contract for selection, activation, disabled state, result content, and forwarded listbox-option and tab-stop state.",
      replacement:
        "Compose OptionRow while retaining cursor selection, preview-only activation, active-descendant coordination, and the open preview panel.",
      deletion:
        "Remove the split-preview search result's native button and duplicated row wrapper during search-result migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/palette/SearchPaletteSurface.tsx",
      owner: "SearchPaletteSurface",
      slot: "collapsed-search-result",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/OptionRow.tsx",
      name: "OptionRow",
      status: "planned",
    },
    rationale: {
      summary:
        "SearchPaletteSurface renders collapsed search results as ordinary option rows.",
      equivalence:
        "The rows need the planned OptionRow contract for selection, activation, disabled state, result content, and forwarded listbox-option and tab-stop state.",
      replacement:
        "Compose OptionRow while retaining cursor selection, reveal-selected behavior, active-descendant coordination, and deferred preview loading.",
      deletion:
        "Remove the collapsed search result's native button and duplicated row wrapper during search-result migration.",
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
