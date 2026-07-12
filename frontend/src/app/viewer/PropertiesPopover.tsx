// PropertiesPopover — the document editor's on-demand metadata surface
// (document-editor-redesign ADR). It replaces the permanent 256px properties column
// that squeezed the writing area: closed by default, it opens from a single
// Properties button in the editor action bar into a VERTICAL stacked form floating
// over the full-width body (kit Popover — Escape / outside-pointer dismiss for free).
//
// The form edits this document's frontmatter only (feature tag, related links, date)
// plus its name (rename); it is NOT a corpus filter (filtering-has-one-surface). The
// feature and related controls link against the LIVE corpus so a value can only ever
// name something that exists. Presentational: the parent owns the drafts and the
// save/rename mutations; this composes kit atoms and the shared pickers.

import type { ReactNode } from "react";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button, Card, Divider, IconButton, Popover, PropertyRow } from "../kit";
import type { EditorLinkingCorpus } from "../../stores/server/queries";
import type { MarkdownEditorFrontmatterDraft } from "../../stores/view/editor";
import { AutocompleteCombobox, type ComboOption } from "./AutocompleteCombobox";
import { RelatedDocPicker } from "./RelatedDocPicker";
import { directoryTagOf, featureTagOf, withFeatureTag } from "./editorTags";

const GLYPH_PX = 16;

/** One vertical form field: a label stacked above its control. */
function PropField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-fg-1 text-label text-ink-muted">
      {label}
      {children}
    </label>
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
  const [open, setOpen] = useState(false);

  const directoryTag = directoryTagOf(frontmatterDraft.tags);
  const currentFeature = featureTagOf(frontmatterDraft.tags);
  const featureOptions: ComboOption[] = corpus.featureTags.map((tag) => ({
    value: tag,
    primary: tag,
  }));

  return (
    <div className="relative" data-properties>
      <span data-properties-trigger>
        <IconButton
          label="Document properties"
          title="Document properties"
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
          aria-label="Document properties"
          className="absolute right-0 top-[calc(100%+0.375rem)] z-40 w-80"
          data-properties-panel
        >
          <Card elevation="overlay" padded>
            <div className="flex flex-col gap-fg-3">
              <PropField label="Name">
                <div className="flex items-center gap-fg-2">
                  <input
                    value={renameDraft}
                    onChange={(event) => onRenameChange(event.target.value)}
                    spellCheck={false}
                    aria-label="document name"
                    className="min-w-0 flex-1 rounded-fg-sm border border-rule bg-paper px-fg-2 py-fg-1 text-body text-ink outline-none focus-visible:border-accent"
                  />
                  <Button
                    variant="ghost"
                    onClick={onRename}
                    disabled={renameDisabled || renaming}
                  >
                    Rename
                  </Button>
                </div>
              </PropField>

              <PropertyRow
                label="Type"
                value={directoryTag ? `#${directoryTag}` : "—"}
              />

              <Divider />

              <PropField label="Feature">
                <AutocompleteCombobox
                  // Re-seed the single-select field if the feature changes out from
                  // under an open popover (e.g. a mid-session autofix) so its shown
                  // value never goes stale.
                  key={currentFeature ?? ""}
                  options={featureOptions}
                  onCommit={(feature) =>
                    onFrontmatterChange({
                      tags: withFeatureTag(frontmatterDraft.tags, feature),
                    })
                  }
                  placeholder="Set feature tag…"
                  ariaLabel="set the document feature tag"
                  allowFreeText
                  initialQuery={currentFeature ?? ""}
                  emptyLabel="Type to create a new feature tag"
                />
              </PropField>

              <PropField label="Related">
                <RelatedDocPicker
                  related={frontmatterDraft.related}
                  onChange={(related) => onFrontmatterChange({ related })}
                  corpus={corpus.documents}
                  selfStem={selfStem}
                />
              </PropField>

              <PropField label="Date">
                <input
                  value={frontmatterDraft.date}
                  onChange={(event) =>
                    onFrontmatterChange({ date: event.target.value })
                  }
                  placeholder="YYYY-MM-DD"
                  inputMode="numeric"
                  spellCheck={false}
                  aria-label="document date"
                  className="rounded-fg-sm border border-rule bg-paper px-fg-2 py-fg-1 text-body text-ink outline-none focus-visible:border-accent"
                />
              </PropField>

              <Button
                variant="secondary"
                onClick={onSaveProperties}
                disabled={savingProperties}
              >
                Save properties
              </Button>
            </div>
          </Card>
        </Popover>
      )}
    </div>
  );
}
