// The composer's standing FEATURE chip (plan S44; the owner's cornerstone mandate).
// Row-2 LEFT — the "what the agent works on" side of the composer law (D3/G6),
// sitting alongside attach and autonomy because a feature IS what the run works on.
//
// Unlike a mention chip, this one is STANDING: for a document-authoring preset it is
// always present, it is required before the run can start, and it defaults from the
// open document. Removing it is not an option the surface offers — rebinding is.
//
// When the selected preset is a coding lane (`authoring_capability: "coding"`) the
// host renders no chip at all: the sibling neither needs nor accepts a feature there,
// and a control that does nothing is worse than no control.
//
// Layer ownership: dumb app chrome over the pure `agentFeature` rules and the shared
// editor linking corpus. No fetch of its own.

import { useRef, useState } from "react";
import { Hash } from "lucide-react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { authoredDisplayText } from "../../platform/localization/displayText";
import { AutocompleteCombobox, type ComboOption } from "../viewer/AutocompleteCombobox";
import { Popover } from "../kit";
import type { FeatureBinding } from "./agentFeature";

const MSG = {
  feature: "common:agent.composer.feature",
  featureUnset: "common:agent.composer.featureUnset",
  featureFromDocument: "common:agent.composer.featureFromDocument",
  featureMenuAria: "common:agent.composer.featureMenuAria",
  featurePlaceholder: "common:agent.composer.featurePlaceholder",
  featureEmpty: "common:agent.composer.featureEmpty",
  selectorValue: "common:agent.composer.selectorValue",
} as const;

export function ComposerFeatureChip({
  binding,
  featureTags,
  onSelectFeature,
  locked,
}: {
  binding: FeatureBinding;
  /** The served feature vocabulary (bare tags), from the vault-tree corpus. */
  featureTags: readonly string[];
  onSelectFeature: (tag: string) => void;
  locked: boolean;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const featureLabel = resolveMessage({ key: MSG.feature }).message;
  const unset = resolveMessage({ key: MSG.featureUnset }).message;
  const value = binding.tag === null ? unset : authoredDisplayText(binding.tag);
  const chipLabel = resolveMessage({
    key: MSG.selectorValue,
    values: { selector: featureLabel, value },
  }).message;
  // A defaulted binding says where it came from, so "already filled in" never reads
  // as "already decided by you".
  const title =
    binding.source === "document"
      ? resolveMessage({ key: MSG.featureFromDocument, values: { feature: value } })
          .message
      : chipLabel;

  const menuAria = resolveMessage({ key: MSG.featureMenuAria });
  const placeholder = resolveMessage({ key: MSG.featurePlaceholder });
  const empty = resolveMessage({ key: MSG.featureEmpty });
  const pickerAvailable =
    !menuAria.usedFallback && !placeholder.usedFallback && !empty.usedFallback;

  const options: ComboOption[] = featureTags.map((tag) => ({
    value: tag,
    primary: tag,
    docType: "feature",
  }));

  return (
    <div
      className="relative"
      data-composer-feature
      data-feature-tag={binding.tag ?? undefined}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={locked || !pickerAvailable}
        onClick={() => setOpen((current) => !current)}
        aria-label={chipLabel}
        aria-expanded={open}
        title={authoredDisplayText(title)}
        data-composer-feature-trigger
        data-feature-source={binding.source}
        className={`inline-flex min-w-0 items-center gap-fg-1 rounded-fg-sm border px-fg-1-5 py-fg-0-5 text-label transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 ${
          binding.tag === null
            ? "border-state-broken text-state-broken"
            : "border-rule text-ink"
        }`}
      >
        <Hash size={12} aria-hidden />
        <span className="min-w-0 truncate">{value}</span>
      </button>
      {open && !locked && pickerAvailable && (
        <Popover
          open
          onDismiss={() => setOpen(false)}
          returnFocusRef={triggerRef}
          ignoreSelector="[data-composer-feature-trigger]"
          role="dialog"
          aria-label={menuAria.message}
          data-composer-feature-menu
          className="absolute bottom-full left-0 z-40 mb-fg-1 min-w-64 rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-popover"
        >
          <AutocompleteCombobox
            options={options}
            onCommit={(tag: string) => {
              const trimmed = tag.trim();
              if (trimmed.length > 0) onSelectFeature(trimmed);
              setOpen(false);
            }}
            // Free text is deliberate: the vocabulary is derived from documents that
            // already EXIST, and a document-authoring run may legitimately open a
            // feature that has none yet. Refusing it would make the picker the
            // authority on which features may exist.
            allowFreeText
            autoFocus
            placeholder={placeholder.message}
            ariaLabel={menuAria.message}
            emptyLabel={empty.message}
          />
        </Popover>
      )}
    </div>
  );
}
