import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ErrorBoundary } from "./platform/errors/ErrorBoundary";
import { installGlobalTraps } from "./platform/logger/globalTraps";
import { ringBuffer } from "./platform/logger/logger";
import { failurePolicy } from "./platform/policy/failurePolicy";
import { getThemeController } from "./platform/theme/themeController";
import { useLiveStatusStore } from "./stores/server/liveStatus";
import { queryClient } from "./stores/server/queryClient";
import { router } from "./router";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root element");
}

// Theme model (design-language adoption S09): resolve the stored preference
// (or system auto-switch) and apply [data-theme] to <html> before first paint
// so there is no theme flash, and begin OS media listening for "system".
getThemeController();

// Last-resort net for failures that escape React entirely (ADR D5).
installGlobalTraps();

// Platform-policy adoption (live-state ADR D5): a stream-lost classification
// flips the stores-owned live-connection signal, so the degradation matrix
// renders the reconnecting/stale surface. The policy classifies (mechanism,
// platform's); the live signal is the vocabulary binding (ours).
failurePolicy.setDegradationHandler((classification) => {
  if (classification.signal === "stream-lost") {
    useLiveStatusStore.getState().setStreamConnected(false);
  }
});

// Dev-only: expose the log ring buffer and the live-connection store for the
// dev overlay and the adverse e2e pass. Never exposed in a production build.
if (import.meta.env.DEV) {
  const devGlobals = globalThis as typeof globalThis & {
    __platformRingBuffer?: typeof ringBuffer;
    __liveStatusStore?: typeof useLiveStatusStore;
    __viewStore?: unknown;
  };
  devGlobals.__platformRingBuffer = ringBuffer;
  devGlobals.__liveStatusStore = useLiveStatusStore;
  // The view store drives granularity / representation-mode / overlays — exposed
  // so the graph visual + behaviour harness can switch to the document graph and
  // exercise representation modes without clicking through chrome.
  void import("./stores/view/viewStore").then((m) => {
    devGlobals.__viewStore = m.useViewStore;
  });
}

createRoot(rootElement).render(
  <StrictMode>
    {/* App-level boundary: the last line. A throw that escapes every region
        boundary degrades to a full-screen recoverable fallback, never a blank
        white screen. */}
    <ErrorBoundary region="app" variant="app">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
