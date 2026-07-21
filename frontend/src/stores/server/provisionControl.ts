// The framework provisioning plane (project-provisioning ADR) — the stores-layer
// SOLE wire client for the engine's `/provision/*` surface. This is where the
// served status projection is fetched, where install / upgrade / migrate /
// acquire are DISPATCHED as bounded jobs through the one engine client, and where
// the job trigger-then-poll lives. Chrome consumes these hooks and never fetches
// `/provision/*` directly (dashboard-layer-ownership).
//
// The empty-project dead-end (a registered root with no `.vault/`/`.vaultspec/`)
// is DETECTED by the served `recommended` field — never re-derived on the client
// (displayed-state-is-backend-served). A mutation returns a `{job, attached}`
// immediately (ADR D4); `useProvisionJob` polls `/provision/jobs/{id}` to a
// terminal state, holding no connection open, then invalidates the status so the
// panel re-reads the now-reconciled projection (ADR D6).

import { useCallback } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  engineClient,
  type ProvisionJob,
  type ProvisionRunBody,
  type ProvisionStatus,
} from "./engine";
import { dispatchProvisionRun } from "./provisionActions";
import {
  JOB_POLL_GC_MS,
  OPERATOR_STATUS_GC_MS,
  OPERATOR_STATUS_STALE_MS,
  runningJobRefetchInterval,
} from "./queryCadence";
import { engineKeys } from "./queries";

/** The confirm token a `force` install must carry (engine-enforced). Exposed so a
 *  confirm affordance sends exactly what the engine expects rather than a magic
 *  string duplicated per call site. */
export const PROVISION_FORCE_CONFIRM = "confirm-force" as const;

/** Read the served provisioning projection for a target. Absent params target the
 *  active workspace root (the common single-project case). Cached per resolved
 *  target; the status is refetched after a job settles so a just-provisioned root
 *  flips to `managed` without a manual reload. */
export function useProvisionStatus(
  params: { workspace?: string; worktree?: string } = {},
) {
  const { workspace, worktree } = params;
  return useQuery({
    queryKey: engineKeys.provisionStatus(workspace, worktree),
    queryFn: ({ signal }) =>
      engineClient.provisionStatus({ workspace, worktree }, signal),
    // Provisioning state changes only when the operator acts; a short stale window
    // keeps the panel fresh across job completions without polling churn.
    staleTime: OPERATOR_STATUS_STALE_MS,
    gcTime: OPERATOR_STATUS_GC_MS,
  });
}

/** Dispatch a provisioning capability. Routes through the ONE platform dispatch
 *  seam (`PROVISION_RUN_ACTION`, actions-keymap-palette / unified-action-plane)
 *  so a panel button and any other eligible surface fire the identical verb —
 *  mirrors `useRagServiceStart` wrapping `dispatchOps`. On success the caller
 *  receives the job envelope (and whether it ATTACHED to an in-flight job for
 *  the same target); poll it with `useProvisionJob`. The status for the
 *  affected target is invalidated so the projection re-reads once the job is
 *  under way. */
export function useProvisionRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProvisionRunBody) => dispatchProvisionRun(body),
    onSuccess: (_result, body) => {
      void queryClient.invalidateQueries({
        queryKey: engineKeys.provisionStatus(body.workspace, body.worktree),
      });
    },
  });
}

/** Poll one provisioning job to a terminal state. Polling stops as soon as the
 *  job is `succeeded`/`failed`; on the transition the affected status projection
 *  is invalidated so the panel reflects the reconciled post-state (ADR D6). Pass
 *  `null` to disable (no job in flight). */
export function useProvisionJob(
  id: string | null,
  affected: { workspace?: string; worktree?: string } = {},
) {
  const queryClient = useQueryClient();
  const { workspace, worktree } = affected;
  return useQuery({
    queryKey: engineKeys.provisionJob(id ?? "none"),
    enabled: id !== null,
    queryFn: async ({ signal }): Promise<ProvisionJob> => {
      const { job } = await engineClient.provisionJob(id as string, signal);
      if (job.state !== "running") {
        void queryClient.invalidateQueries({
          queryKey: engineKeys.provisionStatus(workspace, worktree),
        });
      }
      return job;
    },
    // Trigger-then-poll: refetch while running, stop once terminal (ADR D4).
    refetchInterval: runningJobRefetchInterval,
    gcTime: JOB_POLL_GC_MS,
  });
}

/** A small convenience for the panel: the primary affordance a `recommended`
 *  value maps to, as a ready-to-dispatch run body. Returns `null` when the target
 *  is already managed or the block is a hard dead-end the panel states rather than
 *  acts on (`not-a-git-project`, `acquire-uv` — uv is never installed by us). */
export function recommendedRunBody(
  status: ProvisionStatus | undefined,
): ProvisionRunBody | null {
  if (!status) return null;
  switch (status.recommended) {
    case "acquire-core":
      return { action: "acquire", tool: "core" };
    case "install-framework":
      return { action: "install", provider: "all", workspace: undefined };
    case "run-migrations":
      return { action: "migrate" };
    case "upgrade-core":
      return { action: "acquire", tool: "core", upgrade: true };
    case "not-a-git-project":
    case "acquire-uv":
    case "managed":
      return null;
  }
}

/** Build a force (overwrite) install body carrying the required confirm token —
 *  the ONLY supported way to request a destructive re-install from the client, so
 *  the token is never hand-typed at a call site. */
export function forceInstallBody(
  provider: NonNullable<ProvisionRunBody["provider"]>,
  target: { workspace?: string; worktree?: string } = {},
): ProvisionRunBody {
  return {
    action: "install",
    provider,
    force: true,
    confirm: PROVISION_FORCE_CONFIRM,
    workspace: target.workspace,
    worktree: target.worktree,
  };
}

export type { ProvisionStatus, ProvisionJob, ProvisionRunBody };

/** A memo-safe callback the panel uses to dispatch the recommended action for the
 *  current status in one click. Kept here (not inlined in the view) so the run
 *  body derivation stays in the wire layer. */
export function useRecommendedProvision() {
  const run = useProvisionRun();
  const dispatch = useCallback(
    (status: ProvisionStatus | undefined) => {
      const body = recommendedRunBody(status);
      if (body) run.mutate(body);
      return body;
    },
    [run],
  );
  return { dispatch, run };
}
