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

import { useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from "react";

import {
  useRenameDoc,
  useSaveBody,
  useSetFrontmatter,
  type ContentView,
} from "../../stores/server/queries";
import { docStemFromNodeId } from "../menus/sharedActions";
import { dispatchOps } from "../../stores/server/opsActions";
import { openContextMenu } from "../../stores/view/contextMenu";
import {
  EDITOR_TOGGLE_MODE_ACTION_ID,
  EDITOR_TOGGLE_MODE_LABEL,
} from "../../stores/view/editorKeybindings";
import { registerKeyAction } from "../../stores/view/keymapDispatcher";
import { useViewStore } from "../../stores/view/viewStore";
import { requestCloseDocumentEditor } from "../../stores/view/unsavedEditGuard";
import {
  applyEditorWriteResult,
  applyRenameEditorResult,
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
  editorStatusHasUnsavedDraft,
  promoteDocTab,
} from "../../stores/view/tabs";
import { Button, type BreadcrumbItem } from "../kit";
import { DocChrome, type DocChromeMode } from "./DocChrome";
import { MarkdownReader } from "./MarkdownReader";

// The directory tags every .vault/ document carries; the OTHER tag is the feature.
const VAULT_DIRECTORY_TAGS = new Set([
  "adr",
  "audit",
  "exec",
  "index",
  "plan",
  "reference",
  "research",
]);

/** The feature tag of a document, derived from its frontmatter tags (the one tag
 *  that is not a directory tag), or null when none is present. Used to scope the
 *  conformance autofix. */
export function featureFromDocTags(tags: string): string | null {
  if (typeof tags !== "string") return null;
  for (const raw of tags.split(/[,\s]+/)) {
    const tag = raw.replace(/^#/, "").trim();
    if (tag.length > 0 && !VAULT_DIRECTORY_TAGS.has(tag)) return tag;
  }
  return null;
}

export function MarkdownDocView({
  nodeId,
  content,
  scope,
  trail,
}: {
  nodeId: string;
  content: ContentView;
  scope: string | null;
  /** The path trail for the chrome breadcrumb (built by the host from the
   *  preserved stores header model). */
  trail: BreadcrumbItem[];
}) {
  // Memoize on the now-stable ContentView (useContentView memoizes its result) so
  // `documentEditor.properties` is a referentially-stable object — it is passed into
  // useMarkdownEditorChromeView as a seed-effect dependency, and a fresh object every
  // render would re-fire that effect each render (stable-selector discipline).
  const documentEditor = useMemo(
    () => deriveMarkdownEditorDocumentView(content),
    [content],
  );
  const editor = useDocumentEditorView(nodeId);
  const editorChrome = useMarkdownEditorChromeView(nodeId, documentEditor.properties);

  const saveBody = useSaveBody();
  const setFrontmatter = useSetFrontmatter();
  const renameDoc = useRenameDoc();

  const renameNow = () => {
    const to = editorChrome.renameTarget;
    if (to === null) return;
    // Capture the unsaved-draft flag BEFORE markEditorSaving() flips the status to
    // "saving": the rename re-key must restore "dirty" so the unsaved-edit guard keeps
    // protecting the draft, and the rename re-seed cannot re-derive it (the status is
    // already "saving" by the time the mutation resolves). Thread it through.
    const hadUnsavedDraft = editorStatusHasUnsavedDraft(
      useViewStore.getState().editorStatus,
    );
    markEditorSaving();
    renameDoc.mutate(
      { nodeId, scope: scope ?? undefined, to, expectedBlobHash: editor.baseBlobHash },
      {
        onSuccess: ({ result }) => {
          if (result.kind === "renamed") {
            void applyRenamedMarkdownDocWorkspace(
              result,
              editor.draftText,
              scope,
              hadUnsavedDraft,
            );
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

  const onModeChange = (next: DocChromeMode) => {
    if (next === "edit") {
      if (!editor.isEditing && documentEditor.canEdit) enterEdit();
    } else if (editor.isEditing) {
      requestCloseDocumentEditor();
    }
  };

  // Mod+E toggles edit mode (#16). The live toggle closure is held in a ref so the
  // registered key-action thunk reads it without re-registering on every keystroke
  // (the loop-safe ref pattern). The catalog DEF lives in editorKeybindings; this
  // registers the per-doc thunk. With several doc panels mounted, the last-mounted
  // owns the chord — so the close decision reads the GLOBAL editor target (not this
  // panel's local isEditing): any panel's chord closes the one open editor rather
  // than a non-target panel opening ITSELF (the multi-panel-toggle bug). When no
  // editor is open, this panel enters edit on itself.
  const toggleModeRef = useRef<() => void>(() => undefined);
  toggleModeRef.current = () => {
    if (useViewStore.getState().editorTarget !== null) {
      // An editor is open (possibly a DIFFERENT panel) — close it directly rather
      // than through onModeChange, whose close branch guards on THIS panel's local
      // isEditing and would no-op for a non-target panel.
      requestCloseDocumentEditor();
    } else if (documentEditor.canEdit) {
      enterEdit();
    }
  };
  useEffect(() => {
    return registerKeyAction(EDITOR_TOGGLE_MODE_ACTION_ID, () => ({
      id: EDITOR_TOGGLE_MODE_ACTION_ID,
      label: EDITOR_TOGGLE_MODE_LABEL,
      run: () => toggleModeRef.current(),
    }));
  }, []);

  // Right-click anywhere on the open document opens the SAME vault-doc menu the
  // tree row offers (focus / reveal / open-in-editor / copy / relate / new) — the
  // open document IS a vault-doc. Needs the served path for the entity, so it is a
  // no-op (native menu) until the content carries one. A plain event handler, never
  // a selector, so it is safe in this loop-sensitive component.
  const onDocContextMenu = (event: ReactMouseEvent) => {
    const stem = docStemFromNodeId(nodeId);
    if (stem === null || content.path === undefined) return;
    event.preventDefault();
    openContextMenu(
      { kind: "vault-doc", id: nodeId, scope, path: content.path, stem, nodeId },
      { x: event.clientX, y: event.clientY },
    );
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
      <div className="flex h-full flex-col bg-paper" onContextMenu={onDocContextMenu}>
        <DocChrome
          trail={trail}
          mode="view"
          onModeChange={onModeChange}
          canEdit={documentEditor.canEdit}
        />
        <div className="min-h-0 flex-1">
          <MarkdownReader content={content} scope={scope} nodeId={nodeId} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-paper">
      <DocChrome
        trail={trail}
        mode="edit"
        onModeChange={onModeChange}
        canEdit={documentEditor.canEdit}
      />
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
          <Button variant="ghost" onClick={requestCloseDocumentEditor}>
            Done
          </Button>
        </div>
      </div>
      {editorChrome.hasAdvisories && (
        <div
          className="border-b border-rule bg-paper-sunken px-fg-3 py-fg-2"
          aria-label={editorChrome.advisoriesLabel}
        >
          <div className="flex items-center justify-between gap-fg-2">
            <span className="text-label text-ink-muted">
              {editorChrome.advisoriesLabel}
            </span>
            {/* Fix conformance for this document's feature (vault check all --fix
                --feature), routed through the ops dispatch seam. Feature-scoped (the
                sibling's only fix grain); the watcher re-ingests the fixed docs. */}
            {(() => {
              const feature = featureFromDocTags(editorChrome.frontmatterDraft.tags);
              return (
                <Button
                  variant="ghost"
                  disabled={feature === null}
                  title={
                    feature === null
                      ? "no feature tag to scope the fix"
                      : `Fix conformance for #${feature}`
                  }
                  onClick={() => {
                    if (feature === null) return;
                    void dispatchOps({
                      target: "core",
                      verb: "autofix",
                      mode: "autofix",
                      body: { scope: scope ?? undefined, feature },
                    }).catch(() => undefined);
                  }}
                >
                  Fix conformance
                </Button>
              );
            })()}
          </div>
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
