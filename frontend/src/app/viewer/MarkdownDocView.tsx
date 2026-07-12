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
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  useEditorLinkingCorpus,
  useRenameDoc,
  useSaveBody,
  useSetFrontmatter,
  type ContentView,
} from "../../stores/server/queries";
import { useEnsureCurrentEditorIdentity } from "../../stores/server/authoring";
import { docStemFromNodeId } from "../menus/sharedActions";
import { RowMenuDisclosure } from "../chrome/RowMenuDisclosure";
import { dispatchOps } from "../../stores/server/opsActions";
import { openContextMenu } from "../../stores/view/contextMenu";
import { guardedContextMenu } from "../menus/guardedContextMenu";
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
} from "../../stores/view/editor";
import {
  applyRenamedMarkdownDocWorkspace,
  editorStatusHasUnsavedDraft,
  promoteDocTab,
} from "../../stores/view/tabs";
import { Button, Divider, type BreadcrumbItem } from "../kit";
import { DocChrome, type DocChromeMode } from "./DocChrome";
import { EditorToolbar } from "./EditorToolbar";
import { HighlightedTextarea } from "./HighlightedCode";
import { featureTagOf } from "./editorTags";
import { applyMarkdownFormat, type MarkdownFormatCommand } from "./markdownFormatting";
import { MarkdownReader } from "./MarkdownReader";
import { PropertiesPopover } from "./PropertiesPopover";

/** The feature tag of a document, derived from its frontmatter tags (the one tag
 *  that is not a directory tag), or null when none is present. Used to scope the
 *  conformance autofix. Re-exported from the centralized tag helpers so the
 *  autofix derivation and the Feature control share one source of truth. */
export const featureFromDocTags = featureTagOf;

// Formatting is a TOOLBAR-only command surface (document-editor-redesign ADR):
// there are deliberately no bespoke Mod+key formatting accelerators on the editor
// textarea. A selection-applying command needs the focused textarea a global keymap
// thunk cannot reach, and the obvious chords collide with existing Class-A global
// bindings (Mod+K = command palette, Mod+B = left-rail toggle). Enrolling them would
// either grow a private keydown that swallows those global commands (the exact
// failure actions-keymap-palette forbids) or add palette commands that do nothing
// without a focused editor. Save remains the one editor keymap-registry binding.

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
  // A fresh editing session mints the shared human actor token before any
  // ledgered edit can fire (ledgered-edit-migration ADR, W01.P01): the Save/
  // frontmatter dispatch itself stays on the legacy write path until W01.P02
  // rewires it, but the identity bootstrap starts here so it is already resolved
  // by the time that cutover lands.
  useEnsureCurrentEditorIdentity(editor.isEditing);

  const saveBody = useSaveBody();
  const setFrontmatter = useSetFrontmatter();
  const renameDoc = useRenameDoc();

  // The pickable corpus for the Feature / Related linking pickers (stores selector;
  // this component fetches nothing — dashboard-layer-ownership).
  const corpus = useEditorLinkingCorpus(scope);
  const selfStem = docStemFromNodeId(nodeId) ?? "";

  // Formatting wiring: the toolbar reads the textarea selection, applies a pure
  // transform, and feeds the result back through `updateEditorDraft`. The caret
  // range to restore is stashed in a ref and applied after the draft re-render (a
  // layout effect, so it runs before paint and is deterministic under test).
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelectionRef = useRef<[number, number] | null>(null);

  const applyFormat = (command: MarkdownFormatCommand) => {
    const el = textareaRef.current;
    if (!el) return;
    const result = applyMarkdownFormat(command, {
      text: editor.draftText,
      selStart: el.selectionStart,
      selEnd: el.selectionEnd,
    });
    pendingSelectionRef.current = [result.selStart, result.selEnd];
    updateEditorDraft(result.text);
  };

  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current;
    const el = textareaRef.current;
    if (pending && el) {
      el.focus();
      el.setSelectionRange(pending[0], pending[1]);
      pendingSelectionRef.current = null;
    }
  }, [editor.draftText]);

  const saveFrontmatterNow = () => {
    markEditorSaving();
    const fields = deriveMarkdownEditorFrontmatterPatch(editorChrome.frontmatterDraft);
    setFrontmatter.mutate(
      { nodeId, scope, baseBlobHash: editor.baseBlobHash, ...fields },
      {
        onSuccess: ({ result }) => applyEditorWriteResult(result),
        onError: () => markEditorFailed(),
      },
    );
  };

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
  const onDocContextMenu = guardedContextMenu((event: ReactMouseEvent) => {
    const stem = docStemFromNodeId(nodeId);
    if (stem === null || content.path === undefined) return;
    event.preventDefault();
    openContextMenu(
      { kind: "vault-doc", id: nodeId, scope, path: content.path, stem, nodeId },
      { x: event.clientX, y: event.clientY },
    );
  });

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

  // The coarse-pointer menu entry (touch-selectability ADR D3): the same
  // vault-doc entity the right-click path opens, surfaced as a deliberate tap
  // target because long-press stays the platform selection gesture.
  const docMenuStem = docStemFromNodeId(nodeId);
  const docMenuEntity =
    docMenuStem !== null && content.path !== undefined
      ? { kind: "vault-doc", id: nodeId, scope, path: content.path, stem: docMenuStem, nodeId }
      : null;

  if (!editor.isEditing) {
    return (
      <div className="flex h-full flex-col bg-paper" onContextMenu={onDocContextMenu}>
        <DocChrome
          trail={trail}
          mode="view"
          onModeChange={onModeChange}
          canEdit={documentEditor.canEdit}
          trailing={
            docMenuEntity && (
              <RowMenuDisclosure entity={docMenuEntity} label="Document actions" />
            )
          }
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
      <div className="flex items-center justify-between gap-fg-3 border-b border-rule px-fg-3 py-fg-1">
        <span className={`shrink-0 text-label ${editor.statusToneClass}`}>
          {editor.statusLabel}
        </span>
        <div className="flex items-center gap-fg-2">
          <EditorToolbar onCommand={applyFormat} />
          <Divider orientation="vertical" className="self-stretch" />
          <PropertiesPopover
            frontmatterDraft={editorChrome.frontmatterDraft}
            onFrontmatterChange={setMarkdownEditorFrontmatterDraft}
            onSaveProperties={saveFrontmatterNow}
            savingProperties={setFrontmatter.isPending}
            renameDraft={editorChrome.renameDraft}
            onRenameChange={setMarkdownEditorRenameDraft}
            onRename={renameNow}
            renaming={renameDoc.isPending}
            renameDisabled={editorChrome.renameTarget === null}
            corpus={corpus}
            selfStem={selfStem}
          />
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
                sibling's only fix grain); the watcher re-ingests the fixed docs.
                DELIBERATELY out-of-ledger (ledgered-edit-migration ADR): a bulk
                repair over every document under the feature has no single target,
                so it does not fit the per-document V1 changeset shape — stays on
                `/ops/core/autofix`, a vault-maintenance action, not a document
                edit, even though it renders inside the editor's advisories bar.
                The visible label names the feature (not just the tooltip),
                mirroring `autofixFeatureAction`'s context-menu phrasing so the
                same maintenance action reads consistently everywhere it appears. */}
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
                  {feature === null
                    ? "Fix conformance"
                    : `Fix “${feature}” conformance`}
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
      {/* Flex container so the HighlightedTextarea (flex-1 / min-h-0) stretches to
          fill the body height; a plain block wrapper collapses it to zero height and
          the syntax-highlight layer has nowhere to paint. */}
      <div className="flex min-h-0 flex-1">
        <HighlightedTextarea
          value={editor.draftText}
          languageHint="markdown"
          onChange={updateEditorDraft}
          ariaLabel="document body editor"
          inputRef={textareaRef}
        />
      </div>
    </div>
  );
}
