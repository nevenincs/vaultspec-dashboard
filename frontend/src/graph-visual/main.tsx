// Isolated visual harness for the graph hero (figma-visual-parity). Mounts the REAL
// graph overlays — the category legend, the vertical NavControls, the Graph controls
// panel, and the headerless minimap — plus the real CanvasStateOverlay, inside an
// 860x600 hero card that mirrors the binding graph/Hero board (213:505). The scene
// singleton is mounted and FED a controlled fixture graph (the three-lab sample) so
// the field + minimap render deterministically — every other surface harness
// (timeline/status/filters/reader) follows this same mount-and-feed pattern.
//
// URL params:
//   ?state=ok|loading|empty|degraded  → which designed canvas state to depict
//                                        (ok feeds the fixture; the rest show the
//                                         state card over an empty field, matching
//                                         the binding state variants 713:2116/2296/2475)
//   ?panel=1                          → open the Graph controls panel (714:2630)
//   ?theme=light|dark|hc              → theme remap
//
// Wired with the same providers the app uses (QueryClient + theme).

import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

import { CanvasStateOverlay, type CanvasState } from "../app/stage/CanvasStateOverlay";
import { CategoryLegend } from "../app/stage/CategoryLegend";
import { GraphNavControls, GraphSettingsPanel } from "../app/stage/GraphControls";
import { MinimapWidget } from "../app/stage/MinimapWidget";
import { getScene } from "../app/stage/Stage";
import { getThemeController } from "../platform/theme/themeController";
import { sliceToScene } from "../scene/sceneMapping";
import { queryClient } from "../stores/server/queryClient";
import { setGraphControlsSettingsOpen } from "../stores/view/graphControlsChrome";
import { graphLabDevSlice } from "../three-lab/sampleGraph";
import "../styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root element");
}

const params = new URLSearchParams(window.location.search);
document.documentElement.setAttribute("data-theme", params.get("theme") ?? "light");
getThemeController();

const STATE_PARAM = params.get("state") ?? "ok";
const PANEL_OPEN = params.get("panel") === "1";

function resolveHarnessState(name: string): CanvasState {
  switch (name) {
    case "loading":
      return { kind: "loading-constellation" };
    case "empty":
      return { kind: "empty" };
    case "degraded":
      return { kind: "degraded", tiers: ["semantic"], reasons: {} };
    default:
      return { kind: "ok" };
  }
}

const HERO_W = 860;
const HERO_H = 600;

function GraphVisualHarness() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = getScene();
    scene.controller.mount(host);
    scene.controller.resize(HERO_W, HERO_H);

    // Feed the fixture only for the "ok"/typical state; the designed state cards
    // (loading/empty/degraded) sit over an empty field, matching the Figma variants.
    if (STATE_PARAM === "ok") {
      const mapped = sliceToScene(graphLabDevSlice);
      scene.controller.command({
        kind: "set-data",
        nodes: mapped.nodes,
        edges: mapped.edges,
      });
      scene.controller.command({ kind: "fit-to-view" });
    }
    if (PANEL_OPEN) setGraphControlsSettingsOpen(true);

    return () => {
      scene.controller.destroy();
      setGraphControlsSettingsOpen(false);
    };
  }, []);

  return (
    <main className="flex min-h-screen items-start justify-start bg-paper p-6">
      <div
        className="relative overflow-hidden rounded-[1rem] border border-rule bg-[var(--color-scene-canvas-bg)]"
        style={{ width: HERO_W, height: HERO_H }}
        data-graph-harness
      >
        {/* The field host — the scene renders the constellation into it; overlays
            sit above it exactly as on the real stage. */}
        <div ref={hostRef} className="absolute inset-0" data-stage-host />
        <CategoryLegend />
        <GraphNavControls />
        <GraphSettingsPanel />
        <MinimapWidget />
        <CanvasStateOverlay state={resolveHarnessState(STATE_PARAM)} />
      </div>
    </main>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <GraphVisualHarness />
    </QueryClientProvider>
  </StrictMode>,
);
