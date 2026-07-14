import { useMutation } from "@tanstack/react-query";

import {
  opsReceiptFromError,
  opsReceiptFromResult,
  useActiveScope,
  useInvalidateEngineStatus,
} from "../server/queries";
import {
  dispatchOps,
  lookupOpsWhitelistEntry,
  normalizeOpsWhitelistIntent,
  type OperationConcept,
  type OpsPayload,
} from "../server/opsActions";
import { EngineError, readTierAvailability, type OpsResult } from "../server/engine";
import { useInvalidateAfterRagOpsRun } from "../server/ragControl";
import {
  beginCommandPaletteOpsFeedback,
  commandPaletteOpsFeedback,
  setCommandPaletteOpsFeedbackForEpoch,
  type CommandPaletteOpsCondition,
} from "./commandPalette";
import { currentOpsReceiptEpoch, setOpsReceiptForEpoch } from "./opsReceipt";

export interface OpsRunVariables {
  target: unknown;
  verb: unknown;
}

interface OpsRunContext {
  epoch: number;
}

interface NormalizedOpsRunVariables {
  target: OpsPayload["target"];
  verb: string;
}

export function normalizeOpsRunVariables(
  variables: unknown,
): NormalizedOpsRunVariables | null {
  return normalizeOpsWhitelistIntent(variables);
}

export function opsRunReceiptVerb(variables: unknown): string {
  const normalized = normalizeOpsRunVariables(variables);
  return normalized?.verb ?? "operation";
}

function opsRunInvalidMessage(variables: unknown): string {
  return `operation is not app-whitelisted: ${opsRunReceiptVerb(variables)}`;
}

export function useOpsRunMutation() {
  const scope = useActiveScope();
  const invalidateStatus = useInvalidateEngineStatus();
  const invalidateRagOpsRun = useInvalidateAfterRagOpsRun(scope);

  return useMutation<
    Awaited<ReturnType<typeof dispatchOps>>,
    unknown,
    OpsRunVariables,
    OpsRunContext
  >({
    // The intent flows through the platform dispatch seam (logged + traced +
    // guardable centrally), not an ad-hoc client call.
    mutationFn: (variables) => {
      const intent = normalizeOpsRunVariables(variables);
      if (intent === null) {
        throw new Error(opsRunInvalidMessage(variables));
      }
      return dispatchOps(intent satisfies OpsPayload);
    },
    onMutate: () => ({ epoch: currentOpsReceiptEpoch() }),
    onSuccess: (result, vars, context) => {
      const intent = normalizeOpsRunVariables(vars);
      if (intent === null) return;
      if (intent.target === "rag") {
        invalidateRagOpsRun(intent.verb);
      } else {
        invalidateStatus();
      }
      setOpsReceiptForEpoch(
        context?.epoch ?? currentOpsReceiptEpoch(),
        opsReceiptFromResult(intent.verb, result),
      );
    },
    onError: (err, vars, context) => {
      setOpsReceiptForEpoch(
        context?.epoch ?? currentOpsReceiptEpoch(),
        opsReceiptFromError(opsRunReceiptVerb(vars), err),
      );
    },
  });
}

interface CommandPaletteOpsRunContext {
  epoch: number;
  concept: OperationConcept | null;
}

export type CommandPaletteOpsOutcome = Exclude<CommandPaletteOpsCondition, "running">;

function requiresSemanticAvailability(concept: OperationConcept): boolean {
  switch (concept) {
    case "enable-search":
    case "refresh-search":
    case "apply-search-settings":
      return true;
    case "check-workspace":
    case "show-workspace-details":
    case "disable-search":
      return false;
  }
}

export function classifyCommandPaletteOpsResult(
  concept: OperationConcept,
  result: OpsResult,
): CommandPaletteOpsOutcome {
  if (!result.ok) return "failed";
  return requiresSemanticAvailability(concept) &&
    readTierAvailability(result.tiers, ["semantic"]).degraded
    ? "unavailable"
    : "succeeded";
}

export function classifyCommandPaletteOpsError(
  concept: OperationConcept,
  error: unknown,
): CommandPaletteOpsOutcome {
  return requiresSemanticAvailability(concept) &&
    error instanceof EngineError &&
    readTierAvailability(error.tiers, ["semantic"]).degraded
    ? "unavailable"
    : "failed";
}

function commandPaletteOperationConcept(
  variables: OpsRunVariables,
): OperationConcept | null {
  return lookupOpsWhitelistEntry(variables.target, variables.verb)?.concept ?? null;
}

function feedbackFor(
  concept: OperationConcept | null,
  condition: CommandPaletteOpsCondition,
) {
  return commandPaletteOpsFeedback({ concept, condition });
}

export function useCommandPaletteOpsRunMutation() {
  const scope = useActiveScope();
  const invalidateStatus = useInvalidateEngineStatus();
  const invalidateRagOpsRun = useInvalidateAfterRagOpsRun(scope);

  return useMutation<
    Awaited<ReturnType<typeof dispatchOps>>,
    unknown,
    OpsRunVariables,
    CommandPaletteOpsRunContext
  >({
    mutationFn: (variables) => {
      const intent = normalizeOpsRunVariables(variables);
      if (intent === null) {
        throw new Error(opsRunInvalidMessage(variables));
      }
      return dispatchOps(intent satisfies OpsPayload);
    },
    onMutate: (variables) => {
      const concept = commandPaletteOperationConcept(variables);
      return {
        concept,
        epoch: beginCommandPaletteOpsFeedback(feedbackFor(concept, "running")),
      };
    },
    onSuccess: (result, vars, context) => {
      const intent = normalizeOpsRunVariables(vars);
      if (intent === null) return;
      if (intent.target === "rag") {
        invalidateRagOpsRun(intent.verb);
      } else {
        invalidateStatus();
      }
      const concept = context.concept;
      setCommandPaletteOpsFeedbackForEpoch(
        context.epoch,
        concept === null
          ? feedbackFor(null, "failed")
          : feedbackFor(concept, classifyCommandPaletteOpsResult(concept, result)),
      );
    },
    onError: (err, vars, context) => {
      const concept = context?.concept ?? commandPaletteOperationConcept(vars);
      const feedback =
        concept === null
          ? feedbackFor(null, "failed")
          : feedbackFor(concept, classifyCommandPaletteOpsError(concept, err));
      if (!context) {
        beginCommandPaletteOpsFeedback(feedback);
        return;
      }
      setCommandPaletteOpsFeedbackForEpoch(context.epoch, feedback);
    },
  });
}
