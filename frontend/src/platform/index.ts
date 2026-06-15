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

// Shared action descriptor + resolver registry (dashboard-context-menus W01)
export * from "./actions/action";
export * from "./actions/entity";
export * from "./actions/registry";

// Action verb families (dashboard-context-menus W02): copy + host-shell verbs.
// Importing these modules registers their terminal handlers on the seam.
export * from "./actions/clipboardActions";
export * from "./actions/shellActions";

// Exception-handling policy (P04)
export * from "./policy/failurePolicy";

// Theme model (design-language adoption W01.P02.S09)
export * from "./theme/themeController";
export * from "./theme/useTheme";
