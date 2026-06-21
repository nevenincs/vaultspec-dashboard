// Session-mutation dispatch terminal effect (dashboard-layer-ownership): a session
// mutation (`PUT /session` — workspace registry select/add/forget, active scope,
// layout) realized through the ONE platform dispatch seam so a context-menu/palette
// action can mutate the registry without owning a React hook. Mirrors `opsActions`:
// the engine call lives in the stores layer (the sole wire client), registered on
// the appDispatcher; the app layer triggers intent via `dispatchSession` and never
// touches the engine client itself.
//
// Cache: a session mutation may carry a registry mutation, so on success the
// session cache is seeded and the registry enumeration invalidated — the picker
// re-reads the authoritative roots + active marker (the same refresh `usePutSession`
// performs, here driven from the shared queryClient since the dispatcher has no
// React context).

import { appDispatcher } from "../../platform/dispatch/middleware";
import { engineClient, type SessionState, type SessionUpdate } from "./engine";
import { seedSessionCache } from "./queries";
import { queryClient } from "./queryClient";

export const SESSION_ACTION = "session:put";

/** The keys a session mutation may carry (mirrors `SessionUpdate`). */
const SESSION_UPDATE_KEYS = new Set([
  "active_scope",
  "scope_context",
  "set_workspace_layout",
  "push_recent",
  "active_workspace",
  "add_workspace",
  "forget_workspace",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isSessionUpdatePayload(value: unknown): value is SessionUpdate {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => SESSION_UPDATE_KEYS.has(key));
}

// Register the terminal effect once (module load): PUT the session update through
// the engine and seed the session/registry caches from the response.
appDispatcher.register<SessionUpdate>(SESSION_ACTION, (action) => {
  const payload = action.payload as unknown;
  if (!isSessionUpdatePayload(payload)) {
    throw new Error("session:put dispatched with a non-session-update payload");
  }
  return engineClient.putSession(payload).then((session: SessionState) => {
    seedSessionCache(queryClient, session);
    return session;
  });
});

/** Dispatch a session mutation through the seam; resolves with the new session. */
export function dispatchSession(body: SessionUpdate): Promise<unknown> {
  if (!isSessionUpdatePayload(body)) {
    throw new Error("session:put dispatched with a non-session-update payload");
  }
  return appDispatcher.dispatch({
    type: SESSION_ACTION,
    payload: body,
  }) as Promise<unknown>;
}
