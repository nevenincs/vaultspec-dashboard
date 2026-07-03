// Dispatch middleware (ADR D2): the cross-cutting concerns every dispatched
// intent gets for free - structured logging, trace correlation, and the
// arm-to-confirm guard generalized from the right rail's ops surface. The
// app-wide `appDispatcher` is wired with all three so any consumer that routes
// an intent through it is observable and guardable.

import { logger } from "../logger/logger";
import type { Action, Middleware } from "./dispatch";
import { Dispatcher, normalizeActionType } from "./dispatch";

const dispatchLog = logger.child("dispatch");

/** Logs every dispatched action and any failure - never swallows the throw. */
export const loggingMiddleware: Middleware = (action, next) => {
  dispatchLog.debug(
    `dispatch ${action.type}`,
    action.meta ? { meta: action.meta } : undefined,
  );
  const logFailure = (error: unknown) =>
    dispatchLog.error(
      `action "${action.type}" failed`,
      error instanceof Error ? error : { error },
    );
  let result: unknown;
  try {
    result = next(action);
  } catch (error) {
    logFailure(error);
    throw error;
  }
  // Every consequential handler (ops, copy) is ASYNC: `next` returns a promise
  // whose REJECTION escapes the sync try/catch above, so the seam's
  // "logged/traced/guardable" charter previously covered only the sync half
  // (KAR-007). Attach a catch-log-RETHROW so an async failure is logged too,
  // while callers still observe the rejection unchanged.
  if (
    result !== null &&
    typeof result === "object" &&
    typeof (result as { then?: unknown }).then === "function"
  ) {
    return (result as Promise<unknown>).catch((error: unknown) => {
      logFailure(error);
      throw error;
    });
  }
  return result;
};

let traceCounter = 0;

/** Stamps a monotonic trace id and timestamp into meta so logs correlate. */
export const traceMiddleware: Middleware = (action, next) => {
  traceCounter += 1;
  const traced: Action = {
    ...action,
    meta: { ...action.meta, traceId: traceCounter, ts: Date.now() },
  };
  return next(traced);
};

/** The sentinel a guarded action returns on its first (arming) dispatch. */
export interface ArmedResult {
  status: "armed";
  type: string;
}

export function isArmedResult(value: unknown): value is ArmedResult {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === "armed"
  );
}

export interface ConfirmGuard {
  middleware: Middleware;
  isArmed(type: unknown): boolean;
  subscribe(listener: () => void): () => void;
  /** Disarm one type without firing it (the cancel affordance). */
  disarm(type: unknown): void;
  reset(): void;
}

/**
 * Arm-to-confirm, generalized from the ops rail (finding 026). An action whose
 * `meta.guard === "confirm"` arms on its first dispatch (short-circuits and
 * returns an ArmedResult, so the effect never fires) and runs the handler on
 * the second dispatch of the same type. Any other action passes straight
 * through.
 */
export function createConfirmGuard(): ConfirmGuard {
  const armed = new Set<string>();
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  const middleware: Middleware = (action, next) => {
    if (action.meta?.guard !== "confirm") return next(action);
    if (armed.has(action.type)) {
      armed.delete(action.type);
      emit();
      return next(action);
    }
    armed.add(action.type);
    emit();
    return { status: "armed", type: action.type } satisfies ArmedResult;
  };
  return {
    middleware,
    isArmed: (type) => {
      const normalizedType = normalizeActionType(type);
      return normalizedType !== null && armed.has(normalizedType);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    disarm: (type) => {
      const normalizedType = normalizeActionType(type);
      if (normalizedType !== null && armed.delete(normalizedType)) emit();
    },
    reset: () => {
      if (armed.size === 0) return;
      armed.clear();
      emit();
    },
  };
}

/** The app-wide confirm guard (its armed set is shared across the app). */
export const appConfirmGuard = createConfirmGuard();

/** A dispatcher wired with the standard chain: trace -> log -> confirm guard. */
export function createAppDispatcher(guard: ConfirmGuard = appConfirmGuard): Dispatcher {
  const dispatcher = new Dispatcher();
  dispatcher.use(traceMiddleware);
  dispatcher.use(loggingMiddleware);
  dispatcher.use(guard.middleware);
  return dispatcher;
}

/** The app-wide dispatcher every UI intent flows through. */
export const appDispatcher = createAppDispatcher();
