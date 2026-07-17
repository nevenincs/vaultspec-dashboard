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
import type {
  ActorKind,
  ApprovalRequirement,
  ChangesetStatus,
  OperationMode,
  ValidationStatus,
} from "./wireTypes";
import {
  REVIEW_CONFIRMATIONS,
  REVIEW_STATION_MESSAGES,
  reviewAcknowledgementCountDescriptor,
  reviewAuthorKindDescriptor,
  reviewChangeCountDescriptor,
  reviewCommandPresentation,
  reviewFailureDescriptor,
  reviewPolicyDescriptor,
  reviewStaleDescriptor,
  reviewStatusDescriptor,
  reviewValidationDescriptor,
} from "./reviewStationVocabulary";

const statuses = Object.freeze([
  "draft",
  "generating",
  "proposed",
  "needs_review",
  "approved",
  "applying",
  "applied",
  "partially_applied",
  "compensation_required",
  "rejected",
  "conflicted",
  "superseded",
  "failed",
  "rollback_proposed",
  "cancelled",
] as const satisfies readonly ChangesetStatus[]);

const commands = Object.freeze([
  "approve",
  "reject",
  "edit_proposal",
  "submit_for_review",
  "request_apply",
  "create_rollback",
] as const);

const modes = Object.freeze([
  "manual",
  "assisted",
  "autonomous",
] as const satisfies readonly OperationMode[]);

const requirements = Object.freeze([
  "human_approval_required",
  "system_auto_approvable",
] as const satisfies readonly ApprovalRequirement[]);

const actorKinds = Object.freeze([
  "human",
  "agent",
  "system",
  "tool_executor",
] as const satisfies readonly ActorKind[]);

const validations = Object.freeze([
  "valid",
  "valid_with_warnings",
  "invalid",
  "stale",
] as const satisfies readonly ValidationStatus[]);

function expectTranslatedWithoutFallback(descriptor: AnyMessageDescriptor): void {
  const results = [
    createTestLocalizationRuntime(),
    createTestLocalizationRuntime(ltrTestLocale),
    createTestLocalizationRuntime(rtlTestLocale),
  ].map((runtime) => resolveMessageResult(runtime, descriptor));

  expect(
    results.every((result) => !result.usedFallback),
    descriptor.key,
  ).toBe(true);
  for (const result of results) {
    expect(result.message, descriptor.key).not.toMatch(/\{\{|\$t\(/u);
  }
}

describe("review station presentation vocabulary", () => {
  it("maps every exact lifecycle status and fails closed for hostile values", () => {
    for (const status of statuses) {
      const descriptor = reviewStatusDescriptor(status);
      expect(Object.isFrozen(descriptor)).toBe(true);
      expectTranslatedWithoutFallback(descriptor);
    }

    const safe = reviewStatusDescriptor("future_internal_state actor_id=private");
    expect(safe.key).toBe("documents:reviewStation.statuses.unknown");
    expect(reviewStatusDescriptor({ status: "approved" })).toBe(safe);
    expectTranslatedWithoutFallback(safe);
  });

  it("provides stable command labels and truthful typed confirmations", () => {
    for (const command of commands) {
      const presentation = reviewCommandPresentation(command);
      expect(presentation.command).toBe(command);
      expect(presentation.kind).toBe(
        command === "submit_for_review"
          ? "direct"
          : command === "edit_proposal"
            ? "commented"
            : command === "reject"
              ? "destructive"
              : "guarded",
      );
      expect(Object.isFrozen(presentation)).toBe(true);
      expectTranslatedWithoutFallback(presentation.label);
      if (presentation.confirmation) {
        expect(Object.isFrozen(presentation.confirmation)).toBe(true);
        expectTranslatedWithoutFallback(presentation.confirmation.title);
        expectTranslatedWithoutFallback(presentation.confirmation.body);
        expectTranslatedWithoutFallback(presentation.confirmation.confirmLabel);
      }
    }

    expect(REVIEW_CONFIRMATIONS.approve.kind).toBe("guarded");
    expect(REVIEW_CONFIRMATIONS.apply.kind).toBe("guarded");
    expect(REVIEW_CONFIRMATIONS.rollback.kind).toBe("guarded");
    expect(REVIEW_CONFIRMATIONS.reject.kind).toBe("destructive");
    expect(
      Object.values(REVIEW_CONFIRMATIONS).every(isActionConfirmationDescriptor),
    ).toBe(true);
    const submit = reviewCommandPresentation("submit_for_review");
    const approve = reviewCommandPresentation("approve");
    const apply = reviewCommandPresentation("request_apply");
    const rollback = reviewCommandPresentation("create_rollback");
    const reject = reviewCommandPresentation("reject");
    expect(submit.kind === "direct" && submit.confirmation === undefined).toBe(true);
    expect(approve.kind === "guarded" && approve.confirmation.kind === "guarded").toBe(
      true,
    );
    expect(apply.kind === "guarded" && apply.confirmation.kind === "guarded").toBe(
      true,
    );
    expect(
      rollback.kind === "guarded" && rollback.confirmation.kind === "guarded",
    ).toBe(true);
    expect(
      reject.kind === "destructive" && reject.confirmation.kind === "destructive",
    ).toBe(true);

    const english = createTestLocalizationRuntime();
    expect(
      resolveMessageResult(english, REVIEW_CONFIRMATIONS.approve.body).message,
    ).toContain("can be applied");
    expect(resolveMessageResult(english, REVIEW_CONFIRMATIONS.apply.body).message).toBe(
      "Apply the approved changes to the affected documents.",
    );
    expect(
      resolveMessageResult(english, REVIEW_CONFIRMATIONS.reject.body).message,
    ).toBe("Reject this proposal without applying its document changes.");
    expect(
      resolveMessageResult(english, REVIEW_CONFIRMATIONS.rollback.body).message,
    ).toContain("new proposal");

    const unknown = reviewCommandPresentation("delete_private_actor_123");
    expect(unknown.command).toBeNull();
    expect(unknown.kind).toBe("unavailable");
    expect(unknown.confirmation).toBeNull();
    expect(unknown.label.key).toBe("documents:reviewStation.labels.actionUnavailable");
  });

  it("uses complete policy messages instead of translated fragments", () => {
    const keys = new Set<string>();
    for (const mode of modes) {
      for (const requirement of requirements) {
        const descriptor = reviewPolicyDescriptor(mode, requirement);
        keys.add(descriptor.key);
        expectTranslatedWithoutFallback(descriptor);
      }
    }
    expect(keys.size).toBe(6);

    const safe = reviewPolicyDescriptor("private_mode", "private_requirement");
    expect(safe.key).toBe("documents:reviewStation.policy.unavailable");
    expect(reviewPolicyDescriptor("manual", { requirement: "human" })).toBe(safe);
  });

  it("maps author and validation tokens without exposing raw values or actor ids", () => {
    for (const actorKind of actorKinds) {
      expectTranslatedWithoutFallback(reviewAuthorKindDescriptor(actorKind));
    }
    for (const validation of validations) {
      expectTranslatedWithoutFallback(reviewValidationDescriptor(validation));
    }

    const unknownAuthor = reviewAuthorKindDescriptor("actor_id=private-reviewer");
    const unknownValidation = reviewValidationDescriptor("private_validation_digest");
    expect(unknownAuthor.key).toBe("documents:reviewStation.authorKinds.unknown");
    expect(unknownValidation.key).toBe(
      "documents:reviewStation.validation.unavailable",
    );
    expectTranslatedWithoutFallback(unknownAuthor);
    expectTranslatedWithoutFallback(unknownValidation);
  });

  it("covers stale, failure, state, feedback, and count descriptors", () => {
    const descriptors: AnyMessageDescriptor[] = [
      reviewStaleDescriptor("policy_version_changed"),
      reviewStaleDescriptor("private stale reason"),
      reviewFailureDescriptor("reviewChanged"),
      reviewFailureDescriptor("reviewUnavailable"),
      reviewFailureDescriptor("reviewerUnavailable"),
      reviewFailureDescriptor("actionFailed"),
      ...Object.values(REVIEW_STATION_MESSAGES),
      reviewChangeCountDescriptor(2),
      reviewAcknowledgementCountDescriptor(7),
    ];

    for (const descriptor of descriptors) {
      expectTranslatedWithoutFallback(descriptor);
    }
    expect(reviewChangeCountDescriptor(Number.NaN).values.count).toBe(0);
    expect(reviewAcknowledgementCountDescriptor(-1).values.count).toBe(0);
  });
});
