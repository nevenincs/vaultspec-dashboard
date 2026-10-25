import { EngineError } from "../engine";
import type { AuthoringCommandOutcome } from "./wireTypes";

export type ReviewCommand =
  | "approve"
  | "reject"
  // The request-changes verdict is served as the engine command `edit_proposal`
  // (CommandKind::EditProposal); the UI presents it as "Request changes".
  | "edit_proposal"
  | "submit_for_review"
  | "request_apply"
  | "create_rollback";

const REVIEW_COMMANDS: readonly ReviewCommand[] = [
  "approve",
  "reject",
  "edit_proposal",
  "submit_for_review",
  "request_apply",
  "create_rollback",
];

export function reviewCommand(value: unknown): ReviewCommand | undefined {
  return REVIEW_COMMANDS.includes(value as ReviewCommand)
    ? (value as ReviewCommand)
    : undefined;
}

export type ReviewCommandOutcome =
  | { kind: "accepted" }
  | { kind: "inFlight" }
  | { kind: "refused"; reason: "notAllowed" | "rollbackUnavailable" };

export function normalizeReviewCommandOutcome(
  outcome: AuthoringCommandOutcome,
): ReviewCommandOutcome {
  switch (outcome.kind) {
    case "denied":
      return { kind: "refused", reason: "notAllowed" };
    case "unavailable":
      return { kind: "refused", reason: "rollbackUnavailable" };
    case "in_flight":
      return { kind: "inFlight" };
    case "ok":
      return { kind: "accepted" };
  }
}

export type ReviewCommandFailureKind =
  | "reviewChanged"
  | "reviewUnavailable"
  | "reviewerUnavailable"
  | "actionFailed";

const REVIEW_CHANGED_ERROR_KINDS = new Set([
  "authoring_stale_review",
  "authoring_stale_revision",
  "authoring_stale_base",
]);

const REVIEW_UNAVAILABLE_ERROR_KINDS = new Set([
  "authoring_store_unavailable",
  "authoring_proposal_not_found",
]);

const REVIEWER_UNAVAILABLE_ERROR_KINDS = new Set([
  "authoring_actor_token_missing",
  "authoring_actor_token_unknown",
  "authoring_authorization_denied",
  "authoring_actor_forbidden",
]);

export function reviewCommandFailureKind(error: unknown): ReviewCommandFailureKind {
  if (!(error instanceof EngineError)) return "actionFailed";
  const kind = error.errorKind;
  if (kind && REVIEW_CHANGED_ERROR_KINDS.has(kind)) return "reviewChanged";
  if (kind && REVIEW_UNAVAILABLE_ERROR_KINDS.has(kind)) return "reviewUnavailable";
  if (kind && REVIEWER_UNAVAILABLE_ERROR_KINDS.has(kind)) {
    return "reviewerUnavailable";
  }
  return "actionFailed";
}
