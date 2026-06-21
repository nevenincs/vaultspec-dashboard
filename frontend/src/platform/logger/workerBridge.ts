// Worker log bridge (ADR D3): an off-main-thread worker cannot import the
// main-thread logger, so it posts structured log envelopes across the worker
// boundary; the main-side wrapper recognizes the envelope and re-emits it
// through `logger.ingest`, so a worker diagnostic lands in the same ring buffer
// as every other log.
//
// CURRENTLY UNUSED: this was built for the FA2 graphology LAYOUT worker, retired
// when the graph solver moved to main-thread d3-force — no worker runs today, so
// the bridge has no production caller (only its own tests). Kept as backend-
// agnostic scaffolding for any future off-main-thread worker; a removal candidate
// if none is planned.
//
// This module is logger-free at runtime (the LogRecord/LogLevel import is
// type-only and erased at compile time), so it bundles into the worker
// without dragging the root logger - and its console sink and ring buffer -
// into the worker scope.

import type { LogLevel, LogRecord } from "./logger";

export const WORKER_LOG_TAG = "__platformWorkerLog";

export interface WorkerLogEnvelope {
  tag: typeof WORKER_LOG_TAG;
  record: LogRecord;
}

/** Worker-side: build and post a structured log across the thread boundary. */
export function postWorkerLog(
  post: (message: WorkerLogEnvelope) => void,
  namespace: string,
  level: LogLevel,
  message: string,
  fields?: Record<string, unknown>,
): void {
  const record: LogRecord = { ts: Date.now(), level, namespace, message };
  if (fields && Object.keys(fields).length > 0) record.fields = fields;
  post({ tag: WORKER_LOG_TAG, record });
}

/** Main-side: is this worker message a platform log envelope (not layout data)? */
export function isWorkerLogEnvelope(data: unknown): data is WorkerLogEnvelope {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { tag?: unknown }).tag === WORKER_LOG_TAG &&
    "record" in data
  );
}
