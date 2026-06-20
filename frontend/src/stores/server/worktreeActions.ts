// Worktree-scope dispatch terminal effect (dashboard-layer-ownership):
// context-menu worktree switches are session mutations, so they travel through
// the app-wide dispatcher instead of a menu-local run closure.

import { appDispatcher } from "../../platform/dispatch/middleware";
import { activateWorktreeScope } from "./queries";
import { normalizeStoreScope } from "./scopeIdentity";

export const WORKTREE_ACTIVATE_SCOPE_ACTION = "worktree:activate-scope";

export interface WorktreeActivateScopePayload {
  scope: string;
}

export function normalizeWorktreeActivateScopePayload(
  value: unknown,
): WorktreeActivateScopePayload | null {
  if (typeof value !== "object" || value === null) return null;
  const scope = normalizeStoreScope((value as { scope?: unknown }).scope);
  return scope === null ? null : { scope };
}

export function worktreeActivateScopeDispatch(scope: unknown) {
  const normalizedScope = normalizeStoreScope(scope);
  if (normalizedScope === null) {
    throw new Error("worktree activation requires a non-empty scope payload");
  }
  return {
    type: WORKTREE_ACTIVATE_SCOPE_ACTION,
    payload: { scope: normalizedScope },
  } satisfies {
    type: typeof WORKTREE_ACTIVATE_SCOPE_ACTION;
    payload: WorktreeActivateScopePayload;
  };
}

export function isWorktreeActivateScopePayload(
  value: unknown,
): value is WorktreeActivateScopePayload {
  return normalizeWorktreeActivateScopePayload(value) !== null;
}

appDispatcher.register<unknown>(WORKTREE_ACTIVATE_SCOPE_ACTION, (action) => {
  const payload = normalizeWorktreeActivateScopePayload(action.payload);
  if (payload === null) {
    throw new Error("worktree activation requires a non-empty scope payload");
  }
  return activateWorktreeScope(payload.scope);
});

export function dispatchActivateWorktreeScope(
  payload: { scope: unknown },
): Promise<unknown> {
  return appDispatcher.dispatch(
    worktreeActivateScopeDispatch(payload.scope),
  ) as Promise<unknown>;
}
