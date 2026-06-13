// Global error traps (ADR D3/D5): the last-resort net for failures that
// escape React entirely - an uncaught error on the window, or a promise
// rejection with no handler. Both route into the platform logger so they
// land in the same ring buffer the dev overlay and the failure policy read.
// React render throws are caught earlier by the ErrorBoundary; this catches
// what boundaries structurally cannot.

import type { Logger } from "./logger";
import { logger } from "./logger";

export interface GlobalTrapHandle {
  uninstall(): void;
}

let installed = false;

/**
 * Install `error` and `unhandledrejection` listeners on the window, routing
 * each into the logger. Idempotent: a second install while one is live is a
 * no-op. Returns a handle whose `uninstall()` removes the listeners.
 */
export function installGlobalTraps(
  win: Window = window,
  log: Logger = logger.child("global"),
): GlobalTrapHandle {
  if (installed) {
    return { uninstall: () => undefined };
  }
  installed = true;

  const onError = (event: ErrorEvent): void => {
    const detail = event.error ?? { message: event.message };
    log.error(event.message || "uncaught error", detail);
  };

  const onRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    if (reason instanceof Error) {
      log.error("unhandled promise rejection", reason);
    } else {
      log.error("unhandled promise rejection", { reason });
    }
  };

  win.addEventListener("error", onError);
  win.addEventListener("unhandledrejection", onRejection);

  return {
    uninstall: () => {
      win.removeEventListener("error", onError);
      win.removeEventListener("unhandledrejection", onRejection);
      installed = false;
    },
  };
}
