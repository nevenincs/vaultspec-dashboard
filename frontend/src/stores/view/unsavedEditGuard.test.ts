import { beforeEach, describe, expect, it, vi } from "vitest";

import { openDocumentEditor, updateEditorDraft } from "./editor";
import {
  guardUnsavedDiscard,
  guardUnsavedDiscardForDoc,
  requestCloseDocumentEditor,
  useUnsavedEditGuardStore,
} from "./unsavedEditGuard";
import { useViewStore } from "./viewStore";

/** Open an editor and dirty its draft so `editorStatus === "dirty"`. */
function openDirtyEditor(nodeId: string): void {
  openDocumentEditor(nodeId, "original body", "hash-1");
  updateEditorDraft("edited body");
}

describe("unsaved-edit guard", () => {
  beforeEach(() => {
    useUnsavedEditGuardStore.setState({ pending: null });
    useViewStore.getState().closeEditor();
  });

  it("runs the action immediately and stages nothing when the editor is clean", () => {
    const proceed = vi.fn();
    guardUnsavedDiscard(proceed);
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(useUnsavedEditGuardStore.getState().pending).toBeNull();
  });

  it("stages an arm-to-confirm and does NOT run the action when the editor is dirty", () => {
    openDirtyEditor("doc:a");
    expect(useViewStore.getState().editorStatus).toBe("dirty");

    const proceed = vi.fn();
    guardUnsavedDiscard(proceed);

    expect(proceed).not.toHaveBeenCalled();
    expect(useUnsavedEditGuardStore.getState().pending).not.toBeNull();
  });

  it("runs the staged action and clears on confirm (discard)", () => {
    openDirtyEditor("doc:a");
    const proceed = vi.fn();
    guardUnsavedDiscard(proceed);

    useUnsavedEditGuardStore.getState().confirm();

    expect(proceed).toHaveBeenCalledTimes(1);
    expect(useUnsavedEditGuardStore.getState().pending).toBeNull();
  });

  it("does NOT run the staged action on cancel (keep editing)", () => {
    openDirtyEditor("doc:a");
    const proceed = vi.fn();
    guardUnsavedDiscard(proceed);

    useUnsavedEditGuardStore.getState().cancel();

    expect(proceed).not.toHaveBeenCalled();
    expect(useUnsavedEditGuardStore.getState().pending).toBeNull();
  });

  it("requestCloseDocumentEditor closes immediately when clean", () => {
    openDocumentEditor("doc:clean", "body", "hash-1");
    expect(useViewStore.getState().editorStatus).not.toBe("dirty");

    requestCloseDocumentEditor();

    expect(useViewStore.getState().editorTarget).toBeNull();
    expect(useUnsavedEditGuardStore.getState().pending).toBeNull();
  });

  it("requestCloseDocumentEditor confirms first when dirty, then closes on confirm", () => {
    openDirtyEditor("doc:dirty");

    requestCloseDocumentEditor();
    // Staged — the editor stays open until the user confirms.
    expect(useViewStore.getState().editorTarget).not.toBeNull();
    expect(useUnsavedEditGuardStore.getState().pending).not.toBeNull();

    useUnsavedEditGuardStore.getState().confirm();
    // Confirmed — the editor is now closed and the draft cleared.
    expect(useViewStore.getState().editorTarget).toBeNull();
    expect(useViewStore.getState().draftText).toBe("");
  });
});

describe("guardUnsavedDiscardForDoc (document-scoped)", () => {
  beforeEach(() => {
    useUnsavedEditGuardStore.setState({ pending: null });
    useViewStore.getState().closeEditor();
  });

  it("runs immediately when nothing is dirty", () => {
    const proceed = vi.fn();
    guardUnsavedDiscardForDoc("doc:a", proceed);
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(useUnsavedEditGuardStore.getState().pending).toBeNull();
  });

  it("runs immediately when a DIFFERENT document is dirty (no false prompt)", () => {
    openDirtyEditor("doc:a");
    const proceed = vi.fn();
    // Closing doc:b while doc:a is the dirty editor must NOT prompt — b has no draft.
    guardUnsavedDiscardForDoc("doc:b", proceed);
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(useUnsavedEditGuardStore.getState().pending).toBeNull();
  });

  it("stages a confirm when THIS document is the dirty editor", () => {
    openDirtyEditor("doc:a");
    const proceed = vi.fn();
    guardUnsavedDiscardForDoc("doc:a", proceed);
    expect(proceed).not.toHaveBeenCalled();
    expect(useUnsavedEditGuardStore.getState().pending).not.toBeNull();
  });
});
