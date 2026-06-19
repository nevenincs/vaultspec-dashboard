// Minimal parallel sandbox for the three.js GPGPU field. Drives ThreeField through
// a SceneController (the same path the app uses) so node/edge/simulation AND the
// interaction surface (hover/select/open/context-menu/camera) can be exercised and
// measured on their own — no cosmos, no app chrome.

import { useCallback, useEffect, useRef, useState } from "react";

import { createThreeScene } from "../scene/field/fieldAssembly";
import type { SceneController } from "../scene/sceneController";
import type { SceneEdgeData, SceneNodeData } from "../scene/sceneController";
import { sliceToScene } from "../scene/sceneMapping";
import { graphLabDevSlice } from "../graph-lab/sampleGraph";
import type { ThreeField } from "../scene/three/threeField";
import type { D3ForceParams } from "../scene/three/d3ForceSolver";
import {
  FORCE_CONTROLS,
  FORCE_CONTROL_DEFAULTS,
  FORCE_CONTROL_GROUPS,
} from "../scene/three/forceControls";

interface GeneratedGraph {
  nodes: SceneNodeData[];
  edges: SceneEdgeData[];
}

const DOC_TYPES = ["adr", "plan", "exec", "audit", "research", "reference"];
const TIERS = ["declared", "structural", "temporal", "semantic"] as const;

/**
 * Deterministic clustered synthetic graph for perf testing: `clusters` feature
 * hubs, each with member documents linked to the hub (declared) and a few
 * cross-links. No RNG — a hashed pseudo-random keeps runs stable.
 */
function generateGraph(nodeCount: number): GeneratedGraph {
  const nodes: SceneNodeData[] = [];
  const edges: SceneEdgeData[] = [];
  const clusters = Math.max(3, Math.round(Math.sqrt(nodeCount) / 2));
  const rand = (seed: number) => {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  for (let c = 0; c < clusters; c++) {
    nodes.push({
      id: `feature:${c}`,
      kind: "feature",
      title: `Feature ${c}`,
      featureTags: [`f${c}`],
      memberCount: 0,
    });
  }

  let docIdx = 0;
  while (nodes.length < nodeCount) {
    const c = docIdx % clusters;
    const id = `doc:${docIdx}`;
    nodes.push({
      id,
      kind: "document",
      docType: DOC_TYPES[docIdx % DOC_TYPES.length],
      title: `Doc ${docIdx}`,
      featureTags: [`f${c}`],
      salience: rand(docIdx),
    });
    edges.push({
      id: `e-hub-${docIdx}`,
      src: id,
      dst: `feature:${c}`,
      relation: "member",
      tier: "declared",
      confidence: 0.9,
    });
    if (docIdx > clusters) {
      const targetIdx = Math.floor(rand(docIdx * 7) * docIdx);
      edges.push({
        id: `e-x-${docIdx}`,
        src: id,
        dst: `doc:${targetIdx}`,
        relation: "relates",
        tier: TIERS[docIdx % TIERS.length],
        confidence: 0.3 + rand(docIdx * 3) * 0.6,
      });
    }
    docIdx++;
  }
  return { nodes, edges };
}

export function ThreeLab() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{ controller: SceneController; field: ThreeField } | null>(
    null,
  );
  const [fps, setFps] = useState(0);
  const [status, setStatus] = useState("loading…");
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [params, setParamsState] = useState<D3ForceParams>({
    ...FORCE_CONTROL_DEFAULTS,
  });
  const [showControls, setShowControls] = useState(true);

  // Live retune: push one changed knob into the running solver (it reheats and
  // re-settles so the effect is visible immediately) and mirror it in the panel.
  const setParam = useCallback((key: keyof D3ForceParams, value: number) => {
    setParamsState((prev) => ({ ...prev, [key]: value }) as D3ForceParams);
    sceneRef.current?.field.setForceParams({ [key]: value } as Partial<D3ForceParams>);
  }, []);

  const resetParams = useCallback(() => {
    const d: D3ForceParams = { ...FORCE_CONTROL_DEFAULTS };
    setParamsState(d);
    sceneRef.current?.field.setForceParams(d);
  }, []);

  const load = useCallback(
    (nodes: SceneNodeData[], edges: SceneEdgeData[], label: string) => {
      sceneRef.current?.controller.command({ kind: "set-data", nodes, edges });
      setStatus(`${label}: ${nodes.length} nodes, ${edges.length} edges`);
    },
    [],
  );

  const loadSample = useCallback(() => {
    const mapped = sliceToScene(graphLabDevSlice);
    load(mapped.nodes, mapped.edges, "sample");
  }, [load]);

  const loadGenerated = useCallback(
    (count: number) => {
      const g = generateGraph(count);
      load(g.nodes, g.edges, `generated ${count}`);
    },
    [load],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = createThreeScene();
    sceneRef.current = scene;
    scene.controller.mount(host);

    const off = scene.controller.on((ev) => {
      if (ev.kind === "hover") setHovered(ev.id);
      else if (ev.kind === "select") {
        setSelected(ev.id);
        scene.controller.command({
          kind: "set-selected",
          ids: new Set(ev.id ? [ev.id] : []),
        });
      }
    });

    const ro = new ResizeObserver(() => {
      const rect = host.getBoundingClientRect();
      scene.controller.resize(rect.width, rect.height);
    });
    ro.observe(host);

    const mapped = sliceToScene(graphLabDevSlice);
    scene.controller.command({
      kind: "set-data",
      nodes: mapped.nodes,
      edges: mapped.edges,
    });
    setStatus(`sample: ${mapped.nodes.length} nodes, ${mapped.edges.length} edges`);

    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const tick = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      off();
      ro.disconnect();
      scene.controller.destroy();
      sceneRef.current = null;
    };
  }, []);

  const cmd = (c: Parameters<SceneController["command"]>[0]) =>
    sceneRef.current?.controller.command(c);

  return (
    <div
      style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}
    >
      <header
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "8px 12px",
          borderBottom: "1px solid var(--color-border, #ddd)",
          font: "13px system-ui, sans-serif",
        }}
      >
        <strong>three.js graph lab</strong>
        <button onClick={loadSample}>Sample</button>
        <button onClick={() => loadGenerated(500)}>500</button>
        <button onClick={() => loadGenerated(2000)}>2000</button>
        <button onClick={() => loadGenerated(5000)}>5000</button>
        <button onClick={() => cmd({ kind: "fit-to-view" })}>Fit</button>
        <button onClick={() => cmd({ kind: "set-simulation-active", active: true })}>
          Reheat
        </button>
        <span style={{ opacity: 0.7 }}>
          hover: {hovered ?? "—"} · sel: {selected ?? "—"}
        </span>
        <span style={{ marginLeft: "auto", opacity: 0.7 }}>{status}</span>
        <span
          style={{
            minWidth: 70,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {fps} fps
        </span>
      </header>
      <div ref={hostRef} style={{ position: "relative", flex: 1, minHeight: 0 }} />
      <section
        style={{
          position: "absolute",
          top: 46,
          right: 8,
          width: 252,
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
            borderBottom: showControls ? "1px solid var(--color-border, #eee)" : "none",
          }}
        >
          <button
            onClick={() => setShowControls((s) => !s)}
            title={showControls ? "Collapse" : "Expand"}
            style={{
              border: "none",
              background: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {showControls ? "▾" : "▸"}
          </button>
          <strong style={{ flex: 1 }}>Simulation</strong>
          <button onClick={resetParams} title="Restore defaults">
            Reset
          </button>
        </header>
        {showControls && (
          <div style={{ overflowY: "auto", padding: "2px 8px 8px" }}>
            {FORCE_CONTROL_GROUPS.map((group) => (
              <div key={group}>
                <div
                  style={{
                    margin: "8px 0 1px",
                    fontSize: 10,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    opacity: 0.55,
                  }}
                >
                  {group}
                </div>
                {FORCE_CONTROLS.filter((c) => c.group === group).map((c) => {
                  const v = params[c.key];
                  return (
                    <div key={c.key} style={{ margin: "4px 0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ flex: 1 }} title={c.hint}>
                          {c.label}
                        </span>
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
                      {c.zeroIsAuto && v === 0 && (
                        <div style={{ fontSize: 10, opacity: 0.5, marginTop: -2 }}>
                          auto
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
