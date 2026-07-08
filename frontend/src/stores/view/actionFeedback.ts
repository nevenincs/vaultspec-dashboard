// A tiny app-level action-outcome feedback surface (KAR-006 / KAR-004).
//
// Menu-fired verbs (relate / autofix / archive / copy) close the context menu
// SYNCHRONOUSLY, but their outcome resolves ASYNCHRONOUSLY — so the menu's own
// aria-live region cannot announce it (that region unmounts when the menu
// closes), and the command palette's ops-message is gated on the palette being
// open. This one small store outlives both surfaces: the always-mounted
// ContextMenuHost renders its message into a persistent polite aria-live region,
// and any surface announces through `announceActionFeedback` (callable outside
// React, like the dispatch seam it reports on).
//
// A monotonic `token` rides alongside the message so an IDENTICAL consecutive
// outcome ("Copied." twice) still re-announces: the region keys its text node on
// the token, forcing a remount the screen reader observes as a fresh change.

import { create } from "zustand";

export const ACTION_FEEDBACK_MESSAGE_CAP = 200;

export function normalizeActionFeedbackMessage(message: unknown): string | null {
  if (typeof message !== "string") return null;
  const trimmed = message.trim();
  if (!trimmed) return null;
  return trimmed.length > ACTION_FEEDBACK_MESSAGE_CAP
    ? `${trimmed.slice(0, ACTION_FEEDBACK_MESSAGE_CAP - 1)}…`
    : trimmed;
}

interface ActionFeedbackState {
  message: string | null;
  token: number;
  announce: (message: unknown) => void;
  clear: () => void;
}

export const useActionFeedbackStore = create<ActionFeedbackState>((set) => ({
  message: null,
  token: 0,
  announce: (message) =>
    set((state) => {
      const normalized = normalizeActionFeedbackMessage(message);
      return normalized === null
        ? state
        : { message: normalized, token: state.token + 1 };
    }),
  clear: () => set((state) => ({ message: null, token: state.token + 1 })),
}));

/** Announce an action outcome to AT + the user. Imperative: callable from a
 *  dispatch-outcome consumer outside React, never a private per-surface toast. */
export function announceActionFeedback(message: unknown): void {
  useActionFeedbackStore.getState().announce(message);
}

export function clearActionFeedback(): void {
  useActionFeedbackStore.getState().clear();
}

/** Non-React snapshot of the current feedback (message + token), for consumers
 *  outside a component (tests, imperative readers). */
export function actionFeedbackSnapshot(): { message: string | null; token: number } {
  const { message, token } = useActionFeedbackStore.getState();
  return { message, token };
}

/** The current feedback message (raw primitive — stable-selectors). */
export function useActionFeedbackMessage(): string | null {
  return useActionFeedbackStore((state) => state.message);
}

/** The re-announce token (raw primitive): a monotonic counter the aria-live
 *  region keys on so an identical consecutive message still re-announces. */
export function useActionFeedbackToken(): number {
  return useActionFeedbackStore((state) => state.token);
}
