// Ops dispatch terminal effect (dashboard-layer-ownership): the engine call that
// realizes a whitelisted ops intent lives in the stores layer — the SOLE wire
// client — and is registered onto the ONE platform dispatch seam so it stays
// logged, traced, and centrally guardable. The app layer triggers intents via
// `dispatchOps` (re-exported from app/right/opsActions) and never touches the
// engine client itself.

import { appDispatcher } from "../../platform/dispatch/middleware";
import {
  engineClient,
  type OpsCreateBody,
  type OpsResult,
  type OpsWriteBody,
} from "./engine";

export const OPS_ACTION = "ops:run";

export interface OpsPayload {
  target: "core" | "rag";
  verb: string;
  /**
   * The dispatch mode for a `core` target (document-editor backend): `control`
   * (default) runs the argument-free `opsCore` control verb; `write` runs a
   * document mutation (`set-body` | `set-frontmatter` | `edit`) against
   * `/ops/core/{verb}/write`; `create` runs `/ops/core/create`. The write/create
   * modes carry their payload in `body`. A `rag` target ignores `mode` (it always
   * forwards `body` to the brokered control verb).
   */
  mode?: "control" | "write" | "create";
  /** Optional validated args. For a `rag` control verb: the reindex/watcher/evict
   *  args (rag-control-plane). For a `core` `write`/`create` mode: the
   *  `OpsWriteBody` / `OpsCreateBody` document-mutation payload. Absent for an
   *  argument-free control verb. */
  body?: unknown;
}

// Register the terminal effect once (module load): run the whitelisted verb
// against the engine ops proxy. Cache invalidation stays with the caller so the
// handler is a pure manipulation effect. Document write/create (document-editor
// backend) routes through the same seam so vault mutations stay logged, traced,
// and centrally guardable — the app layer never reaches the engine client itself.
appDispatcher.register<OpsPayload>(OPS_ACTION, (action) => {
  const payload = action.payload;
  if (!payload) throw new Error("ops:run dispatched without a payload");
  if (payload.target === "rag") {
    return engineClient.opsRag(payload.verb, payload.body ?? {});
  }
  switch (payload.mode) {
    case "write":
      return engineClient.opsCoreWrite(payload.verb, payload.body as OpsWriteBody);
    case "create":
      return engineClient.opsCoreCreate(payload.body as OpsCreateBody);
    default:
      return engineClient.opsCore(payload.verb);
  }
});

/** Dispatch an ops intent through the seam; resolves with the ops envelope. */
export function dispatchOps(payload: OpsPayload): Promise<OpsResult> {
  return appDispatcher.dispatch({
    type: OPS_ACTION,
    payload,
  }) as Promise<OpsResult>;
}
