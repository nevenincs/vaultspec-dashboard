import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../../localization/testing";
import { resolveMessageResult } from "../../../platform/localization/fallback";
import {
  isActionConfirmationDescriptor,
  type AnyMessageDescriptor,
} from "../../../platform/localization/message";
import type { ActorKind } from "./wireTypes";
import {
  COMMENT_ACTIONS,
  COMMENT_DELETE_CONFIRMATION,
  COMMENT_MESSAGES,
  commentAuthorKindDescriptor,
  commentConnectionIssueDescriptor,
  commentFailureDescriptor,
  commentRelativeTimeDescriptor,
  commentsToReviewCountDescriptor,
  commentSuccessDescriptor,
  type CommentFailureKind,
  type CommentMutationKind,
} from "./commentVocabulary";

const runtimes = () =>
  [
    createTestLocalizationRuntime(),
    createTestLocalizationRuntime(ltrTestLocale),
    createTestLocalizationRuntime(rtlTestLocale),
  ] as const;

function expectLocalized(descriptor: AnyMessageDescriptor): readonly string[] {
  const results = runtimes().map((runtime) =>
    resolveMessageResult(runtime, descriptor),
  );
  expect(
    results.every((result) => !result.usedFallback),
    descriptor.key,
  ).toBe(true);
  expect(results.map((result) => result.message).every(Boolean)).toBe(true);
  return results.map((result) => result.message);
}

describe("comment presentation vocabulary", () => {
  it("provides canonical localized actions and a platform-typed delete confirmation", () => {
    expect(Object.isFrozen(COMMENT_ACTIONS)).toBe(true);
    for (const action of Object.values(COMMENT_ACTIONS)) {
      expect(Object.isFrozen(action)).toBe(true);
      expectLocalized(action);
    }

    expect(isActionConfirmationDescriptor(COMMENT_DELETE_CONFIRMATION)).toBe(true);
    expect(COMMENT_DELETE_CONFIRMATION.kind).toBe("destructive");
    expect(COMMENT_DELETE_CONFIRMATION.confirmLabel).toStrictEqual(
      COMMENT_ACTIONS.delete,
    );
    expect(COMMENT_DELETE_CONFIRMATION.cancelLabel).toStrictEqual(
      COMMENT_ACTIONS.cancel,
    );
    expectLocalized(COMMENT_DELETE_CONFIRMATION.title);
    expectLocalized(COMMENT_DELETE_CONFIRMATION.body);
    expectLocalized(COMMENT_DELETE_CONFIRMATION.confirmLabel);
    expectLocalized(COMMENT_DELETE_CONFIRMATION.cancelLabel);
  });

  it("maps every actor kind and fails closed for unknown actor metadata", () => {
    const kinds = [
      "human",
      "agent",
      "system",
      "tool_executor",
    ] as const satisfies readonly ActorKind[];
    for (const kind of kinds) expectLocalized(commentAuthorKindDescriptor(kind));

    const unknown = commentAuthorKindDescriptor("private_actor_id=123");
    expect(unknown.key).toBe("documents:viewer.comments.authorKinds.unknown");
    expect(commentAuthorKindDescriptor({ kind: "human" })).toBe(unknown);
    expectLocalized(unknown);
  });

  it("maps every served connection issue to safe user language", () => {
    const reasons = [
      "content_hash_mismatch",
      "missing_anchor",
      "ambiguous_anchor",
      "malformed_anchor",
    ] as const;
    for (const reason of reasons) {
      const messages = expectLocalized(commentConnectionIssueDescriptor(reason));
      for (const message of messages) {
        expect(message).not.toMatch(/\b(?:anchor|orphan|wire|hash|payload)\b/iu);
      }
    }

    const unknown = commentConnectionIssueDescriptor("future_wire_reason");
    expect(unknown.key).toBe("documents:viewer.comments.connectionIssues.malformed");
    expect(commentConnectionIssueDescriptor(null)).toBe(unknown);
  });

  it("provides exhaustive semantic success and actionable failure descriptors", () => {
    const mutations = [
      "add",
      "save",
      "resolve",
      "reopen",
      "move",
      "delete",
    ] as const satisfies readonly CommentMutationKind[];
    for (const mutation of mutations) {
      expectLocalized(commentSuccessDescriptor(mutation));
      const failures = expectLocalized(commentFailureDescriptor(mutation));
      expect(failures.every((message) => /[.!?]$/u.test(message))).toBe(true);
    }

    const remainingFailures = [
      "copyLink",
      "load",
    ] as const satisfies readonly CommentFailureKind[];
    for (const failure of remainingFailures) {
      expectLocalized(commentFailureDescriptor(failure));
    }
    expectLocalized(COMMENT_MESSAGES.errors.actorUnavailable);
  });

  it("resolves comment counts and relative time through CLDR catalogs", () => {
    expect(expectLocalized(commentsToReviewCountDescriptor(1))).toEqual([
      "1 comment to review",
      "1 commentaire à examiner",
      "1 تعليق للمراجعة",
    ]);
    expect(expectLocalized(commentsToReviewCountDescriptor(7))).toEqual([
      "7 comments to review",
      "7 commentaires à examiner",
      "7 تعليقات للمراجعة",
    ]);

    const now = Date.UTC(2026, 6, 15, 12);
    const samples = [
      now,
      now - 60_000,
      now - 3_600_000,
      now - 86_400_000,
      now - 31 * 86_400_000,
      now - 370 * 86_400_000,
    ] as const;
    for (const createdAt of samples) {
      expectLocalized(commentRelativeTimeDescriptor(createdAt, now));
    }
    expect(commentRelativeTimeDescriptor("private-time", now)).toBe(
      COMMENT_MESSAGES.states.justNow,
    );
  });
});
