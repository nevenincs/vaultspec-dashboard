// The platform substrate's published interface (ADR D1). The data, scene, and
// chrome teams import their cross-cutting seams from here:
//
//   import { logger, ErrorBoundary, useAction, classifyError } from "../platform";
//
// Importing a specific submodule (e.g. "../platform/logger/logger") is also
// fine and avoids pulling the React surfaces when only the logger is needed.
// Nothing in here imports app/, scene/, or the stores - the substrate is a
// foundation, not a peer.

// Observability spine (P01)
export * from "./logger/logger";
export * from "./logger/globalTraps";
export * from "./logger/workerBridge";

// Exception containment (P02)
export * from "./errors/ErrorBoundary";
export * from "./errors/CrashInjector";

// Dispatch seam (P03)
export * from "./dispatch/dispatch";
export * from "./dispatch/middleware";
export * from "./dispatch/useAction";

// Exception-handling policy (P04)
export * from "./policy/failurePolicy";
