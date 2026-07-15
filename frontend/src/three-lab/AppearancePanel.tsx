// Live "look" knobs (node module size, edge width/opacity, edge colour mode) for
// the three.js field — the appearance sibling of the Simulation (force) panel.
// Mirrors the forceControls knob pattern; drives ThreeField.setAppearanceParams.
// Renders both control kinds from the shared appearanceControls schema: a numeric
// slider/stepper, and a select for enum knobs (the edge colour mode). Self-contained
// so it slots into the lab as a single element, anchored top-LEFT (the Simulation
// panel owns top-right).

import { useCallback, useState } from "react";

import type { AppearanceParams } from "../scene/three/appearance";
import {
  APPEARANCE_CONTROLS,
  APPEARANCE_CONTROL_DEFAULTS,
  APPEARANCE_CONTROL_GROUPS,
  type AppearanceControl,
} from "../scene/three/appearanceControls";
import type { ThreeField } from "../scene/three/threeField";

export function AppearancePanel({ getField }: { getField: () => ThreeField | null }) {
  const [params, setParams] = useState<AppearanceParams>({
    ...APPEARANCE_CONTROL_DEFAULTS,
  });
  const [open, setOpen] = useState(true);

  // Live retune: mirror the knob in the panel and push the single changed value into
  // the running field (edge changes are a cheap attribute rewrite; a node-size change
  // re-feeds collide spacing and gently reheats).
  const setParam = useCallback(
    (key: keyof AppearanceParams, value: number | string) => {
      setParams((prev) => ({ ...prev, [key]: value }) as AppearanceParams);
      getField()?.setAppearanceParams({ [key]: value } as Partial<AppearanceParams>);
    },
    [getField],
  );

  const reset = useCallback(() => {
    const d: AppearanceParams = { ...APPEARANCE_CONTROL_DEFAULTS };
    setParams(d);
    getField()?.setAppearanceParams(d);
  }, [getField]);

  const renderControl = (c: AppearanceControl) => {
    if (c.kind === "enum") {
      const v = params[c.key] as string;
      return (
        <div key={c.key} style={{ margin: "4px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ flex: 1 }}>{c.controlId}</span>
            <select
              value={v}
              onChange={(e) => setParam(c.key, e.target.value)}
              style={{ font: "inherit" }}
            >
              {c.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    }
    const v = params[c.key] as number;
    return (
      <div key={c.key} style={{ margin: "4px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ flex: 1 }}>{c.controlId}</span>
          <input
            type="number"
            value={v}
            min={c.min}
            max={c.max}
            step={c.step}
            onChange={(e) => setParam(c.key, Number(e.target.value))}
            style={{ width: 60, font: "inherit", textAlign: "right" }}
          />
        </div>
        <input
          type="range"
          min={c.min}
          max={c.max}
          step={c.step}
          value={v}
          onChange={(e) => setParam(c.key, Number(e.target.value))}
          style={{ width: "100%", marginTop: 1 }}
        />
      </div>
    );
  };

  return (
    <section
      style={{
        position: "absolute",
        top: 46,
        left: 8,
        width: 236,
        maxHeight: "calc(100% - 54px)",
        display: "flex",
        flexDirection: "column",
        background: "rgba(253, 250, 246, 0.95)",
        border: "1px solid var(--color-border, #ddd)",
        borderRadius: 8,
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.14)",
        font: "12px system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 8px",
          borderBottom: open ? "1px solid var(--color-border, #eee)" : "none",
        }}
      >
        <button
          onClick={() => setOpen((s) => !s)}
          title={open ? "Collapse" : "Expand"}
          style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }}
        >
          {open ? "▾" : "▸"}
        </button>
        <strong style={{ flex: 1 }}>Appearance</strong>
        <button onClick={reset} title="Restore defaults">
          Reset
        </button>
      </header>
      {open && (
        <div style={{ overflowY: "auto", padding: "2px 8px 8px" }}>
          {APPEARANCE_CONTROL_GROUPS.map((group) => (
            <div key={group}>
              <div
                style={{
                  margin: "8px 0 1px",
                  fontSize: 10,
                  letterSpacing: 0.6,
                  opacity: 0.55,
                }}
              >
                {group}
              </div>
              {APPEARANCE_CONTROLS.filter((c) => c.group === group).map(renderControl)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
