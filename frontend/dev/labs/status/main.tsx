// Isolated visual harness for the right-rail activity surface (figma-visual-parity).
// Mounts the real, retired-tabs ActivityRail composition — the single StatusTab
// surface (location header + Changes fold + status sections) — inside a 300px card
// that mirrors the binding ActivityRail board (node 599:2099), so a parity capture
// of /status.html lines up with the Figma node. Wired with the same providers the
// app uses (QueryClient + theme); the scope is seeded from the URL (?scope=…),
// exactly like the timeline harness.
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { StatusTab, StatusTabView } from "@app/app/right/StatusTab";
import type { RailState } from "@app/app/right/railStates";
import { getThemeController } from "@app/platform/theme/themeController";
import { queryClient } from "@app/stores/server/queryClient";
import { useViewStore } from "@app/stores/view/viewStore";
import "@app/styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root element");
}

getThemeController();

function seedScopeFromUrl(): void {
  const scope = new URLSearchParams(window.location.search).get("scope");
  if (scope) useViewStore.getState().setScope(scope);
}

// `?state=empty|degraded|loading|typical` renders ONE canonical mode. It drives the
// wire-free `StatusTabView` directly rather than overriding what the container
// derives — production carries no preview affordance (visual-review-harness ADR D2).
// Absent/invalid → the live container, whose mode its real data implies.
function modeFromUrl(): RailState | undefined {
  const raw = new URLSearchParams(window.location.search).get("state");
  return raw === "empty" || raw === "degraded" || raw === "loading" || raw === "typical"
    ? raw
    : undefined;
}

function StatusVisualHarness() {
  useEffect(() => {
    seedScopeFromUrl();
  }, []);
  const mode = modeFromUrl();
  return (
    <main className="flex min-h-screen items-start justify-start bg-paper p-6">
      <div
        className="w-[18.75rem] overflow-hidden rounded-fg-lg border border-rule bg-paper"
        data-status-harness
      >
        <div className="flex flex-col p-fg-4">
          {mode ? <StatusTabView railState={mode} /> : <StatusTab />}
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
