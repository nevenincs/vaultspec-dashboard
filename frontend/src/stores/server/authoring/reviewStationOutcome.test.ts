import { describe, expect, it } from "vitest";

import { EngineError } from "../engine";
import type { AuthoringCommandOutcome } from "./wireTypes";
import {
  normalizeReviewCommandOutcome,
  reviewCommand,
  reviewCommandFailureKind,
} from "./reviewStationOutcome";

const tiers = {};

describe("review station command vocabulary", () => {
  it("accepts only commands the review station presents", () => {
    expect(
      [
        "approve",
        "reject",
        "edit_proposal",
        "submit_for_review",
        "request_apply",
        "create_rollback",
      ].map(reviewCommand),
    ).toEqual([
      "approve",
      "reject",
      "edit_proposal",
      "submit_for_review",
      "request_apply",
      "create_rollback",
    ]);
    expect(reviewCommand("future_command_with_internal_metadata")).toBeUndefined();
    expect(reviewCommand({ command: "approve" })).toBeUndefined();
  });
});

describe("review station command outcomes", () => {
  it.each<{
    outcome: AuthoringCommandOutcome;
    expected: ReturnType<typeof normalizeReviewCommandOutcome>;
  }>([
    {
      outcome: {
        kind: "ok",
        status: "accepted_private_receipt_123",
        data: {
          command: "approve",
          actor_id: "private-reviewer-id",
          path: "/private/project/plan.md",
        },
        tiers,
      },
      expected: { kind: "accepted" },
    },
    {
      outcome: { kind: "in_flight", tiers },
      expected: { kind: "inFlight" },
    },
    {
      outcome: {
        kind: "denied",
        command: "approve",
        reason: "policy trace actor_id=private-reviewer-id",
        tiers,
      },
      expected: { kind: "refused", reason: "notAllowed" },
    },
    {
      outcome: {
        kind: "unavailable",
        command: "create_rollback",
        reason: "missing preimage at /private/project/plan.md",
        manual_repair: {
          source_children: ["private-child-id"],
          hint: "run internal repair command",
        },
        tiers,
      },
      expected: { kind: "refused", reason: "rollbackUnavailable" },
    },
  ])("returns only the closed semantic result", ({ outcome, expected }) => {
    const result = normalizeReviewCommandOutcome(outcome);
    expect(result).toEqual(expected);
    expect(JSON.stringify(result)).not.toMatch(
      /private|receipt|actor_id|policy trace|preimage|repair|source_children/i,
    );
  });
});

function engineFailure(errorKind: string): EngineError {
  return new EngineError("/authoring/v1/private-route", 409, {
    body: {
      error_kind: errorKind,
      error: "internal diagnostic /private/project actor_id=reviewer-123",
      reason: "raw policy reason",
    },
  });
}

describe("review station command failures", () => {
  it.each([
    ["authoring_stale_review", "reviewChanged"],
    ["authoring_stale_revision", "reviewChanged"],
    ["authoring_stale_base", "reviewChanged"],
    ["authoring_store_unavailable", "reviewUnavailable"],
    ["authoring_proposal_not_found", "reviewUnavailable"],
    ["authoring_actor_token_missing", "reviewerUnavailable"],
    ["authoring_actor_token_unknown", "reviewerUnavailable"],
    ["authoring_authorization_denied", "reviewerUnavailable"],
    ["authoring_actor_forbidden", "reviewerUnavailable"],
  ] as const)("maps %s to %s", (errorKind, expected) => {
    expect(reviewCommandFailureKind(engineFailure(errorKind))).toBe(expected);
  });

  it("fails closed for unknown and untyped failures", () => {
    expect(reviewCommandFailureKind(engineFailure("future_internal_kind"))).toBe(
      "actionFailed",
    );
    expect(
      reviewCommandFailureKind(
        new Error("private transport diagnostic /private/project/plan.md"),
      ),
    ).toBe("actionFailed");
    expect(reviewCommandFailureKind({ errorKind: "authoring_stale_review" })).toBe(
      "actionFailed",
    );
  });
});
