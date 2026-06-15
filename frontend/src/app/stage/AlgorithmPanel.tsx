// Graph layout controls panel (dashboard-node-graph-stability ADR).
//
// Exposes the Obsidian knob set for the d3-force connectivity layout — Repel,
// Link force, Link distance, Center — plus the layout-mode toggle (force ↔
// circular). The cooling schedule (alpha/velocity decay) is deliberately NOT
// exposed: fixing it in code is what guarantees the layout always settles.
//
// Commands set-layout-params and set-layout-mode are dispatched only via
// SceneController.command(); the panel never fetches, never touches stores, and
// never reaches the solver directly. SceneController.getLayoutState() provides
// the initial state on mount so the sliders open reflecting the live engine
// state, and the panel subscribes to layout-changed events to stay in sync.

import { X } from "lucide-react";
import { useEffect, useState } from "react";

import type { LayoutParams } from "../../scene/field/forceLayout";
import { LAYOUT_DEFAULTS } from "../../scene/field/forceLayout";
import { getScene } from "./Stage";

// The "reset" target and the initial state before the scene reports its own
// state via getLayoutState(). Exported so tests can assert the shape without
// rendering the component.
export const DEFAULTS: Required<LayoutParams> = { ...LAYOUT_DEFAULTS };

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
              aria-label="reset to default forces"
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

      {/* Obsidian force knobs — only relevant in force mode */}
      <div className={`py-1 ${mode === "circular" ? "opacity-40" : ""}`}>
        <SliderRow
          label="Repel force"
          hint="Node repulsion — higher pushes nodes further apart"
          value={params.repel}
          min={0}
          max={400}
          step={10}
          onChange={(v) => applyParams({ repel: v })}
          format={(v) => String(Math.round(v))}
        />
        <SliderRow
          label="Link force"
          hint="Spring stiffness — higher pulls linked nodes tighter together"
          value={params.linkForce}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => applyParams({ linkForce: v })}
          format={(v) => v.toFixed(2)}
        />
        <SliderRow
          label="Link distance"
          hint="Spring rest length between linked nodes"
          value={params.linkDistance}
          min={10}
          max={120}
          step={5}
          onChange={(v) => applyParams({ linkDistance: v })}
          format={(v) => String(Math.round(v))}
        />
        <SliderRow
          label="Center force"
          hint="Gravity toward the center — higher tightens the whole graph inward"
          value={params.center}
          min={0}
          max={0.3}
          step={0.01}
          onChange={(v) => applyParams({ center: v })}
          format={(v) => v.toFixed(2)}
        />
      </div>
    </div>
  );
}
