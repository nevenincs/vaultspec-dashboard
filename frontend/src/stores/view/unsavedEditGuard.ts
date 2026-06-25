// Unsaved-edit guard (data-safety): an arm-to-confirm gate that fires before a
// dirty markdown-editor draft would be silently discarded.
//
// The editor holds its body draft locally (`viewStore.draftText` / `editorStatus`)
// until an explicit save, so a worktree/scope SWITCH (whose wholesale reset clears
// `draftText`) or an editor CLOSE would throw the draft away with no warning — the
// "Unsaved changes" status is shown but nothing BLOCKS the destructive action. This
// guard intercepts those user actions at their call sites: when `editorStatus` is
// `dirty`, it stages an arm-to-confirm (rendered by `UnsavedEditGuardHost` through the
// shared `ConfirmDialog` primitive) instead of proceeding; when clean, it runs the
// action immediately so there is zero cost on the common path. Pure store + helper;
// no React, no fetch (dashboard-layer-ownership).

import { create } from "zustand";

import { closeDocumentEditor } from "./editor";
import { useViewStore } from "./viewStore";

/** A staged destructive action awaiting the user's keep-or-discard decision. */
export interface PendingUnsavedDiscard {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
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
  /** Keep editing — clear without running the staged action. */
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

const DEFAULT_COPY = {
  title: "Unsaved changes",
  message:
    "You have unsaved changes in the open document. Discarding them cannot be undone.",
  confirmLabel: "Discard changes",
} as const;

function stagePending(
  proceed: () => void,
  copy?: Partial<Omit<PendingUnsavedDiscard, "proceed">>,
): void {
  useUnsavedEditGuardStore.getState().request({
    title: copy?.title ?? DEFAULT_COPY.title,
    message: copy?.message ?? DEFAULT_COPY.message,
    confirmLabel: copy?.confirmLabel ?? DEFAULT_COPY.confirmLabel,
    proceed,
  });
}

/**
 * Run `proceed` immediately when the editor has no unsaved changes; otherwise stage
 * an arm-to-confirm so the user can keep editing or discard the dirty draft. Use this
 * at every call site that would otherwise silently throw away the draft (a scope
 * switch, an editor close). `editorStatus === "dirty"` is the single source of truth
 * for "there is unsaved work" (mirrors the editor's own "Unsaved changes" label).
 */
export function guardUnsavedDiscard(
  proceed: () => void,
  copy?: Partial<Omit<PendingUnsavedDiscard, "proceed">>,
): void {
  if (useViewStore.getState().editorStatus !== "dirty") {
    proceed();
    return;
  }
  stagePending(proceed, copy);
}

/**
 * The document-scoped variant: arm-to-confirm only when the dirty editor targets THIS
 * document. A tab/panel close on doc B must NOT prompt about doc A's unsaved draft, so
 * a global dirty check is wrong here — gate on `editorTarget?.nodeId === nodeId`.
 */
export function guardUnsavedDiscardForDoc(
  nodeId: string,
  proceed: () => void,
  copy?: Partial<Omit<PendingUnsavedDiscard, "proceed">>,
): void {
  const state = useViewStore.getState();
  const dirtyForThisDoc =
    state.editorStatus === "dirty" && state.editorTarget?.nodeId === nodeId;
  if (!dirtyForThisDoc) {
    proceed();
    return;
  }
  stagePending(proceed, copy);
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
