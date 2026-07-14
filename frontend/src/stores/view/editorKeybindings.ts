// Document-editor command shortcuts on the ONE keymap registry + dispatcher
// (keyboard-shortcuts-bind-through-the-one-keymap-registry). Save and close-editor
// are enrolled here so the open markdown editor is drivable from the keyboard like
// every other surface, WITHOUT moving the save logic out of the dispatcher seam.
//
// Loop safety (stable-selectors): the registered thunks read the editor's RAW
// zustand fields through `useViewStore.getState()` at keypress time — never through
// a fresh-derived selector — so they cannot trigger the "getSnapshot should be
// cached" feedback the markdown editor's derived chrome views are prone to. The
// save mutation is captured once in the effect; the thunk fires it synchronously.

import { useEffect } from "react";

import {
  legacyActionPresentation,
  type ActionDescriptor,
} from "../../platform/actions/action";
import {
  type KeybindingDef,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { useSaveBody } from "../server/queries";
import {
  applyEditorWriteResult,
  markEditorFailed,
  markEditorSaving,
  toggleEditorDiff,
} from "./editor";
import { registerKeyAction } from "./keymapDispatcher";
import { requestCloseDocumentEditor } from "./unsavedEditGuard";
import { useViewStore } from "./viewStore";

export const EDITOR_SAVE_ACTION_ID = "editor:save-body";
export const EDITOR_CLOSE_ACTION_ID = "editor:close";
export const EDITOR_TOGGLE_MODE_ACTION_ID = "editor:toggle-mode";
export const EDITOR_TOGGLE_DIFF_ACTION_ID = "editor:toggle-diff";

export const EDITOR_SAVE_LABEL = "Save the open document";
export const EDITOR_CLOSE_LABEL = "Close the editor";
export const EDITOR_TOGGLE_MODE_LABEL = "Toggle document edit mode";
export const EDITOR_TOGGLE_DIFF_LABEL = "Toggle draft diff";

const EDITOR_GROUP = "Editor";

export function deriveEditorKeybindings(): KeybindingDef[] {
  return [
    {
      id: EDITOR_SAVE_ACTION_ID,
      defaultChord: "Mod+S",
      label: EDITOR_SAVE_LABEL,
      group: EDITOR_GROUP,
      context: "global",
    },
    {
      // Mod+W is browser-reserved (cannot be reliably preventDefault'd); the editor
      // close uses Mod+Alt+W so the chord is honoured.
      id: EDITOR_CLOSE_ACTION_ID,
      defaultChord: "Mod+Alt+W",
      label: EDITOR_CLOSE_LABEL,
      group: EDITOR_GROUP,
      context: "global",
    },
    {
      // The View/Edit toggle as a chord. The DEF lives in the catalog (the legend
      // derives from it); the live thunk is registered by the mounted document view
      // (MarkdownDocView), which owns the per-doc content/mode closure.
      id: EDITOR_TOGGLE_MODE_ACTION_ID,
      defaultChord: "Mod+E",
      label: EDITOR_TOGGLE_MODE_LABEL,
      group: EDITOR_GROUP,
      context: "global",
    },
    {
      // Toggle the draft-vs-saved diff panel (authoring-surface ADR D4). Chord
      // verified free of same-specificity collisions by the KAR-008 guard.
      // Mod+B (left-rail toggle) and Mod+I/K are reserved — not this chord.
      id: EDITOR_TOGGLE_DIFF_ACTION_ID,
      defaultChord: "Mod+Shift+D",
      label: EDITOR_TOGGLE_DIFF_LABEL,
      group: EDITOR_GROUP,
      context: "global",
    },
  ];
}

/** True when an editor is open and its draft diverges from the saved text. */
function editorCanSave(): boolean {
  const state = useViewStore.getState();
  return (
    state.editorTarget !== null &&
    (state.editorStatus === "dirty" || state.editorStatus === "save-failed")
  );
}

export function useEditorKeybindings(): void {
  const saveBody = useSaveBody();

  useEffect(() => {
    const disposeBindings = registerKeybindings(deriveEditorKeybindings());

    const disposeSave = registerKeyAction(
      EDITOR_SAVE_ACTION_ID,
      (): ActionDescriptor => ({
        id: EDITOR_SAVE_ACTION_ID,
        label: legacyActionPresentation(EDITOR_SAVE_LABEL),
        disabled: !editorCanSave(),
        disabledReason: editorCanSave()
          ? undefined
          : legacyActionPresentation("no unsaved changes"),
        run: () => {
          const state = useViewStore.getState();
          if (state.editorTarget === null) return;
          // Capture the draft at mutation time so the save-resolve closure can
          // advance editorBaseText to what was actually committed, not the
          // potentially-raced current draft (edit-during-save guard).
          const savedText = state.draftText;
          markEditorSaving();
          saveBody.mutate(
            {
              nodeId: state.editorTarget.nodeId,
              // The ONE save scope source (per-tab-scope-binding): the scope pinned on
              // the editor target at open (the tab's scope), NOT the ambient
              // `state.scope`. Kills the third scope source — a cross-scope tab saved
              // via Mod+S no longer writes the stem against the wrong corpus.
              scope: state.editorTarget.scope,
              text: savedText,
              baseBlobHash: state.baseBlobHash,
            },
            {
              onSuccess: ({ result }) => applyEditorWriteResult(result, savedText),
              onError: () => markEditorFailed(),
            },
          );
        },
      }),
    );

    const disposeClose = registerKeyAction(
      EDITOR_CLOSE_ACTION_ID,
      (): ActionDescriptor => ({
        id: EDITOR_CLOSE_ACTION_ID,
        label: legacyActionPresentation(EDITOR_CLOSE_LABEL),
        disabled: useViewStore.getState().editorTarget === null,
        disabledReason:
          useViewStore.getState().editorTarget === null
            ? legacyActionPresentation("no open document")
            : undefined,
        run: requestCloseDocumentEditor,
      }),
    );

    const disposeToggleDiff = registerKeyAction(
      EDITOR_TOGGLE_DIFF_ACTION_ID,
      (): ActionDescriptor => ({
        id: EDITOR_TOGGLE_DIFF_ACTION_ID,
        label: legacyActionPresentation(EDITOR_TOGGLE_DIFF_LABEL),
        disabled: useViewStore.getState().editorTarget === null,
        disabledReason:
          useViewStore.getState().editorTarget === null
            ? legacyActionPresentation("no open document")
            : undefined,
        run: () => {
          // Guard so a stale keymap action does not toggle a closed editor's state.
          if (useViewStore.getState().editorTarget !== null) {
            toggleEditorDiff();
          }
        },
      }),
    );

    return () => {
      disposeToggleDiff();
      disposeClose();
      disposeSave();
      disposeBindings();
    };
  }, [saveBody]);
}
