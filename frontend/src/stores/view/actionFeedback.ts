import { create } from "zustand";

import type { MessageDescriptor } from "../../platform/localization/message";

export const ACTION_FEEDBACK_CONDITIONS = Object.freeze([
  "archive-succeeded",
  "archive-rejected",
  "archive-unavailable",
  "repair-succeeded",
  "repair-rejected",
  "repair-unavailable",
  "copy-succeeded",
  "copy-failed",
  "link-succeeded",
  "already-linked",
  "link-conflict",
  "link-failed",
  "link-in-progress",
  "action-unavailable",
] as const);

export type ActionFeedbackCondition = (typeof ACTION_FEEDBACK_CONDITIONS)[number];

const ACTION_FEEDBACK_CONDITION_SET: ReadonlySet<string> = new Set(
  ACTION_FEEDBACK_CONDITIONS,
);

const descriptor = <Key extends MessageDescriptor["key"]>(
  key: Key,
): MessageDescriptor<Key> => Object.freeze({ key });

const ACTION_FEEDBACK_DESCRIPTORS = Object.freeze({
  "archive-succeeded": descriptor("features:feedback.archiveSucceeded"),
  "archive-rejected": descriptor("features:feedback.archiveRejected"),
  "archive-unavailable": descriptor("features:feedback.archiveUnavailable"),
  "repair-succeeded": descriptor("features:feedback.repairSucceeded"),
  "repair-rejected": descriptor("features:feedback.repairRejected"),
  "repair-unavailable": descriptor("features:feedback.repairUnavailable"),
  "copy-succeeded": descriptor("common:feedback.copySucceeded"),
  "copy-failed": descriptor("common:feedback.copyFailed"),
  "link-succeeded": descriptor("documents:feedback.linkSucceeded"),
  "already-linked": descriptor("documents:feedback.alreadyLinked"),
  "link-conflict": descriptor("documents:feedback.linkConflict"),
  "link-failed": descriptor("documents:feedback.linkFailed"),
  "link-in-progress": descriptor("documents:feedback.linkInProgress"),
  "action-unavailable": descriptor("common:feedback.actionUnavailable"),
} satisfies Readonly<Record<ActionFeedbackCondition, MessageDescriptor>>);

export function normalizeActionFeedbackCondition(
  value: unknown,
): ActionFeedbackCondition | null {
  return typeof value === "string" && ACTION_FEEDBACK_CONDITION_SET.has(value)
    ? (value as ActionFeedbackCondition)
    : null;
}

/** Exhaustively map a semantic action outcome to its immutable catalog descriptor. */
export function actionFeedbackDescriptor(
  condition: ActionFeedbackCondition,
): MessageDescriptor {
  return ACTION_FEEDBACK_DESCRIPTORS[condition];
}

interface ActionFeedbackState {
  condition: ActionFeedbackCondition | null;
  token: number;
  announce: (condition: unknown) => void;
  clear: () => void;
}

export const useActionFeedbackStore = create<ActionFeedbackState>((set) => ({
  condition: null,
  token: 0,
  announce: (condition) =>
    set((state) => {
      const normalized = normalizeActionFeedbackCondition(condition);
      return normalized === null
        ? state
        : { condition: normalized, token: state.token + 1 };
    }),
  clear: () => set((state) => ({ condition: null, token: state.token + 1 })),
}));

export function announceActionFeedback(condition: unknown): void {
  useActionFeedbackStore.getState().announce(condition);
}

export function clearActionFeedback(): void {
  useActionFeedbackStore.getState().clear();
}

export function actionFeedbackSnapshot(): {
  condition: ActionFeedbackCondition | null;
  token: number;
} {
  const { condition, token } = useActionFeedbackStore.getState();
  return { condition, token };
}

export function useActionFeedbackCondition(): ActionFeedbackCondition | null {
  return useActionFeedbackStore((state) => state.condition);
}

export function useActionFeedbackToken(): number {
  return useActionFeedbackStore((state) => state.token);
}
