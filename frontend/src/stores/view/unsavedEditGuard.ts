import { create } from "zustand";

import type { ActionConfirmationDescriptor } from "../../platform/localization/message";
import { closeDocumentEditor } from "./editor";
import { editorStatusHasUnsavedDraft } from "./tabs";
import { useViewStore } from "./viewStore";

type UnsavedDiscardConfirmation = Extract<
  ActionConfirmationDescriptor,
  { readonly kind: "destructive" }
>;

/** A staged destructive action awaiting the user's keep-or-discard decision. */
export interface PendingUnsavedDiscard {
  readonly confirmation: UnsavedDiscardConfirmation;
  /** Run when the user confirms discarding the draft. */
  readonly proceed: () => void;
}

interface UnsavedEditGuardState {
  /** The staged confirmation, or null when nothing is pending. */
  pending: PendingUnsavedDiscard | null;
  /** Stage an arm-to-confirm. */
  request: (intent: PendingUnsavedDiscard) => void;
  /** Discard confirmed — run the staged action and clear. */
  confirm: () => void;
  /** Cancel the discard and clear without running the staged action. */
  cancel: () => void;
}

export const useUnsavedEditGuardStore = create<UnsavedEditGuardState>((set, get) => ({
  pending: null,
  request: (intent) => set({ pending: intent }),
  confirm: () => {
    const { pending } = get();
    // Clear BEFORE running so a `proceed` that itself opens another guard (or
    // re-enters) sees a clean slate rather than the just-confirmed entry.
    set({ pending: null });
    pending?.proceed();
  },
  cancel: () => set({ pending: null }),
}));

const UNSAVED_DISCARD_CONFIRMATION = {
  kind: "destructive",
  title: { key: "documents:confirmations.discardUnsavedChanges.title" },
  body: { key: "documents:confirmations.discardUnsavedChanges.body" },
  confirmLabel: { key: "common:destructiveActions.discardChanges" },
  cancelLabel: { key: "common:actions.cancel" },
} as const satisfies UnsavedDiscardConfirmation;

function stagePending(proceed: () => void): void {
  useUnsavedEditGuardStore.getState().request({
    confirmation: UNSAVED_DISCARD_CONFIRMATION,
    proceed,
  });
}

/**
 * Run `proceed` immediately when the editor has no unsaved changes; otherwise stage
 * an arm-to-confirm so the user can keep editing or discard the dirty draft. Use this
 * at every call site that would otherwise silently throw away the draft (a scope
 * switch, an editor close). `editorStatusHasUnsavedDraft` (dirty, or a retained-draft
 * save-failed/conflict — all hold unsaved work) is the source of truth for "unsaved work".
 */
export function guardUnsavedDiscard(proceed: () => void): void {
  if (!editorStatusHasUnsavedDraft(useViewStore.getState().editorStatus)) {
    proceed();
    return;
  }
  stagePending(proceed);
}

/**
 * The document-scoped variant: arm-to-confirm only when the dirty editor targets THIS
 * document. A tab/panel close on doc B must NOT prompt about doc A's unsaved draft, so
 * a global dirty check is wrong here — gate on `editorTarget?.nodeId === nodeId`.
 */
export function guardUnsavedDiscardForDoc(nodeId: string, proceed: () => void): void {
  const state = useViewStore.getState();
  const dirtyForThisDoc =
    editorStatusHasUnsavedDraft(state.editorStatus) &&
    state.editorTarget?.nodeId === nodeId;
  if (!dirtyForThisDoc) {
    proceed();
    return;
  }
  stagePending(proceed);
}

/**
 * Close the open markdown editor — arm-to-confirm first when its draft is dirty.
 * The single guarded entry every USER-facing close path routes through (the editor's
 * Done button + mode toggle, the command-palette "close document" command, the close
 * keybinding) so none of them can silently throw away unsaved work. The raw store
 * `closeDocumentEditor` stays available for the confirmed `proceed` and any internal
 * non-user reset.
 */
export function requestCloseDocumentEditor(): void {
  guardUnsavedDiscard(() => closeDocumentEditor());
}
