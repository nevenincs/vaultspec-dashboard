// Exception-handling policy (ADR D4): the one coherent answer to "what does
// this failure become?" - mechanism here, vocabulary in the app. The platform
// classifies a failure into a kind and logs it; the binding of a `degraded`
// failure to a specific degradation SurfaceState stays in app/degradation,
// invoked through an injected handler. That split is what keeps the substrate
// from importing upward (ADR D1): this module recognizes the engine's HTTP
// error structurally (a numeric `status`) rather than importing EngineError
// from the stores.

import { logger } from "../logger/logger";

const policyLog = logger.child("policy");

export type FailureKind = "transient" | "degraded" | "contained" | "fatal";

export interface FailureClassification {
  /** transient: retry. degraded: route to the degradation vocabulary.
   *  contained: nearest region boundary. fatal: app boundary / unexpected. */
  kind: FailureKind;
  /** True when a retry could plausibly succeed. */
  retryable: boolean;
  /** A stable hint naming the condition, for the app's degradation mapper. */
  signal?: string;
}

/**
 * A dropped SSE stream. The stores' stream consumer throws this on disconnect;
 * the platform owns the type so classification stays decoupled from the
 * stores. Resume is the Data team's; classification is ours.
 */
export class StreamLostError extends Error {
  constructor(message = "event stream lost") {
    super(message);
    this.name = "StreamLostError";
  }
}

/** A dead layout/render worker. The scene throws this when a worker dies. */
export class WorkerCrashError extends Error {
  constructor(message = "worker crashed") {
    super(message);
    this.name = "WorkerCrashError";
  }
}

/** Structural read of an HTTP-ish error (e.g. the engine's EngineError) without
 *  importing the stores - any error carrying a numeric `status`. */
function statusOf(error: unknown): number | null {
  if (
    error !== null &&
    typeof error === "object" &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }
  return null;
}

const TRANSIENT_STATUSES = new Set([408, 425, 429, 502, 503, 504]);

/** Map any thrown value to a FailureKind. Pure and total. */
export function classifyError(error: unknown): FailureClassification {
  if (error instanceof StreamLostError) {
    return { kind: "degraded", retryable: true, signal: "stream-lost" };
  }
  if (error instanceof WorkerCrashError) {
    return { kind: "contained", retryable: false, signal: "worker-crash" };
  }

  const status = statusOf(error);
  if (status !== null) {
    if (status === 0) {
      return { kind: "degraded", retryable: true, signal: "backend-unreachable" };
    }
    if (TRANSIENT_STATUSES.has(status)) {
      return { kind: "transient", retryable: true, signal: "backend-busy" };
    }
    if (status >= 500) {
      return { kind: "degraded", retryable: false, signal: "backend-error" };
    }
    if (status >= 400) {
      return { kind: "degraded", retryable: false, signal: "request-rejected" };
    }
  }

  // A bare fetch failure (engine not running) rejects as a TypeError.
  if (error instanceof TypeError) {
    return { kind: "degraded", retryable: true, signal: "backend-unreachable" };
  }

  return { kind: "fatal", retryable: false };
}

/** The app injects how a `degraded` failure maps to its degradation matrix. */
export type DegradationHandler = (
  classification: FailureClassification,
  error: unknown,
) => void;

class FailurePolicy {
  private degradationHandler: DegradationHandler | null = null;

  /** app/degradation injects the vocabulary binding here (ADR D4). */
  setDegradationHandler(handler: DegradationHandler | null): void {
    this.degradationHandler = handler;
  }

  classify(error: unknown): FailureClassification {
    return classifyError(error);
  }

  /**
   * Classify a failure, log it at the kind-appropriate level, and route a
   * `degraded` failure to the app's degradation mapper. Returns the
   * classification so a caller (a query's retry predicate, a boundary) can act
   * on it. Never swallows: a fatal is logged at error.
   */
  report(error: unknown, context?: Record<string, unknown>): FailureClassification {
    const classification = classifyError(error);
    const fields = {
      kind: classification.kind,
      signal: classification.signal,
      ...context,
    };
    if (classification.kind === "fatal") {
      policyLog.error(
        "unclassified failure",
        error instanceof Error ? error : { error, ...fields },
      );
    } else {
      policyLog.warn(`failure: ${classification.kind}`, fields);
    }
    if (classification.kind === "degraded") {
      this.degradationHandler?.(classification, error);
    }
    return classification;
  }
}

/** The app-wide failure policy. */
export const failurePolicy = new FailurePolicy();

/** Route a TanStack Query error through the policy (wired in the query client). */
export function queryErrorRouter(
  error: unknown,
  context?: Record<string, unknown>,
): FailureClassification {
  return failurePolicy.report(error, { source: "query", ...context });
}

export interface FailurePolicyApi {
  classify: (error: unknown) => FailureClassification;
  report: (error: unknown, context?: Record<string, unknown>) => FailureClassification;
}

/** Hook face for components that need to classify or report a failure. */
export function useFailurePolicy(): FailurePolicyApi {
  return {
    classify: (error) => failurePolicy.classify(error),
    report: (error, context) => failurePolicy.report(error, context),
  };
}
