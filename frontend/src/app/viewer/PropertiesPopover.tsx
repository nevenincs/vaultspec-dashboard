// On-demand document metadata form. The parent owns drafts and mutations while
// this component resolves labels and composes the shared field controls.

import type { ReactNode } from "react";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import { Button, Card, Divider, IconButton, Popover, PropertyRow } from "../kit";
import type { EditorLinkingCorpus } from "../../stores/server/queries";
import { docTypePresentation } from "../../stores/server/docTypeVocabulary";
import type { MarkdownEditorFrontmatterDraft } from "../../stores/view/editor";
import { AutocompleteCombobox, type ComboOption } from "./AutocompleteCombobox";
import { RelatedDocPicker } from "./RelatedDocPicker";
import { directoryTagOf, featureTagOf, withFeatureTag } from "./editorTags";

const GLYPH_PX = 16;

export const PROPERTIES_POPOVER_MESSAGES = {
  date: { key: "documents:viewer.properties.labels.date" },
  datePlaceholder: { key: "documents:viewer.properties.placeholders.date" },
  documentName: { key: "documents:viewer.properties.labels.documentName" },
  documentProperties: { key: "documents:viewer.accessibility.documentProperties" },
  documentType: { key: "documents:viewer.properties.labels.documentType" },
  feature: { key: "documents:viewer.properties.labels.feature" },
  featureTag: { key: "documents:viewer.accessibility.featureTag" },
  featureTagPlaceholder: {
    key: "documents:viewer.properties.placeholders.featureTag",
  },
  newFeatureTag: { key: "documents:viewer.properties.emptyStates.newFeatureTag" },
  notSet: { key: "documents:viewer.properties.states.notSet" },
  relatedDocuments: { key: "documents:viewer.properties.labels.relatedDocuments" },
  rename: { key: "documents:viewer.properties.actions.rename" },
  renaming: { key: "documents:viewer.properties.states.renaming" },
  save: { key: "documents:viewer.properties.actions.save" },
  saving: { key: "documents:viewer.properties.states.saving" },
} as const satisfies Record<string, MessageDescriptor>;

/** One vertical form field: a label stacked above its control. */
function PropField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-fg-1 text-label text-ink-muted">
      <span>{label}</span>
      {children}
    </div>
  );
}

export function PropertiesPopover({
  frontmatterDraft,
  onFrontmatterChange,
  onSaveProperties,
  savingProperties,
  renameDraft,
  onRenameChange,
  onRename,
  renaming,
  renameDisabled,
  corpus,
  selfStem,
}: {
  frontmatterDraft: MarkdownEditorFrontmatterDraft;
  onFrontmatterChange: (patch: Partial<MarkdownEditorFrontmatterDraft>) => void;
  onSaveProperties: () => void;
  savingProperties: boolean;
  renameDraft: string;
  onRenameChange: (value: string) => void;
  onRename: () => void;
  renaming: boolean;
  renameDisabled: boolean;
  corpus: EditorLinkingCorpus;
  selfStem: string;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const message = (descriptor: MessageDescriptor) => resolveMessage(descriptor).message;
  const [open, setOpen] = useState(false);

  const directoryTag = directoryTagOf(frontmatterDraft.tags);
  const documentType = docTypePresentation(directoryTag);
  const currentFeature = featureTagOf(frontmatterDraft.tags);
  const featureOptions: ComboOption[] = corpus.featureTags.map((tag) => ({
    value: tag,
    primary: tag,
  }));

  return (
    <div className="relative" data-properties>
      <span data-properties-trigger>
        <IconButton
          label={message(PROPERTIES_POPOVER_MESSAGES.documentProperties)}
          title={message(PROPERTIES_POPOVER_MESSAGES.documentProperties)}
          active={open}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <SlidersHorizontal size={GLYPH_PX} aria-hidden />
        </IconButton>
      </span>
      {open && (
        <Popover
          open={open}
          onDismiss={() => setOpen(false)}
          ignoreSelector="[data-properties-trigger]"
          role="dialog"
          aria-label={message(PROPERTIES_POPOVER_MESSAGES.documentProperties)}
          className="absolute right-0 top-[calc(100%+0.375rem)] z-40 w-80"
          data-properties-panel
        >
          <Card elevation="overlay" padded>
            <div className="flex flex-col gap-fg-3">
              <PropField label={message(PROPERTIES_POPOVER_MESSAGES.documentName)}>
                <div className="flex items-center gap-fg-2">
                  <input
                    aria-label={message(PROPERTIES_POPOVER_MESSAGES.documentName)}
                    value={renameDraft}
                    onChange={(event) => onRenameChange(event.target.value)}
                    spellCheck={false}
                    className="min-w-0 flex-1 rounded-fg-sm border border-rule bg-paper px-fg-2 py-fg-1 text-body text-ink outline-none focus-visible:border-accent"
                  />
                  <Button
                    variant="ghost"
                    onClick={onRename}
                    disabled={renameDisabled || renaming}
                  >
                    {message(
                      renaming
                        ? PROPERTIES_POPOVER_MESSAGES.renaming
                        : PROPERTIES_POPOVER_MESSAGES.rename,
                    )}
                  </Button>
                </div>
              </PropField>

              <PropertyRow
                label={message(PROPERTIES_POPOVER_MESSAGES.documentType)}
                value={message(
                  documentType?.detailLabel ?? PROPERTIES_POPOVER_MESSAGES.notSet,
                )}
              />

              <Divider />

              <PropField label={message(PROPERTIES_POPOVER_MESSAGES.feature)}>
                <AutocompleteCombobox
                  // Re-seed the field if its value changes while the popover is open.
                  key={currentFeature ?? ""}
                  options={featureOptions}
                  onCommit={(feature) =>
                    onFrontmatterChange({
                      tags: withFeatureTag(frontmatterDraft.tags, feature),
                    })
                  }
                  placeholder={message(
                    PROPERTIES_POPOVER_MESSAGES.featureTagPlaceholder,
                  )}
                  ariaLabel={message(PROPERTIES_POPOVER_MESSAGES.featureTag)}
                  allowFreeText
                  initialQuery={currentFeature ?? ""}
                  emptyLabel={message(PROPERTIES_POPOVER_MESSAGES.newFeatureTag)}
                />
              </PropField>

              <PropField label={message(PROPERTIES_POPOVER_MESSAGES.relatedDocuments)}>
                <RelatedDocPicker
                  related={frontmatterDraft.related}
                  onChange={(related) => onFrontmatterChange({ related })}
                  corpus={corpus.documents}
                  selfStem={selfStem}
                />
              </PropField>

              <PropField label={message(PROPERTIES_POPOVER_MESSAGES.date)}>
                <input
                  aria-label={message(PROPERTIES_POPOVER_MESSAGES.date)}
                  value={frontmatterDraft.date}
                  onChange={(event) =>
                    onFrontmatterChange({ date: event.target.value })
                  }
                  placeholder={message(PROPERTIES_POPOVER_MESSAGES.datePlaceholder)}
                  inputMode="numeric"
                  spellCheck={false}
                  className="rounded-fg-sm border border-rule bg-paper px-fg-2 py-fg-1 text-body text-ink outline-none focus-visible:border-accent"
                />
              </PropField>

              <Button
                variant="secondary"
                onClick={onSaveProperties}
                disabled={savingProperties}
              >
                {message(
                  savingProperties
                    ? PROPERTIES_POPOVER_MESSAGES.saving
                    : PROPERTIES_POPOVER_MESSAGES.save,
                )}
              </Button>
            </div>
          </Card>
        </Popover>
      )}
    </div>
  );
}
