// A2A lifecycle dispatch terminal effect (a2a-product-provisioning W05.P11.S91):
// the ONE engine call that starts a lifecycle job lives in the stores layer — the
// sole wire client — registered onto the platform dispatch seam so a non-hook
// surface (an ActionDescriptor fired from outside React) can run a lifecycle
// operation without owning a mutation hook. Mirrors provisionActions/opsActions:
// the handler is a pure manipulation effect (no cache write); the caller
// (`useA2aLifecycleRun`, a2aLifecycle.ts) owns the status-cache invalidation.
//
// The validator is the wire-contract guard (ADR D3): the run body carries ONLY a
// closed, typed `op` — no path, no free-form argument, and no implicit
// data-removal flag. `remove` is a BOUNDED intent (the engine preserves user data
// on remove); there is NO client-side purge / delete-data field, so a body
// carrying any key beyond `op`, or an op outside the enumerated set, is refused
// BEFORE it reaches the wire.

import { appDispatcher } from "../../platform/dispatch/middleware";
import {
  engineClient,
  type A2aLifecycleJob,
  type A2aLifecycleOp,
  type A2aLifecycleRunBody,
} from "./engine";

export const A2A_LIFECYCLE_RUN_ACTION = "a2a-lifecycle:run";

/** The closed lifecycle op set (engine `LifecycleOpArg`). Kept beside the
 *  validator so a wire-contract change is one edit. */
const A2A_LIFECYCLE_OPS: ReadonlySet<A2aLifecycleOp> = new Set<A2aLifecycleOp>([
  "install",
  "ensure",
  "start",
  "stop",
  "restart",
  "repair",
  "update",
  "rollback",
  "remove",
  "doctor",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Bounded, typed validation of a lifecycle run body BEFORE it reaches the wire
 *  (wire-contract / never a free-form wire path). The body is a CLOSED shape: a
 *  single `op` drawn from the enumerated set and NOTHING else — any additional key
 *  (a smuggled path, a free-form argument, a `delete_data` / `purge` flag) is
 *  rejected, so implicit data deletion cannot ride a lifecycle dispatch. The
 *  engine's own typed authority governs WHETHER an op is legal for the current
 *  state; this only rejects malformed or over-broad shapes early. */
export function isA2aLifecycleRunPayload(value: unknown): value is A2aLifecycleRunBody {
  if (!isRecord(value)) return false;
  if (
    typeof value.op !== "string" ||
    !A2A_LIFECYCLE_OPS.has(value.op as A2aLifecycleOp)
  ) {
    return false;
  }
  // Closed body: `op` is the ONLY permitted key. A body carrying anything else is
  // a free-form / deletion-intent smuggle and is refused.
  return Object.keys(value).length === 1;
}

// Register the terminal effect once (module load): start the lifecycle job against
// the engine's typed plane. No cache write here — `useA2aLifecycleRun`
// (a2aLifecycle.ts) owns the status-cache invalidation on success, same split as
// the ops/rag/provision pairs.
appDispatcher.register<A2aLifecycleRunBody>(A2A_LIFECYCLE_RUN_ACTION, (action) => {
  const payload = action.payload;
  if (!isA2aLifecycleRunPayload(payload)) {
    throw new Error("a2a-lifecycle:run dispatched without a valid lifecycle body");
  }
  return engineClient.a2aLifecycleRun(payload);
});

/** Dispatch a lifecycle run through the seam; resolves with the job envelope (and
 *  whether it ATTACHED to an in-flight identical operation). */
export function dispatchA2aLifecycleRun(
  body: A2aLifecycleRunBody,
): Promise<{ job: A2aLifecycleJob; attached: boolean }> {
  if (!isA2aLifecycleRunPayload(body)) {
    throw new Error("a2a-lifecycle:run dispatched without a valid lifecycle body");
  }
  return appDispatcher.dispatch({
    type: A2A_LIFECYCLE_RUN_ACTION,
    payload: body,
  }) as Promise<{ job: A2aLifecycleJob; attached: boolean }>;
}
