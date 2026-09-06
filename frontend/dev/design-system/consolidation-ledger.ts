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

export const RELATIVE_VALUE_UNITS = ["rem", "em", "vw", "vh", "cqw", "%"] as const;

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
  {
    source: {
      path: "frontend/src/app/chrome/Dialog.tsx",
      owner: "Dialog",
      slot: "close-action",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/IconButton.tsx",
      name: "IconButton",
      status: "existing",
    },
    rationale: {
      summary: "Dialog duplicates the canonical glyph-only close action.",
      equivalence:
        "The action needs the IconButton contract for an accessible name, glyph content, disabled state, activation, focus treatment, and quiet hover state.",
      replacement:
        "Compose IconButton while retaining the localized close name, dismissibility-derived disabled state, close callback, and header placement.",
      deletion:
        "Remove the dialog-owned native close button and duplicated icon-action classes during dialog migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/Composer.tsx",
      owner: "ComposerChip",
      slot: "remove-action",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/IconButton.tsx",
      name: "IconButton",
      status: "existing",
    },
    rationale: {
      summary: "ComposerChip duplicates the canonical glyph-only remove action.",
      equivalence:
        "The action needs the IconButton contract for an accessible name, glyph content, activation, focus treatment, and quiet hover state.",
      replacement:
        "Compose IconButton while retaining the localized per-chip remove name, staged attachment mutation, and compact chip placement.",
      deletion:
        "Remove the composer chip's native remove button and duplicated icon-action classes during composer migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/Composer.tsx",
      owner: "ComposerScopeControls",
      slot: "attach-trigger",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/IconButton.tsx",
      name: "IconButton",
      status: "existing",
    },
    rationale: {
      summary:
        "ComposerScopeControls duplicates the canonical glyph-only attach action.",
      equivalence:
        "The action needs the IconButton contract for an accessible name, glyph content, activation, disabled treatment, focus treatment, and quiet hover state.",
      replacement:
        "Compose IconButton while retaining the localized label and title, expanded state, popover anchoring, and attach-menu toggle behavior.",
      deletion:
        "Remove the composer's native attach button and duplicated bordered icon-action classes during composer migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/shell/MobileTopBar.tsx",
      owner: "IconSlot",
      slot: "icon-action",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/IconButton.tsx",
      name: "IconButton",
      status: "existing",
    },
    rationale: {
      summary: "IconSlot duplicates the canonical glyph-only action contract.",
      equivalence:
        "Both controls carry an accessible name, glyph content, pressed state, disabled state, activation, focus treatment, and shape-based active treatment.",
      replacement:
        "Compose IconButton while retaining action resolution, back and trailing-action dispatch, pressed state, disabled fallback handling, and the coarse 2.75rem touch target.",
      deletion:
        "Remove the compact-shell native icon button and duplicated state classes after IconButton accepts the required coarse-pointer sizing composition.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/RelatedDocPicker.tsx",
      owner: "RelatedDocPicker",
      slot: "remove-related-action",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/IconButton.tsx",
      name: "IconButton",
      status: "existing",
    },
    rationale: {
      summary: "RelatedDocPicker duplicates the canonical glyph-only remove action.",
      equivalence:
        "The action needs the IconButton contract for an accessible name, glyph content, activation, focus treatment, and quiet hover state.",
      replacement:
        "Compose IconButton while retaining the authored-stem localized name, selected-document removal, badge placement, and compact glyph scale.",
      deletion:
        "Remove the related-document native remove button and duplicated icon-action classes during picker migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/settings/SettingsDialog.tsx",
      owner: "SettingRow",
      slot: "reset-action",
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
      summary: "SettingRow duplicates an ordinary localized text action.",
      equivalence:
        "The reset action needs the canonical Button contract for accessible text, activation, focus treatment, and quiet visual emphasis.",
      replacement:
        "Compose Button while retaining conditional availability, the store-derived reset value and label, row commit behavior, and footer placement.",
      deletion:
        "Remove the settings row's native reset button and store-provided button class recipe during settings migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/settings/SettingsDialog.tsx",
      owner: "ScopeTargetToggle",
      slot: "scope-target-option",
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
      summary: "ScopeTargetToggle duplicates the canonical segmented-radio option.",
      equivalence:
        "Both controls are controlled radio buttons with selected state, click selection, group labeling, focus treatment, and shape-based active treatment.",
      replacement:
        "Compose SegmentedToggle and Segment while retaining the store-derived target rows, localized labels, and global-versus-scope selection behavior.",
      deletion:
        "Remove the settings-owned native radio option, radiogroup wrapper classes, and row-provided option classes during settings migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/Composer.tsx",
      owner: "Composer",
      slot: "prompt-entry",
    },
    element: "textarea",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/agent/Composer.tsx",
      name: "Composer",
      status: "existing",
    },
    rationale: {
      summary: "Composer owns its specialized prompt-entry textarea.",
      distinction:
        "The input is an auto-growing combobox and command-entry surface with slash and mention modes, evidence attachment, Enter submission, Shift+Enter newlines, parked-run disabling, and focus return; those semantics exceed the ordinary TextArea contract.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/ComposerModelPicker.tsx",
      owner: "ComposerModelPicker",
      slot: "provider-native-control",
    },
    element: "select",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/agent/ComposerModelPicker.tsx",
      name: "ComposerModelPicker",
      status: "existing",
    },
    rationale: {
      summary: "ComposerModelPicker owns its served provider-native select.",
      distinction:
        "The select is generated from provider-described controls and opaque option identifiers, then revalidates each change against the current catalog revision; no shared kit primitive owns this dynamic native-control contract.",
    },
  },
  {
    source: {
      path: "frontend/src/app/palette/CommandPalette.tsx",
      owner: "CommandPaletteSurface",
      slot: "command-query-input",
    },
    element: "input",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/palette/CommandPalette.tsx",
      name: "CommandPaletteSurface",
      status: "existing",
    },
    rationale: {
      summary: "CommandPaletteSurface owns its embedded command-query combobox.",
      distinction:
        "The bare input is structurally integrated into modal header chrome and coordinates active-descendant cursoring, command scoring, arm cancellation, feedback reset, keyboard activation, and focus restoration; the decorated standalone SearchField would change that composite.",
    },
  },
  {
    source: {
      path: "frontend/src/app/palette/DocumentSearchSurface.tsx",
      owner: "DocumentSearchSurface",
      slot: "document-query-input",
    },
    element: "input",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/palette/DocumentSearchSurface.tsx",
      name: "DocumentSearchSurface",
      status: "existing",
    },
    rationale: {
      summary: "DocumentSearchSurface owns its embedded document-query combobox.",
      distinction:
        "The bare input is part of the modal header and coordinates result cursoring, active selection, Enter activation, search count, focus restoration, and dialog dismissal; the decorated standalone SearchField would alter this search-plane composition.",
    },
  },
  {
    source: {
      path: "frontend/src/app/palette/SearchPaletteSurface.tsx",
      owner: "SearchPaletteSurface",
      slot: "compact-query-input",
    },
    element: "input",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/palette/SearchPaletteSurface.tsx",
      name: "SearchPaletteSurface",
      status: "existing",
    },
    rationale: {
      summary: "SearchPaletteSurface owns its compact query combobox.",
      distinction:
        "The bare input is integrated into the compact full-screen header and coordinates provider search, cursor repair, preview collapse, keyboard activation, safe-area layout, and the adjacent cancel action; the standalone SearchField would duplicate chrome and change the compact shell.",
    },
  },
  {
    source: {
      path: "frontend/src/app/palette/SearchPaletteSurface.tsx",
      owner: "SearchPaletteSurface",
      slot: "regular-query-input",
    },
    element: "input",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/palette/SearchPaletteSurface.tsx",
      name: "SearchPaletteSurface",
      status: "existing",
    },
    rationale: {
      summary: "SearchPaletteSurface owns its regular query combobox.",
      distinction:
        "The bare input is integrated into the regular modal header and coordinates provider search, cursor repair, split-preview expansion, keyboard activation, corpus selection, result counts, and focus restoration; the standalone SearchField would alter this composite.",
    },
  },
  {
    source: {
      path: "frontend/src/app/right/PlanStepTree.tsx",
      owner: "StepRow",
      slot: "step-completion-checkbox",
    },
    element: "input",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "shared-chrome",
      path: "frontend/src/app/right/PlanStepTree.tsx",
      name: "StepRow",
      status: "existing",
    },
    rationale: {
      summary: "StepRow owns its plan-step completion checkbox.",
      distinction:
        "The visually hidden checkbox is the roving-focus tab stop behind StepCheckMark and couples native Space toggling with Enter-to-open, optimistic mutation, blob-hash conflict fencing, time-travel disabling, and served-state reconciliation.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/FilterMenu.tsx",
      owner: "CustomRangeInputs",
      slot: "date-from-input",
    },
    element: "input",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/stage/FilterMenu.tsx",
      name: "CustomRangeInputs",
      status: "existing",
    },
    rationale: {
      summary: "CustomRangeInputs owns the native start-date boundary.",
      distinction:
        "The locale-aware native date picker carries canonical day strings and corpus minimum plus end-date-linked maximum constraints directly into the one date-range filter seam; it is not an ordinary free-text field.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/FilterMenu.tsx",
      owner: "CustomRangeInputs",
      slot: "date-to-input",
    },
    element: "input",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/stage/FilterMenu.tsx",
      name: "CustomRangeInputs",
      status: "existing",
    },
    rationale: {
      summary: "CustomRangeInputs owns the native end-date boundary.",
      distinction:
        "The locale-aware native date picker carries canonical day strings and start-date-linked minimum plus corpus maximum constraints directly into the one date-range filter seam; it is not an ordinary free-text field.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/HighlightedCode.tsx",
      owner: "HighlightedTextarea",
      slot: "transparent-code-input",
    },
    element: "textarea",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/viewer/HighlightedCode.tsx",
      name: "HighlightedTextarea",
      status: "existing",
    },
    rationale: {
      summary: "HighlightedTextarea owns its transparent code-editing layer.",
      distinction:
        "The textarea overlays syntax-highlighted preformatted content, synchronizes two-axis scroll, exposes editor selection through a forwarded ref, carries formatting shortcuts and diff gutters, and renders transparent text with a themed caret; those mechanics must not enter TextArea.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/CategoryLegend.tsx",
      owner: "CategoryLegend",
      slot: "code-module-compact-toggle",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/stage/CategoryLegend.tsx",
      name: "CategoryLegend",
      status: "existing",
    },
    rationale: {
      summary: "CategoryLegend owns the code-module compact-mode disclosure.",
      distinction:
        "The button is the roving FocusZone anchor for the graph's module legend and changes the legend's compact-versus-expanded presentation while preserving one grouped keyboard model; it is not a standalone disclosure or generic icon action.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/CategoryLegend.tsx",
      owner: "CategoryLegend",
      slot: "document-type-compact-toggle",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/stage/CategoryLegend.tsx",
      name: "CategoryLegend",
      status: "existing",
    },
    rationale: {
      summary: "CategoryLegend owns the document-type compact-mode disclosure.",
      distinction:
        "The button participates in the same roving toolbar as the document facets and changes the legend's compact-versus-expanded rendering without changing filter truth; that coupled graph-toolbar contract is not a generic toggle primitive.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/CategoryLegend.tsx",
      owner: "CategoryLegend",
      slot: "document-type-filter-option",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/stage/CategoryLegend.tsx",
      name: "CategoryLegend",
      status: "existing",
    },
    rationale: {
      summary: "CategoryLegend owns its repeated document-type facet button site.",
      distinction:
        "Each rendered facet is a roving toolbar item whose pressed, included, degraded, and compact-label states coordinate directly with the graph's canonical document-type filter; the variable multi-select toolbar is not the single-value SegmentedToggle contract.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/CategoryLegend.tsx",
      owner: "CategoryLegend",
      slot: "document-type-filter-reset",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/stage/CategoryLegend.tsx",
      name: "CategoryLegend",
      status: "existing",
    },
    rationale: {
      summary: "CategoryLegend owns the conditional document-type facet reset.",
      distinction:
        "The reset is conditionally enrolled as the final item in the legend's roving FocusZone and shares degraded-state suppression with the graph facets, so replacing it with the fixed Button geometry would break the compact toolbar composition.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/GraphControls.tsx",
      owner: "FoldableCategory",
      slot: "category-disclosure",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/stage/GraphControls.tsx",
      name: "FoldableCategory",
      status: "existing",
    },
    rationale: {
      summary: "FoldableCategory owns the graph-control section disclosure.",
      distinction:
        "The full-width, text-aligned disclosure binds a generated panel body id, expanded state, category label, and directional twisty inside the dense graph settings hierarchy; neither Button nor IconButton expresses that composite section-header contract.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/GraphControls.tsx",
      owner: "GraphSettingsPanel",
      slot: "reset-all-action",
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
      summary: "GraphSettingsPanel's reset-all control is an ordinary text action.",
      equivalence:
        "The native button has standard click and label semantics, while graph-state reset logic remains wholly in the caller's resetAll handler.",
      replacement:
        "Render the reset label and resetAll handler through the appropriate Button variant without moving graph commands or store mutations into the kit.",
      deletion:
        "Remove the panel-owned native button element and resetButtonClassName styling once Button supplies its shared interaction chrome.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/WorkingSet.tsx",
      owner: "WorkingSet",
      slot: "collapse-item-action",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/IconButton.tsx",
      name: "IconButton",
      status: "existing",
    },
    rationale: {
      summary: "WorkingSet's repeated collapse glyph is an ordinary icon action.",
      equivalence:
        "Each native button exposes an accessible label, a single X glyph, and one click callback; row identity and graph working-set mutation remain caller-owned.",
      replacement:
        "Render X through IconButton with the row's localized collapse label and existing collapseWorkingSet callback.",
      deletion:
        "Remove the native button and row-provided collapseButtonClassName styling after the shared icon-action geometry is adopted.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/WorkingSet.tsx",
      owner: "WorkingSet",
      slot: "clear-action",
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
      summary: "WorkingSet's clear control is an ordinary text action.",
      equivalence:
        "The native button has a localized label and a single clearWorkingSet callback, with no custom keyboard or selection semantics.",
      replacement:
        "Use the compact appropriate Button variant while keeping the graph working-set command in the caller.",
      deletion:
        "Remove the native button and clearButtonClassName styling once Button owns its interaction chrome.",
    },
  },
  {
    source: {
      path: "frontend/src/app/islands/NodeInterior.tsx",
      owner: "FeatureLifecycle",
      slot: "document-navigation-tile",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/islands/NodeInterior.tsx",
      name: "FeatureLifecycle",
      status: "existing",
    },
    rationale: {
      summary: "FeatureLifecycle owns its graph-island document navigation tile.",
      distinction:
        "The repeated button is a compact node-navigation tile on the canonical lifecycle axis, combining document-type identity, authored-title fallback, and asynchronous graph selection; its geometry is structural island content rather than a generic text action.",
    },
  },
  {
    source: {
      path: "frontend/src/app/islands/NodeInterior.tsx",
      owner: "PlanInterior",
      slot: "step-navigation-tile",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/islands/NodeInterior.tsx",
      name: "PlanInterior",
      status: "existing",
    },
    rationale: {
      summary: "PlanInterior owns its graph-island plan-step tile.",
      distinction:
        "The repeated tile couples graph navigation with aria-pressed completion state, a completion glyph, and the island's fixed four-column plan layout; it is neither a form toggle nor a generic Button action.",
    },
  },
  {
    source: {
      path: "frontend/src/app/islands/IslandLayer.tsx",
      owner: "Island",
      slot: "close-action",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/IconButton.tsx",
      name: "IconButton",
      status: "existing",
    },
    rationale: {
      summary: "Island's close glyph is an ordinary icon action.",
      equivalence:
        "The native button has a localized accessible label, one X glyph, and a single close callback; island anchoring and target-scoped context-menu behavior remain outside the control.",
      replacement:
        "Render the X glyph through IconButton with the existing close label and closeNodeIsland callback.",
      deletion:
        "Remove the native close button and its local hover, sizing, and focus styling after IconButton owns the action chrome.",
    },
  },
  {
    source: {
      path: "frontend/src/app/timeline/TimelineRangeSelector.tsx",
      owner: "TimelineRange",
      slot: "clear-range-action",
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
      summary: "TimelineRange's conditional clear control is an ordinary text action.",
      equivalence:
        "The native button only exposes the localized clear label and invokes the range reset callback; the slider spans, pointer sessions, keyboard steps, and restore gestures remain owned by TimelineRange.",
      replacement:
        "Use the compact appropriate Button variant for the clear action while retaining all timeline-handle coordination in TimelineRange.",
      deletion:
        "Remove the native button and its local padding, typography, hover, and focus classes after Button owns the action chrome.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/CodeTree.tsx",
      owner: "DirectoryRow",
      slot: "hierarchy-row-control",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "shared-chrome",
      path: "frontend/src/app/left/CodeTree.tsx",
      name: "DirectoryRow",
      status: "existing",
    },
    rationale: {
      summary: "DirectoryRow owns the code hierarchy's row control.",
      distinction:
        "The row is the recursive tree's roving tab stop and combines directory disclosure, file activation, selection, git and ignore cues, depth geometry, keyboard context-menu routing, and async child expansion; those semantics do not belong in Button.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/FolderBrowser.tsx",
      owner: "FolderBrowser",
      slot: "folder-option-row",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "shared-chrome",
      path: "frontend/src/app/left/FolderBrowser.tsx",
      name: "FolderBrowser",
      status: "existing",
    },
    rationale: {
      summary: "FolderBrowser owns its filesystem listbox option row.",
      distinction:
        "The row is a role=option roving tab stop that distinguishes selection from navigation, supports Enter, Backspace, double-click, cross-axis parent/child movement, registered-folder gating, and landed-level focus transfer; it is not a menu item or generic Button.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/TreeBrowser.tsx",
      owner: "VaultTreeRow",
      slot: "hierarchy-row-control",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "shared-chrome",
      path: "frontend/src/app/left/TreeBrowser.tsx",
      name: "VaultTreeRow",
      status: "existing",
    },
    rationale: {
      summary: "VaultTreeRow owns the document hierarchy's row control.",
      distinction:
        "The row coordinates recursive disclosure, roving focus, responsive tap-versus-double-click opening, highlighted-page state, depth geometry, status presentation, and keyboard context menus across several entity kinds; a generic Button cannot own that tree contract.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/MarkdownReader.tsx",
      owner: "COMPONENTS.input",
      slot: "non-checkbox-renderer-fallback",
    },
    element: "input",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/viewer/MarkdownReader.tsx",
      name: "COMPONENTS.input",
      status: "existing",
    },
    rationale: {
      summary: "The Markdown renderer owns its read-only non-checkbox input fallback.",
      distinction:
        "The react-markdown override replaces GFM task checkboxes with StepCheckMark and preserves any other parsed input type as read-only renderer output; routing that fallback through a form-field primitive would imply editable application state and alter unknown markdown input semantics.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/AgentBeginView.tsx",
      owner: "AgentStarters",
      slot: "starter-card",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/agent/AgentBeginView.tsx",
      name: "AgentStarters",
      status: "existing",
    },
    rationale: {
      summary: "AgentStarters owns its intent-card control.",
      distinction:
        "The repeated full-card target combines a lane icon, verb, outcome description, and draft-seeding behavior in the agent begin composition; it is structural content rather than a generic text action or option row.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/AgentBeginView.tsx",
      owner: "AgentRecents",
      slot: "recent-session-option",
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
      summary: "AgentRecents renders behaviorally ordinary session rows.",
      equivalence:
        "Each row has a label and one activation callback, with session identity and current-session mutation remaining caller-owned.",
      replacement:
        "Compose OptionRow while retaining the capped recent-session list, untitled fallback, and session-selection intent.",
      deletion:
        "Remove the native button and duplicated recent-row interaction classes when OptionRow lands.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/AgentChip.tsx",
      owner: "AgentChip",
      slot: "status-panel-toggle",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "shared-chrome",
      path: "frontend/src/app/agent/AgentChip.tsx",
      name: "AgentChip",
      status: "existing",
    },
    rationale: {
      summary: "AgentChip owns the collapsed agent status target.",
      distinction:
        "The control is a roving footer-cluster item whose live run-status dot and state label form the collapsed panel representation; its compact status-chip contract is not Button or IconButton.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/AgentPanel.tsx",
      owner: "AgentPanelHeader",
      slot: "archive-current-session-command",
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
      summary: "AgentPanelHeader's archive command is an ordinary menu row.",
      equivalence:
        "The native menuitem has leading content, a label, and one activation callback with no independent interaction model.",
      replacement:
        "Compose OptionRow while retaining current-session identity, archive dispatch, and menu dismissal in AgentPanelHeader.",
      deletion:
        "Remove the native menuitem and duplicated menu-row classes during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/AgentPanel.tsx",
      owner: "AgentPanelHeader",
      slot: "recent-session-command",
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
      summary: "AgentPanelHeader's recent-session choices are ordinary menu rows.",
      equivalence:
        "Each menuitem forwards current state, a label, and one activation callback while the adjacent archive action remains separately composed.",
      replacement:
        "Compose OptionRow while retaining session selection, current-session marking, history dismissal, and adjacent archive IconButton.",
      deletion:
        "Remove the native recent-session menuitem and duplicated row-state classes during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/ClarificationCard.tsx",
      owner: "ClarificationCard",
      slot: "choice-option",
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
      summary: "ClarificationCard renders behaviorally ordinary radio option rows.",
      equivalence:
        "The row needs selection, activation, accessible checked state, and forwarded key handling, all within OptionRow's planned contract.",
      replacement:
        "Compose OptionRow while retaining numeric accelerators, answer drafting, and single-choice immediate submission in ClarificationCard.",
      deletion:
        "Remove the native radio button and duplicated selected-row classes during clarification migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/Composer.tsx",
      owner: "ComposerTeamSelector",
      slot: "default-team-option",
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
      summary: "ComposerTeamSelector's default choice is an ordinary radio menu row.",
      equivalence:
        "The menuitemradio exposes checked state, a label, and one selection callback within the planned OptionRow contract.",
      replacement:
        "Compose OptionRow while retaining default-team identity, selection, and popover dismissal in ComposerTeamSelector.",
      deletion:
        "Remove the native default-team button and duplicated menu-row classes during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/Composer.tsx",
      owner: "ComposerTeamSelector",
      slot: "preset-team-option",
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
      summary: "ComposerTeamSelector's preset choices are ordinary radio menu rows.",
      equivalence:
        "Each menuitemradio forwards checked and disabled state, title, primary label, optional reason, and activation to the planned OptionRow contract.",
      replacement:
        "Compose OptionRow while retaining served preset loadability, unavailable reasons, identity, selection, and dismissal.",
      deletion:
        "Remove the native preset button and duplicated checked and disabled row classes during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/Composer.tsx",
      owner: "ComposerScopeControls",
      slot: "attach-corpus-option",
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
        "ComposerScopeControls' corpus attachment command is an ordinary menu row.",
      equivalence:
        "The menuitem carries disabled state, a label, and one activation callback within OptionRow's planned contract.",
      replacement:
        "Compose OptionRow while retaining attachment availability, corpus intent dispatch, and menu dismissal in the composer.",
      deletion:
        "Remove the native corpus menuitem and duplicated interaction classes during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/Composer.tsx",
      owner: "ComposerScopeControls",
      slot: "attach-evidence-option",
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
        "ComposerScopeControls' evidence attachment command is an ordinary menu row.",
      equivalence:
        "The menuitem carries disabled state, a label, and one activation callback within OptionRow's planned contract.",
      replacement:
        "Compose OptionRow while retaining attachment availability, evidence intent dispatch, and menu dismissal in the composer.",
      deletion:
        "Remove the native evidence menuitem and duplicated interaction classes during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/Composer.tsx",
      owner: "Composer",
      slot: "slash-command-option",
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
      summary: "Composer's slash-command results are ordinary listbox options.",
      equivalence:
        "Each option forwards selected state, pointer activation, hover cursoring, and content through the planned OptionRow contract.",
      replacement:
        "Compose OptionRow while retaining command parsing, active-index management, mouse-down focus preservation, and command dispatch in Composer.",
      deletion:
        "Remove the native slash-result button and duplicated selected-row classes during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/ComposerAutonomyBanner.tsx",
      owner: "ComposerAutonomyBanner",
      slot: "dismiss-action",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/IconButton.tsx",
      name: "IconButton",
      status: "existing",
    },
    rationale: {
      summary: "ComposerAutonomyBanner's dismiss glyph is an ordinary icon action.",
      equivalence:
        "The native button has a localized label, one X glyph, and one local dismissal callback.",
      replacement:
        "Render X through IconButton while retaining mode-scoped dismissal and re-arming behavior in the banner.",
      deletion:
        "Remove the native button and its local icon-action classes after migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/ComposerFeatureChip.tsx",
      owner: "ComposerFeatureChip",
      slot: "feature-picker-trigger",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/agent/ComposerFeatureChip.tsx",
      name: "ComposerFeatureChip",
      status: "existing",
    },
    rationale: {
      summary: "ComposerFeatureChip owns its standing feature-binding trigger.",
      distinction:
        "The chip communicates required, defaulted, unset, and locked feature-binding state while anchoring an editable free-text feature combobox; its standing semantic status is not a generic Button or DropdownButton value.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/PendingChangesBridge.tsx",
      owner: "PendingChangesBridge",
      slot: "region-disclosure",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "shared-chrome",
      path: "frontend/src/app/agent/PendingChangesBridge.tsx",
      name: "PendingChangesBridge",
      status: "existing",
    },
    rationale: {
      summary: "PendingChangesBridge owns its agent-region disclosure strip.",
      distinction:
        "The full-width boundary strip is both the standing out-of-session change count and the collapse affordance for the agent pending-changes region, with conditional presence and directional state integral to panel composition.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/CreateDocDialog.tsx",
      owner: "DocumentStage",
      slot: "back-action",
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
      summary: "DocumentStage's back control is an ordinary labeled action.",
      equivalence:
        "The native button carries a leading arrow, localized label, focus ref, and one navigation callback, all compatible with Button.",
      replacement:
        "Compose Button while retaining stage navigation, initial focus, localized labeling, and coarse-pointer sizing policy.",
      deletion:
        "Remove the native back button and duplicated action classes after migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/CreateDocDialog.tsx",
      owner: "DocumentStage",
      slot: "document-type-option",
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
        "DocumentStage renders document types as behaviorally ordinary radio option rows.",
      equivalence:
        "The rows need checked state, accessible unavailability, leading and trailing content, roving props, and activation within OptionRow's planned contract.",
      replacement:
        "Compose OptionRow while retaining prerequisite traversal, reason association, document-type identity, and focus-zone ownership in DocumentStage.",
      deletion:
        "Remove the native radio option and duplicated selected, eligible, and unavailable classes during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/CreateDocDialog.tsx",
      owner: "DocumentStage",
      slot: "remove-linked-document-action",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/IconButton.tsx",
      name: "IconButton",
      status: "existing",
    },
    rationale: {
      summary:
        "DocumentStage's linked-document removal glyph is an ordinary icon action.",
      equivalence:
        "The repeated native button has a localized item-specific label, one X glyph, and one removal callback.",
      replacement:
        "Render X through IconButton while retaining related-document identity and coarse-pointer target policy in the dialog.",
      deletion:
        "Remove the native button and duplicated removal-action classes after migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/FeatureSearchField.tsx",
      owner: "FeatureSuggestionList",
      slot: "feature-suggestion-option",
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
        "FeatureSuggestionList renders behaviorally ordinary search-result options.",
      equivalence:
        "Each row forwards option identity, selected state, primary and metadata content, pointer activation, and hover cursoring to OptionRow.",
      replacement:
        "Compose OptionRow while retaining active-descendant ownership, mouse-down focus preservation, corpus metadata, and feature commit behavior.",
      deletion:
        "Remove the native suggestion button and duplicated active-row classes during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/PickerPlacesRail.tsx",
      owner: "PickerPlacesRail",
      slot: "responsive-place-row",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "shared-chrome",
      path: "frontend/src/app/left/PickerPlacesRail.tsx",
      name: "PickerPlacesRail",
      status: "existing",
    },
    rationale: {
      summary: "PickerPlacesRail owns its responsive place-navigation row.",
      distinction:
        "The same native site changes from a horizontal compact pill to a vertical rail row while carrying current-location state and path navigation; that shell-adaptive geometry is integral to the places rail rather than a general option row.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/ProjectNavigator.tsx",
      owner: "ProjectNavigatorBody",
      slot: "recent-project-option",
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
        "ProjectNavigatorBody renders behaviorally ordinary recent-project rows.",
      equivalence:
        "Each row forwards current and disabled state, roving props, label content, activation, and keyboard handling within OptionRow's planned contract.",
      replacement:
        "Compose OptionRow while retaining project switching, Delete and Backspace history removal, active cues, and focus-zone ownership in the navigator.",
      deletion:
        "Remove the native row button and store-provided row interaction classes during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/WorktreePicker.tsx",
      owner: "renderWorktreeRow",
      slot: "worktree-option",
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
      summary: "renderWorktreeRow emits behaviorally ordinary picker options.",
      equivalence:
        "The row forwards current and disabled state, leading and trailing content, roving props, activation, and context-menu handlers within OptionRow's planned contract.",
      replacement:
        "Compose OptionRow while retaining unsaved-draft guarding, worktree activation, degraded badges, keyboard routing, and picker dismissal.",
      deletion:
        "Remove the native worktree button and store-provided row interaction classes during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/WorktreePicker.tsx",
      owner: "renderProjectRow",
      slot: "project-option",
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
      summary: "renderProjectRow emits behaviorally ordinary picker options.",
      equivalence:
        "The row forwards current and disabled state, leading content, roving props, activation, and keyboard handling within OptionRow's planned contract.",
      replacement:
        "Compose OptionRow while retaining unsaved-draft guarding, project switching, Escape dismissal, and focus-zone ownership.",
      deletion:
        "Remove the native project button and store-provided row interaction classes during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/WorktreePicker.tsx",
      owner: "renderRecentRow",
      slot: "recent-worktree-option",
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
      summary: "renderRecentRow emits behaviorally ordinary picker options.",
      equivalence:
        "The row forwards current and disabled state, leading content, roving props, activation, and keyboard handling within OptionRow's planned contract.",
      replacement:
        "Compose OptionRow while retaining cross-project activation, unsaved-draft guarding, Escape dismissal, and focus-zone ownership.",
      deletion:
        "Remove the native recent-worktree button and store-provided row interaction classes during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/WorktreePicker.tsx",
      owner: "renderAddProjectRow",
      slot: "add-project-command",
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
      summary: "renderAddProjectRow emits an ordinary picker command row.",
      equivalence:
        "The row has leading content, a label, roving props, activation, and keyboard dismissal within OptionRow's planned contract.",
      replacement:
        "Compose OptionRow while retaining add-dialog dispatch, keyboard-open provenance, Escape dismissal, and focus-zone ownership.",
      deletion:
        "Remove the native add-project button and duplicated command-row classes during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/WorktreePicker.tsx",
      owner: "renderAllToggleRow",
      slot: "worktree-section-disclosure",
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
      summary: "renderAllToggleRow emits an ordinary picker disclosure row.",
      equivalence:
        "The row forwards expanded state, leading and trailing content, roving props, activation, and keyboard handling within OptionRow's planned contract.",
      replacement:
        "Compose OptionRow while retaining section-open state, worktree count, Escape dismissal, and focus-zone ownership.",
      deletion:
        "Remove the native disclosure button and duplicated command-row classes during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/WorktreePicker.tsx",
      owner: "WorktreePicker",
      slot: "identity-trigger",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "shared-chrome",
      path: "frontend/src/app/left/WorktreePicker.tsx",
      name: "WorktreePicker",
      status: "existing",
    },
    rationale: {
      summary: "WorktreePicker owns its multi-line workspace identity trigger.",
      distinction:
        "The trigger is the picker focus-return anchor and combines project, worktree, branch, dirty, ahead, behind, degraded, and expanded state with ArrowDown focus transfer; it is a canonical shell composite rather than a generic dropdown button.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/WorktreePicker.tsx",
      owner: "WorktreePicker",
      slot: "retry-action",
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
      summary: "WorktreePicker's retry control is an ordinary text action.",
      equivalence:
        "The native button has a localized label and one retry callback with no picker-specific keyboard model.",
      replacement:
        "Compose the compact appropriate Button variant while retaining degraded-state placement and retry intent in WorktreePicker.",
      deletion:
        "Remove the native retry button and duplicated link-action classes after migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/palette/DocumentSearchSurface.tsx",
      owner: "DocumentSearchSurface",
      slot: "document-result-option",
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
      summary: "DocumentSearchSurface renders behaviorally ordinary result options.",
      equivalence:
        "Each result forwards option content, selected state, tab-stop state, and activation within OptionRow's planned contract.",
      replacement:
        "Compose OptionRow while retaining input-owned result cursoring, node opening, result identity, and modal dismissal.",
      deletion:
        "Remove the native result button and redundant row wrapper classes during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/panels/RagJobsTable.tsx",
      owner: "HeaderCell",
      slot: "sort-control",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/panels/RagJobsTable.tsx",
      name: "HeaderCell",
      status: "existing",
    },
    rationale: {
      summary: "HeaderCell owns its compact sortable-column control.",
      distinction:
        "The target conditionally replaces a static grid header, preserves column alignment, and exposes active sort direction in the table header geometry; Button and OptionRow would introduce unrelated control or row chrome.",
    },
  },
  {
    source: {
      path: "frontend/src/app/panels/RagJobsTable.tsx",
      owner: "JobRow",
      slot: "job-selection-row",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/panels/RagJobsTable.tsx",
      name: "JobRow",
      status: "existing",
    },
    rationale: {
      summary: "JobRow owns the selectable RAG-job grid row.",
      distinction:
        "The full-row target is a five-column data grid carrying selection, status, live progress, relative start, and duration while toggling the associated detail region; it is not a generic option-row composition.",
    },
  },
  {
    source: {
      path: "frontend/src/app/panels/RagJobsTable.tsx",
      owner: "RagJobsTableBody",
      slot: "phase-facet-chip",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/panels/RagJobsTable.tsx",
      name: "RagJobsTableBody",
      status: "existing",
    },
    rationale: {
      summary: "RagJobsTableBody owns its multi-select phase facet chips.",
      distinction:
        "Each role=checkbox pill combines semantic phase color, label, live count, and independent multi-selection in a compact table filter cluster; neither the vertical FacetRow nor single-choice OptionRow expresses that geometry and contract.",
    },
  },
  {
    source: {
      path: "frontend/src/app/right/ChangesOverview.tsx",
      owner: "ChangeRow",
      slot: "changed-file-row",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "shared-chrome",
      path: "frontend/src/app/right/ChangesOverview.tsx",
      name: "ChangeRow",
      status: "existing",
    },
    rationale: {
      summary: "ChangeRow owns the changed-file tree row.",
      distinction:
        "The row is structural content under collapsible status groups and combines file opening, path identity, binary state, additions and deletions, status-owned styling, and tree indent geometry; it is not an ordinary option row.",
    },
  },
  {
    source: {
      path: "frontend/src/app/right/ChangesOverview.tsx",
      owner: "ChangesOverviewBody",
      slot: "retry-action",
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
      summary: "ChangesOverviewBody's retry control is an ordinary text action.",
      equivalence:
        "The native button has a served label and one retry callback with no tree-specific semantics.",
      replacement:
        "Compose the appropriate Button variant while retaining error-state ownership and retry behavior in ChangesOverviewBody.",
      deletion:
        "Remove the native retry button and store-provided retryButtonClassName styling after migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/right/FrameworkStatusCluster.tsx",
      owner: "StatusChip",
      slot: "framework-panel-toggle",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "shared-chrome",
      path: "frontend/src/app/right/FrameworkStatusCluster.tsx",
      name: "StatusChip",
      status: "existing",
    },
    rationale: {
      summary: "StatusChip owns its framework-state panel target.",
      distinction:
        "The roving footer-cluster item combines served tone, optional count, pressed panel state, and coarse-pointer sizing as the collapsed representation of a framework plane; it is not a generic Button or IconButton.",
    },
  },
  {
    source: {
      path: "frontend/src/app/right/PlanStepTree.tsx",
      owner: "StepRow",
      slot: "step-preview-action",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "shared-chrome",
      path: "frontend/src/app/right/PlanStepTree.tsx",
      name: "StepRow",
      status: "existing",
    },
    rationale: {
      summary: "StepRow owns its untabbable step-preview target.",
      distinction:
        "The button is the pointer surface paired with the row's single checkbox tab stop; Enter and cross-axis navigation on that checkbox invoke the same preview, so extracting it would split one composite's coordinated focus and activation contract.",
    },
  },
  {
    source: {
      path: "frontend/src/app/right/StatusTab.tsx",
      owner: "PlanPill",
      slot: "plan-disclosure-row",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "shared-chrome",
      path: "frontend/src/app/right/StatusTab.tsx",
      name: "PlanPill",
      status: "existing",
    },
    rationale: {
      summary: "PlanPill owns its plan-tree disclosure row.",
      distinction:
        "The button is the plan list's roving tab stop and couples full-row disclosure, cross-axis tree navigation, progress composition, and a separate untabbable open action; that hierarchy contract is not a generic Button.",
    },
  },
  {
    source: {
      path: "frontend/src/app/right/StatusTab.tsx",
      owner: "PlanPill",
      slot: "open-plan-action",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/IconButton.tsx",
      name: "IconButton",
      status: "existing",
    },
    rationale: {
      summary: "PlanPill's external-link glyph is an ordinary icon action.",
      equivalence:
        "The native button has an accessible label, one glyph, one click callback, and an intentionally forwarded negative tab index, all compatible with IconButton.",
      replacement:
        "Render ExternalLink through IconButton while retaining plan activation, graph framing, and the plan row's single-tab-stop policy.",
      deletion:
        "Remove the native open button and duplicated icon-action classes after migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/right/StatusTab.tsx",
      owner: "RecentCommitItem",
      slot: "message-disclosure-action",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/IconButton.tsx",
      name: "IconButton",
      status: "existing",
    },
    rationale: {
      summary: "RecentCommitItem's message twisty is an ordinary icon action.",
      equivalence:
        "The native button has a state-specific accessible label, one chevron glyph, expanded state, disabled state, and one toggle callback within IconButton's contract.",
      replacement:
        "Render the chevron through IconButton while retaining commit-body availability and expansion state in RecentCommitItem.",
      deletion:
        "Remove the native toggle and store-provided toggleClassName styling after migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/right/StatusTab.tsx",
      owner: "RecentCommitItem",
      slot: "commit-selection-row",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "shared-chrome",
      path: "frontend/src/app/right/StatusTab.tsx",
      name: "RecentCommitItem",
      status: "existing",
    },
    rationale: {
      summary: "RecentCommitItem owns its commit-selection row target.",
      distinction:
        "The button is the flexible center of a three-control commit header, aligns selectable subject and age columns beside disclosure and context actions, and selects a graph event with all touched nodes; generic row chrome would disturb that coordinated structure.",
    },
  },
  {
    source: {
      path: "frontend/src/app/right/StatusTab.tsx",
      owner: "RecentCommitsBody",
      slot: "show-more-action",
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
      summary: "RecentCommitsBody's show-more control is an ordinary text action.",
      equivalence:
        "The native button has a label and one pagination callback with no commit-row interaction semantics.",
      replacement:
        "Compose the appropriate Button variant while retaining bounded history pagination in RecentCommitsBody.",
      deletion:
        "Remove the native show-more button and store-provided showMoreButtonClassName styling after migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/right/menus/HoverCard.tsx",
      owner: "HoverCard",
      slot: "open-document-action",
    },
    element: "button",
    disposition: "migrate",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/IconButton.tsx",
      name: "IconButton",
      status: "existing",
    },
    rationale: {
      summary: "HoverCard's open glyph is an ordinary icon action.",
      equivalence:
        "The native button has an accessible label, one ExternalLink glyph, and one activation callback within IconButton's contract.",
      replacement:
        "Render ExternalLink through IconButton while retaining pointer-event escape behavior and document opening in HoverCard.",
      deletion:
        "Remove the native button and duplicated icon-action classes after migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/shell/BottomTabBar.tsx",
      owner: "BottomTabBar",
      slot: "compact-navigation-tab",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "shared-chrome",
      path: "frontend/src/app/shell/BottomTabBar.tsx",
      name: "BottomTabBar",
      status: "existing",
    },
    rationale: {
      summary: "BottomTabBar owns its compact navigation tab site.",
      distinction:
        "The repeated control is a share-filling safe-area navigation target with manual activation, one roving tab stop, current-page state, and a nested compact active pill; generic IconButton geometry cannot express the canonical bottom-bar composition.",
    },
  },
  {
    source: {
      path: "frontend/src/app/shell/MobileTopBar.tsx",
      owner: "MobileTopBar",
      slot: "workspace-title-trigger",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "shared-chrome",
      path: "frontend/src/app/shell/MobileTopBar.tsx",
      name: "MobileTopBar",
      status: "existing",
    },
    rationale: {
      summary: "MobileTopBar owns its interactive workspace title.",
      distinction:
        "The control remains the page's level-one heading through a display-contents wrapper while acting as the full-width sheet trigger with truncated identity and disclosure state; neither Button nor DropdownButton owns that shell heading contract.",
    },
  },
  {
    source: {
      path: "frontend/src/app/shell/MobileTopBar.tsx",
      owner: "MobileTopBar",
      slot: "text-action",
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
      summary: "MobileTopBar's text-only action is an ordinary labeled action.",
      equivalence:
        "The native button forwards an accessible label, disabled state, visible text, and one callback within Button's contract.",
      replacement:
        "Compose a semantic-size Button variant while retaining top-bar action ordering, fallback suppression, and compact target sizing.",
      deletion:
        "Remove the native text-action button and duplicated top-bar action classes after migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/shell/WorkspaceSwitcherSheet.tsx",
      owner: "SwitcherRow",
      slot: "workspace-option",
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
      summary: "SwitcherRow is a behaviorally ordinary workspace option row.",
      equivalence:
        "The row forwards current and disabled state, accessible text, leading and trailing content, and activation within OptionRow's planned contract.",
      replacement:
        "Compose OptionRow while retaining worktree, recent, project, and add-project intents plus unsaved-draft guarding and sheet dismissal.",
      deletion:
        "Remove SwitcherRow's native button and duplicated ROW_CLASS interaction styling during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/timeline/TimeTravelChip.tsx",
      owner: "TimeTravelChip",
      slot: "return-to-live-action",
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
      summary: "TimeTravelChip's return-to-live control is an ordinary labeled action.",
      equivalence:
        "The native button has a leading glyph, localized label, and one callback; timeline-mode interpretation remains entirely in the caller.",
      replacement:
        "Compose the compact appropriate Button variant while retaining the stage-chip status message and canonical movePlayhead writer.",
      deletion:
        "Remove the native action and duplicated inline link-button classes after migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/AutocompleteCombobox.tsx",
      owner: "AutocompleteCombobox",
      slot: "suggestion-option",
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
      summary: "AutocompleteCombobox renders behaviorally ordinary suggestion options.",
      equivalence:
        "Each row forwards selected state, accessible identity, leading and secondary content, pointer activation, and hover cursoring within OptionRow's planned contract.",
      replacement:
        "Compose OptionRow while retaining portaled placement, mouse-down focus preservation, active-index ownership, commit behavior, and coarse-pointer sizing.",
      deletion:
        "Remove the native suggestion button and duplicated active-row classes during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/CodeViewer.tsx",
      owner: "CopyMenu",
      slot: "copy-contents-command",
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
      summary: "CopyMenu's copy-contents command is an ordinary menu row.",
      equivalence:
        "The menuitem has a label and one activation callback within OptionRow's planned contract.",
      replacement:
        "Compose OptionRow while retaining clipboard dispatch, content identity, and menu dismissal in CopyMenu.",
      deletion:
        "Remove the native menuitem and shared COPY_MENU_ITEM_CLASS duplication during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/CodeViewer.tsx",
      owner: "CopyMenu",
      slot: "copy-path-command",
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
      summary: "CopyMenu's conditional copy-path command is an ordinary menu row.",
      equivalence:
        "The menuitem has a label and one activation callback within OptionRow's planned contract.",
      replacement:
        "Compose OptionRow while retaining honest path absence, clipboard identity metadata, and menu dismissal in CopyMenu.",
      deletion:
        "Remove the native menuitem and shared COPY_MENU_ITEM_CLASS duplication during migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/CommentThreadPanel.tsx",
      owner: "CommentRow",
      slot: "reanchor-action",
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
      summary: "CommentRow's reanchor control is an ordinary labeled action.",
      equivalence:
        "The native button carries a leading glyph, disabled state, localized label, and one async action callback within Button's contract.",
      replacement:
        "Compose a compact Button while retaining selector resolution, busy state, mutation feedback, and comment identity in CommentRow.",
      deletion:
        "Remove the native reanchor button and duplicated inline action classes after migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/CommentThreadPanel.tsx",
      owner: "CommentRow",
      slot: "body-edit-trigger",
    },
    element: "button",
    disposition: "retain-semantic-seam",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/viewer/CommentThreadPanel.tsx",
      name: "CommentRow",
      status: "existing",
    },
    rationale: {
      summary: "CommentRow owns the comment body as its edit-mode trigger.",
      distinction:
        "The unchromed target preserves whitespace and selectable authored prose, then swaps that exact body into an editing textarea with draft and feedback state; generic Button styling would misrepresent content as action chrome.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/MarkdownReader.tsx",
      owner: "CodeFence",
      slot: "copy-code-action",
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
      summary: "CodeFence's copy control is an ordinary text action.",
      equivalence:
        "The native button has a localized label and one clipboard callback, while syntax rendering remains caller-owned.",
      replacement:
        "Compose the compact appropriate Button variant while retaining dispatchCopy fallback behavior and code-fence header composition.",
      deletion:
        "Remove the native copy button and its vs-code-fence__copy interaction styling after migration.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/MarkdownReader.tsx",
      owner: "OrphanedNotesBar",
      slot: "notes-disclosure-action",
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
      summary:
        "OrphanedNotesBar's note-count disclosure is an ordinary labeled action.",
      equivalence:
        "The native button has leading content, a localized count label, and one toggle callback within Button's contract.",
      replacement:
        "Compose the appropriate ghost Button while retaining orphan derivation, panel placement, and open state in OrphanedNotesBar.",
      deletion:
        "Remove the native disclosure button and duplicated inline action classes after migration.",
    },
  },
  {
    source: {
      path: "frontend/src/platform/errors/ErrorBoundary.tsx",
      owner: "DefaultFallback",
      slot: "app-reload-action",
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
      summary:
        "DefaultFallback's application reload control belongs to app-owned Button composition.",
      equivalence:
        "The native control has a localized label and one reload callback, but its product styling currently violates the platform containment boundary.",
      replacement:
        "Compose Button in the planned app-owned fallback renderer while platform ErrorBoundary retains only containment, diagnostics, reset, and injected rendering.",
      deletion:
        "Remove the native app fallback button and bespoke framework-palette classes from platform when AppErrorBoundary takes presentation ownership.",
    },
  },
  {
    source: {
      path: "frontend/src/platform/errors/ErrorBoundary.tsx",
      owner: "DefaultFallback",
      slot: "region-retry-action",
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
      summary:
        "DefaultFallback's region retry control belongs to app-owned Button composition.",
      equivalence:
        "The native control has a localized label and one reset callback, but its product styling currently violates the platform containment boundary.",
      replacement:
        "Compose Button in the planned app-owned fallback renderer while platform ErrorBoundary retains reset coordination and injected rendering.",
      deletion:
        "Remove the native region fallback button and bespoke framework-palette classes from platform when AppErrorBoundary takes presentation ownership.",
    },
  },
] as const satisfies readonly NativeControlLedgerEntry[];
export const KIT_RELATIVE_VALUE_LEDGER = [
  {
    source: {
      path: "frontend/src/app/kit/ActivityIndicator.tsx",
      owner: "ActivityIndicator",
      slot: "progress-bar-thickness",
    },
    expression: "h-[0.125rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/ActivityIndicator.tsx",
      name: "ActivityIndicator",
      status: "existing",
    },
    rationale: {
      summary:
        "The activity strip's 0.125rem thickness is exact component geometry rather than general spacing.",
      constraint:
        "Its two-device-pixel visual weight keeps the fixed progress strip subordinate to application content while remaining perceptible.",
      exactValue:
        "Retain h-[0.125rem] under ActivityIndicator; a foundation spacing alias would misstate the value's component-specific role.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/Breadcrumb.tsx",
      owner: "Breadcrumb",
      slot: "trail-label-type-size",
    },
    expression: "text-[0.8125rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-foundation",
      path: "frontend/tokens/type.tokens.json",
      name: "type.role.label.size",
      status: "existing",
    },
    rationale: {
      summary:
        "Breadcrumb trail labels use the existing 0.8125rem label-role type size.",
      equivalence:
        "The loose size is byte-for-byte equal to type.role.label.size and does not encode breadcrumb-only geometry.",
      replacement:
        "Bind the trail's font size directly to the existing label-role size while preserving its current line height and weight semantics.",
      deletion:
        "Remove text-[0.8125rem] from Breadcrumb when the exact DTCG size binding is consumed.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/FacetRow.tsx",
      owner: "FacetRow",
      slot: "row-density-geometry",
    },
    expression: "gap-[0.625rem] py-[0.3125rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/FacetRow.tsx",
      name: "FacetRow",
      status: "existing",
    },
    rationale: {
      summary:
        "FacetRow's inline gap and block padding form one exact dense-row footprint.",
      constraint:
        "The 0.625rem gap and 0.3125rem padding coordinate custom controls, optional dots, labels, and counts without changing row density.",
      exactValue:
        "Retain gap-[0.625rem] and py-[0.3125rem] together under the FacetRow component recipe.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/FacetRow.tsx",
      owner: "FacetRow",
      slot: "radio-control-geometry",
    },
    expression: "size-[1rem] border-[0.0875rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/FacetRow.tsx",
      name: "FacetRow",
      status: "existing",
    },
    rationale: {
      summary:
        "The custom radio's diameter and stroke are coordinated exact control geometry.",
      constraint:
        "Changing either 1rem diameter or 0.0875rem stroke changes the radio silhouette and its checked-state balance.",
      exactValue:
        "Retain size-[1rem] with border-[0.0875rem] as the FacetRow radio recipe.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/FacetRow.tsx",
      owner: "FacetRow",
      slot: "radio-selected-dot-geometry",
    },
    expression: "size-[0.5rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/FacetRow.tsx",
      name: "FacetRow",
      status: "existing",
    },
    rationale: {
      summary:
        "The selected radio dot is exact internal geometry of the 1rem custom radio.",
      constraint:
        "Its 0.5rem diameter maintains the shipped one-half scale relationship to the radio control.",
      exactValue: "Retain size-[0.5rem] for the selected-dot slot inside FacetRow.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/FacetRow.tsx",
      owner: "FacetRow",
      slot: "checkbox-control-geometry",
    },
    expression: "size-[1rem] border-[0.075rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/FacetRow.tsx",
      name: "FacetRow",
      status: "existing",
    },
    rationale: {
      summary:
        "The custom checkbox's diameter and stroke are coordinated exact control geometry.",
      constraint:
        "The 1rem box and 0.075rem stroke frame the fixed check glyph without altering the shipped checkbox silhouette.",
      exactValue:
        "Retain size-[1rem] with border-[0.075rem] as the FacetRow checkbox recipe.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/FacetRow.tsx",
      owner: "FacetRow",
      slot: "status-dot-geometry",
    },
    expression: "size-[0.5rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/FacetRow.tsx",
      name: "FacetRow",
      status: "existing",
    },
    rationale: {
      summary:
        "FacetRow's optional status dot has exact indicator geometry distinct from spacing.",
      constraint:
        "The 0.5rem diameter preserves the shipped status-dot prominence beside the custom control and label.",
      exactValue: "Retain size-[0.5rem] for the status-dot slot owned by FacetRow.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/FacetRow.tsx",
      owner: "FacetRow",
      slot: "label-type-size",
    },
    expression: "text-[0.78125rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/type.tokens.json",
      name: "component.facet-row.label-size",
      status: "planned",
    },
    rationale: {
      summary:
        "FacetRow's repeated 0.78125rem label metric needs an explicit component-owned role rather than a loose utility.",
      equivalence:
        "The planned component token preserves exactly 0.78125rem and does not snap the label to the nearby foundation label or meta steps.",
      replacement:
        "Add the exact shipped label-size role through the DTCG pipeline and consume its generated utility in FacetRow.",
      deletion:
        "Remove text-[0.78125rem] only after the exact component token is generated and directly consumed.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/FacetRow.tsx",
      owner: "FacetRow",
      slot: "count-leading-space",
    },
    expression: "w-[0.25rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-foundation",
      path: "frontend/tokens/spacing.tokens.json",
      name: "spacing.1",
      status: "existing",
    },
    rationale: {
      summary:
        "The count spacer is exactly the existing 0.25rem foundation spacing step.",
      equivalence:
        "w-[0.25rem] and spacing.1 resolve to the same computed width at the established rem basis.",
      replacement:
        "Use the generated width utility for spacing.1 without changing the spacer element or layout.",
      deletion:
        "Remove w-[0.25rem] after direct consumption of the existing spacing token.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/FacetRow.tsx",
      owner: "FacetRow",
      slot: "count-type-size",
    },
    expression: "text-[0.6875rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-foundation",
      path: "frontend/tokens/type.tokens.json",
      name: "type.role.caption.size",
      status: "existing",
    },
    rationale: {
      summary: "FacetRow counts use the existing 0.6875rem caption-role type size.",
      equivalence:
        "The arbitrary value exactly equals type.role.caption.size and serves the same dense metadata role.",
      replacement:
        "Bind the count to the existing caption role while retaining its tabular numeral treatment.",
      deletion:
        "Remove text-[0.6875rem] when FacetRow consumes the canonical caption role.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/Kbd.tsx",
      owner: "Kbd",
      slot: "keycap-minimum-width",
    },
    expression: "min-w-[1.25rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Kbd.tsx",
      name: "Kbd",
      status: "existing",
    },
    rationale: {
      summary:
        "Kbd's minimum width is exact keycap geometry, not a general spacing role.",
      constraint:
        "The 1.25rem floor keeps single-glyph keycaps square enough to read while allowing longer shortcut labels to grow.",
      exactValue: "Retain min-w-[1.25rem] as part of the Kbd component silhouette.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/SearchField.tsx",
      owner: "SearchField",
      slot: "field-shell-geometry",
    },
    expression: "h-[2.125rem] px-[0.625rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/SearchField.tsx",
      name: "SearchField",
      status: "existing",
    },
    rationale: {
      summary:
        "SearchField's height and inline padding form one exact component shell geometry.",
      constraint:
        "The 2.125rem height and 0.625rem padding jointly align the search glyph, input, and optional clear action.",
      exactValue:
        "Retain h-[2.125rem] and px-[0.625rem] together under SearchField until an exact component-shell token has independent reuse.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/SearchField.tsx",
      owner: "SearchField",
      slot: "input-type-size",
    },
    expression: "text-[0.75rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-foundation",
      path: "frontend/tokens/type.tokens.json",
      name: "type.role.meta.size",
      status: "existing",
    },
    rationale: {
      summary: "The search input uses the existing 0.75rem meta-role type size.",
      equivalence:
        "text-[0.75rem] is computed-value equivalent to type.role.meta.size and carries the same compact supporting-text scale.",
      replacement:
        "Bind SearchField's input size to the existing meta-role metric while preserving its current weight and input behavior.",
      deletion: "Remove text-[0.75rem] when the exact DTCG size binding is consumed.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/SectionLabel.tsx",
      owner: "SectionLabel",
      slot: "eyebrow-letter-spacing",
    },
    expression: "tracking-[0.025rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-foundation",
      path: "frontend/tokens/type.tokens.json",
      name: "type.tracking.eyebrow",
      status: "planned",
    },
    rationale: {
      summary:
        "The repeated 0.025rem eyebrow tracking is a reusable typography role rather than SectionLabel-only geometry.",
      equivalence:
        "The planned role preserves exactly 0.025rem and also matches the shipped transcript and hover-card eyebrow treatment.",
      replacement:
        "Add an exact eyebrow tracking token through the DTCG type pipeline and consume its generated binding in SectionLabel.",
      deletion:
        "Remove tracking-[0.025rem] only after the exact reusable role is generated and directly consumed.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/Skeleton.tsx",
      owner: "SkeletonBar",
      slot: "width-api-documentation-example",
    },
    expression: "w-[5rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Skeleton.tsx",
      name: "SkeletonBar",
      status: "existing",
    },
    rationale: {
      summary:
        "The raw 106-site scan includes a documented example of caller-defined SkeletonBar width rather than an executable class site.",
      constraint:
        "SkeletonBar intentionally accepts arbitrary width utilities so callers can mimic the exact content line they stand in for.",
      exactValue:
        "Retain w-[5rem] as a non-executable API example in the bounded textual baseline; it prescribes no shared runtime value.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/Skeleton.tsx",
      owner: "SkeletonRow",
      slot: "boxed-row-block-padding",
    },
    expression: "py-[0.6875rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Skeleton.tsx",
      name: "SkeletonRow",
      status: "existing",
    },
    rationale: {
      summary:
        "SkeletonRow's boxed variant uses exact padding to mimic its settled row footprint.",
      constraint:
        "The 0.6875rem block padding is geometry for loading-state height, not the coincidentally equal caption type metric.",
      exactValue:
        "Retain py-[0.6875rem] in the boxed SkeletonRow recipe so loading and settled footprints stay aligned.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/Spinner.tsx",
      owner: "Spinner",
      slot: "ring-stroke-width",
    },
    expression: "border-[0.1875rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Spinner.tsx",
      name: "Spinner",
      status: "existing",
    },
    rationale: {
      summary:
        "Spinner's 0.1875rem border is the exact stroke geometry of the shared loading ring.",
      constraint:
        "The stroke must remain balanced at both supported ring diameters and match the shipped boot-to-app loading silhouette.",
      exactValue:
        "Retain border-[0.1875rem] under Spinner rather than treating the stroke as general spacing.",
    },
  },
  {
    source: {
      path: "frontend/src/app/kit/Switch.tsx",
      owner: "Switch",
      slot: "track-height",
    },
    expression: "h-[1.125rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "app-kit",
      path: "frontend/src/app/kit/Switch.tsx",
      name: "Switch",
      status: "existing",
    },
    rationale: {
      summary:
        "Switch's 1.125rem track height is exact geometry coordinated with its knob and horizontal travel.",
      constraint:
        "Changing the height alone would disturb the current knob centering and on/off silhouette.",
      exactValue: "Retain h-[1.125rem] as the Switch track-height recipe.",
    },
  },
] as const satisfies readonly RelativeValueLedgerEntry[];

export const CHROME_AND_SHELL_RELATIVE_VALUE_LEDGER = [
  {
    source: {
      path: "frontend/src/app/chrome/BottomSheet.tsx",
      owner: "BottomSheet",
      slot: "panel-viewport-height-limit",
    },
    expression: "max-h-[85vh] pb-[max(1rem,env(safe-area-inset-bottom))]",
    units: ["vh", "rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.bottom-sheet.viewport-geometry",
      status: "planned",
    },
    rationale: {
      summary:
        "The sheet's height limit and safe-area padding are reusable viewport geometry owned by the BottomSheet composite.",
      equivalence:
        "The planned role preserves exactly 85vh and the max(1rem, env(safe-area-inset-bottom)) floor for every BottomSheet instance.",
      replacement:
        "Generate exact bottom-sheet viewport-height and safe-area-padding bindings under one component geometry owner and consume both in the shared panel shell.",
      deletion:
        "Remove both arbitrary utilities only after BottomSheet directly consumes the exact generated bindings.",
    },
  },
  {
    source: {
      path: "frontend/src/app/chrome/Dialog.tsx",
      owner: "PANEL_WIDTH",
      slot: "default-panel-width",
    },
    expression: "w-[34rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.dialog.width.default",
      status: "planned",
    },
    rationale: {
      summary:
        "The default Dialog width is a named shared-chrome variant that belongs in the component token surface.",
      equivalence:
        "The planned role preserves exactly 34rem and leaves the compact max-width guard unchanged.",
      replacement:
        "Generate the default dialog-width role and reference it from PANEL_WIDTH.",
      deletion:
        "Remove w-[34rem] only when the exact component role is directly consumed.",
    },
  },
  {
    source: {
      path: "frontend/src/app/chrome/Dialog.tsx",
      owner: "PANEL_WIDTH",
      slot: "medium-panel-width",
    },
    expression: "w-[45rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.dialog.width.medium",
      status: "planned",
    },
    rationale: {
      summary:
        "The medium Dialog width is a named shared-chrome variant that belongs in the component token surface.",
      equivalence:
        "The planned role preserves exactly 45rem and leaves the compact max-width guard unchanged.",
      replacement:
        "Generate the medium dialog-width role and reference it from PANEL_WIDTH.",
      deletion:
        "Remove w-[45rem] only when the exact component role is directly consumed.",
    },
  },
  {
    source: {
      path: "frontend/src/app/chrome/Dialog.tsx",
      owner: "PANEL_WIDTH",
      slot: "wide-panel-width",
    },
    expression: "w-[52rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.dialog.width.wide",
      status: "planned",
    },
    rationale: {
      summary:
        "The wide Dialog width is a named shared-chrome variant that belongs in the component token surface.",
      equivalence:
        "The planned role preserves exactly 52rem and leaves the compact max-width guard unchanged.",
      replacement:
        "Generate the wide dialog-width role and reference it from PANEL_WIDTH.",
      deletion:
        "Remove w-[52rem] only when the exact component role is directly consumed.",
    },
  },
  {
    source: {
      path: "frontend/src/app/chrome/Dialog.tsx",
      owner: "Dialog",
      slot: "panel-block-start-placement",
    },
    expression: "pt-[10vh]",
    units: ["vh"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.dialog.block-start",
      status: "planned",
    },
    rationale: {
      summary:
        "Dialog's 10vh block-start placement is shared overlay geometry rather than caller-owned spacing.",
      equivalence:
        "The planned role preserves exactly 10vh and keeps the existing top-aligned scrim composition.",
      replacement:
        "Generate the exact dialog block-start role and consume it on the shared scrim.",
      deletion:
        "Remove pt-[10vh] only after direct use of the generated component role.",
    },
  },
  {
    source: {
      path: "frontend/src/app/chrome/Dialog.tsx",
      owner: "Dialog",
      slot: "panel-viewport-height-limit",
    },
    expression: "max-h-[80vh] max-w-[calc(100vw-2rem)]",
    units: ["vh", "vw", "rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.dialog.viewport-geometry",
      status: "planned",
    },
    rationale: {
      summary:
        "Dialog's height limit and compact width guard are reusable viewport geometry owned by the shared composite.",
      equivalence:
        "The planned role preserves exactly 80vh and calc(100vw - 2rem), including the existing scrolling and narrow-viewport behavior.",
      replacement:
        "Generate exact dialog viewport-height and compact-width bindings under one component geometry owner and consume both on the shared panel.",
      deletion:
        "Remove both arbitrary utilities only after direct use of the generated component bindings.",
    },
  },
  {
    source: {
      path: "frontend/src/app/shell/WorkspaceSwitcherSheet.tsx",
      owner: "ROW_CLASS",
      slot: "switcher-row-coarse-target",
    },
    expression: "min-h-[2.75rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.control.coarse-target",
      status: "planned",
    },
    rationale: {
      summary:
        "Workspace switcher rows use the repeated 2.75rem coarse-pointer target role.",
      equivalence:
        "The planned role preserves exactly 2.75rem and is shared by shell rows, dialog actions, and other coarse controls.",
      replacement:
        "Generate the exact coarse-target role and apply its minimum height to ROW_CLASS.",
      deletion:
        "Remove min-h-[2.75rem] only after the shared target role is directly consumed.",
    },
  },
  {
    source: {
      path: "frontend/src/app/shell/MobileTopBar.tsx",
      owner: "MobileTopBar",
      slot: "compact-top-bar-height",
    },
    expression: "h-[3.25rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.mobile-top-bar.height",
      status: "planned",
    },
    rationale: {
      summary:
        "The 3.25rem compact top-bar height is reusable shell geometry owned by MobileTopBar.",
      equivalence:
        "The planned role preserves exactly 3.25rem and retains the existing 2.75rem action targets and alignment.",
      replacement:
        "Generate the exact mobile-top-bar height role and consume it on the shared header.",
      deletion:
        "Remove h-[3.25rem] only after MobileTopBar directly consumes the generated role.",
    },
  },
  {
    source: {
      path: "frontend/src/app/shell/IconRail.tsx",
      owner: "IconRail",
      slot: "active-indicator-width",
    },
    expression: "w-[0.1875rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "shared-chrome",
      path: "frontend/src/app/shell/IconRail.tsx",
      name: "IconRail",
      status: "existing",
    },
    rationale: {
      summary:
        "IconRail's accent sliver is exact selected-navigation geometry rather than general spacing.",
      constraint:
        "The 0.1875rem width balances the fixed rail and its five-unit height without introducing another shared indicator contract.",
      exactValue:
        "Retain w-[0.1875rem] inside IconRail until an independently reused shell-selection indicator exists.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/AddProjectDialog.tsx",
      owner: "AddProjectDialogBody",
      slot: "browser-region-height",
    },
    expression: "h-[22rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.add-project-dialog.browser-height",
      status: "planned",
    },
    rationale: {
      summary:
        "The project browser's 22rem body height is a stable AddProjectDialog dimension.",
      equivalence:
        "The planned role preserves exactly 22rem and leaves the compact flex-column switch and internal overflow behavior unchanged.",
      replacement:
        "Generate the exact project-dialog browser-height role and consume it in the dialog body composition.",
      deletion:
        "Remove h-[22rem] only after AddProjectDialog directly consumes the generated role.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/CreateDocDialog.tsx",
      owner: "CreateDocDialog",
      slot: "related-array-scan-false-positive",
    },
    expression: "[...related, stem]",
    units: ["em"],
    disposition: "repair-local-defect",
    canonicalOwner: {
      layer: "platform-mechanism",
      path: "frontend/dev/tooling/scan-design-system.mjs",
      name: "scanRelativeValueSites",
      status: "planned",
    },
    rationale: {
      summary:
        "The raw baseline mistakes an ordinary related-document array expression for an em-valued styling site.",
      defect:
        "The textual matcher reads the suffix of the identifier stem as the unit em even though the bracket is executable TypeScript, not a class utility.",
      correction:
        "Keep this dated identity in the 106-line ledger, then make the planned scanner syntax-aware so future source discovery excludes the false positive without editing dialog behavior.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/CreateDocDialog.tsx",
      owner: "DocumentStage",
      slot: "back-action-coarse-target",
    },
    expression: "min-h-[2.75rem] min-w-[2.75rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.control.coarse-target",
      status: "planned",
    },
    rationale: {
      summary:
        "The document-stage back action uses the repeated square 2.75rem coarse target.",
      equivalence:
        "Both minimum axes preserve exactly 2.75rem and match the shared coarse-pointer target role.",
      replacement:
        "Apply the generated coarse-target role to both minimum dimensions without changing the action or pointer policy.",
      deletion:
        "Remove the two arbitrary target utilities only after direct component-token consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/CreateDocDialog.tsx",
      owner: "DocumentStage",
      slot: "linked-document-chip-coarse-height",
    },
    expression: "min-h-[2.75rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.control.coarse-target",
      status: "planned",
    },
    rationale: {
      summary:
        "Linked-document chips use the shared 2.75rem coarse-pointer height floor.",
      equivalence:
        "The planned role preserves exactly 2.75rem while leaving chip width content-driven.",
      replacement:
        "Apply the generated coarse-target minimum height when coarse-pointer policy is active.",
      deletion: "Remove min-h-[2.75rem] only after direct component-token consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/CreateDocDialog.tsx",
      owner: "DocumentStage",
      slot: "remove-link-action-coarse-target",
    },
    expression: "min-h-[2.75rem] min-w-[2.75rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.control.coarse-target",
      status: "planned",
    },
    rationale: {
      summary:
        "The linked-document remove action uses the repeated square 2.75rem coarse target.",
      equivalence:
        "Both minimum axes preserve exactly 2.75rem and match the shared coarse-pointer target role.",
      replacement:
        "Apply the generated coarse-target role to both minimum dimensions without changing removal behavior.",
      deletion:
        "Remove the two arbitrary target utilities only after direct component-token consumption.",
    },
  },
] as const satisfies readonly RelativeValueLedgerEntry[];

export const VIEWER_RELATIVE_VALUE_LEDGER = [
  {
    source: {
      path: "frontend/src/app/viewer/AutocompleteCombobox.tsx",
      owner: "AutocompleteCombobox",
      slot: "empty-option-type-size",
    },
    expression: "text-[0.6875rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-foundation",
      path: "frontend/tokens/type.tokens.json",
      name: "type.role.caption.size",
      status: "existing",
    },
    rationale: {
      summary: "The empty-option message uses the existing caption type size.",
      equivalence:
        "0.6875rem exactly equals type.role.caption.size and serves dense supporting copy.",
      replacement:
        "Bind the size to the caption metric without changing padding or option behavior.",
      deletion: "Remove text-[0.6875rem] after direct canonical consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/AutocompleteCombobox.tsx",
      owner: "AutocompleteCombobox",
      slot: "option-coarse-target",
    },
    expression: "min-h-[2.75rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.control.coarse-target",
      status: "planned",
    },
    rationale: {
      summary:
        "Autocomplete options use the shared 2.75rem coarse-pointer target floor.",
      equivalence:
        "The planned role preserves exactly 2.75rem and the existing pointer-conditional application.",
      replacement:
        "Consume the generated coarse-target minimum height on coarse pointers.",
      deletion: "Remove min-h-[2.75rem] only after direct component-token consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/AutocompleteCombobox.tsx",
      owner: "AutocompleteCombobox",
      slot: "option-primary-type-size",
    },
    expression: "text-[0.75rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-foundation",
      path: "frontend/tokens/type.tokens.json",
      name: "type.role.meta.size",
      status: "existing",
    },
    rationale: {
      summary: "Autocomplete primary option text uses the existing meta type size.",
      equivalence:
        "0.75rem exactly equals type.role.meta.size and preserves the current compact hierarchy.",
      replacement: "Bind only the font size to the existing meta metric.",
      deletion: "Remove text-[0.75rem] after direct canonical consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/AutocompleteCombobox.tsx",
      owner: "AutocompleteCombobox",
      slot: "option-secondary-type-size",
    },
    expression: "text-[0.6875rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-foundation",
      path: "frontend/tokens/type.tokens.json",
      name: "type.role.caption.size",
      status: "existing",
    },
    rationale: {
      summary:
        "Autocomplete secondary option text uses the existing caption type size.",
      equivalence:
        "0.6875rem exactly equals type.role.caption.size and fits secondary metadata semantics.",
      replacement: "Bind only the font size to the existing caption metric.",
      deletion: "Remove text-[0.6875rem] after direct canonical consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/CodeViewer.tsx",
      owner: "CodeLines",
      slot: "removed-line-tick-geometry",
    },
    expression: "h-[0.125rem] w-[0.375rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/viewer/CodeViewer.tsx",
      name: "CodeLines",
      status: "existing",
    },
    rationale: {
      summary:
        "The removed-line tick is exact renderer-coordinated code gutter geometry.",
      constraint:
        "Its 0.125rem by 0.375rem silhouette distinguishes deletion ticks from full-height change bars.",
      exactValue:
        "Retain both dimensions inside CodeLines without treating them as spacing roles.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/CodeViewer.tsx",
      owner: "CodeLines",
      slot: "changed-line-bar-width",
    },
    expression: "w-[0.1875rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/viewer/CodeViewer.tsx",
      name: "CodeLines",
      status: "existing",
    },
    rationale: {
      summary: "The changed-line bar width is exact code-gutter marker geometry.",
      constraint:
        "The 0.1875rem bar coordinates with line layout and the distinct removal tick.",
      exactValue: "Retain w-[0.1875rem] under CodeLines.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/CodeViewer.tsx",
      owner: "CodeViewer",
      slot: "file-identity-inline-gap",
    },
    expression: "gap-[0.625rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.code-viewer.header-gap",
      status: "planned",
    },
    rationale: {
      summary:
        "The repeated 0.625rem code-viewer header gap is one component-owned layout role.",
      equivalence:
        "The planned role preserves exactly 0.625rem for both header clusters.",
      replacement: "Generate and consume the exact code-viewer header-gap binding.",
      deletion: "Remove gap-[0.625rem] after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/CodeViewer.tsx",
      owner: "CodeViewer",
      slot: "header-actions-inline-gap",
    },
    expression: "gap-[0.625rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.code-viewer.header-gap",
      status: "planned",
    },
    rationale: {
      summary:
        "The header action cluster shares CodeViewer's exact 0.625rem header gap.",
      equivalence:
        "The planned role preserves exactly 0.625rem across both component-owned header clusters.",
      replacement: "Consume the generated code-viewer header-gap binding.",
      deletion: "Remove gap-[0.625rem] after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/CommentThreadPanel.tsx",
      owner: "CommentThreadPanel",
      slot: "thread-panel-viewport-bounds",
    },
    expression: "max-h-[24rem] max-w-[calc(100cqw-1.5rem)]",
    units: ["rem", "cqw"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/viewer/CommentThreadPanel.tsx",
      name: "CommentThreadPanel",
      status: "existing",
    },
    rationale: {
      summary:
        "The thread panel's height and container-relative width are exact embedded-viewer geometry.",
      constraint:
        "The 24rem cap and calc(100cqw - 1.5rem) guard coordinate with its containing reader rather than a global overlay.",
      exactValue: "Retain both viewport bounds under CommentThreadPanel.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/DocChrome.tsx",
      owner: "DocChrome",
      slot: "document-toolbar-insets",
    },
    expression: "py-[0.8125rem] pl-[1.25rem] pr-[0.875rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "shared-chrome",
      path: "frontend/src/app/viewer/DocChrome.tsx",
      name: "DocChrome",
      status: "existing",
    },
    rationale: {
      summary:
        "DocChrome's asymmetric toolbar insets are exact document-workspace composition geometry.",
      constraint:
        "The three values align identity, actions, and the adjacent document edge; replacing them independently would alter balance.",
      exactValue: "Retain all three insets together under DocChrome.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/HighlightedCode.tsx",
      owner: "ChangeMarker",
      slot: "removed-marker-geometry",
    },
    expression: "left-[-0.9rem] h-[0.125rem] w-[0.5rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/viewer/HighlightedCode.tsx",
      name: "ChangeMarker",
      status: "existing",
    },
    rationale: {
      summary:
        "The removal tick's inset, height, and width are exact highlighted-code marker geometry.",
      constraint:
        "These values coordinate the tick with editor padding and distinguish it from full-height bars.",
      exactValue: "Retain the complete three-value marker recipe under ChangeMarker.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/HighlightedCode.tsx",
      owner: "ChangeMarker",
      slot: "changed-marker-geometry",
    },
    expression: "left-[-0.9rem] w-[0.1875rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/viewer/HighlightedCode.tsx",
      name: "ChangeMarker",
      status: "existing",
    },
    rationale: {
      summary:
        "The change bar's negative inset and width are exact editor-overlay geometry.",
      constraint:
        "The values keep the bar inside reserved editor padding and aligned with removal ticks.",
      exactValue: "Retain both values under ChangeMarker.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/HighlightedCode.tsx",
      owner: "ChangeMarker",
      slot: "unseen-agent-dot-geometry",
    },
    expression: "left-[-1.15rem] top-[0.35em] h-[0.375rem] w-[0.375rem]",
    units: ["rem", "em"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/viewer/HighlightedCode.tsx",
      name: "ChangeMarker",
      status: "existing",
    },
    rationale: {
      summary:
        "The unseen-agent dot uses exact mixed rem/em geometry tied to the rendered code line.",
      constraint:
        "Its negative inset, font-relative vertical offset, and diameter coordinate with wrapping line metrics.",
      exactValue: "Retain the complete four-value dot recipe under ChangeMarker.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/HighlightedCode.tsx",
      owner: "HighlightedTextLines",
      slot: "empty-line-height-floor",
    },
    expression: "min-h-[1em]",
    units: ["em"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/viewer/HighlightedCode.tsx",
      name: "HighlightedTextLines",
      status: "existing",
    },
    rationale: {
      summary:
        "Each highlighted source line retains a one-em height floor tied to its own font metrics.",
      constraint:
        "The font-relative floor preserves empty-line rhythm and marker coordination through soft wrapping.",
      exactValue: "Retain min-h-[1em] as renderer-owned line geometry.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/MarkdownReader.tsx",
      owner: "DocHeaderBlock",
      slot: "editorial-header-block-gap",
    },
    expression: "gap-[0.6875rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/viewer/MarkdownReader.tsx",
      name: "DocHeaderBlock",
      status: "existing",
    },
    rationale: {
      summary:
        "The editorial header's 0.6875rem block rhythm is exact reader composition geometry.",
      constraint:
        "Its coincidence with the caption font size does not give it typography or foundation spacing semantics.",
      exactValue: "Retain gap-[0.6875rem] under DocHeaderBlock.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/MarkdownReader.tsx",
      owner: "DocHeaderBlock",
      slot: "eyebrow-cluster-gap",
    },
    expression: "gap-[0.4375rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.reader.inline-cluster-gap",
      status: "planned",
    },
    rationale: {
      summary:
        "The repeated 0.4375rem reader inline-cluster gap is a reusable reader role.",
      equivalence:
        "The exact value is shared by the eyebrow and footer tag clusters without a nearby-token substitution.",
      replacement: "Generate and consume the exact reader inline-cluster-gap role.",
      deletion: "Remove gap-[0.4375rem] after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/MarkdownReader.tsx",
      owner: "ReaderFooter",
      slot: "footer-responsive-insets",
    },
    expression: "pb-[1.875rem] pt-[1.375rem] @3xl:px-[3rem] @5xl:px-[4.5rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.reader.footer-insets",
      status: "planned",
    },
    rationale: {
      summary:
        "ReaderFooter's exact vertical and responsive horizontal insets form a reusable footer role.",
      equivalence:
        "The planned binding preserves all four shipped rem values and viewport variants.",
      replacement:
        "Generate exact reader footer inset bindings and consume them as one component recipe.",
      deletion:
        "Remove the four arbitrary utilities only after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/MarkdownReader.tsx",
      owner: "ReaderFooter",
      slot: "tag-cluster-gap",
    },
    expression: "gap-[0.4375rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.reader.inline-cluster-gap",
      status: "planned",
    },
    rationale: {
      summary: "The tag cluster shares the reader's exact 0.4375rem inline gap role.",
      equivalence:
        "The value exactly matches the editorial eyebrow cluster and is not snapped to the spacing scale.",
      replacement: "Consume the generated reader inline-cluster-gap role.",
      deletion: "Remove gap-[0.4375rem] after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/MarkdownReader.tsx",
      owner: "ReaderFooter",
      slot: "tag-chip-metrics",
    },
    expression: "px-[0.625rem] text-[0.6875rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.reader.tag-chip-metrics",
      status: "planned",
    },
    rationale: {
      summary:
        "Reader tag chips pair exact 0.625rem padding with the caption-size metric as one component recipe.",
      equivalence:
        "The planned role preserves 0.625rem padding and 0.6875rem type exactly; the latter equals the existing caption size.",
      replacement:
        "Generate the exact reader tag-chip metric bindings and consume them together.",
      deletion:
        "Remove both arbitrary utilities only after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/MarkdownReader.tsx",
      owner: "ReaderFooter",
      slot: "related-link-type-size",
    },
    expression: "text-[0.84375rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.reader.related-link-size",
      status: "planned",
    },
    rationale: {
      summary:
        "Related-document links need an explicit reader-owned type metric rather than a loose utility.",
      equivalence:
        "The planned role preserves exactly 0.84375rem and does not snap to neighboring foundation type steps.",
      replacement: "Generate and consume the exact reader related-link size binding.",
      deletion: "Remove text-[0.84375rem] only after exact component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/MarkdownReader.tsx",
      owner: "MarkdownBody",
      slot: "body-responsive-insets",
    },
    expression: "pb-[0.625rem] pt-[1.875rem] @3xl:px-[3rem] @5xl:px-[4.5rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.reader.body-insets",
      status: "planned",
    },
    rationale: {
      summary:
        "MarkdownBody's exact vertical and responsive horizontal insets form a reusable reader role.",
      equivalence:
        "The planned binding preserves all four shipped values and viewport variants without snapping.",
      replacement:
        "Generate exact reader body inset bindings and consume them as one component recipe.",
      deletion:
        "Remove the four arbitrary utilities only after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/MarkdownReader.tsx",
      owner: "MarkdownReader",
      slot: "metadata-responsive-gutter",
    },
    expression: "@3xl:px-[3rem] @5xl:px-[4.5rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.reader.responsive-gutter",
      status: "planned",
    },
    rationale: {
      summary:
        "Reader metadata shares the exact 3rem and 4.5rem wide-viewport gutter role.",
      equivalence:
        "The planned role preserves both responsive values also used by body, footer, and orphan-note chrome.",
      replacement: "Generate and consume the exact reader responsive-gutter bindings.",
      deletion:
        "Remove both arbitrary responsive utilities after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/MarkdownReader.tsx",
      owner: "OrphanedNotesBar",
      slot: "orphan-notes-responsive-gutter",
    },
    expression: "@3xl:px-[3rem] @5xl:px-[4.5rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.reader.responsive-gutter",
      status: "planned",
    },
    rationale: {
      summary: "OrphanedNotesBar shares the reader's exact wide-viewport gutter role.",
      equivalence:
        "The planned role preserves 3rem and 4.5rem at the same responsive variants as the reader body and metadata.",
      replacement: "Consume the generated reader responsive-gutter bindings.",
      deletion:
        "Remove both arbitrary responsive utilities after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/viewer/RelatedDocPicker.tsx",
      owner: "RelatedDocPicker",
      slot: "selected-array-scan-false-positive",
    },
    expression: "[...selected, stem]",
    units: ["em"],
    disposition: "repair-local-defect",
    canonicalOwner: {
      layer: "platform-mechanism",
      path: "frontend/dev/tooling/scan-design-system.mjs",
      name: "scanRelativeValueSites",
      status: "planned",
    },
    rationale: {
      summary:
        "The raw baseline mistakes an ordinary selected-stem array expression for an em-valued styling site.",
      defect:
        "The textual matcher reads the identifier suffix stem as unit em although the bracket is TypeScript, not a class utility.",
      correction:
        "Keep the dated identity in the 106-line ledger, then exclude it with the planned syntax-aware scanner without changing viewer behavior.",
    },
  },
] as const satisfies readonly RelativeValueLedgerEntry[];

export const PALETTE_AND_AGENT_RELATIVE_VALUE_LEDGER = [
  {
    source: {
      path: "frontend/src/app/palette/DocumentSearchSurface.tsx",
      owner: "DocumentSearchSurface",
      slot: "search-overlay-viewport-geometry",
    },
    expression: "max-h-[calc(100vh-9rem)] w-[32rem] max-w-[calc(100vw-2rem)]",
    units: ["vh", "rem", "vw"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.document-search.viewport-geometry",
      status: "planned",
    },
    rationale: {
      summary:
        "DocumentSearchSurface's height, nominal width, and compact guard form one reusable search-overlay geometry role.",
      equivalence:
        "The planned bindings preserve calc(100vh - 9rem), 32rem, and calc(100vw - 2rem) exactly.",
      replacement:
        "Generate the exact document-search viewport bindings and consume them together on the overlay panel.",
      deletion:
        "Remove all three arbitrary utilities only after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/palette/SearchPaletteSurface.tsx",
      owner: "SearchPaletteSurface",
      slot: "expanded-result-column-width",
    },
    expression: "w-[22rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.search-palette.result-column-width",
      status: "planned",
    },
    rationale: {
      summary:
        "The 22rem expanded result column is reusable split-pane geometry owned by SearchPaletteSurface.",
      equivalence:
        "The planned role preserves exactly 22rem and leaves the adjacent preview flexible.",
      replacement: "Generate and consume the exact result-column width binding.",
      deletion: "Remove w-[22rem] only after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/palette/SearchPaletteSurface.tsx",
      owner: "SearchPaletteSurface",
      slot: "result-list-height-limit",
    },
    expression: "max-h-[28rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.search-palette.result-region-max-height",
      status: "planned",
    },
    rationale: {
      summary:
        "SearchPaletteSurface's populated result list uses the shared 28rem result-region height limit.",
      equivalence:
        "The planned role preserves exactly 28rem for both populated and empty result regions.",
      replacement:
        "Generate and consume the exact search result-region max-height binding.",
      deletion: "Remove max-h-[28rem] after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/palette/SearchPaletteSurface.tsx",
      owner: "SearchPaletteSurface",
      slot: "empty-result-region-height-limit",
    },
    expression: "max-h-[28rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.search-palette.result-region-max-height",
      status: "planned",
    },
    rationale: {
      summary:
        "The empty search result region shares the populated list's exact 28rem height limit.",
      equivalence:
        "The planned role preserves exactly 28rem and keeps empty/populated panel geometry stable.",
      replacement: "Consume the generated search result-region max-height binding.",
      deletion: "Remove max-h-[28rem] after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/palette/SearchResultPill.tsx",
      owner: "SearchResultPill",
      slot: "selection-border-width",
    },
    expression: "border-[0.09375rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/palette/SearchResultPill.tsx",
      name: "SearchResultPill",
      status: "existing",
    },
    rationale: {
      summary:
        "SearchResultPill's 0.09375rem border is exact selected-result silhouette geometry.",
      constraint:
        "The border remains present in selected and transparent states to prevent layout shift; no other component shares this stroke contract.",
      exactValue:
        "Retain border-[0.09375rem] under SearchResultPill rather than treating it as foundation spacing.",
    },
  },
  {
    source: {
      path: "frontend/src/app/palette/CommandPalette.tsx",
      owner: "CommandPaletteSurface",
      slot: "command-overlay-width-geometry",
    },
    expression: "w-[32rem] max-w-[calc(100vw-2rem)]",
    units: ["rem", "vw"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.command-palette.width-geometry",
      status: "planned",
    },
    rationale: {
      summary:
        "The command overlay's nominal width and compact guard are reusable palette geometry.",
      equivalence:
        "The planned bindings preserve 32rem and calc(100vw - 2rem) exactly without changing placement.",
      replacement:
        "Generate and consume both exact command-palette width bindings on the overlay panel.",
      deletion:
        "Remove both arbitrary utilities only after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/Composer.tsx",
      owner: "Composer",
      slot: "entry-height-limit",
    },
    expression: "max-h-[6.75rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/agent/Composer.tsx",
      name: "Composer",
      status: "existing",
    },
    rationale: {
      summary:
        "The composer entry's 6.75rem height cap is exact interaction geometry for its expanding textarea seam.",
      constraint:
        "The cap balances multi-line authoring against transcript visibility and is not shared by ordinary TextArea consumers.",
      exactValue: "Retain max-h-[6.75rem] under Composer's specialized entry contract.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/transcriptKit.tsx",
      owner: "AgentTag",
      slot: "attribution-letter-spacing",
    },
    expression: "tracking-[0.025rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-foundation",
      path: "frontend/tokens/type.tokens.json",
      name: "type.tracking.eyebrow",
      status: "planned",
    },
    rationale: {
      summary:
        "Agent attribution uses the same reusable 0.025rem eyebrow tracking role as SectionLabel and hover-card metadata.",
      equivalence:
        "The planned role preserves exactly 0.025rem across these equivalent compact attribution treatments.",
      replacement: "Consume the exact generated eyebrow-tracking binding in AgentTag.",
      deletion:
        "Remove tracking-[0.025rem] only after direct foundation-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/agent/transcriptKit.tsx",
      owner: "UserTurnBubble",
      slot: "bubble-line-length-limit",
    },
    expression: "max-w-[85%]",
    units: ["%"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/agent/transcriptKit.tsx",
      name: "UserTurnBubble",
      status: "existing",
    },
    rationale: {
      summary:
        "The user-turn bubble's 85% width cap is exact conversation-layout geometry.",
      constraint:
        "The percentage preserves a visible alignment cue while adapting to transcript width; it is not a global container role.",
      exactValue: "Retain max-w-[85%] under UserTurnBubble.",
    },
  },
] as const satisfies readonly RelativeValueLedgerEntry[];

export const STAGE_AND_TIMELINE_RELATIVE_VALUE_LEDGER = [
  {
    source: {
      path: "frontend/src/app/stage/CanvasStateOverlay.tsx",
      owner: "CanvasStateOverlay",
      slot: "state-card-shell-metrics",
    },
    expression: "gap-[0.625rem] rounded-[0.625rem] px-[1.625rem] py-[1.375rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.canvas-state-overlay.card-shell-metrics",
      status: "planned",
    },
    rationale: {
      summary:
        "The shared canvas-state card shell applies one exact spacing and radius recipe to blocking and caution states.",
      equivalence:
        "The planned component role preserves the 0.625rem gap and radius, 1.625rem horizontal inset, and 1.375rem vertical inset together.",
      replacement:
        "Generate and consume the complete exact card-shell metric binding in the shared CARD_SHELL recipe.",
      deletion:
        "Remove all four arbitrary utilities only after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/CanvasStateOverlay.tsx",
      owner: "OverlayChip",
      slot: "annotation-line-length-limit",
    },
    expression: "max-w-[34rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.canvas-state-overlay.annotation-max-width",
      status: "planned",
    },
    rationale: {
      summary:
        "Canvas annotation chips use the state overlay's exact 34rem readable-width limit.",
      equivalence:
        "The planned component role preserves exactly 34rem for every annotation rendered through OverlayChip.",
      replacement:
        "Generate and consume the exact annotation max-width binding without changing chip composition.",
      deletion: "Remove max-w-[34rem] only after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/CategoryLegend.tsx",
      owner: "CategoryLegend",
      slot: "active-item-destructure-scan-false-positive",
    },
    expression: "[activeItem, setActiveItem]",
    units: ["em"],
    disposition: "repair-local-defect",
    canonicalOwner: {
      layer: "platform-mechanism",
      path: "frontend/dev/tooling/scan-design-system.mjs",
      name: "scanRelativeValueSites",
      status: "planned",
    },
    rationale: {
      summary:
        "The raw baseline mistakes a React state destructure for an em-valued styling site.",
      defect:
        "The textual matcher reads the Item identifier suffix inside a TypeScript bracket expression as unit em.",
      correction:
        "Keep this dated identity in the 106-line ledger, then make the planned scanner syntax-aware without changing graph legend behavior.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/CategoryLegend.tsx",
      owner: "CategoryLegend",
      slot: "recency-ramp-geometry",
    },
    expression: "h-[0.5em] w-[6em]",
    units: ["em"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/stage/CategoryLegend.tsx",
      name: "CategoryLegend",
      status: "existing",
    },
    rationale: {
      summary:
        "The recency ramp uses font-relative dimensions that belong to its graph-legend visualization.",
      constraint:
        "The 0.5em height and 6em width scale with the adjacent caption and preserve the readable cold-to-hot sample.",
      exactValue: "Retain both em dimensions together under CategoryLegend.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/CategoryLegend.tsx",
      owner: "CategoryLegend",
      slot: "code-module-divider-height",
    },
    expression: "h-[1.25em]",
    units: ["em"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/stage/CategoryLegend.tsx",
      name: "CategoryLegend",
      status: "existing",
    },
    rationale: {
      summary:
        "The code-module legend divider is font-relative separator geometry within the compact toolbar.",
      constraint:
        "Its 1.25em height tracks the legend's current line metrics rather than a global divider size.",
      exactValue: "Retain h-[1.25em] on this CategoryLegend branch.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/CategoryLegend.tsx",
      owner: "CategoryLegend",
      slot: "document-type-divider-height",
    },
    expression: "h-[1.25em]",
    units: ["em"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/stage/CategoryLegend.tsx",
      name: "CategoryLegend",
      status: "existing",
    },
    rationale: {
      summary:
        "The document-type legend divider uses the same local font-relative toolbar geometry.",
      constraint:
        "The 1.25em separator follows this legend's caption and control height without defining a general Divider contract.",
      exactValue: "Retain h-[1.25em] on the document-type branch.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/CategoryLegend.tsx",
      owner: "CategoryLegend",
      slot: "filter-reset-divider-height",
    },
    expression: "h-[1.25em]",
    units: ["em"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/stage/CategoryLegend.tsx",
      name: "CategoryLegend",
      status: "existing",
    },
    rationale: {
      summary:
        "The active-filter reset divider repeats CategoryLegend's local separator geometry.",
      constraint:
        "Its 1.25em height coordinates the optional reset action with the same legend row, not with independent surfaces.",
      exactValue: "Retain h-[1.25em] on the filter-reset branch.",
    },
  },
  {
    source: {
      path: "frontend/src/app/stage/ProvisionPanel.tsx",
      owner: "ProvisionPanelBody",
      slot: "progress-skeleton-geometry",
    },
    expression: "w-[12.5rem] h-[0.625rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/stage/ProvisionPanel.tsx",
      name: "ProvisionPanelBody",
      status: "existing",
    },
    rationale: {
      summary:
        "The provisioning progress skeleton has exact placeholder geometry for the centered status card.",
      constraint:
        "Its 12.5rem width and 0.625rem height stand in for this panel's progress treatment and do not define a shared SkeletonBar role.",
      exactValue: "Retain both dimensions together under ProvisionPanelBody.",
    },
  },
  {
    source: {
      path: "frontend/src/app/timeline/DateBasisSelect.tsx",
      owner: "DateBasisSelect",
      slot: "menu-width-comment-scan-false-positive",
    },
    expression: "min-w-[11rem]",
    units: ["rem"],
    disposition: "repair-local-defect",
    canonicalOwner: {
      layer: "platform-mechanism",
      path: "frontend/dev/tooling/scan-design-system.mjs",
      name: "scanRelativeValueSites",
      status: "planned",
    },
    rationale: {
      summary:
        "The raw baseline counts a documentation reference to the former utility as a live relative-value site.",
      defect:
        "The current portaled menu uses measured 176px placement geometry; min-w-[11rem] appears only in explanatory prose.",
      correction:
        "Preserve the dated raw identity, then exclude comments in the planned syntax-aware scanner without changing menu placement.",
    },
  },
  {
    source: {
      path: "frontend/src/app/timeline/TimelineRangeSelector.tsx",
      owner: "handleFootprint",
      slot: "responsive-handle-footprints",
    },
    expression: "size-[1.25rem] size-[0.875rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/timeline/TimelineRangeSelector.tsx",
      name: "handleFootprint",
      status: "existing",
    },
    rationale: {
      summary:
        "Timeline handles retain distinct compact and desktop footprints inside their drag contract.",
      constraint:
        "The 1.25rem compact target and 0.875rem desktop mark are shared by live and ghost handles and coordinate pointer geometry with the track.",
      exactValue:
        "Retain both variant values in handleFootprint without treating the specialized slider seam as a generic control size.",
    },
  },
  {
    source: {
      path: "frontend/src/app/timeline/TimelineRangeSelector.tsx",
      owner: "DateBasisGhost",
      slot: "leading-mark-footprint",
    },
    expression: "size-[0.875rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/timeline/TimelineRangeSelector.tsx",
      name: "DateBasisGhost",
      status: "existing",
    },
    rationale: {
      summary:
        "The leading ghost mark mirrors the date-basis trigger's structural glyph footprint.",
      constraint:
        "Its 0.875rem square is authored placeholder geometry coupled to DateBasisGhost, not a live control target.",
      exactValue: "Retain size-[0.875rem] on the leading ghost mark.",
    },
  },
  {
    source: {
      path: "frontend/src/app/timeline/TimelineRangeSelector.tsx",
      owner: "DateBasisGhost",
      slot: "label-skeleton-width",
    },
    expression: "w-[3.5rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/timeline/TimelineRangeSelector.tsx",
      name: "DateBasisGhost",
      status: "existing",
    },
    rationale: {
      summary:
        "The date-basis ghost label uses an exact placeholder width for the compact pill composition.",
      constraint:
        "The 3.5rem bar balances the two glyph ghosts and approximates this control's label region only.",
      exactValue: "Retain w-[3.5rem] under DateBasisGhost.",
    },
  },
  {
    source: {
      path: "frontend/src/app/timeline/TimelineRangeSelector.tsx",
      owner: "DateBasisGhost",
      slot: "trailing-mark-footprint",
    },
    expression: "size-[0.875rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/timeline/TimelineRangeSelector.tsx",
      name: "DateBasisGhost",
      status: "existing",
    },
    rationale: {
      summary:
        "The trailing ghost mark mirrors the date-basis trigger's chevron footprint.",
      constraint:
        "Its 0.875rem square completes this one placeholder composition and carries no independent primitive semantics.",
      exactValue: "Retain size-[0.875rem] on the trailing ghost mark.",
    },
  },
  {
    source: {
      path: "frontend/src/app/timeline/TimelineRangeSelector.tsx",
      owner: "TimelineGhost",
      slot: "selected-summary-skeleton-width",
    },
    expression: "w-[6rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/timeline/TimelineRangeSelector.tsx",
      name: "TimelineGhost",
      status: "existing",
    },
    rationale: {
      summary:
        "The timeline ghost's summary bar reserves the exact width of the selected date-range label region.",
      constraint:
        "The 6rem placeholder coordinates with the ghost track and date-basis pill rather than a shared skeleton vocabulary.",
      exactValue: "Retain w-[6rem] under TimelineGhost.",
    },
  },
  {
    source: {
      path: "frontend/src/app/timeline/TimelineRangeSelector.tsx",
      owner: "TimelineRange",
      slot: "state-strip-height",
    },
    expression: "h-[2.75rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/timeline/TimelineRangeSelector.tsx",
      name: "TimelineRange",
      status: "existing",
    },
    rationale: {
      summary:
        "Loading, degraded, and empty timeline states share the selector's exact strip height.",
      constraint:
        "The 2.75rem height tethers the timeline to the graph panel and is not the generic coarse-target role with the same numeric value.",
      exactValue: "Retain h-[2.75rem] in the shared non-populated container recipe.",
    },
  },
  {
    source: {
      path: "frontend/src/app/timeline/TimelineRangeSelector.tsx",
      owner: "TimelineRange",
      slot: "populated-strip-height",
    },
    expression: "h-[2.75rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/timeline/TimelineRangeSelector.tsx",
      name: "TimelineRange",
      status: "existing",
    },
    rationale: {
      summary:
        "The populated timeline selector preserves the same exact graph-panel strip height as its state variants.",
      constraint:
        "The 2.75rem height is composition geometry for the graph-plus-timeline panel, not a general touch-target token.",
      exactValue: "Retain h-[2.75rem] on the populated TimelineRange container.",
    },
  },
] as const satisfies readonly RelativeValueLedgerEntry[];

export const RESIDUAL_RELATIVE_VALUE_LEDGER = [
  {
    source: {
      path: "frontend/src/app/left/CodeTree.tsx",
      owner: "DepthGuides",
      slot: "guide-line-block-insets",
    },
    expression: "top-[0.3125rem] bottom-[0.3125rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/left/CodeTree.tsx",
      name: "DepthGuides",
      status: "existing",
    },
    rationale: {
      summary:
        "Code-tree depth guides use symmetric block insets tied to the row's visual hierarchy.",
      constraint:
        "The two 0.3125rem insets shorten each recursive guide inside its row while inline placement is computed from depth.",
      exactValue: "Retain both guide-line insets together under DepthGuides.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/FeatureSearchField.tsx",
      owner: "FeatureSuggestionList",
      slot: "suggestion-popup-placement-and-height",
    },
    expression: "top-[calc(100%+0.25rem)] max-h-[16rem]",
    units: ["%", "rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/left/FeatureSearchField.tsx",
      name: "FeatureSuggestionList",
      status: "existing",
    },
    rationale: {
      summary:
        "The feature-suggestion popup pairs a trigger-relative offset with its own scroll-height limit.",
      constraint:
        "calc(100% + 0.25rem) anchors the list below this field and 16rem bounds its feature-result viewport; neither value defines the planned picker overlay role.",
      exactValue:
        "Retain the complete placement and height expression under FeatureSuggestionList.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/FeatureSearchField.tsx",
      owner: "FeatureSuggestionList",
      slot: "suggestion-primary-type-size",
    },
    expression: "text-[0.75rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-foundation",
      path: "frontend/tokens/type.tokens.json",
      name: "type.role.meta.size",
      status: "existing",
    },
    rationale: {
      summary: "Feature suggestion names use the existing meta type size.",
      equivalence:
        "0.75rem exactly equals type.role.meta.size and preserves the compact option hierarchy.",
      replacement: "Bind only the suggestion name size to the existing meta metric.",
      deletion: "Remove text-[0.75rem] after direct canonical consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/FeatureSearchField.tsx",
      owner: "FeatureSuggestionList",
      slot: "suggestion-secondary-type-size",
    },
    expression: "text-[0.6875rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-foundation",
      path: "frontend/tokens/type.tokens.json",
      name: "type.role.caption.size",
      status: "existing",
    },
    rationale: {
      summary: "Feature suggestion metadata uses the existing caption type size.",
      equivalence:
        "0.6875rem exactly equals type.role.caption.size and retains the secondary hierarchy beneath the suggestion name.",
      replacement: "Bind only the metadata size to the existing caption metric.",
      deletion: "Remove text-[0.6875rem] after direct canonical consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/FolderBrowser.tsx",
      owner: "FolderBrowser",
      slot: "focus-effect-dependencies-scan-false-positive",
    },
    expression: "[currentPath, firstRowPath, focusIntent, focusItem]",
    units: ["em"],
    disposition: "repair-local-defect",
    canonicalOwner: {
      layer: "platform-mechanism",
      path: "frontend/dev/tooling/scan-design-system.mjs",
      name: "scanRelativeValueSites",
      status: "planned",
    },
    rationale: {
      summary:
        "The raw matcher mistakes a React effect dependency array for an em-valued styling site.",
      defect:
        "The textual scan reads the focusItem identifier suffix inside a TypeScript bracket expression as unit em.",
      correction:
        "Preserve the dated raw identity, then exclude non-style syntax in the planned scanner without changing focus behavior.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/RailFilterField.tsx",
      owner: "RailFilterField",
      slot: "active-filter-badge-offsets",
    },
    expression: "right-[-0.25rem] top-[-0.25rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/left/RailFilterField.tsx",
      name: "RailFilterField",
      status: "existing",
    },
    rationale: {
      summary:
        "The active-filter badge overlaps the rail filter action with exact negative offsets.",
      constraint:
        "Both -0.25rem offsets coordinate the Badge with this IconButton corner and do not represent foundation spacing.",
      exactValue: "Retain both offsets together under RailFilterField.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/railStates.tsx",
      owner: "RAIL_SKELETON_ROWS",
      slot: "row-one-width",
    },
    expression: "w-[38%]",
    units: ["%"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/left/railStates.tsx",
      name: "RAIL_SKELETON_ROWS",
      status: "existing",
    },
    rationale: {
      summary: "The first left-rail skeleton row uses an authored varied-width cue.",
      constraint:
        "Its 38% width participates in a deliberately irregular tree silhouette rather than a reusable container role.",
      exactValue: "Retain w-[38%] in the ordered skeleton-row recipe.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/railStates.tsx",
      owner: "RAIL_SKELETON_ROWS",
      slot: "row-two-width",
    },
    expression: "w-[62%]",
    units: ["%"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/left/railStates.tsx",
      name: "RAIL_SKELETON_ROWS",
      status: "existing",
    },
    rationale: {
      summary:
        "The second left-rail skeleton row extends the authored tree silhouette.",
      constraint:
        "Its 62% width is coupled to this row's depth and the surrounding varied placeholders.",
      exactValue: "Retain w-[62%] in the ordered skeleton-row recipe.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/railStates.tsx",
      owner: "RAIL_SKELETON_ROWS",
      slot: "row-three-width",
    },
    expression: "w-[54%]",
    units: ["%"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/left/railStates.tsx",
      name: "RAIL_SKELETON_ROWS",
      status: "existing",
    },
    rationale: {
      summary: "The third left-rail skeleton row varies the nested tree footprint.",
      constraint:
        "Its 54% width is an authored placeholder proportion tied to this sequence and depth.",
      exactValue: "Retain w-[54%] in the ordered skeleton-row recipe.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/railStates.tsx",
      owner: "RAIL_SKELETON_ROWS",
      slot: "row-four-width",
    },
    expression: "w-[70%]",
    units: ["%"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/left/railStates.tsx",
      name: "RAIL_SKELETON_ROWS",
      status: "existing",
    },
    rationale: {
      summary: "The fourth left-rail skeleton row forms the deepest long placeholder.",
      constraint:
        "Its 70% width is coupled to depth two and the ordered tree-loading silhouette.",
      exactValue: "Retain w-[70%] in the ordered skeleton-row recipe.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/railStates.tsx",
      owner: "RAIL_SKELETON_ROWS",
      slot: "row-five-width",
    },
    expression: "w-[46%]",
    units: ["%"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/left/railStates.tsx",
      name: "RAIL_SKELETON_ROWS",
      status: "existing",
    },
    rationale: {
      summary:
        "The final left-rail skeleton row closes the varied root-level silhouette.",
      constraint:
        "Its 46% width is an authored sequence value and carries no independent layout role.",
      exactValue: "Retain w-[46%] in the ordered skeleton-row recipe.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/railStates.tsx",
      owner: "RailSkeleton",
      slot: "section-label-skeleton-height",
    },
    expression: "h-[0.625rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/left/railStates.tsx",
      name: "RailSkeleton",
      status: "existing",
    },
    rationale: {
      summary:
        "The left-rail skeleton header uses an exact height matching its section-label footprint.",
      constraint:
        "The 0.625rem bar is specific placeholder geometry paired with a quarter-width label cue.",
      exactValue: "Retain h-[0.625rem] under RailSkeleton.",
    },
  },
  {
    source: {
      path: "frontend/src/app/left/WorktreePicker.tsx",
      owner: "WorktreePicker",
      slot: "dropdown-height-limit",
    },
    expression: "max-h-[18rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.worktree-picker.dropdown-max-height",
      status: "planned",
    },
    rationale: {
      summary:
        "The worktree switcher's scrollable dropdown uses its planned exact overlay height role.",
      equivalence:
        "The component binding preserves exactly 18rem and leaves anchoring, overflow, and dismissal unchanged.",
      replacement:
        "Generate and consume the exact worktree-picker dropdown max height.",
      deletion: "Remove max-h-[18rem] only after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/onboarding/FirstRunOnboarding.tsx",
      owner: "FirstRunOnboardingBody",
      slot: "content-line-length-limit",
    },
    expression: "max-w-[28rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/onboarding/FirstRunOnboarding.tsx",
      name: "FirstRunOnboardingBody",
      status: "existing",
    },
    rationale: {
      summary:
        "The first-run message block uses an exact line-length cap for its singular full-screen welcome state.",
      constraint:
        "The 28rem width balances the product mark, heading, explanatory copy, and action without defining a shared overlay.",
      exactValue: "Retain max-w-[28rem] under FirstRunOnboardingBody.",
    },
  },
  {
    source: {
      path: "frontend/src/app/panels/IndexLogTail.tsx",
      owner: "IndexLogTailBody",
      slot: "log-viewport-height-limit",
    },
    expression: "max-h-[16rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/panels/IndexLogTail.tsx",
      name: "IndexLogTailBody",
      status: "existing",
    },
    rationale: {
      summary: "The bounded index log keeps an exact scroll-viewport height limit.",
      constraint:
        "The 16rem cap balances this live tail against the sibling maintenance panels and is unrelated to the feature-suggestion popup with the same value.",
      exactValue: "Retain max-h-[16rem] under IndexLogTailBody.",
    },
  },
  {
    source: {
      path: "frontend/src/app/panels/RagJobsTable.tsx",
      owner: "GRID",
      slot: "job-table-column-template",
    },
    expression: "grid-cols-[minmax(6rem,2fr)_6rem_minmax(6rem,2fr)_7rem_6rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/panels/RagJobsTable.tsx",
      name: "GRID",
      status: "existing",
    },
    rationale: {
      summary:
        "The RAG job header and rows share one exact five-column data-table template.",
      constraint:
        "Its two fixed 6rem columns, two flexible columns with 6rem floors, and 7rem duration column encode this table's data hierarchy.",
      exactValue: "Retain the full grid template under the shared local GRID recipe.",
    },
  },
  {
    source: {
      path: "frontend/src/app/panels/RagJobsTable.tsx",
      owner: "RagJobsTableBody",
      slot: "filter-control-width-floor",
    },
    expression: "min-w-[10rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/panels/RagJobsTable.tsx",
      name: "RagJobsTableBody",
      status: "existing",
    },
    rationale: {
      summary:
        "The maintenance-table filter keeps an exact flex-wrap width floor beside sorting controls.",
      constraint:
        "The 10rem floor belongs to this panel's filter-and-sort composition rather than the shared SearchField primitive.",
      exactValue: "Retain min-w-[10rem] on the filter wrapper.",
    },
  },
  {
    source: {
      path: "frontend/src/app/panels/RagJobsTable.tsx",
      owner: "RagJobsTableBody",
      slot: "horizontal-table-width-floor",
    },
    expression: "min-w-[34rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/panels/RagJobsTable.tsx",
      name: "RagJobsTableBody",
      status: "existing",
    },
    rationale: {
      summary:
        "The RAG jobs table keeps a horizontal width floor that protects its five-column layout.",
      constraint:
        "The 34rem floor coordinates with GRID and intentionally hands narrower containers to the surrounding horizontal scroller.",
      exactValue: "Retain min-w-[34rem] under RagJobsTableBody.",
    },
  },
  {
    source: {
      path: "frontend/src/app/panels/SearchActivityLane.tsx",
      owner: "GRID",
      slot: "search-activity-column-template",
    },
    expression: "grid-cols-[6rem_5rem_minmax(8rem,3fr)_4.5rem_7rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/panels/SearchActivityLane.tsx",
      name: "GRID",
      status: "existing",
    },
    rationale: {
      summary:
        "Search activity rows use an exact five-column template for time, state, query, results, and duration.",
      constraint:
        "The 6rem, 5rem, flexible 8rem floor, 4.5rem, and 7rem tracks encode this lane's content rather than a reusable data-grid primitive.",
      exactValue: "Retain the full local search-activity GRID template.",
    },
  },
  {
    source: {
      path: "frontend/src/app/panels/SearchActivityLane.tsx",
      owner: "SearchActivityLaneBody",
      slot: "horizontal-list-width-floor",
    },
    expression: "min-w-[30rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/panels/SearchActivityLane.tsx",
      name: "SearchActivityLaneBody",
      status: "existing",
    },
    rationale: {
      summary:
        "The search-activity list keeps an exact horizontal floor for its five-column rows.",
      constraint:
        "The 30rem floor coordinates with this lane's GRID and delegates narrower panels to the existing horizontal scroller.",
      exactValue: "Retain min-w-[30rem] under SearchActivityLaneBody.",
    },
  },
  {
    source: {
      path: "frontend/src/app/right/FrameworkStatusCluster.tsx",
      owner: "StatusChip",
      slot: "coarse-pointer-height-floor",
    },
    expression: "min-h-[2.75rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-component",
      path: "frontend/tokens/components.tokens.json",
      name: "component.control.coarse-target",
      status: "planned",
    },
    rationale: {
      summary: "StatusChip uses the shared 2.75rem coarse-pointer target floor.",
      equivalence:
        "The planned role preserves exactly 2.75rem under the current pointer-conditional policy.",
      replacement:
        "Consume the generated coarse-target minimum height on coarse pointers.",
      deletion: "Remove min-h-[2.75rem] only after direct component-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/right/menus/HoverCard.tsx",
      owner: "HoverCard",
      slot: "document-type-letter-spacing",
    },
    expression: "tracking-[0.025rem]",
    units: ["rem"],
    disposition: "migrate",
    canonicalOwner: {
      layer: "dtcg-foundation",
      path: "frontend/tokens/type.tokens.json",
      name: "type.tracking.eyebrow",
      status: "planned",
    },
    rationale: {
      summary:
        "Hover-card document type copy uses the shared exact eyebrow-tracking role.",
      equivalence:
        "0.025rem exactly matches the planned role already used by SectionLabel and AgentTag for compact attribution copy.",
      replacement: "Consume the exact generated eyebrow-tracking binding in HoverCard.",
      deletion: "Remove tracking-[0.025rem] after direct foundation-role consumption.",
    },
  },
  {
    source: {
      path: "frontend/src/app/right/railStates.tsx",
      owner: "RailLoading",
      slot: "section-stack-gap",
    },
    expression: "gap-[1.125rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/right/railStates.tsx",
      name: "RailLoading",
      status: "existing",
    },
    rationale: {
      summary:
        "The activity-rail loading ghost uses an exact gap between its two card-section silhouettes.",
      constraint:
        "The 1.125rem gap mirrors this settled rail's section cadence and is not a general Skeleton layout role.",
      exactValue: "Retain gap-[1.125rem] under RailLoading.",
    },
  },
  {
    source: {
      path: "frontend/src/app/right/railStates.tsx",
      owner: "RailLoading",
      slot: "first-section-label-skeleton",
    },
    expression: "w-[5.25rem] h-[0.5625rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/right/railStates.tsx",
      name: "RailLoading",
      status: "existing",
    },
    rationale: {
      summary:
        "The first activity-rail ghost heading has exact width and height for its section label.",
      constraint:
        "The 5.25rem by 0.5625rem bar is authored placeholder geometry for the first loading section.",
      exactValue: "Retain both dimensions together under RailLoading.",
    },
  },
  {
    source: {
      path: "frontend/src/app/right/railStates.tsx",
      owner: "RailLoading",
      slot: "second-section-label-skeleton",
    },
    expression: "w-[4.125rem] h-[0.5625rem]",
    units: ["rem"],
    disposition: "retain-exact-geometry",
    canonicalOwner: {
      layer: "feature-surface",
      path: "frontend/src/app/right/railStates.tsx",
      name: "RailLoading",
      status: "existing",
    },
    rationale: {
      summary:
        "The second activity-rail ghost heading varies the section-label silhouette.",
      constraint:
        "The 4.125rem by 0.5625rem bar is authored placeholder geometry paired with the first section's longer cue.",
      exactValue: "Retain both dimensions together under RailLoading.",
    },
  },
] as const satisfies readonly RelativeValueLedgerEntry[];

export const RELATIVE_VALUE_LEDGER: readonly RelativeValueLedgerEntry[] = [
  ...KIT_RELATIVE_VALUE_LEDGER,
  ...CHROME_AND_SHELL_RELATIVE_VALUE_LEDGER,
  ...VIEWER_RELATIVE_VALUE_LEDGER,
  ...PALETTE_AND_AGENT_RELATIVE_VALUE_LEDGER,
  ...STAGE_AND_TIMELINE_RELATIVE_VALUE_LEDGER,
  ...RESIDUAL_RELATIVE_VALUE_LEDGER,
];
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
