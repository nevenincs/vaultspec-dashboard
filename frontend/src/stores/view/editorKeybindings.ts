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
import {
  applyEditorWriteResult,
  markEditorFailed,
  markEditorSaving,
  toggleEditorDiff,
} from "./editor";
import { registerKeyAction } from "./keymapDispatcher";
import { requestCloseDocumentEditor } from "./unsavedEditGuard";
import { type EditorStatus, type ViewState, useViewStore } from "./viewStore";

export const EDITOR_SAVE_ACTION_ID = "editor:save-body";
export const EDITOR_CLOSE_ACTION_ID = "editor:close";
export const EDITOR_TOGGLE_MODE_ACTION_ID = "editor:toggle-mode";
export const EDITOR_TOGGLE_DIFF_ACTION_ID = "editor:toggle-diff";
export const EDITOR_NEXT_CHANGE_ACTION_ID = "editor:next-change";
export const EDITOR_PREVIOUS_CHANGE_ACTION_ID = "editor:previous-change";

export const EDITOR_SAVE_LABEL = { key: "documents:actions.save" } as const;
export const EDITOR_CLOSE_LABEL = {
  key: "documents:actions.finishEditing",
} as const;
export const EDITOR_TOGGLE_MODE_LABEL = {
  key: "documents:actions.switchReadingAndEditing",
} as const;
export const EDITOR_TOGGLE_DIFF_LABEL = {
  key: "documents:actions.showOrHideChanges",
} as const;
export const EDITOR_NEXT_CHANGE_LABEL = {
  key: "documents:actions.nextChange",
} as const;
export const EDITOR_PREVIOUS_CHANGE_LABEL = {
  key: "documents:actions.previousChange",
} as const;

const EDITOR_GROUP = { key: "documents:shortcutGroups.editing" } as const;

const OPEN_FOR_EDITING_REASON = {
  key: "documents:disabledReasons.openForEditing",
} as const;
const UPDATE_BEFORE_SAVING_REASON = {
  key: "documents:disabledReasons.updateBeforeSaving",
} as const;
const TRY_AFTER_SAVING_REASON = {
  key: "documents:disabledReasons.tryAfterSaving",
} as const;
const COPY_CHANGES_BEFORE_REOPENING_REASON = {
  key: "documents:disabledReasons.copyChangesBeforeReopening",
} as const;

export type EditorSaveAvailability =
  | { readonly disabled: false; readonly disabledReason?: never }
  | {
      readonly disabled: true;
      readonly disabledReason:
        | typeof OPEN_FOR_EDITING_REASON
        | typeof UPDATE_BEFORE_SAVING_REASON
        | typeof TRY_AFTER_SAVING_REASON
        | typeof COPY_CHANGES_BEFORE_REOPENING_REASON;
    };

function exhaustiveEditorStatus(status: never): never {
  throw new Error(`Unhandled editor status: ${String(status)}`);
}

/** Derive save availability from one editor-state snapshot. */
export function deriveEditorSaveAvailability(
  state: Pick<ViewState, "editorTarget" | "editorStatus">,
): EditorSaveAvailability {
  if (state.editorTarget === null) {
    return { disabled: true, disabledReason: OPEN_FOR_EDITING_REASON };
  }
  const status: EditorStatus = state.editorStatus;
  switch (status) {
    case "dirty":
    case "save-failed":
      return { disabled: false };
    case "saving":
      return { disabled: true, disabledReason: TRY_AFTER_SAVING_REASON };
    case "conflict":
      return {
        disabled: true,
        disabledReason: COPY_CHANGES_BEFORE_REOPENING_REASON,
      };
    case "idle":
    case "saved":
      return { disabled: true, disabledReason: UPDATE_BEFORE_SAVING_REASON };
    default:
      return exhaustiveEditorStatus(status);
  }
}

export function saveDocumentAction(
  run: () => void,
  availability: EditorSaveAvailability,
): ActionDescriptor {
  return {
    id: EDITOR_SAVE_ACTION_ID,
    label: EDITOR_SAVE_LABEL,
    ...availability,
    run,
  };
}

export function finishEditingAction(
  run: () => void,
  disabled: boolean,
): ActionDescriptor {
  return {
    id: EDITOR_CLOSE_ACTION_ID,
    label: EDITOR_CLOSE_LABEL,
    disabled,
    disabledReason: disabled ? OPEN_FOR_EDITING_REASON : undefined,
    run,
  };
}

export function switchReadingAndEditingAction(run: () => void): ActionDescriptor {
  return {
    id: EDITOR_TOGGLE_MODE_ACTION_ID,
    label: EDITOR_TOGGLE_MODE_LABEL,
    run,
  };
}

export function showOrHideChangesAction(
  run: () => void,
  disabled = false,
): ActionDescriptor {
  return {
    id: EDITOR_TOGGLE_DIFF_ACTION_ID,
    label: EDITOR_TOGGLE_DIFF_LABEL,
    disabled,
    disabledReason: disabled ? OPEN_FOR_EDITING_REASON : undefined,
    run,
  };
}

export function nextChangeAction(run: () => void, disabled = false): ActionDescriptor {
  return {
    id: EDITOR_NEXT_CHANGE_ACTION_ID,
    label: EDITOR_NEXT_CHANGE_LABEL,
    disabled,
    disabledReason: disabled ? OPEN_FOR_EDITING_REASON : undefined,
    run,
  };
}

export function previousChangeAction(
  run: () => void,
  disabled = false,
): ActionDescriptor {
  return {
    id: EDITOR_PREVIOUS_CHANGE_ACTION_ID,
    label: EDITOR_PREVIOUS_CHANGE_LABEL,
    disabled,
    disabledReason: disabled ? OPEN_FOR_EDITING_REASON : undefined,
    run,
  };
}

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
      // Toggle the draft-vs-saved diff panel (authoring-surface ADR D4). Binds Mod+Alt+G
      // after two prior chords were disqualified (keyboard-shortcut-conflict-review ADR D5,
      // review-round): Mod+Shift+D is Chrome's bookmark-all-tabs, and Mod+Alt+D is macOS
      // Cmd+Opt+D (Show/Hide Dock, an Apple system-wide shortcut) — both chrome/OS-reserved.
      // Mod+Alt+G is clean across Chrome/Firefox/Safari/Edge and macOS system shortcuts (the
      // reviewer vetted out B/K/E/C/M/H in this family as browser/OS-reserved on Mac); it is
      // a distinct chord from the Mod+Shift+G graph toggle. Both Mod+Shift+D and Mod+Alt+D
      // are on the reserved-chord denylist so neither returns.
      id: EDITOR_TOGGLE_DIFF_ACTION_ID,
      defaultChord: "Mod+Alt+G",
      label: EDITOR_TOGGLE_DIFF_LABEL,
      group: EDITOR_GROUP,
      context: "global",
    },
    {
      // Jump to the next/previous change in the dirty-diff gutter
      // (editor-change-fidelity D5). Chord VETTING (default-chord-selection-vetting
      // rule): Mod+Alt+ArrowUp/Down complements the tab strip's Mod+Alt+ArrowLeft/Right
      // (docTabKeybindings) — horizontal arrows move between documents, vertical
      // between changes within one, a deliberate axis split. Vetted: (1) not in
      // reservedChords.ts (only Mod+Alt+D there); (2) the macOS Cmd+Opt reserved
      // class is LETTERS (B/K/E/C/D/H/M) — arrows are unaffected, and Cmd+Opt+Up/Down
      // is not an Apple system shortcut (Cmd+Opt+Left/Right is browser tab-switch,
      // which the app already rebinds for its own tabs, proving the Mod+Alt+Arrow
      // class reaches the page in the target browsers); (3) grep of the default-chord
      // inventory shows Mod+Alt+ArrowUp/Down unused; (4) arrows need no AltGr on EU
      // layouts. Down = next (toward the document end), Up = previous.
      id: EDITOR_NEXT_CHANGE_ACTION_ID,
      defaultChord: "Mod+Alt+ArrowDown",
      label: EDITOR_NEXT_CHANGE_LABEL,
      group: EDITOR_GROUP,
      context: "global",
    },
    {
      id: EDITOR_PREVIOUS_CHANGE_ACTION_ID,
      defaultChord: "Mod+Alt+ArrowUp",
      label: EDITOR_PREVIOUS_CHANGE_LABEL,
      group: EDITOR_GROUP,
      context: "global",
    },
  ];
}

export function useEditorKeybindings(): void {
  const saveBody = useSaveBody();

  useEffect(() => {
    const disposeBindings = registerKeybindings(deriveEditorKeybindings());

    const disposeSave = registerKeyAction(
      EDITOR_SAVE_ACTION_ID,
      (): ActionDescriptor => {
        const snapshot = useViewStore.getState();
        const availability = deriveEditorSaveAvailability(snapshot);
        return saveDocumentAction(() => {
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
        }, availability);
      },
    );

    const disposeClose = registerKeyAction(
      EDITOR_CLOSE_ACTION_ID,
      (): ActionDescriptor => {
        const snapshot = useViewStore.getState();
        return finishEditingAction(
          requestCloseDocumentEditor,
          snapshot.editorTarget === null,
        );
      },
    );

    const disposeToggleDiff = registerKeyAction(
      EDITOR_TOGGLE_DIFF_ACTION_ID,
      (): ActionDescriptor => {
        const snapshot = useViewStore.getState();
        return showOrHideChangesAction(() => {
          // Guard so a stale keymap action does not toggle a closed editor's state.
          if (useViewStore.getState().editorTarget !== null) {
            toggleEditorDiff();
          }
        }, snapshot.editorTarget === null);
      },
    );

    return () => {
      disposeToggleDiff();
      disposeClose();
      disposeSave();
      disposeBindings();
    };
  }, [saveBody]);
}
