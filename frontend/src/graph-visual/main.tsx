import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";

import { CanvasStateOverlay, type CanvasState } from "../app/stage/CanvasStateOverlay";
import { CategoryLegend } from "../app/stage/CategoryLegend";
import { GraphNavControls, GraphSettingsPanel } from "../app/stage/GraphControls";
import { MinimapWidget } from "../app/stage/MinimapWidget";
import { getScene } from "../app/stage/Stage";
import { bindDocumentLanguage } from "../platform/localization/documentLanguage";
import {
  LocalizationProvider,
  useLocalizedMessageResolver,
} from "../platform/localization/LocalizationProvider";
import { getThemeController } from "../platform/theme/themeController";
import { sliceToScene } from "../scene/sceneMapping";
import { queryClient } from "../stores/server/queryClient";
import { setGraphControlsSettingsOpen } from "../stores/view/graphControlsChrome";
import { sampleTitleMessage } from "../stores/view/threeLabVocabulary";
import { createGraphLabSampleSlice } from "../three-lab/sampleGraph";
import "../styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("missing #root element");

const unbindDocumentLanguage = bindDocumentLanguage();
if (import.meta.hot) import.meta.hot.dispose(unbindDocumentLanguage);

const params = new URLSearchParams(window.location.search);
document.documentElement.setAttribute("data-theme", params.get("theme") ?? "light");
getThemeController();

const STATE_PARAM = params.get("state") ?? "ok";
const PANEL_OPEN = params.get("panel") === "1";
const HERO_WIDTH = 860;
const HERO_HEIGHT = 600;

function resolveHarnessState(name: string): CanvasState {
  switch (name) {
    case "loading":
      return { primary: { kind: "loading-constellation" }, annotations: [] };
    case "empty":
      return { primary: { kind: "empty" }, annotations: [] };
    case "unavailable":
      return { primary: { kind: "unavailable" }, annotations: [] };
    case "degraded":
      return {
        primary: { kind: "ok" },
        annotations: [{ kind: "degraded", tiers: ["structural"], reasons: {} }],
      };
    case "links-building":
      return { primary: { kind: "ok" }, annotations: [{ kind: "links-building" }] };
    case "links-refreshing":
      return { primary: { kind: "ok" }, annotations: [{ kind: "links-refreshing" }] };
    case "truncated":
      return {
        primary: { kind: "ok" },
        annotations: [
          { kind: "truncated", total: 8700, returned: 5000, reason: "node ceiling" },
        ],
      };
    default:
      return { primary: { kind: "ok" }, annotations: [] };
  }
}

function GraphVisualHarness() {
  const hostRef = useRef<HTMLDivElement>(null);
  const resolveMessage = useLocalizedMessageResolver();
  const sampleScene = useMemo(() => {
    const message = (name: Parameters<typeof sampleTitleMessage>[0]) =>
      resolveMessage(sampleTitleMessage(name)).message;
    return sliceToScene(
      createGraphLabSampleSlice({
        planning: message("planning"),
        connections: message("connections"),
        history: message("history"),
        researchNote: message("researchNote"),
        designNote: message("designNote"),
        workPlan: message("workPlan"),
        progressNote: message("progressNote"),
        qualitySummary: message("qualitySummary"),
        projectGuidance: message("projectGuidance"),
        workGroup: message("workGroup"),
      }),
    );
  }, [resolveMessage]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = getScene();
    scene.controller.mount(host);
    scene.controller.resize(HERO_WIDTH, HERO_HEIGHT);
    if (PANEL_OPEN) setGraphControlsSettingsOpen(true);
    return () => {
      scene.controller.destroy();
      setGraphControlsSettingsOpen(false);
    };
  }, []);

  useEffect(() => {
    if (STATE_PARAM !== "ok") return;
    const scene = getScene();
    scene.controller.command({
      kind: "set-data",
      nodes: sampleScene.nodes,
      edges: sampleScene.edges,
    });
    scene.controller.command({ kind: "fit-to-view" });
  }, [sampleScene]);

  return (
    <main className="flex min-h-screen items-start justify-start bg-paper p-6">
      <div
        className="relative overflow-hidden rounded-[1rem] border border-rule bg-[var(--color-scene-canvas-bg)]"
        style={{ width: HERO_WIDTH, height: HERO_HEIGHT }}
        data-graph-harness
      >
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
    <LocalizationProvider>
      <QueryClientProvider client={queryClient}>
        <GraphVisualHarness />
      </QueryClientProvider>
    </LocalizationProvider>
  </StrictMode>,
);
