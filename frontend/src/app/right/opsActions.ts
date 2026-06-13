// Ops dispatch adoption (platform ADR D2; state-system delivery B-1, GUI
// finding 032): every whitelisted ops intent flows through the ONE platform
// dispatch seam, so it is logged, traced, and centrally guardable instead of
// fired ad-hoc from the component. This is the first real adopter of the
// dispatch seam the platform feature published - realizing "manipulate through
// one seam" rather than leaving it a dead, unexercised capability.

import { appDispatcher } from "../../platform/dispatch/middleware";
import { engineClient, type OpsResult } from "../../stores/server/engine";

export const OPS_ACTION = "ops:run";

export interface OpsPayload {
  target: "core" | "rag";
  verb: string;
}

// Register the terminal effect once (module load): run the whitelisted verb
// against the engine ops proxy. Cache invalidation stays with the caller so the
// handler is a pure manipulation effect.
appDispatcher.register<OpsPayload>(OPS_ACTION, (action) => {
  const payload = action.payload;
  if (!payload) throw new Error("ops:run dispatched without a payload");
  return payload.target === "core"
    ? engineClient.opsCore(payload.verb)
    : engineClient.opsRag(payload.verb);
});

/** Dispatch an ops intent through the seam; resolves with the ops envelope. */
export function dispatchOps(payload: OpsPayload): Promise<OpsResult> {
  return appDispatcher.dispatch({ type: OPS_ACTION, payload }) as Promise<OpsResult>;
}
