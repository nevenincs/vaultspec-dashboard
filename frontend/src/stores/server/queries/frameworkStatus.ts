// The framework-status cluster projection (activity-rail-realignment ADR D2). The
// rail-footer status cluster shows one chip per control panel — Search service,
// Approvals, Backend health, Vault health — each rendering a served health tone and
// at most one served count. The tones/counts are INTERPRETED here in the stores
// layer from the existing status selectors, so the dumb cluster maps only
// presentation (token -> dot tone, label) and never touches raw `tiers`
// (architecture-boundaries / degradation-is-read-from-tiers).
//
// Every input is read through an EXISTING interpreted selector — the status rollup
// (engine reachability, the served `degradations` list, the core and rag views) and
// the review-station view — never the raw wire block. Counts are served numbers: the
// approvals count is omitted when the served queue is truncated, so the chip never
// shows a re-count over a capped slice (wire-contract).

import { useMemo } from "react";

import type { ControlPanelId } from "../../view/controlPanels";
import { useReviewStationView } from "../authoring";
import { useStatusRollup, type CoreStatusView, type RagStatusView } from "./status";

/** The health tone a chip renders, in the standard status-dot vocabulary. `unknown`
 *  is the first-load state before any status has resolved. */
export type FrameworkStatusTone = "ok" | "attention" | "down" | "unknown";

/** One chip's projected view: a served tone, an optional served count, and the
 *  plain-language panel label. */
export interface FrameworkStatusChip {
  tone: FrameworkStatusTone;
  count?: number;
  label: string;
}

/** The full cluster projection, one chip per panel id. */
export type FrameworkStatusView = Record<ControlPanelId, FrameworkStatusChip>;

/** Plain-language labels — never internal vocabulary (no "rag"/"tier" on screen). */
const PANEL_LABELS: FrameworkStatusView = {
  "search-service": { tone: "unknown", label: "Search service" },
  approvals: { tone: "unknown", label: "Approvals" },
  "backend-health": { tone: "unknown", label: "Backend health" },
  "vault-health": { tone: "unknown", label: "Vault health" },
};

/** The interpreted inputs the pure derive consumes, each already read through an
 *  existing status selector (no raw tiers). Flat primitives so the projection is
 *  unit-testable and the hook can key its `useMemo` on the same fields. */
export interface FrameworkStatusInputs {
  /** The status snapshot is in flight with nothing resolved yet. */
  engineLoading: boolean;
  /** The status query errored (no tiers-bearing envelope) — engine unreachable. */
  engineUnreachable: boolean;
  /** The served degradation rollup size (engine `/status` `degradations`). */
  degradedBackendCount: number;
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
 *  is a real condition worth attention. */
const HEALTHY_VAULT_WORDS = new Set(["healthy", "ok"]);

function deriveBackendChip(input: FrameworkStatusInputs): FrameworkStatusChip {
  const label = PANEL_LABELS["backend-health"].label;
  if (input.engineUnreachable) return { tone: "down", label };
  if (input.engineLoading) return { tone: "unknown", label };
  if (input.degradedBackendCount > 0) {
    return { tone: "attention", count: input.degradedBackendCount, label };
  }
  return { tone: "ok", label };
}

function deriveVaultChip(core: FrameworkStatusInputs["core"]): FrameworkStatusChip {
  const label = PANEL_LABELS["vault-health"].label;
  if (core.errored || !core.reachable) {
    return { tone: core.loading ? "unknown" : "down", label };
  }
  const word = core.vaultHealth?.trim().toLowerCase();
  if (word !== undefined && word.length > 0 && !HEALTHY_VAULT_WORDS.has(word)) {
    return { tone: "attention", label };
  }
  return { tone: "ok", label };
}

function deriveSearchChip(rag: FrameworkStatusInputs["rag"]): FrameworkStatusChip {
  const label = PANEL_LABELS["search-service"].label;
  if (rag.errored || rag.degraded) return { tone: "down", label };
  if (rag.loading) return { tone: "unknown", label };
  return { tone: "ok", label };
}

function deriveApprovalsChip(
  approvals: FrameworkStatusInputs["approvals"],
): FrameworkStatusChip {
  const label = PANEL_LABELS.approvals.label;
  if (approvals.storeUnavailable) return { tone: "down", label };
  if (approvals.loading) return { tone: "unknown", label };
  if (approvals.pending > 0) {
    // The count is a SERVED number only when the queue is complete; a truncated
    // queue reports attention with no exact count (never a re-count over a cap).
    return approvals.truncated
      ? { tone: "attention", label }
      : { tone: "attention", count: approvals.pending, label };
  }
  if (approvals.degraded) return { tone: "attention", label };
  return { tone: "ok", label };
}

/**
 * Project the four chips from the interpreted status inputs. Pure — no hook, no
 * store — so tone mapping is unit-testable per plane.
 */
export function deriveFrameworkStatusView(
  input: FrameworkStatusInputs,
): FrameworkStatusView {
  return {
    "search-service": deriveSearchChip(input.rag),
    approvals: deriveApprovalsChip(input.approvals),
    "backend-health": deriveBackendChip(input),
    "vault-health": deriveVaultChip(input.core),
  };
}

/**
 * The cluster projection hook: composes the existing status rollup and review-station
 * views, then derives the four chips in a `useMemo` keyed on the raw primitive slices
 * it reads (frontend-store-selectors: derive outside the selector). The heavier
 * review-queue read rides `useReviewStationView`, the only served source of the
 * pending count; the panel bodies still mount-gate their own detail reads.
 */
export function useFrameworkStatusView(): FrameworkStatusView {
  const rollup = useStatusRollup();
  const review = useReviewStationView();

  const engineLoading = rollup.core.loading;
  const engineUnreachable = rollup.engineUnreachable;
  const degradedBackendCount = rollup.degradations.length;
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
        engineLoading,
        engineUnreachable,
        degradedBackendCount,
        core: {
          loading: engineLoading,
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
      engineLoading,
      engineUnreachable,
      degradedBackendCount,
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
