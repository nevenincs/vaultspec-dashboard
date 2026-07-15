// Project interpreted status into tone and count data for each control panel.
// User-facing labels are resolved by the rendering boundary.

import { useMemo } from "react";

import type { FooterChipId } from "../../view/controlPanels";
import { useReviewStationView } from "../authoring";
import { useStatusRollup, type CoreStatusView, type RagStatusView } from "./status";

/** The health tone a chip renders, in the standard status-dot vocabulary. `unknown`
 *  is the first-load state before any status has resolved. */
export type FrameworkStatusTone = "ok" | "attention" | "down" | "unknown";

export interface FrameworkStatusChip {
  tone: FrameworkStatusTone;
  count?: number;
}

/** The cluster projection, one chip per footer control panel. Backend health is
 *  not a footer chip (it was pulled from the rail — see `FOOTER_CHIP_IDS`), so it
 *  is not projected here; its panel reads the interpreted status rollup directly. */
export type FrameworkStatusView = Record<FooterChipId, FrameworkStatusChip>;

/** The interpreted inputs the pure derive consumes, each already read through an
 *  existing status selector (no raw tiers). Flat primitives so the projection is
 *  unit-testable and the hook can key its `useMemo` on the same fields. */
export interface FrameworkStatusInputs {
  /** The interpreted core/vault view. */
  core: Pick<CoreStatusView, "loading" | "errored" | "reachable" | "vaultHealth">;
  /** The interpreted rag/search view. */
  rag: Pick<RagStatusView, "loading" | "errored" | "degraded">;
  /** The interpreted approvals queue. */
  approvals: {
    loading: boolean;
    storeUnavailable: boolean;
    degraded: boolean;
    /** The served bounded queue length (a floor when `truncated`). */
    pending: number;
    truncated: boolean;
  };
}

/** Vault-health words the engine serves that mean "healthy" — anything else served
 *  is a real condition worth attention. "green" is the engine's canonical healthy
 *  word (the live adapter's vault-green rollup); the chip and the Vault health
 *  panel MUST read the same set so the ambient indicator never contradicts the
 *  panel it opens. */
export const HEALTHY_VAULT_WORDS: ReadonlySet<string> = new Set([
  "healthy",
  "ok",
  "green",
]);

function deriveVaultChip(core: FrameworkStatusInputs["core"]): FrameworkStatusChip {
  if (core.errored || !core.reachable) {
    return { tone: core.loading ? "unknown" : "down" };
  }
  const word = core.vaultHealth?.trim().toLowerCase();
  if (word !== undefined && word.length > 0 && !HEALTHY_VAULT_WORDS.has(word)) {
    return { tone: "attention" };
  }
  return { tone: "ok" };
}

function deriveSearchChip(rag: FrameworkStatusInputs["rag"]): FrameworkStatusChip {
  if (rag.errored || rag.degraded) return { tone: "down" };
  if (rag.loading) return { tone: "unknown" };
  return { tone: "ok" };
}

function deriveApprovalsChip(
  approvals: FrameworkStatusInputs["approvals"],
): FrameworkStatusChip {
  if (approvals.storeUnavailable) return { tone: "down" };
  if (approvals.loading) return { tone: "unknown" };
  if (approvals.pending > 0) {
    // The count is a SERVED number only when the queue is complete; a truncated
    // queue reports attention with no exact count (never a re-count over a cap).
    return approvals.truncated
      ? { tone: "attention" }
      : { tone: "attention", count: approvals.pending };
  }
  if (approvals.degraded) return { tone: "attention" };
  return { tone: "ok" };
}

/**
 * Project each control-panel chip from interpreted status inputs.
 */
export function deriveFrameworkStatusView(
  input: FrameworkStatusInputs,
): FrameworkStatusView {
  return {
    "search-service": deriveSearchChip(input.rag),
    approvals: deriveApprovalsChip(input.approvals),
    "vault-health": deriveVaultChip(input.core),
  };
}

/**
 * The cluster projection hook: composes the existing status rollup and review-station
 * views, then derives the chips in a `useMemo` keyed on the raw primitive slices
 * it reads (frontend-store-selectors: derive outside the selector). The heavier
 * review-queue read rides `useReviewStationView`, the only served source of the
 * pending count; the panel bodies still mount-gate their own detail reads.
 */
export function useFrameworkStatusView(): FrameworkStatusView {
  const rollup = useStatusRollup();
  const review = useReviewStationView();

  const coreLoading = rollup.core.loading;
  const coreErrored = rollup.core.errored;
  const coreReachable = rollup.core.reachable;
  const coreVaultHealth = rollup.core.vaultHealth;
  const ragLoading = rollup.rag.loading;
  const ragErrored = rollup.rag.errored;
  const ragDegraded = rollup.rag.degraded;
  const approvalsLoading = review.loading;
  const approvalsStoreUnavailable = review.storeUnavailable;
  const approvalsDegraded = review.degraded;
  const approvalsPending = review.rows.length;
  const approvalsTruncated = review.truncated;

  return useMemo(
    () =>
      deriveFrameworkStatusView({
        core: {
          loading: coreLoading,
          errored: coreErrored,
          reachable: coreReachable,
          vaultHealth: coreVaultHealth,
        },
        rag: { loading: ragLoading, errored: ragErrored, degraded: ragDegraded },
        approvals: {
          loading: approvalsLoading,
          storeUnavailable: approvalsStoreUnavailable,
          degraded: approvalsDegraded,
          pending: approvalsPending,
          truncated: approvalsTruncated,
        },
      }),
    [
      coreLoading,
      coreErrored,
      coreReachable,
      coreVaultHealth,
      ragLoading,
      ragErrored,
      ragDegraded,
      approvalsLoading,
      approvalsStoreUnavailable,
      approvalsDegraded,
      approvalsPending,
      approvalsTruncated,
    ],
  );
}
