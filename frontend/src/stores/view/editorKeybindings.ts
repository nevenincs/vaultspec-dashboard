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

import type { ActionDescriptor } from "../../platform/actions/action";
import {
  type KeybindingDef,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { useSaveBody } from "../server/queries";
import { applyEditorWriteResult, markEditorFailed, markEditorSaving } from "./editor";
import { registerKeyAction } from "./keymapDispatcher";
import { requestCloseDocumentEditor } from "./unsavedEditGuard";
import { useViewStore } from "./viewStore";

export const EDITOR_SAVE_ACTION_ID = "editor:save-body";
export const EDITOR_CLOSE_ACTION_ID = "editor:close";
export const EDITOR_TOGGLE_MODE_ACTION_ID = "editor:toggle-mode";

export const EDITOR_SAVE_LABEL = "Save the open document";
export const EDITOR_CLOSE_LABEL = "Close the editor";
export const EDITOR_TOGGLE_MODE_LABEL = "Toggle document edit mode";

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
        label: EDITOR_SAVE_LABEL,
        disabled: !editorCanSave(),
        disabledReason: editorCanSave() ? undefined : "no unsaved changes",
        run: () => {
          const state = useViewStore.getState();
          if (state.editorTarget === null) return;
          markEditorSaving();
          saveBody.mutate(
            {
              nodeId: state.editorTarget.nodeId,
              scope: state.scope,
              text: state.draftText,
              baseBlobHash: state.baseBlobHash,
            },
            {
              onSuccess: ({ result }) => applyEditorWriteResult(result),
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
        label: EDITOR_CLOSE_LABEL,
        disabled: useViewStore.getState().editorTarget === null,
        disabledReason:
          useViewStore.getState().editorTarget === null
            ? "no open document"
            : undefined,
        run: requestCloseDocumentEditor,
      }),
    );

    return () => {
      disposeClose();
      disposeSave();
      disposeBindings();
    };
  }, [saveBody]);
}
