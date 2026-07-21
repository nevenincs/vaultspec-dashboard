// Shared polling/staleness cadences for the stores-layer wire client
// (resource-bounds: every accumulator is bounded at creation). Centralizing these
// here means a cadence is tuned in exactly one place instead of drifting across
// the modules that happen to poll for the same reason.

/** How often a query self-heals by polling while it sits in TanStack's `error`
 *  state, so a status/registry consumer recovers after an engine-up transition
 *  without requiring a page reload. Shared by `useEngineStatus`, `useWorkspaceMap`,
 *  and `useWorkspaces` — all three read a small engine-owned projection whose only
 *  failure mode worth self-healing is "engine was briefly down". */
export const ERROR_RECOVERY_POLL_MS = 8_000;

/** `refetchInterval` predicate for the error-recovery cadence above: poll while
 *  errored, stop once the query is no longer in that state. */
export function errorRecoveryRefetchInterval(query: {
  state: { status: string };
}): number | false {
  return query.state.status === "error" ? ERROR_RECOVERY_POLL_MS : false;
}

/** How long an operator-driven status projection (provisioning, A2A lifecycle) is
 *  held fresh before a refetch. These projections change only when the operator
 *  acts or a job settles, so a short stale window keeps the panel current across
 *  completions without polling churn. */
export const OPERATOR_STATUS_STALE_MS = 5_000;

/** Bounded retention for the operator-status projection above (resource-bounds:
 *  every cache entry carries an explicit `gcTime`). */
export const OPERATOR_STATUS_GC_MS = 5 * 60_000;

/** Trigger-then-poll cadence for a bounded background job (provisioning run, A2A
 *  lifecycle op): how often to refetch while the job is still `running`. */
export const JOB_POLL_MS = 1_500;

/** Bounded retention for a job-poll query once it stops being observed. */
export const JOB_POLL_GC_MS = 5 * 60_000;

/** `refetchInterval` predicate for the job-poll cadence above: refetch while the
 *  job is `running`, stop once it reaches any terminal state. Generic over the
 *  job shape so both `ProvisionJob` and `A2aLifecycleJob` (identical `state` union)
 *  share the one predicate rather than re-authoring it per job type. */
export function runningJobRefetchInterval<T extends { state: string }>(query: {
  state: { data?: T };
}): number | false {
  return query.state.data?.state === "running" ? JOB_POLL_MS : false;
}
