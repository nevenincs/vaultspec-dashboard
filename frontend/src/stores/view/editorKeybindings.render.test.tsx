// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { resetKeybindings } from "../../platform/keymap/registry";
import { queryClient } from "../server/queryClient";
import {
  closeDocumentEditor,
  markEditorConflict,
  markEditorFailed,
  markEditorSaved,
  markEditorSaving,
  openDocumentEditor,
  updateEditorDraft,
} from "./editor";
import {
  EDITOR_CLOSE_ACTION_ID,
  EDITOR_SAVE_ACTION_ID,
  EDITOR_TOGGLE_DIFF_ACTION_ID,
  deriveEditorKeybindings,
  useEditorKeybindings,
} from "./editorKeybindings";
import { resetKeyActions, resolveKeyAction } from "./keymapDispatcher";

function EditorKeybindingHarness() {
  useEditorKeybindings();
  return null;
}

function renderHarness() {
  return render(
    <QueryClientProvider client={queryClient}>
      <EditorKeybindingHarness />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  act(() => closeDocumentEditor());
  cleanup();
  resetKeyActions();
  resetKeybindings();
  queryClient.clear();
});

describe("editor keybinding localization", () => {
  it("defines stable ids and chords with localized presentation descriptors", () => {
    expect(deriveEditorKeybindings()).toEqual([
      {
        id: "editor:save-body",
        defaultChord: "Mod+S",
        label: { key: "documents:actions.save" },
        group: { key: "documents:shortcutGroups.editing" },
        context: "global",
      },
      {
        id: "editor:close",
        defaultChord: "Mod+Alt+W",
        label: { key: "documents:actions.finishEditing" },
        group: { key: "documents:shortcutGroups.editing" },
        context: "global",
      },
      {
        id: "editor:toggle-mode",
        defaultChord: "Mod+E",
        label: { key: "documents:actions.switchReadingAndEditing" },
        group: { key: "documents:shortcutGroups.editing" },
        context: "global",
      },
      {
        id: "editor:toggle-diff",
        defaultChord: "Mod+Alt+G",
        label: { key: "documents:actions.showOrHideChanges" },
        group: { key: "documents:shortcutGroups.editing" },
        context: "global",
      },
      {
        id: "editor:next-change",
        defaultChord: "Mod+Alt+ArrowDown",
        label: { key: "documents:actions.nextChange" },
        group: { key: "documents:shortcutGroups.editing" },
        context: "global",
      },
      {
        id: "editor:previous-change",
        defaultChord: "Mod+Alt+ArrowUp",
        label: { key: "documents:actions.previousChange" },
        group: { key: "documents:shortcutGroups.editing" },
        context: "global",
      },
    ]);
  });

  it("derives actionable disabled reasons from live editor transitions", () => {
    renderHarness();

    expect(resolveKeyAction(EDITOR_SAVE_ACTION_ID)).toMatchObject({
      disabled: true,
      disabledReason: { key: "documents:disabledReasons.openForEditing" },
    });
    expect(resolveKeyAction(EDITOR_CLOSE_ACTION_ID)).toMatchObject({
      disabled: true,
      disabledReason: { key: "documents:disabledReasons.openForEditing" },
    });
    expect(resolveKeyAction(EDITOR_TOGGLE_DIFF_ACTION_ID)).toMatchObject({
      disabled: true,
      disabledReason: { key: "documents:disabledReasons.openForEditing" },
    });

    act(() => openDocumentEditor("doc:sample", "Saved text", "blob-1"));
    expect(resolveKeyAction(EDITOR_SAVE_ACTION_ID)).toMatchObject({
      disabled: true,
      disabledReason: { key: "documents:disabledReasons.updateBeforeSaving" },
    });
    expect(resolveKeyAction(EDITOR_CLOSE_ACTION_ID)?.disabled ?? false).toBe(false);
    expect(resolveKeyAction(EDITOR_TOGGLE_DIFF_ACTION_ID)?.disabled ?? false).toBe(
      false,
    );

    act(() => updateEditorDraft("Changed text"));
    expect(resolveKeyAction(EDITOR_SAVE_ACTION_ID)?.disabled ?? false).toBe(false);

    act(() => markEditorSaving());
    act(() => markEditorSaved("blob-2", "Changed text"));
    expect(resolveKeyAction(EDITOR_SAVE_ACTION_ID)).toMatchObject({
      disabled: true,
      disabledReason: { key: "documents:disabledReasons.updateBeforeSaving" },
    });

    act(() => updateEditorDraft("Changed again"));
    act(() => markEditorSaving());
    expect(resolveKeyAction(EDITOR_SAVE_ACTION_ID)).toMatchObject({
      disabled: true,
      disabledReason: { key: "documents:disabledReasons.tryAfterSaving" },
    });

    act(() => markEditorFailed());
    expect(resolveKeyAction(EDITOR_SAVE_ACTION_ID)?.disabled ?? false).toBe(false);

    act(() => markEditorConflict());
    expect(resolveKeyAction(EDITOR_SAVE_ACTION_ID)).toMatchObject({
      disabled: true,
      disabledReason: {
        key: "documents:disabledReasons.copyChangesBeforeReopening",
      },
    });
  });
});
