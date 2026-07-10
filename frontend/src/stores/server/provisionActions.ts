// Provisioning dispatch terminal effect (project-provisioning ADR D7): the one
// engine call that starts a provisioning capability job lives in the stores
// layer — the sole wire client — and is registered onto the ONE platform
// dispatch seam so a non-hook surface (an ActionDescriptor fired from outside
// React) can start install / upgrade / migrate / acquire without owning a
// mutation hook. Mirrors `opsActions`/`sessionActions`: the handler here is a
// pure manipulation effect (no cache write); the caller (`useProvisionRun`)
// owns invalidation via its own `onSuccess`, exactly as `useRagServiceStart`
// wraps `dispatchOps`.

import { appDispatcher } from "../../platform/dispatch/middleware";
import { engineClient, type ProvisionJob, type ProvisionRunBody } from "./engine";

export const PROVISION_RUN_ACTION = "provision:run";

const PROVISION_ACTIONS = new Set(["install", "upgrade", "migrate", "acquire"]);
const PROVISION_PROVIDERS = new Set([
  "all",
  "core",
  "claude",
  "gemini",
  "antigravity",
  "codex",
]);
const PROVISION_TOOLS = new Set(["core", "rag"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Bounded, typed validation of a provisioning run body BEFORE it reaches the
 *  wire (resource-bounds / never a free-form wire path): every field is
 *  either absent or one of its enumerated/typed values — the engine's own
 *  typed capability resolution is the authority on WHICH combination is
 *  legal, this only rejects malformed shapes early. */
export function isProvisionRunPayload(value: unknown): value is ProvisionRunBody {
  if (!isRecord(value)) return false;
  if (typeof value.action !== "string" || !PROVISION_ACTIONS.has(value.action)) {
    return false;
  }
  if (
    value.provider !== undefined &&
    (typeof value.provider !== "string" || !PROVISION_PROVIDERS.has(value.provider))
  ) {
    return false;
  }
  if (
    value.tool !== undefined &&
    (typeof value.tool !== "string" || !PROVISION_TOOLS.has(value.tool))
  ) {
    return false;
  }
  if (value.upgrade !== undefined && typeof value.upgrade !== "boolean") return false;
  if (value.force !== undefined && typeof value.force !== "boolean") return false;
  if (value.confirm !== undefined && typeof value.confirm !== "string") return false;
  if (value.workspace !== undefined && typeof value.workspace !== "string") {
    return false;
  }
  if (value.worktree !== undefined && typeof value.worktree !== "string") {
    return false;
  }
  return true;
}

// Register the terminal effect once (module load): start the capability job
// against the engine's typed broker. No cache write here — `useProvisionRun`
// (provisionControl.ts) owns the status-cache invalidation on success, same
// split as the ops/rag pair.
appDispatcher.register<ProvisionRunBody>(PROVISION_RUN_ACTION, (action) => {
  const payload = action.payload;
  if (!isProvisionRunPayload(payload)) {
    throw new Error("provision:run dispatched without a valid provisioning body");
  }
  return engineClient.provisionRun(payload);
});

/** Dispatch a provisioning run through the seam; resolves with the job envelope. */
export function dispatchProvisionRun(
  body: ProvisionRunBody,
): Promise<{ job: ProvisionJob; attached: boolean }> {
  if (!isProvisionRunPayload(body)) {
    throw new Error("provision:run dispatched without a valid provisioning body");
  }
  return appDispatcher.dispatch({
    type: PROVISION_RUN_ACTION,
    payload: body,
  }) as Promise<{ job: ProvisionJob; attached: boolean }>;
}
