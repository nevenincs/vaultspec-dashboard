// Graph navigation toolbar (task #6): zoom controls, fit-to-view, reset,
// algorithm panel toggle, and browser fullscreen. Positioned below the
// FilterBar in the top-right corner of the stage.
//
// Camera commands (zoom-in, zoom-out, fit-to-view, reset-view) are live —
// SceneController carries these command kinds as of the 2026-06-13
// graph-quality addenda (P01.S02). The toolbar subscribes to camera-change
// events to display the current semantic level.
//
// Seam boundary: chrome calls SceneController.command() only; no fetching,
// no derived data, no direct access to the Pixi renderer.

import {
  Maximize,
  Maximize2,
  Minimize,
  Minus,
  Plus,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { useEffect, useState } from "react";

import type { SemanticLevel } from "../../scene/field/camera";
import { useViewStore } from "../../stores/view/viewStore";
import { getScene } from "./Stage";

interface NavToolbarProps {
  /** Whether the algorithm panel is open — toolbar reflects the toggle state. */
  algorithmPanelOpen: boolean;
  onAlgorithmPanelToggle: () => void;
}

function enterFullscreen() {
  document.documentElement.requestFullscreen().catch(() => {
    // Browser may refuse (permissions policy, sandboxed iframe).
    // Silently ignore — the button is best-effort.
  });
}

function exitFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

interface ToolButtonProps {
  label: string;
  title?: string;
  icon: React.ReactNode;
  onClick: () => void;
  pressed?: boolean;
}

function ToolButton({ label, title, icon, onClick, pressed }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? label}
      onClick={onClick}
      className={`flex h-6 w-6 items-center justify-center rounded-vs-sm transition-colors duration-ui-fast ease-settle ${
        pressed
          ? "bg-paper-sunken text-ink hover:bg-rule"
          : "text-ink-faint hover:bg-paper-sunken hover:text-ink"
      }`}
    >
      {icon}
    </button>
  );
}

export const LEVEL_LABEL: Record<SemanticLevel, string> = {
  constellation: "all",
  feature: "feat",
  document: "doc",
};

export function NavToolbar({
  algorithmPanelOpen,
  onAlgorithmPanelToggle,
}: NavToolbarProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [level, setLevel] = useState<SemanticLevel | null>(null);
  // Granularity toggle: reads + writes viewStore so Stage.tsx re-queries.
  const granularity = useViewStore((s) => s.granularity);
  const setGranularity = useViewStore((s) => s.setGranularity);

  // Track OS-level fullscreen state via the document event.
  useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFSChange);
    return () => document.removeEventListener("fullscreenchange", onFSChange);
  }, []);

  // Subscribe to camera-change events to display the current semantic level.
  useEffect(() => {
    return getScene().controller.on((event) => {
      if (event.kind === "camera-change") {
        setLevel(event.level);
      }
    });
  }, []);

  const scene = getScene();

  return (
    <div
      className="pointer-events-auto absolute right-vs-2 top-8 z-20 flex items-center gap-vs-0-5 rounded-vs-md border border-rule bg-paper-raised/90 px-vs-1 py-vs-0-5 shadow-card backdrop-blur-sm"
      role="toolbar"
      aria-label="graph navigation"
      data-nav-toolbar
    >
      {/* Camera controls (SceneController zoom commands, P01.S02) */}
      <ToolButton
        label="zoom out"
        icon={<Minus size={13} />}
        onClick={() => scene.controller.command({ kind: "zoom-out" })}
      />
      {level !== null && (
        <span
          className="min-w-[2.5rem] text-center text-2xs text-ink-faint tabular-nums"
          aria-label={`zoom level: ${level}`}
          title={level}
        >
          {LEVEL_LABEL[level]}
        </span>
      )}
      <ToolButton
        label="zoom in"
        icon={<Plus size={13} />}
        onClick={() => scene.controller.command({ kind: "zoom-in" })}
      />

      <span className="mx-vs-0-5 h-3.5 w-px bg-rule" aria-hidden />

      <ToolButton
        label="fit to view"
        title="fit all nodes into viewport"
        icon={<Maximize2 size={13} />}
        onClick={() => scene.controller.command({ kind: "fit-to-view" })}
      />
      <ToolButton
        label="reset view"
        title="reset camera to origin"
        icon={<RotateCcw size={13} />}
        onClick={() => scene.controller.command({ kind: "reset-view" })}
      />

      <span className="mx-vs-0-5 h-3.5 w-px bg-rule" aria-hidden />

      {/* Algorithm panel toggle */}
      <ToolButton
        label="toggle layout controls"
        title={algorithmPanelOpen ? "close layout controls" : "open layout controls"}
        icon={<Settings2 size={13} />}
        pressed={algorithmPanelOpen}
        onClick={onAlgorithmPanelToggle}
      />

      <span className="mx-vs-0-5 h-3.5 w-px bg-rule" aria-hidden />

      {/* Granularity toggle: constellation (~12 feature nodes) ↔ document graph (~200 nodes) */}
      <div
        className="flex rounded-vs-sm border border-rule text-2xs"
        role="group"
        aria-label="graph granularity"
        title="Switch between the feature constellation overview and the full document graph"
      >
        <button
          type="button"
          aria-pressed={granularity === "feature"}
          onClick={() => setGranularity("feature")}
          className={`flex items-center px-vs-1-5 py-vs-0-5 transition-colors duration-ui-fast ease-settle ${
            granularity === "feature"
              ? "bg-paper-sunken font-medium text-ink"
              : "text-ink-faint hover:text-ink-muted"
          }`}
          title="Feature constellation — overview of how features relate"
        >
          feat
        </button>
        <span className="w-px bg-rule" aria-hidden />
        <button
          type="button"
          aria-pressed={granularity === "document"}
          onClick={() => setGranularity("document")}
          className={`flex items-center px-vs-1-5 py-vs-0-5 transition-colors duration-ui-fast ease-settle ${
            granularity === "document"
              ? "bg-paper-sunken font-medium text-ink"
              : "text-ink-faint hover:text-ink-muted"
          }`}
          title="Document graph — all vault documents and their links"
        >
          docs
        </button>
      </div>

      <span className="mx-vs-0-5 h-3.5 w-px bg-rule" aria-hidden />

      {/* Fullscreen — browser Fullscreen API */}
      <ToolButton
        label={isFullscreen ? "exit fullscreen" : "fullscreen"}
        title={isFullscreen ? "exit fullscreen (Esc)" : "fullscreen"}
        icon={isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
        pressed={isFullscreen}
        onClick={isFullscreen ? exitFullscreen : enterFullscreen}
      />
    </div>
  );
}
