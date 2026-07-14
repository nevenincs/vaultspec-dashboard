import type { QueryClient } from "@tanstack/react-query";

import {
  COPY_ACTION,
  normalizeCopyWhat,
  type CopyResult,
} from "../../platform/actions/clipboardActions";
import { normalizeAction } from "../../platform/dispatch/dispatch";
import type { ActionFeedbackCondition } from "../view/actionFeedback";
import { envelopeData, type OpsResult } from "./engine";
import { isOpsDispatchIntent, OPS_ACTION, type OpsPayload } from "./opsActions";
import { invalidateAfterVaultMutation } from "./queries";
import { queryClient as defaultQueryClient } from "./queryClient";
import { RELATE_ACTION, type RelateOutcome, type RelatePayload } from "./relateActions";

export interface MenuActionOutcome {
  readonly ok: boolean;
  readonly feedback: ActionFeedbackCondition | null;
}

type MenuDispatchKind = "archive" | "repair" | "copy" | "relate";
type RelateFeedbackCondition =
  | "link-succeeded"
  | "already-linked"
  | "link-conflict"
  | "link-failed"
  | "link-in-progress";

type ClassifiedDispatch =
  | { readonly kind: "unknown" }
  | { readonly kind: "malformed" }
  | { readonly kind: MenuDispatchKind };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCopyPayload(value: unknown): boolean {
  if (!isRecord(value) || typeof value.text !== "string") return false;
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "text" && key !== "what")) return false;
  return value.what === undefined || normalizeCopyWhat(value.what) === value.what;
}

function isRelatePayload(value: unknown): value is RelatePayload {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "src" && key !== "dst" && key !== "scope")) {
    return false;
  }
  return (
    typeof value.src === "string" &&
    value.src.length > 0 &&
    typeof value.dst === "string" &&
    value.dst.length > 0 &&
    (value.scope === undefined ||
      value.scope === null ||
      typeof value.scope === "string")
  );
}

function classifyDispatch(value: unknown): ClassifiedDispatch {
  const dispatch = normalizeAction(value);
  if (dispatch === null) return { kind: "unknown" };
  if (dispatch.type === COPY_ACTION) {
    return isCopyPayload(dispatch.payload) ? { kind: "copy" } : { kind: "malformed" };
  }
  if (dispatch.type === RELATE_ACTION) {
    return isRelatePayload(dispatch.payload)
      ? { kind: "relate" }
      : { kind: "malformed" };
  }
  if (dispatch.type !== OPS_ACTION) return { kind: "unknown" };
  if (!isOpsDispatchIntent(dispatch.payload)) return { kind: "malformed" };

  const payload = dispatch.payload as OpsPayload;
  if (
    payload.target === "core" &&
    payload.mode === "archive" &&
    payload.verb === "feature-archive"
  ) {
    return { kind: "archive" };
  }
  if (
    payload.target === "core" &&
    payload.mode === "autofix" &&
    payload.verb === "autofix"
  ) {
    return { kind: "repair" };
  }
  return { kind: "unknown" };
}

function isOpsResult(value: unknown): value is OpsResult {
  return (
    isRecord(value) &&
    typeof value.ok === "boolean" &&
    Object.hasOwn(value, "envelope") &&
    isRecord(value.tiers)
  );
}

function classifyOpsResult(value: unknown): "succeeded" | "rejected" | null {
  if (!isOpsResult(value) || !isRecord(value.envelope)) return null;
  if (!isRecord(value.envelope.data)) return null;
  const { status, data } = envelopeData(value.envelope);
  if (status === "failed" || data.refused === true || data.conflict === true) {
    return "rejected";
  }
  return status === "ok" && value.ok ? "succeeded" : null;
}

function isCopyResult(value: unknown): value is CopyResult {
  return (
    isRecord(value) && Object.keys(value).length === 1 && typeof value.ok === "boolean"
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRelateOutcome(value: unknown): value is RelateOutcome {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "already_related") {
    return Object.keys(value).length === 1;
  }
  if (!isRecord(value.tiers)) return false;
  switch (value.kind) {
    case "applied":
      return (
        typeof value.changesetId === "string" &&
        isNullableString(value.documentPath) &&
        isNullableString(value.blobHash) &&
        typeof value.replayed === "boolean"
      );
    case "conflict":
      return isRecord(value.conflict);
    case "denied":
    case "failed":
      return isNullableString(value.reason);
    case "in_flight":
      return true;
    default:
      return false;
  }
}

export function classifyRelateFeedback(
  outcome: RelateOutcome,
): RelateFeedbackCondition {
  switch (outcome.kind) {
    case "applied":
      return "link-succeeded";
    case "already_related":
      return "already-linked";
    case "conflict":
      return "link-conflict";
    case "in_flight":
      return "link-in-progress";
    case "denied":
    case "failed":
      return "link-failed";
  }
}

function rejectedFeedback(kind: "archive" | "repair"): ActionFeedbackCondition {
  return kind === "archive" ? "archive-rejected" : "repair-rejected";
}

function succeededFeedback(kind: "archive" | "repair"): ActionFeedbackCondition {
  return kind === "archive" ? "archive-succeeded" : "repair-succeeded";
}

function unavailableFeedback(kind: "archive" | "repair"): ActionFeedbackCondition {
  return kind === "archive" ? "archive-unavailable" : "repair-unavailable";
}

async function settleSilently(outcome: unknown): Promise<void> {
  try {
    await outcome;
  } catch {
    // Unknown or malformed dispatches remain silent and never leak a rejection.
  }
}

export async function consumeMenuActionOutcome(
  dispatchValue: unknown,
  outcome: unknown,
  scope: unknown,
  queryClient: QueryClient = defaultQueryClient,
): Promise<MenuActionOutcome> {
  const dispatch = classifyDispatch(dispatchValue);
  if (dispatch.kind === "unknown") {
    await settleSilently(outcome);
    return { ok: true, feedback: null };
  }
  if (dispatch.kind === "malformed") {
    await settleSilently(outcome);
    return { ok: false, feedback: "action-unavailable" };
  }

  if (dispatch.kind === "archive" || dispatch.kind === "repair") {
    try {
      const result = classifyOpsResult(await outcome);
      if (result === null) return { ok: false, feedback: "action-unavailable" };
      if (result === "rejected") {
        return { ok: false, feedback: rejectedFeedback(dispatch.kind) };
      }
      invalidateAfterVaultMutation(queryClient, scope);
      return { ok: true, feedback: succeededFeedback(dispatch.kind) };
    } catch {
      return { ok: false, feedback: unavailableFeedback(dispatch.kind) };
    }
  }

  if (dispatch.kind === "copy") {
    try {
      const result = await outcome;
      if (!isCopyResult(result)) {
        return { ok: false, feedback: "action-unavailable" };
      }
      return result.ok
        ? { ok: true, feedback: "copy-succeeded" }
        : { ok: false, feedback: "copy-failed" };
    } catch {
      return { ok: false, feedback: "copy-failed" };
    }
  }

  try {
    const result = await outcome;
    if (!isRelateOutcome(result)) {
      return { ok: false, feedback: "action-unavailable" };
    }
    const feedback = classifyRelateFeedback(result);
    return {
      ok: result.kind === "applied" || result.kind === "already_related",
      feedback,
    };
  } catch {
    return { ok: false, feedback: "link-failed" };
  }
}
