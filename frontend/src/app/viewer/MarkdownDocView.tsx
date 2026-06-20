// The markdown document view with read + edit modes (editor-dock-workspace P05).
// View mode renders the read-only `MarkdownReader`; edit mode mounts the existing
// (document-editor backend) bounded editor slice as a raw-markdown body editor
// plus a PROPERTIES card for `tags / date / related`, saving through the core
// write verbs (`set-body` / `set-frontmatter` / `rename`) over the core ops route.
// Only markdown documents are editable; the code viewer stays read-only.
//
// The editor slice is single (one open editor at a time, bounded-by-default): a
// markdown panel is editable when it IS the editor target, and entering edit mode
// seeds the slice from this panel's read. Layer law: this is dumb `app/` chrome —
// it fetches nothing (the content query + the write mutations are the sole wire
// clients) and reads the tiers-derived `ContentView`, never raw `tiers`.

import {
  useRenameDoc,
  useSaveBody,
  useSetFrontmatter,
  type ContentView,
} from "../../stores/server/queries";
import {
  applyEditorWriteResult,
  applyRenameEditorResult,
  closeDocumentEditor,
  deriveMarkdownEditorFrontmatterPatch,
  deriveMarkdownEditorDocumentView,
  markEditorFailed,
  markEditorSaving,
  openDocumentEditor,
  setMarkdownEditorFrontmatterDraft,
  setMarkdownEditorRenameDraft,
  updateEditorDraft,
  useDocumentEditorView,
  useMarkdownEditorChromeView,
  type MarkdownEditorFrontmatterDraft,
} from "../../stores/view/editor";
import {
  applyRenamedMarkdownDocWorkspace,
  promoteDocTab,
} from "../../stores/view/tabs";
import { Button } from "../kit";
import { MarkdownReader } from "./MarkdownReader";

export function MarkdownDocView({
  nodeId,
  content,
  scope,
}: {
  nodeId: string;
  content: ContentView;
  scope: string | null;
}) {
  const documentEditor = deriveMarkdownEditorDocumentView(content);
  const editor = useDocumentEditorView(nodeId);
  const editorChrome = useMarkdownEditorChromeView(nodeId, documentEditor.properties);

  const saveBody = useSaveBody();
  const setFrontmatter = useSetFrontmatter();
  const renameDoc = useRenameDoc();

  const renameNow = () => {
    const to = editorChrome.renameTarget;
    if (to === null) return;
    markEditorSaving();
    renameDoc.mutate(
      { nodeId, scope: scope ?? undefined, to, expectedBlobHash: editor.baseBlobHash },
      {
        onSuccess: ({ result }) => {
          if (result.kind === "renamed") {
            void applyRenamedMarkdownDocWorkspace(result, editor.draftText, scope);
          } else {
            applyRenameEditorResult(result);
          }
        },
        onError: () => markEditorFailed(),
      },
    );
  };

  const enterEdit = () => {
    openDocumentEditor(
      nodeId,
      documentEditor.initialText,
      documentEditor.initialBlobHash,
    );
    // An explicit edit promotes a provisional (preview) tab to a permanent one.
    promoteDocTab(nodeId);
  };

  const saveBodyNow = () => {
    markEditorSaving();
    saveBody.mutate(
      { nodeId, scope, text: editor.draftText, baseBlobHash: editor.baseBlobHash },
      {
        onSuccess: ({ result }) => {
          applyEditorWriteResult(result);
        },
        onError: () => markEditorFailed(),
      },
    );
  };

  if (!editor.isEditing) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-end gap-fg-2 border-b border-rule px-fg-3 py-fg-1">
          <Button
            variant="ghost"
            onClick={enterEdit}
            disabled={!documentEditor.canEdit}
          >
            Edit
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <MarkdownReader content={content} scope={scope} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-fg-2 border-b border-rule px-fg-3 py-fg-1">
        <span className={`text-label ${editor.statusToneClass}`}>
          {editor.statusLabel}
        </span>
        <div className="flex items-center gap-fg-2">
          <input
            className="w-48 rounded-fg-1 border border-rule bg-paper px-fg-2 py-px text-label text-ink outline-none focus:border-accent"
            value={editorChrome.renameDraft}
            onChange={(event) => setMarkdownEditorRenameDraft(event.target.value)}
            spellCheck={false}
            aria-label="document name (rename)"
          />
          <Button
            variant="ghost"
            onClick={renameNow}
            disabled={renameDoc.isPending || editorChrome.renameTarget === null}
          >
            Rename
          </Button>
          <Button
            variant="primary"
            onClick={saveBodyNow}
            disabled={!editor.canSave || saveBody.isPending}
          >
            Save
          </Button>
          <Button variant="ghost" onClick={closeDocumentEditor}>
            Done
          </Button>
        </div>
      </div>
      {editorChrome.hasAdvisories && (
        <div
          className="border-b border-rule bg-paper-sunken px-fg-3 py-fg-2"
          aria-label={editorChrome.advisoriesLabel}
        >
          <span className="text-label text-ink-muted">
            {editorChrome.advisoriesLabel}
          </span>
          <ul className="mt-fg-1 flex flex-col gap-px">
            {editorChrome.advisoryRows.map((row) => (
              <li key={row.key} className={`text-label ${row.toneClass}`}>
                {row.marker} {row.message}
                {row.fixableSuffix}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <textarea
          className="min-h-0 flex-1 resize-none border-none bg-paper px-fg-6 py-fg-3 font-mono text-body leading-relaxed text-ink outline-none"
          value={editor.draftText}
          onChange={(event) => updateEditorDraft(event.target.value)}
          spellCheck={false}
          aria-label="document body editor"
        />
        <PropertiesCard
          draft={editorChrome.frontmatterDraft}
          onDraftChange={setMarkdownEditorFrontmatterDraft}
          onSave={() => {
            markEditorSaving();
            const fields = deriveMarkdownEditorFrontmatterPatch(
              editorChrome.frontmatterDraft,
            );
            setFrontmatter.mutate(
              { nodeId, scope, baseBlobHash: editor.baseBlobHash, ...fields },
              {
                onSuccess: ({ result }) => {
                  applyEditorWriteResult(result);
                },
                onError: () => markEditorFailed(),
              },
            );
          }}
          saving={setFrontmatter.isPending}
        />
      </div>
    </div>
  );
}

/** The frontmatter PROPERTIES card: edit tags / date / related, saved atomically
 *  through `set-frontmatter` (the engine validates and refuses a non-conformant
 *  write, surfaced through the editor status). Seeded from the read's header. */
function PropertiesCard({
  draft,
  onDraftChange,
  onSave,
  saving,
}: {
  draft: MarkdownEditorFrontmatterDraft;
  onDraftChange: (draft: Partial<MarkdownEditorFrontmatterDraft>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <form
      className="flex w-64 shrink-0 flex-col gap-fg-3 overflow-y-auto border-l border-rule bg-paper-sunken px-fg-3 py-fg-3"
      aria-label="document properties"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <Field
        label="Tags"
        name="tags"
        value={draft.tags}
        placeholder="#tag, #tag"
        onChange={(value) => onDraftChange({ tags: value })}
      />
      <Field
        label="Date"
        name="date"
        value={draft.date}
        placeholder="YYYY-MM-DD"
        onChange={(value) => onDraftChange({ date: value })}
      />
      <Field
        label="Related"
        name="related"
        value={draft.related}
        placeholder="stem, stem"
        onChange={(value) => onDraftChange({ related: value })}
      />
      <Button type="submit" variant="secondary" disabled={saving}>
        Save properties
      </Button>
    </form>
  );
}

function Field({
  label,
  name,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-fg-1 text-label text-ink-muted">
      {label}
      <input
        name={name}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-fg-sm border border-rule bg-paper px-fg-2 py-fg-1 text-body text-ink outline-none focus-visible:border-accent"
      />
    </label>
  );
}
