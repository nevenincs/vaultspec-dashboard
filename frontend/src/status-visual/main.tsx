// Isolated visual harness for the right-rail Status surface (figma-visual-parity).
// Mounts the real ActivityRail composition — the RailTabs bar over the rebuilt
// StatusTab — inside a 300px card that mirrors the binding ActivityRail board
// (node 238:601), so a parity capture of /status.html lines up with the Figma
// node. Wired with the same providers the app uses (QueryClient + theme); the
// scope is seeded from the URL (?scope=…), exactly like the timeline harness.
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { RailTabs } from "../app/right/RailTabs";
import { StatusTab } from "../app/right/StatusTab";
import { getThemeController } from "../platform/theme/themeController";
import { queryClient } from "../stores/server/queryClient";
import { useViewStore } from "../stores/view/viewStore";
import "../styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root element");
}

getThemeController();

function seedScopeFromUrl(): void {
  const scope = new URLSearchParams(window.location.search).get("scope");
  if (scope) useViewStore.getState().setScope(scope);
}

function StatusVisualHarness() {
  useEffect(() => {
    seedScopeFromUrl();
  }, []);
  return (
    <main className="flex min-h-screen items-start justify-start bg-paper p-6">
      <div
        className="w-[18.75rem] overflow-hidden rounded-fg-lg border border-rule bg-paper-raised"
        data-status-harness
      >
        <div className="flex flex-col gap-fg-2 p-fg-2">
          <RailTabs active="status" onChange={() => {}} />
          <StatusTab />
        </div>
      </div>
    </main>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <StatusVisualHarness />
    </QueryClientProvider>
  </StrictMode>,
);
