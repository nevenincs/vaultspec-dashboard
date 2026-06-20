import { useMutation } from "@tanstack/react-query";

import {
  opsReceiptFromError,
  opsReceiptFromResult,
  useActiveScope,
  useInvalidateEngineStatus,
} from "../server/queries";
import {
  dispatchOps,
  normalizeOpsWhitelistIntent,
  type OpsPayload,
} from "../server/opsActions";
import { useInvalidateAfterRagOpsRun } from "../server/ragControl";
import {
  beginCommandPaletteOpsFeedback,
  setCommandPaletteOpsFeedbackForEpoch,
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
    onMutate: (variables) => ({
      epoch: beginCommandPaletteOpsFeedback(
        `${opsRunReceiptVerb(variables)}: running…`,
      ),
    }),
    onSuccess: (result, vars, context) => {
      const intent = normalizeOpsRunVariables(vars);
      if (intent === null) return;
      if (intent.target === "rag") {
        invalidateRagOpsRun(intent.verb);
      } else {
        invalidateStatus();
      }
      const receipt = opsReceiptFromResult(intent.verb, result);
      setCommandPaletteOpsFeedbackForEpoch(
        context.epoch,
        `${receipt.verb}: ${receipt.text}`,
      );
    },
    onError: (err, vars, context) => {
      const receipt = opsReceiptFromError(opsRunReceiptVerb(vars), err);
      if (!context) {
        beginCommandPaletteOpsFeedback(`${receipt.verb}: ${receipt.text}`);
        return;
      }
      setCommandPaletteOpsFeedbackForEpoch(
        context.epoch,
        `${receipt.verb}: ${receipt.text}`,
      );
    },
  });
}
