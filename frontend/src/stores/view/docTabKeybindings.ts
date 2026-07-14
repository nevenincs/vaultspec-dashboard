// Document-tab navigation/close shortcuts on the ONE keymap registry + dispatcher
// (keyboard-shortcuts-bind-through-the-one-keymap-registry, #15). Next/previous tab
// and close-active-tab are command shortcuts (Class A), so they bind here — never a
// private window keydown listener. The thunks read the RAW open-docs/active fields
// through `useViewStore.getState()` at keypress time (via the tab seam helpers),
// never a fresh-derived selector, so they cannot trip the getSnapshot loop
// (stable-selectors).

import { useEffect } from "react";

import {
  legacyActionPresentation,
  type ActionDescriptor,
} from "../../platform/actions/action";
import {
  type KeybindingDef,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { activateAdjacentDocTab, closeActiveDocTab, useActiveDocId } from "./tabs";
import { registerKeyAction } from "./keymapDispatcher";

export const TAB_NEXT_ACTION_ID = "tabs:next-tab";
export const TAB_PREV_ACTION_ID = "tabs:prev-tab";
export const TAB_CLOSE_ACTION_ID = "tabs:close-active";

export const TAB_NEXT_LABEL = "Next document tab";
export const TAB_PREV_LABEL = "Previous document tab";
export const TAB_CLOSE_LABEL = "Close the active document tab";

const TAB_GROUP = "Documents";

export function deriveDocTabKeybindings(): KeybindingDef[] {
  return [
    {
      // Mod+Alt+Arrow (not Ctrl+PageDown/Up, which the browser owns for its own
      // tab switching) cycles the document tab strip, wrapping at the ends.
      id: TAB_NEXT_ACTION_ID,
      defaultChord: "Mod+Alt+ArrowRight",
      label: TAB_NEXT_LABEL,
      group: TAB_GROUP,
      context: "global",
    },
    {
      id: TAB_PREV_ACTION_ID,
      defaultChord: "Mod+Alt+ArrowLeft",
      label: TAB_PREV_LABEL,
      group: TAB_GROUP,
      context: "global",
    },
    {
      // Mod+W is browser-reserved (cannot be reliably preventDefault'd) and
      // Mod+Alt+W is the editor-close chord, so the tab close uses Mod+Alt+Backspace.
      id: TAB_CLOSE_ACTION_ID,
      defaultChord: "Mod+Alt+Backspace",
      label: TAB_CLOSE_LABEL,
      group: TAB_GROUP,
      context: "global",
    },
  ];
}

/** Register the document-tab navigation/close bindings + their live thunks for the
 *  app's lifetime. Mirrors `useEditorKeybindings`. */
export function useDocTabKeybindings(): void {
  // Subscribe to the active doc id so the close binding's disabled/label re-resolve
  // when the open-tab set changes; the value itself is read fresh in the thunk.
  const activeDocId = useActiveDocId();

  useEffect(() => {
    const disposeBindings = registerKeybindings(deriveDocTabKeybindings());

    const disposeNext = registerKeyAction(
      TAB_NEXT_ACTION_ID,
      (): ActionDescriptor => ({
        id: TAB_NEXT_ACTION_ID,
        label: legacyActionPresentation(TAB_NEXT_LABEL),
        run: () => activateAdjacentDocTab(1),
      }),
    );
    const disposePrev = registerKeyAction(
      TAB_PREV_ACTION_ID,
      (): ActionDescriptor => ({
        id: TAB_PREV_ACTION_ID,
        label: legacyActionPresentation(TAB_PREV_LABEL),
        run: () => activateAdjacentDocTab(-1),
      }),
    );
    const disposeClose = registerKeyAction(
      TAB_CLOSE_ACTION_ID,
      (): ActionDescriptor => ({
        id: TAB_CLOSE_ACTION_ID,
        label: legacyActionPresentation(TAB_CLOSE_LABEL),
        disabled: activeDocId === null,
        disabledReason:
          activeDocId === null
            ? legacyActionPresentation("no open document")
            : undefined,
        run: () => closeActiveDocTab(),
      }),
    );

    return () => {
      disposeClose();
      disposePrev();
      disposeNext();
      disposeBindings();
    };
  }, [activeDocId]);
}
