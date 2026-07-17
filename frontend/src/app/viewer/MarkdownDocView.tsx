import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { GitCompare } from "lucide-react";

import {
  useActiveLocale,
  useLocalizedMessageResolver,
} from "../../platform/localization/LocalizationProvider";
import { authoredDisplayText } from "../../platform/localization/displayText";

import {
  useCreateComment,
  useDeleteComment,
  useDocumentComments,
  useEditComment,
  useEditorLinkingCorpus,
  useReanchorComment,
  useRenameDoc,
  useSaveBody,
  useSetCommentResolved,
  useSetFrontmatter,
  type ContentView,
} from "../../stores/server/queries";
import { useEnsureCurrentEditorIdentity } from "../../stores/server/authoring";
import type { SectionSelector, ServedComment } from "../../stores/server/authoring";
import type { ReaderCommentSource } from "./readerComments";

/** A stable empty listing so an unresolved comment query does not mint a fresh
 *  array each render (which would churn the memoized comment plane). */
const NO_COMMENTS: ServedComment[] = [];
import { docStemFromNodeId } from "../menus/sharedActions";
import { RowMenuDisclosure } from "../chrome/RowMenuDisclosure";
import { dispatchOps } from "../../stores/server/opsActions";
import { openContextMenu } from "../../stores/view/contextMenu";
import { guardedContextMenu } from "../menus/guardedContextMenu";
import {
  EDITOR_CLOSE_LABEL,
  EDITOR_SAVE_LABEL,
  EDITOR_TOGGLE_DIFF_LABEL,
  EDITOR_TOGGLE_MODE_ACTION_ID,
  switchReadingAndEditingAction,
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
  toggleEditorDiff,
  updateEditorDraft,
  useDocumentEditorView,
  useMarkdownEditorChromeView,
} from "../../stores/view/editor";
import {
  applyRenamedMarkdownDocWorkspace,
  editorStatusHasUnsavedDraft,
  promoteDocTab,
} from "../../stores/view/tabs";
import { DiffView } from "../authoring/DiffView";
import {
  Button,
  DecorativeGlyph,
  Divider,
  IconButton,
  type BreadcrumbItem,
} from "../kit";
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

/** Debounces the proposed text fed to DiffView so per-keystroke O(n·m)
 *  line-LCS is bounded. Flushes immediately when the diff panel first opens
 *  (visible: false → true) so the leading render is instant; subsequent draft
 *  changes trail by delayMs. Panel-closed transitions skip the timeout entirely. */
function useDebouncedDraftText(
  draft: string,
  delayMs: number,
  visible: boolean,
): string {
  const [debounced, setDebounced] = useState(draft);
  const prevVisibleRef = useRef(visible);

  useEffect(() => {
    const prevVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;

    if (visible && !prevVisible) {
      // Panel just opened: flush instantly so the first diff render is immediate.
      setDebounced(draft);
      return;
    }

    if (!visible) return;

    // Panel open, draft changed: trail by delayMs to bound keystroke LCS cost.
    const id = setTimeout(() => setDebounced(draft), delayMs);
    return () => clearTimeout(id);
  }, [draft, visible, delayMs]);

  return debounced;
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
  const resolveMessage = useLocalizedMessageResolver();
  const toggleChangesLabel = resolveMessage(EDITOR_TOGGLE_DIFF_LABEL).message;
  const saveLabel = resolveMessage(EDITOR_SAVE_LABEL);
  const closeLabel = resolveMessage(EDITOR_CLOSE_LABEL);
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
  // Debounce the proposed side of the diff (authoring-surface ADR D4 ceiling closure):
  // per-keystroke O(n·m) line-LCS is bounded to ~250ms trailing; the leading open
  // flush ensures the first diff render is instant. Textarea stays fully live.
  const debouncedDraft = useDebouncedDraftText(
    editor.draftText,
    250,
    editor.diffVisible,
  );
  // A fresh editing session mints the shared human actor token before any
  // ledgered edit can fire (ledgered-edit-migration ADR, W01.P01): the Save/
  // frontmatter dispatch itself stays on the legacy write path until W01.P02
  // rewires it, but the identity bootstrap starts here so it is already resolved
  // by the time that cutover lands.
  // Bootstrap the shared editor actor eagerly while editing; the comment plane
  // bootstraps it lazily (on first thread open) in view mode via `ensureActor`.
  const editorIdentity = useEnsureCurrentEditorIdentity(editor.isEditing);

  const saveBody = useSaveBody();
  const setFrontmatter = useSetFrontmatter();
  const renameDoc = useRenameDoc();

  // Section comments (authoring-surface ADR D2): this smart parent is the sole wire
  // client for the comment read + mutations; the reader is dumb chrome that renders
  // the plane and emits intent. The read is mount-gated on the open document.
  const commentsQuery = useDocumentComments(nodeId, scope);
  const createComment = useCreateComment();
  const editComment = useEditComment();
  const setCommentResolved = useSetCommentResolved();
  const reanchorComment = useReanchorComment();
  const deleteComment = useDeleteComment();

  // A ref-stable `ensureActor` so the memoized plane is not invalidated by the
  // per-render identity of the bootstrap callback (it closes over an unstable
  // mutation object). The mutation `mutateAsync` fns are already react-query-stable.
  const bootstrapRef = useRef(editorIdentity.bootstrap);
  bootstrapRef.current = editorIdentity.bootstrap;
  const ensureActorRef = useRef(() => bootstrapRef.current());

  const comments = commentsQuery.data?.comments ?? NO_COMMENTS;
  const createCommentAsync = createComment.mutateAsync;
  const editCommentAsync = editComment.mutateAsync;
  const setCommentResolvedAsync = setCommentResolved.mutateAsync;
  const reanchorCommentAsync = reanchorComment.mutateAsync;
  const deleteCommentAsync = deleteComment.mutateAsync;

  const commentSource = useMemo<ReaderCommentSource>(
    () => ({
      comments,
      docStem: docStemFromNodeId(nodeId),
      sourceRevision: content.blobHash ?? null,
      actorReady: editorIdentity.hasToken,
      actorBootstrapping: editorIdentity.bootstrapping,
      ensureActor: ensureActorRef.current,
      createComment: async (selector: SectionSelector, body: string) => {
        await createCommentAsync({ scope, nodeId, selector, body });
      },
      editComment: async (commentId: string, body: string) => {
        await editCommentAsync({ scope, nodeId, commentId, body });
      },
      setResolved: async (commentId: string, resolved: boolean) => {
        await setCommentResolvedAsync({ scope, nodeId, commentId, resolved });
      },
      reanchorComment: async (commentId: string, selector: SectionSelector) => {
        await reanchorCommentAsync({ scope, nodeId, commentId, selector });
      },
      deleteComment: async (commentId: string) => {
        await deleteCommentAsync({ scope, nodeId, commentId });
      },
    }),
    [
      comments,
      content.blobHash,
      editorIdentity.hasToken,
      editorIdentity.bootstrapping,
      scope,
      nodeId,
      createCommentAsync,
      editCommentAsync,
      setCommentResolvedAsync,
      reanchorCommentAsync,
      deleteCommentAsync,
    ],
  );

  // The pickable corpus for the Feature / Related linking pickers (stores selector;
  // this component fetches nothing — dashboard-layer-ownership).
  const locale = useActiveLocale();
  const corpus = useEditorLinkingCorpus(scope, locale);
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
    const result = applyMarkdownFormat(
      command,
      {
        text: editor.draftText,
        selStart: el.selectionStart,
        selEnd: el.selectionEnd,
      },
      {
        bold: resolveMessage({
          key: "documents:localizationWave.formatting.boldPlaceholder",
        }).message,
        italic: resolveMessage({
          key: "documents:localizationWave.formatting.italicPlaceholder",
        }).message,
        code: resolveMessage({
          key: "documents:localizationWave.formatting.codePlaceholder",
        }).message,
        document: resolveMessage({
          key: "documents:localizationWave.formatting.documentPlaceholder",
        }).message,
        linkText: resolveMessage({
          key: "documents:localizationWave.formatting.linkTextPlaceholder",
        }).message,
        linkUrl: resolveMessage({
          key: "documents:localizationWave.formatting.linkUrlPlaceholder",
        }).message,
      },
    );
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
    // Capture editorBaseText before the mutation so the resolve closure can keep it
    // unchanged (frontmatter saves do not alter the body diff base).
    const baseTextSnapshot = useViewStore.getState().editorBaseText;
    markEditorSaving();
    const fields = deriveMarkdownEditorFrontmatterPatch(editorChrome.frontmatterDraft);
    setFrontmatter.mutate(
      // The tab's pinned editor scope is the single save source (per-tab-scope-binding).
      { nodeId, scope: editor.scope, baseBlobHash: editor.baseBlobHash, ...fields },
      {
        onSuccess: ({ result }) => applyEditorWriteResult(result, baseTextSnapshot),
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
      {
        nodeId,
        scope: editor.scope ?? undefined,
        to,
        expectedBlobHash: editor.baseBlobHash,
      },
      {
        onSuccess: ({ result }) => {
          if (result.kind === "renamed") {
            void applyRenamedMarkdownDocWorkspace(
              result,
              editor.draftText,
              editor.scope,
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
      // Pin THIS tab's scope onto the editor target so every save (panel + Mod+S)
      // writes to the corpus the tab was opened in (per-tab-scope-binding).
      scope,
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
    return registerKeyAction(EDITOR_TOGGLE_MODE_ACTION_ID, () =>
      switchReadingAndEditingAction(() => toggleModeRef.current()),
    );
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
    // Capture the draft at mutation time (not the render closure snapshot) so the
    // resolve closure can advance editorBaseText to what was actually committed.
    const savedText = useViewStore.getState().draftText;
    markEditorSaving();
    saveBody.mutate(
      {
        nodeId,
        scope: editor.scope,
        text: savedText,
        baseBlobHash: editor.baseBlobHash,
      },
      {
        onSuccess: ({ result }) => {
          applyEditorWriteResult(result, savedText);
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
      ? {
          kind: "vault-doc",
          id: nodeId,
          scope,
          path: content.path,
          stem: docMenuStem,
          nodeId,
        }
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
              <RowMenuDisclosure
                entity={docMenuEntity}
                label={
                  resolveMessage({
                    key: "documents:localizationWave.accessibility.documentActions",
                  }).message
                }
              />
            )
          }
        />
        <div className="min-h-0 flex-1">
          <MarkdownReader
            content={content}
            scope={scope}
            nodeId={nodeId}
            commentSource={commentSource}
          />
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
      <div className="flex flex-wrap items-center justify-between gap-fg-2 border-b border-rule px-fg-3 py-fg-1">
        <span className={`shrink-0 text-label ${editor.statusToneClass}`}>
          {resolveMessage(editor.statusLabel).message}
        </span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-fg-2">
          <div className="min-w-0 overflow-x-auto" data-editor-toolbar-scroll-region>
            <EditorToolbar onCommand={applyFormat} />
          </div>
          {/* Toggle diff (authoring-surface ADR D4): compare draft against the
              saved text captured at open. Chord Mod+Alt+G; shared id
              `editor:toggle-diff` across toolbar, keymap, and palette. */}
          <IconButton
            label={toggleChangesLabel}
            title={toggleChangesLabel}
            active={editor.diffVisible}
            data-editor-diff-toggle
            onClick={toggleEditorDiff}
          >
            <GitCompare size={16} aria-hidden />
          </IconButton>
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
          {!saveLabel.usedFallback && (
            <Button
              variant="primary"
              onClick={saveBodyNow}
              disabled={!editor.canSave || saveBody.isPending}
            >
              {saveLabel.message}
            </Button>
          )}
          {!closeLabel.usedFallback && (
            <Button variant="ghost" onClick={requestCloseDocumentEditor}>
              {closeLabel.message}
            </Button>
          )}
        </div>
      </div>
      {editorChrome.hasAdvisories && (
        <div
          className="border-b border-rule bg-paper-sunken px-fg-3 py-fg-2"
          aria-label={resolveMessage(editorChrome.advisoriesLabel).message}
        >
          <div className="flex items-center justify-between gap-fg-2">
            <span className="text-label text-ink-muted">
              {resolveMessage(editorChrome.advisoriesLabel).message}
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
                      ? resolveMessage({
                          key: "documents:localizationWave.disabledReasons.noFeatureForFix",
                        }).message
                      : resolveMessage({
                          key: "documents:localizationWave.actions.fixFeatureConformance",
                          values: { feature: authoredDisplayText(feature) },
                        }).message
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
                    ? resolveMessage({
                        key: "documents:localizationWave.actions.fixConformance",
                      }).message
                    : resolveMessage({
                        key: "documents:localizationWave.actions.fixFeatureConformance",
                        values: { feature: authoredDisplayText(feature) },
                      }).message}
                </Button>
              );
            })()}
          </div>
          <ul className="mt-fg-1 flex flex-col gap-px">
            {editorChrome.advisoryRows.map((row) => (
              <li key={row.key} className={`text-label ${row.toneClass}`}>
                {row.marker}{" "}
                {row.messageDescriptor
                  ? resolveMessage(row.messageDescriptor).message
                  : row.message}
                {row.fixable && (
                  <span className="text-ink-faint">
                    {" "}
                    <DecorativeGlyph name="middleDot" />{" "}
                    {resolveMessage({ key: "documents:editor.advisories.fixable" }).message}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Draft-vs-saved diff (authoring-surface ADR D4): a collapsible section
          comparing the base text captured at open against the current draft.
          Zero new wire calls — both sides are client-held strings. Only mounts
          while editing; cleared when the editor closes or a new session opens. */}
      {editor.diffVisible && (
        <div
          className="max-h-64 overflow-y-auto border-b border-rule bg-paper-sunken px-fg-3 py-fg-2"
          data-editor-diff-section
        >
          <DiffView
            source="draft-vs-saved"
            base={{
              text: editor.baseText,
              truncated: false,
              total_bytes: editor.baseText.length,
              returned_bytes: editor.baseText.length,
            }}
            proposed={{
              text: debouncedDraft,
              truncated: false,
              total_bytes: debouncedDraft.length,
              returned_bytes: debouncedDraft.length,
            }}
            label={content.path ?? docStemFromNodeId(nodeId) ?? nodeId}
          />
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
          ariaLabel={
            resolveMessage({
              key: "documents:localizationWave.accessibility.documentBodyEditor",
            }).message
          }
          inputRef={textareaRef}
        />
      </div>
    </div>
  );
}
