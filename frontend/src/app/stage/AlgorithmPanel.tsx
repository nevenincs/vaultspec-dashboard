// Graph algorithm controls panel (task #6): sliders and toggles for the
// ForceAtlas2 layout engine in the scene layer's web worker, plus a
// layout-mode toggle (force ↔ circular).
//
// Commands set-layout-params and set-layout-mode are live as of the
// 2026-06-13 graph-quality addenda (P01.S02). SceneController.getLayoutState()
// provides the initial state on mount so the sliders open reflecting the
// current engine state. The panel subscribes to layout-changed events to stay
// in sync if another actor changes the params.
//
// Seam boundary: panel dispatches only via SceneController.command(); it
// never fetches, never touches stores, and never reaches the worker directly.

import { X } from "lucide-react";
import { useEffect, useState } from "react";

import type { LayoutParams } from "../../scene/field/layoutWorker";
import { getScene } from "./Stage";

// Defaults match the FA2 inferSettings() output for a medium-sized graph.
// Used as the "reset" target and the initial state before the scene reports
// its own state via getLayoutState(). Exported so tests can assert the
// shape without rendering the component.
export const DEFAULTS: Required<LayoutParams> = {
  scalingRatio: 25,
  gravity: 0.5,
  slowDown: 1,
  barnesHutOptimize: true,
  iterationsPerTick: 4,
};

// ---------------------------------------------------------------------------
// Slider row helper
// ---------------------------------------------------------------------------

interface SliderRowProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (v: number) => string;
}

function SliderRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: SliderRowProps) {
  const display = format ? format(value) : String(value);
  return (
    <label className="flex flex-col gap-vs-0-5 px-vs-3 py-vs-1" title={hint}>
      <span className="flex items-center justify-between text-label text-ink-muted">
        <span>{label}</span>
        {/* Readout is a data-bearing numeric value: tabular numerals, not the
            monospace identity face. */}
        <span data-tabular className="text-2xs tabular-nums text-ink-faint">
          {display}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={display}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full accent-accent"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface AlgorithmPanelProps {
  onClose: () => void;
}

export function AlgorithmPanel({ onClose }: AlgorithmPanelProps) {
  // Initialize from the scene's live state so the sliders open truthfully.
  const liveState = getScene().controller.getLayoutState();
  const [params, setParams] = useState<Required<LayoutParams>>({
    ...DEFAULTS,
    ...liveState.params,
  });
  const [mode, setMode] = useState<"force" | "circular">(liveState.mode);

  // Stay in sync with layout-changed events (e.g. if another session actor
  // sends a set-layout-params command while the panel is open).
  useEffect(() => {
    return getScene().controller.on((event) => {
      if (event.kind === "layout-changed") {
        setMode(event.mode);
        setParams((prev) => ({ ...prev, ...event.params }));
      }
    });
  }, []);

  // Close on Escape — this is a non-modal role="dialog" surface.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function applyParams(update: Partial<LayoutParams>) {
    const next = { ...params, ...update };
    setParams(next);
    getScene().controller.command({ kind: "set-layout-params", params: next });
  }

  function applyMode(next: "force" | "circular") {
    setMode(next);
    getScene().controller.command({ kind: "set-layout-mode", mode: next });
  }

  function handleReset() {
    setParams({ ...DEFAULTS });
    getScene().controller.command({
      kind: "set-layout-params",
      params: { ...DEFAULTS },
    });
  }

  const isDirty = JSON.stringify(params) !== JSON.stringify(DEFAULTS);

  return (
    <div
      role="dialog"
      aria-label="layout algorithm controls"
      aria-modal={false}
      className="pointer-events-auto absolute bottom-12 right-2 z-20 w-52 overflow-hidden rounded-vs-md border border-rule bg-paper-raised/95 shadow-float backdrop-blur-sm animate-slide-in-up"
      data-algorithm-panel
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-rule px-vs-3 py-vs-1-5">
        <span className="text-label font-semibold uppercase tracking-wider text-ink-muted">
          Layout
        </span>
        <div className="flex items-center gap-vs-2">
          {isDirty && (
            <button
              type="button"
              onClick={handleReset}
              className="rounded-vs-sm text-2xs text-ink-faint hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              aria-label="reset to inferred defaults"
            >
              reset
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="close layout panel"
            className="rounded-vs-sm p-vs-0-5 text-ink-faint hover:bg-paper-sunken hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Layout mode toggle */}
      <div className="border-b border-rule px-vs-3 py-vs-2">
        <span className="mb-vs-1 block text-label font-medium text-ink-muted">
          Mode
        </span>
        <div className="flex rounded-vs-sm border border-rule text-label">
          {(["force", "circular"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => applyMode(m)}
              aria-pressed={mode === m}
              className={`flex-1 py-vs-0-5 transition-colors duration-ui-fast ease-settle focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-focus ${
                mode === m
                  ? "bg-paper-sunken text-ink"
                  : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* FA2 parameter sliders — only relevant in force mode */}
      <div className={`py-1 ${mode === "circular" ? "opacity-40" : ""}`}>
        <SliderRow
          label="Spread"
          hint="Node repulsion — higher spreads nodes further apart"
          value={params.scalingRatio}
          min={0.1}
          max={20}
          step={0.1}
          onChange={(v) => applyParams({ scalingRatio: v })}
          format={(v) => v.toFixed(1)}
        />
        <SliderRow
          label="Gravity"
          hint="Central gravity — higher pulls nodes toward center"
          value={params.gravity}
          min={0}
          max={5}
          step={0.1}
          onChange={(v) => applyParams({ gravity: v })}
          format={(v) => v.toFixed(1)}
        />
        <SliderRow
          label="Inertia"
          hint="Damping — higher slows convergence"
          value={params.slowDown}
          min={1}
          max={100}
          step={1}
          onChange={(v) => applyParams({ slowDown: v })}
          format={(v) => String(Math.round(v))}
        />
        <SliderRow
          label="Speed"
          hint="FA2 iterations per 16ms frame"
          value={params.iterationsPerTick}
          min={1}
          max={20}
          step={1}
          onChange={(v) => applyParams({ iterationsPerTick: v })}
          format={(v) => `${Math.round(v)}/frame`}
        />

        {/* Barnes-Hut toggle */}
        <label className="flex cursor-pointer items-center gap-vs-2 px-vs-3 py-vs-1-5">
          <input
            type="checkbox"
            checked={params.barnesHutOptimize}
            onChange={(e) => applyParams({ barnesHutOptimize: e.target.checked })}
            className="accent-accent"
            disabled={mode === "circular"}
          />
          <span className="text-label text-ink-muted">Barnes-Hut</span>
          <span className="ml-vs-0-5 text-2xs text-ink-faint">(n &gt; 200)</span>
        </label>
      </div>
    </div>
  );
}
