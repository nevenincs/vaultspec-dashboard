// The A2A component lifecycle plane (a2a-product-provisioning W05.P11) — the
// stores-layer SOLE wire client for the engine's `/a2a/lifecycle/*` surface. This
// is where the served install / readiness / ownership projection is fetched, where
// install / start / stop / restart / repair / update / rollback / remove / doctor
// are DISPATCHED as bounded jobs through the one engine client, and where the job
// trigger-then-poll lives. Chrome consumes these hooks and NEVER fetches
// `/a2a/lifecycle/*` directly (architecture-boundaries: stores is the sole wire
// client).
//
// Degradation of the agent ORCHESTRATION tier is read from the served `tiers.agent`
// block via the canonical `readAgentTierAvailability` — never re-derived from a
// transport error (wire-contract). The install-level state (`install_state`,
// `readiness`, `degraded`) is a SEPARATE, controller-served truth the panel renders
// directly. A mutation returns a `{job, attached}` immediately (ADR D3);
// `useA2aLifecycleJob` polls to a terminal state holding no connection open, then
// invalidates the status so the panel re-reads the reconciled projection.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  engineClient,
  type A2aInstallState,
  type A2aLifecycleJob,
  type A2aLifecycleOp,
  type A2aLifecycleRunBody,
  type A2aLifecycleStatus,
  type A2aReadiness,
} from "./engine";
import { readAgentTierAvailability, type AgentAvailability } from "./agent/a2aTeam";
import { dispatchA2aLifecycleRun } from "./a2aLifecycleActions";
import { engineKeys } from "./queries";

/** The lifecycle ops that DESTROY or roll back durable state and so require an
 *  explicit confirm affordance before dispatch (S96). `remove` preserves user data
 *  engine-side but retires the install; `rollback` reverts the active generation. */
export const A2A_DESTRUCTIVE_OPS: ReadonlySet<A2aLifecycleOp> = new Set<A2aLifecycleOp>(
  ["remove", "rollback"],
);

/** Read the served lifecycle projection. The plane is machine-global (a2a is one
 *  resident per machine), so a single cached entry; the status is refetched after a
 *  job settles so a just-reconciled install flips state without a manual reload. */
export function useA2aLifecycleStatus() {
  return useQuery({
    queryKey: engineKeys.a2aLifecycleStatus(),
    queryFn: ({ signal }) => engineClient.a2aLifecycleStatus(signal),
    // Lifecycle state changes only when the operator acts (or a job settles); a
    // short stale window keeps the panel fresh across completions without churn.
    staleTime: 5_000,
    gcTime: 5 * 60_000,
  });
}

/** Dispatch a lifecycle operation. Routes through the ONE platform dispatch seam
 *  (`A2A_LIFECYCLE_RUN_ACTION`, actions-keymap-palette) so a panel button and any
 *  other eligible surface fire the identical verb — mirrors `useProvisionRun`
 *  wrapping `dispatchProvisionRun`. On success the caller receives the job envelope
 *  (and whether it ATTACHED to an in-flight identical op); poll it with
 *  `useA2aLifecycleJob`. The status is invalidated so the projection re-reads once
 *  the job is under way. */
export function useA2aLifecycleRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: A2aLifecycleRunBody) => dispatchA2aLifecycleRun(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: engineKeys.a2aLifecycleStatus(),
      });
    },
  });
}

/** Poll one lifecycle job to a terminal state. Polling stops as soon as the job is
 *  `succeeded` / `failed`; on the transition the status projection is invalidated so
 *  the panel reflects the reconciled post-state. Pass `null` to disable (no job in
 *  flight). Bounded: `refetchInterval` returns `false` once terminal, and a
 *  reclaimed id 404s and settles. */
export function useA2aLifecycleJob(id: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: engineKeys.a2aLifecycleJob(id ?? "none"),
    enabled: id !== null,
    queryFn: async ({ signal }): Promise<A2aLifecycleJob> => {
      const { job } = await engineClient.a2aLifecycleJob(id as string, signal);
      if (job.state !== "running") {
        void queryClient.invalidateQueries({
          queryKey: engineKeys.a2aLifecycleStatus(),
        });
      }
      return job;
    },
    // Trigger-then-poll: refetch while running, stop once terminal (ADR D3).
    refetchInterval: (query) => (query.state.data?.state === "running" ? 1_500 : false),
    gcTime: 5 * 60_000,
  });
}

/** The presentation projection the panel renders — a PURE derivation over the
 *  served status so the panel wraps it in one `useMemo` (frontend-store-selectors:
 *  derivation lives outside the reactive read, never mints a fresh reference on
 *  every render). Every value is either served truth or a UX affordance hint; the
 *  engine remains the authority on which op is legal and refuses authoritatively. */
export interface A2aLifecycleView {
  /** The raw served status, or `undefined` before the first read. */
  status: A2aLifecycleStatus | undefined;
  /** Whether an installed generation exists (`null` = unknown / degraded). */
  installed: boolean | null;
  /** The controller's install-state label. `unknown` before the first read. */
  installState: A2aInstallState | "unknown";
  /** The one served readiness model, or `null` when unknown. */
  readiness: A2aReadiness | null;
  /** Install-level degradation (recovery-required / busy / unverifiable). Distinct
   *  from the orchestration tier's availability. */
  degraded: boolean;
  /** Whether recovery is required before any mutation can proceed. */
  recoveryRequired: boolean;
  /** Whether this seated dashboard owns the install (`ownership.retained`). */
  owned: boolean;
  /** The active generation, when installed. */
  activeGeneration: string | null;
  /** The agent ORCHESTRATION availability read from `tiers.agent` (canonical
   *  reader), never re-derived from a transport error. */
  orchestration: AgentAvailability;
  /** The ops the current state makes eligible — a UX hint that greys clearly
   *  illegal affordances; the engine refuses authoritatively regardless. */
  eligibleOps: ReadonlySet<A2aLifecycleOp>;
  /** The eligible ops that are destructive and need a confirm affordance. */
  destructiveOps: ReadonlySet<A2aLifecycleOp>;
}

/** Derive which ops the current install-state / readiness makes eligible. Doctor
 *  is always offered (a pure read). Install only when nothing is installed; the
 *  receipt-bound mutations only once a settled install exists; start / stop gate on
 *  readiness. A degraded install offers only the recovery-oriented ops. */
function deriveEligibleOps(
  installState: A2aInstallState | "unknown",
  readiness: A2aReadiness | null,
): ReadonlySet<A2aLifecycleOp> {
  const ops = new Set<A2aLifecycleOp>(["doctor"]);
  switch (installState) {
    case "absent":
      ops.add("install");
      return ops;
    case "recovery-required":
    case "unverifiable":
      ops.add("repair");
      return ops;
    case "busy":
      // A mutation authority is held elsewhere; only the read is safe to offer.
      return ops;
    case "settled": {
      // A settled install: the receipt-bound maintenance ops are eligible, plus
      // the readiness-gated process control.
      ops.add("repair");
      ops.add("update");
      ops.add("rollback");
      ops.add("remove");
      ops.add("ensure");
      if (readiness?.state === "gateway-ready") {
        ops.add("stop");
        ops.add("restart");
      } else if (readiness?.state === "installed-stopped") {
        ops.add("start");
      }
      return ops;
    }
    case "unknown":
      return ops;
  }
}

/** Build the panel's presentation projection from the served status. Pure — the
 *  panel calls it inside `useMemo` keyed on the raw status. */
export function deriveA2aLifecycleView(
  status: A2aLifecycleStatus | undefined,
): A2aLifecycleView {
  const installState: A2aInstallState | "unknown" = status?.install_state ?? "unknown";
  const readiness = status?.readiness ?? null;
  const eligibleOps = deriveEligibleOps(installState, readiness);
  const destructiveOps = new Set<A2aLifecycleOp>(
    [...eligibleOps].filter((op) => A2A_DESTRUCTIVE_OPS.has(op)),
  );
  return {
    status,
    installed: status?.installed ?? null,
    installState,
    readiness,
    degraded: status?.degraded ?? false,
    recoveryRequired: status?.recovery_required ?? false,
    owned: status?.ownership?.retained ?? false,
    activeGeneration: status?.active_generation ?? null,
    orchestration: readAgentTierAvailability(status?.tiers),
    eligibleOps,
    destructiveOps,
  };
}

export type {
  A2aInstallState,
  A2aLifecycleJob,
  A2aLifecycleOp,
  A2aLifecycleRunBody,
  A2aLifecycleStatus,
  A2aReadiness,
};
