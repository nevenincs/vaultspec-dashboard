import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ErrorBoundary } from "./platform/errors/ErrorBoundary";
import {
  applyDocumentLanguage,
  bindDocumentLanguage,
} from "./platform/localization/documentLanguage";
import {
  LocalizationProvider,
  setActiveLocalizationInstance,
} from "./platform/localization/LocalizationProvider";
import { localization } from "./platform/localization/runtime";
import { installGlobalTraps } from "./platform/logger/globalTraps";
import { ringBuffer } from "./platform/logger/logger";
import { failurePolicy } from "./platform/policy/failurePolicy";
import { getThemeController } from "./platform/theme/themeController";
import { markLiveStreamLost, setLiveStreamConnected } from "./stores/server/liveStatus";
import { queryClient } from "./stores/server/queryClient";
import { router } from "./router";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root element");
}

const unbindDocumentLanguage = bindDocumentLanguage();
if (import.meta.hot) {
  import.meta.hot.dispose(unbindDocumentLanguage);
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
    markLiveStreamLost();
  }
});

// Dev-only: expose the log ring buffer and the live-connection store for the
// dev overlay and the adverse e2e pass. Never exposed in a production build.
if (import.meta.env.DEV) {
  const devGlobals = globalThis as typeof globalThis & {
    __platformRingBuffer?: typeof ringBuffer;
    __liveStatusControls?: {
      markStreamLost: () => void;
      setStreamConnected: (connected: boolean) => void;
    };
    __viewStore?: unknown;
    __localizationControls?: {
      loadTestLocale: (locale: "fr" | "ar") => Promise<void>;
      resetLocale: () => void;
    };
  };
  devGlobals.__platformRingBuffer = ringBuffer;
  devGlobals.__liveStatusControls = {
    markStreamLost: markLiveStreamLost,
    setStreamConnected: setLiveStreamConnected,
  };
  // The view store exposes local graph overlay chrome for the visual harness; graph
  // granularity and representation mode live in dashboard-state.
  void import("./stores/view/viewStore").then((m) => {
    devGlobals.__viewStore = m.useViewStore;
  });
  // Expanded-copy/right-to-left browser verification lever (W06.P19.S105/S138):
  // swaps the bound runtime for the alternate-locale e2e harness (the SAME
  // fixtures the unit suites exercise) and rebinds document lang/dir to
  // follow it, so localization-layout.spec.ts drives real French/Arabic
  // rendering through the production component tree. Dynamically imported so
  // the test-only fixture module never enters the production bundle graph
  // (dead-code-eliminated with this whole block when `import.meta.env.DEV`
  // is statically `false`).
  let unbindTestLocaleDocumentLanguage: (() => void) | undefined;
  devGlobals.__localizationControls = {
    async loadTestLocale(locale) {
      const { createTestLocalizationRuntime } =
        await import("./localization/testing/runtime");
      const instance = createTestLocalizationRuntime(locale);
      unbindTestLocaleDocumentLanguage?.();
      unbindTestLocaleDocumentLanguage = bindDocumentLanguage(instance);
      setActiveLocalizationInstance(instance);
    },
    resetLocale() {
      unbindTestLocaleDocumentLanguage?.();
      unbindTestLocaleDocumentLanguage = undefined;
      setActiveLocalizationInstance(localization);
      applyDocumentLanguage(localization);
    },
  };
}

createRoot(rootElement).render(
  <StrictMode>
    <LocalizationProvider>
      {/* App-level boundary: the last line. A throw that escapes every region
          boundary degrades to a full-screen recoverable fallback, never a blank
          white screen. */}
      <ErrorBoundary region="app" variant="app">
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ErrorBoundary>
    </LocalizationProvider>
  </StrictMode>,
);

// Boot-shell fallback retirement: AppShell removes the pre-hydration skeleton
// on its first commit (the guaranteed post-paint point). This timeout is the
// backstop for surfaces that never mount AppShell (a crash fallback, an aux
// route) so the skeleton can never trap the screen.
setTimeout(() => {
  document.getElementById("boot-shell")?.remove();
}, 10_000);
