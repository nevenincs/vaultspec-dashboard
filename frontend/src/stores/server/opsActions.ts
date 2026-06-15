// Ops dispatch terminal effect (dashboard-layer-ownership): the engine call that
// realizes a whitelisted ops intent lives in the stores layer — the SOLE wire
// client — and is registered onto the ONE platform dispatch seam so it stays
// logged, traced, and centrally guardable. The app layer triggers intents via
// `dispatchOps` (re-exported from app/right/opsActions) and never touches the
// engine client itself.

import { appDispatcher } from "../../platform/dispatch/middleware";
import { engineClient, type OpsResult } from "./engine";

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
  return appDispatcher.dispatch({
    type: OPS_ACTION,
    payload,
  }) as Promise<OpsResult>;
}
