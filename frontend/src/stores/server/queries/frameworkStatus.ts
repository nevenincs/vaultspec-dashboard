// The rail-footer approvals projection (advanced-service-console ADR D3).
//
// This module used to project one chip per rail-footer control panel. Those chips
// were dev status bleeding into the user chrome and left with them: the index,
// system-status, project-health, and agent consoles now live behind Settings ▸
// Advanced, and the health truth renders there (ADR D2/D6). What SURVIVES in the
// user chrome is the pending-changes affordance — a served count plus an
// open-review intent — because the review queue feeds the authoring workflow
// rather than reporting on a tool's health.
//
// User-facing labels are resolved by the rendering boundary; this layer projects
// interpreted truth only (no raw tiers).

import { useMemo } from "react";

import { useReviewStationView } from "../authoring";
import type { CoreStatusView } from "./status";

/** The health tone a status mark renders, in the standard status-dot vocabulary.
 *  `unknown` is the first-load state before any status has resolved. */
export type FrameworkStatusTone = "ok" | "attention" | "down" | "unknown";

/** One projected status mark: a tone and, at most, one served count. */
export interface FrameworkStatusChip {
  tone: FrameworkStatusTone;
  count?: number;
}

/** The interpreted inputs the pure derive consumes, already read through the
 *  review-station selector. Flat primitives so the projection is unit-testable and
 *  the hook can key its `useMemo` on the same fields. */
export interface ApprovalsStatusInputs {
  loading: boolean;
  storeUnavailable: boolean;
  degraded: boolean;
  /** The served bounded queue length (a floor when `truncated`). */
  queued: number;
  truncated: boolean;
}

/** Vault-health words the engine serves that mean "healthy" — anything else served
 *  is a real condition worth attention. "green" is the engine's canonical healthy
 *  word (the live adapter's vault-green rollup); every surface classifying vault
 *  health MUST read the same set so two renderings never contradict each other. */
export const HEALTHY_VAULT_WORDS: ReadonlySet<string> = new Set([
  "healthy",
  "ok",
  "green",
]);

/** Classify a served vault-health word into the shared status tone. Consumed by the
 *  Advanced project-health console, the only surface rendering vault health now
 *  that the rail chip retired. */
export function deriveVaultHealthTone(
  core: Pick<CoreStatusView, "loading" | "errored" | "reachable" | "vaultHealth">,
): FrameworkStatusTone {
  if (core.errored || !core.reachable) return core.loading ? "unknown" : "down";
  const word = core.vaultHealth?.trim().toLowerCase();
  if (word !== undefined && word.length > 0 && !HEALTHY_VAULT_WORDS.has(word)) {
    return "attention";
  }
  return "ok";
}

/** Project the approvals affordance from the interpreted review-queue inputs. */
export function deriveApprovalsStatusView(
  input: ApprovalsStatusInputs,
): FrameworkStatusChip {
  if (input.storeUnavailable) return { tone: "down" };
  if (input.loading) return { tone: "unknown" };
  if (input.queued > 0) {
    // The count is a SERVED number only when the queue is complete; a truncated
    // queue reports attention with no exact count (never a re-count over a cap).
    return input.truncated
      ? { tone: "attention" }
      : { tone: "attention", count: input.queued };
  }
  if (input.degraded) return { tone: "attention" };
  return { tone: "ok" };
}

/**
 * The approvals projection hook: composes the review-station view — the only
 * served source of the pending count — then derives the affordance state in a
 * `useMemo` keyed on the raw primitive slices it reads (frontend-store-selectors:
 * derive outside the selector).
 */
export function useApprovalsStatusView(): FrameworkStatusChip {
  const review = useReviewStationView();

  const loading = review.loading;
  const storeUnavailable = review.storeUnavailable;
  const degraded = review.degraded;
  const queued = review.rows.length;
  const truncated = review.truncated;

  return useMemo(
    () =>
      deriveApprovalsStatusView({
        loading,
        storeUnavailable,
        degraded,
        queued,
        truncated,
      }),
    [loading, storeUnavailable, degraded, queued, truncated],
  );
}
