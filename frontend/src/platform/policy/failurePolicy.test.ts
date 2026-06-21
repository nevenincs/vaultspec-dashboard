import { afterEach, describe, expect, it, vi } from "vitest";

import type { LogRecord } from "../logger/logger";
import { logger } from "../logger/logger";
import {
  StreamLostError,
  WorkerCrashError,
  classifyError,
  failurePolicy,
  queryErrorRouter,
} from "./failurePolicy";

function captureLogs(): { records: LogRecord[]; detach: () => void } {
  const records: LogRecord[] = [];
  const sink = { write: (r: LogRecord) => records.push(r) };
  logger.addSink(sink);
  return { records, detach: () => logger.removeSink(sink) };
}

describe("classifyError", () => {
  it("maps a dropped stream to degraded/stream-lost", () => {
    expect(classifyError(new StreamLostError())).toEqual({
      kind: "degraded",
      retryable: true,
      signal: "stream-lost",
    });
  });

  it("maps a dead worker to contained", () => {
    expect(classifyError(new WorkerCrashError()).kind).toBe("contained");
  });

  it("classifies HTTP status codes structurally without importing EngineError", () => {
    // A plain object with a numeric status - proves the decoupling.
    expect(classifyError({ status: 503 }).kind).toBe("transient");
    expect(classifyError({ status: 429 }).kind).toBe("transient");
    expect(classifyError({ status: 500 })).toMatchObject({
      kind: "degraded",
      signal: "backend-error",
    });
    expect(classifyError({ status: 404 })).toMatchObject({
      kind: "degraded",
      signal: "request-rejected",
    });
    expect(classifyError({ status: 0 }).signal).toBe("backend-unreachable");
  });

  it("treats a bare fetch TypeError as backend-unreachable degraded", () => {
    expect(classifyError(new TypeError("Failed to fetch"))).toMatchObject({
      kind: "degraded",
      signal: "backend-unreachable",
    });
  });

  it("classifies an intentional AbortError as cancelled, not fatal", () => {
    // TanStack/AbortController aborts on unmount/scope-change/refetch reject with
    // an AbortError — normal lifecycle, must NOT be logged as an "unclassified
    // failure". Recognized structurally by name (decoupled from the fetch layer).
    const abort = new Error("signal is aborted without reason");
    abort.name = "AbortError";
    expect(classifyError(abort)).toEqual({
      kind: "cancelled",
      retryable: false,
      signal: "cancelled",
    });
    // A native DOMException-style abort (name === "AbortError") also classifies.
    expect(classifyError(new DOMException("aborted", "AbortError")).kind).toBe(
      "cancelled",
    );
  });

  it("falls back to fatal for an unrecognized error", () => {
    expect(classifyError(new Error("who knows")).kind).toBe("fatal");
  });
});

describe("failurePolicy.report", () => {
  afterEach(() => {
    failurePolicy.setDegradationHandler(null);
    vi.restoreAllMocks();
  });

  it("logs a degraded failure at warn and routes it to the injected handler", () => {
    const cap = captureLogs();
    const handler = vi.fn();
    failurePolicy.setDegradationHandler(handler);
    const result = failurePolicy.report(new StreamLostError(), { scope: "main" });
    expect(result.kind).toBe("degraded");
    expect(handler).toHaveBeenCalledTimes(1);
    const warned = cap.records.find((r) => r.level === "warn");
    expect(warned?.fields).toMatchObject({ kind: "degraded", signal: "stream-lost" });
    cap.detach();
  });

  it("logs a fatal at error and does not call the degradation handler", () => {
    const cap = captureLogs();
    const handler = vi.fn();
    failurePolicy.setDegradationHandler(handler);
    failurePolicy.report(new Error("boom"));
    expect(handler).not.toHaveBeenCalled();
    expect(cap.records.some((r) => r.level === "error")).toBe(true);
    cap.detach();
  });

  it("does not route transient or contained failures to the degradation handler", () => {
    const handler = vi.fn();
    failurePolicy.setDegradationHandler(handler);
    failurePolicy.report({ status: 503 });
    failurePolicy.report(new WorkerCrashError());
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("queryErrorRouter", () => {
  afterEach(() => failurePolicy.setDegradationHandler(null));

  it("tags the failure with source=query and returns the classification", () => {
    const cap = captureLogs();
    const result = queryErrorRouter({ status: 500 }, { queryKey: "status" });
    expect(result.kind).toBe("degraded");
    const warned = cap.records.find((r) => r.level === "warn");
    expect(warned?.fields).toMatchObject({ source: "query", queryKey: "status" });
    cap.detach();
  });
});
