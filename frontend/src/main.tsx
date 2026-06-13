import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ErrorBoundary } from "./platform/errors/ErrorBoundary";
import { installGlobalTraps } from "./platform/logger/globalTraps";
import { ringBuffer } from "./platform/logger/logger";
import { failurePolicy } from "./platform/policy/failurePolicy";
import { useLiveStatusStore } from "./stores/server/liveStatus";
import { queryClient } from "./stores/server/queryClient";
import { router } from "./router";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root element");
}

// Contract-mock mode (W02.P05): the mock engine serves the fixture corpus
// through the same client transport until the live serve origin lands
// (S49). Dynamic import keeps the mock out of the bundle when the flag is
// off.
if (import.meta.env.VITE_MOCK_ENGINE === "1") {
  const [{ getMockEngine }, { engineClient }] = await Promise.all([
    import("./testing/mockEngine"),
    import("./stores/server/engine"),
  ]);
  engineClient.useTransport(getMockEngine().fetchImpl);
}

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
  };
  devGlobals.__platformRingBuffer = ringBuffer;
  devGlobals.__liveStatusStore = useLiveStatusStore;
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
