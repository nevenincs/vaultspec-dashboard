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

import { StatusTab } from "../app/right/StatusTab";
import type { RailState } from "../app/right/railStates";
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

// `?state=empty|degraded|loading|populated` drives the rail into a single binding
// state for a visual-parity capture (the live engine only ever yields whichever
// state its real data implies). Absent/invalid → live-derived state.
function stateOverrideFromUrl(): RailState | undefined {
  const raw = new URLSearchParams(window.location.search).get("state");
  return raw === "empty" ||
    raw === "degraded" ||
    raw === "loading" ||
    raw === "populated"
    ? raw
    : undefined;
}

function StatusVisualHarness() {
  useEffect(() => {
    seedScopeFromUrl();
  }, []);
  const stateOverride = stateOverrideFromUrl();
  return (
    <main className="flex min-h-screen items-start justify-start bg-paper p-6">
      <div
        className="w-[18.75rem] overflow-hidden rounded-fg-lg border border-rule bg-paper"
        data-status-harness
      >
        <div className="flex flex-col p-fg-4">
          <StatusTab stateOverride={stateOverride} />
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
