import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { Timeline } from "../app/timeline/Timeline";
import { TimelineControls } from "../app/timeline/TimelineControls";
import { getThemeController } from "../platform/theme/themeController";
import { useActiveScope } from "../stores/server/queries";
import { queryClient } from "../stores/server/queryClient";
import { useViewStore } from "../stores/view/viewStore";
import "../styles.css";
import {
  applyTimelineViewportOverrideFromUrl,
  hasTimelineViewportOverrideParams,
} from "./viewportOverride";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root element");
}

getThemeController();

function seedScopeFromUrl(): void {
  const scope = new URLSearchParams(window.location.search).get("scope");
  if (scope) useViewStore.getState().setScope(scope);
}

function TimelineVisualHarness() {
  const scope = useActiveScope();
  const viewportWidth = typeof window === "undefined" ? 800 : window.innerWidth;
  const preferViewportDateRange =
    typeof window !== "undefined" &&
    hasTimelineViewportOverrideParams(new URLSearchParams(window.location.search));

  useEffect(() => {
    seedScopeFromUrl();
  }, []);

  useEffect(() => {
    applyTimelineViewportOverrideFromUrl(
      window.location.search,
      scope,
      window.innerWidth,
    );
  }, [scope]);

  return (
    <main
      className="grid h-screen min-h-0 bg-paper text-ink"
      style={{ gridTemplateRows: "auto minmax(0, 1fr)" }}
      data-timeline-visual-harness
    >
      <TimelineControls
        viewportWidth={viewportWidth}
        preferViewportDateRange={preferViewportDateRange}
      />
      <section className="relative min-h-0 overflow-hidden" aria-label="timeline">
        <Timeline />
      </section>
    </main>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TimelineVisualHarness />
    </QueryClientProvider>
  </StrictMode>,
);
