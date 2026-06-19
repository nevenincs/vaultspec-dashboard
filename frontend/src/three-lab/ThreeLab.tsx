// Minimal parallel sandbox for the three.js GPGPU field. Drives ThreeField through
// a SceneController (the same path the app uses) so node/edge/simulation AND the
// interaction surface (hover/select/open/context-menu/camera) can be exercised and
// measured on their own — no cosmos, no app chrome.

import { useCallback, useEffect, useRef, useState } from "react";

import { createDashboardScene } from "../scene/field/fieldAssembly";
import type { SceneController } from "../scene/sceneController";
import type { SceneEdgeData, SceneNodeData } from "../scene/sceneController";
import { sliceToScene } from "../scene/sceneMapping";
import { graphLabDevSlice } from "./sampleGraph";
import type { ThreeField } from "../scene/three/threeField";
import type { D3ForceParams } from "../scene/three/d3ForceSolver";
import {
  FORCE_CONTROLS,
  FORCE_CONTROL_DEFAULTS,
  FORCE_CONTROL_GROUPS,
} from "../scene/three/forceControls";
import {
  DEFAULT_PRESET_NAME,
  type ForcePresets,
  buildShareUrl,
  deletePreset,
  initialForceParams,
  loadPreset,
  paramsToJson,
  parseParamsJson,
  presetNames,
  readPresets,
  savePreset,
  writeStoredParams,
} from "./forcePresets";
import { AppearancePanel } from "./AppearancePanel";

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
  // Params hydrate from `?sim=` › localStorage › defaults (forcePresets), so a
  // tuned config survives reload and is shareable by URL.
  const [params, setParamsState] = useState<D3ForceParams>(() =>
    initialForceParams(window.location.search),
  );
  const paramsRef = useRef(params);
  const [presets, setPresets] = useState<ForcePresets>(() => readPresets());
  const [selectedPreset, setSelectedPreset] = useState<string>(DEFAULT_PRESET_NAME);
  const [presetDraft, setPresetDraft] = useState("");
  const [jsonDraft, setJsonDraft] = useState("");
  const [labStatus, setLabStatus] = useState("");
  const [showControls, setShowControls] = useState(true);

  // Persist the live params on every change so a tweak survives reload (and a
  // `?sim=` hydration becomes the working set). The ref keeps the latest value
  // available to the mount effect without re-running it.
  useEffect(() => {
    paramsRef.current = params;
    writeStoredParams(params);
  }, [params]);

  // Apply a full param set: mirror it in the panel AND push it into the running
  // solver (it reheats and re-settles so the effect is visible immediately).
  const applyParams = useCallback((next: D3ForceParams) => {
    setParamsState(next);
    sceneRef.current?.field.setForceParams(next);
  }, []);

  // Live retune of one knob.
  const setParam = useCallback((key: keyof D3ForceParams, value: number) => {
    setParamsState((prev) => ({ ...prev, [key]: value }) as D3ForceParams);
    sceneRef.current?.field.setForceParams({ [key]: value } as Partial<D3ForceParams>);
  }, []);

  const resetParams = useCallback(() => {
    applyParams({ ...FORCE_CONTROL_DEFAULTS });
    setSelectedPreset(DEFAULT_PRESET_NAME);
    setLabStatus("Restored defaults");
  }, [applyParams]);

  const onLoadPreset = useCallback(
    (name: string) => {
      setSelectedPreset(name);
      applyParams(loadPreset(presets, name));
      setLabStatus(`Loaded preset “${name}”`);
    },
    [applyParams, presets],
  );

  const onSavePreset = useCallback(() => {
    const name = presetDraft.trim();
    if (!name || name === DEFAULT_PRESET_NAME) {
      setLabStatus("Enter a preset name (not “Default”)");
      return;
    }
    setPresets((prev) => savePreset(prev, name, params));
    setSelectedPreset(name);
    setPresetDraft("");
    setLabStatus(`Saved preset “${name}”`);
  }, [params, presetDraft]);

  const onDeletePreset = useCallback(() => {
    if (selectedPreset === DEFAULT_PRESET_NAME) {
      setLabStatus("The Default preset can’t be deleted");
      return;
    }
    const name = selectedPreset;
    setPresets((prev) => deletePreset(prev, name));
    setSelectedPreset(DEFAULT_PRESET_NAME);
    setLabStatus(`Deleted preset “${name}”`);
  }, [selectedPreset]);

  const onCopyJson = useCallback(() => {
    const text = paramsToJson(params);
    setJsonDraft(text);
    const pending = navigator.clipboard?.writeText?.(text);
    if (pending) {
      void pending.then(
        () => setLabStatus("Copied params JSON to clipboard"),
        () => setLabStatus("Clipboard blocked — copy from the box below"),
      );
    } else {
      setLabStatus("Clipboard unavailable — copy from the box below");
    }
  }, [params]);

  const onLoadJson = useCallback(() => {
    try {
      applyParams(parseParamsJson(jsonDraft));
      setSelectedPreset(DEFAULT_PRESET_NAME);
      setLabStatus("Applied pasted JSON");
    } catch {
      setLabStatus("Invalid JSON");
    }
  }, [applyParams, jsonDraft]);

  const onCopyShareUrl = useCallback(() => {
    const url = buildShareUrl(params);
    if (!url) {
      setLabStatus("Could not build a share URL");
      return;
    }
    const pending = navigator.clipboard?.writeText?.(url);
    if (pending) {
      void pending.then(
        () => setLabStatus("Copied shareable ?sim= URL"),
        () => setLabStatus("Clipboard blocked"),
      );
    } else {
      setLabStatus("Clipboard unavailable");
    }
  }, [params]);

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
    const scene = createDashboardScene();
    sceneRef.current = scene;
    scene.controller.mount(host);
    // Hydrate the freshly-built field with the persisted/URL params BEFORE the
    // first set-data, so the solver is constructed at those values (no
    // default-then-reheat flash).
    scene.field.setForceParams(paramsRef.current);

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

  const presetOptions = presetNames(presets);

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
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "4px 0 8px",
                borderBottom: "1px solid var(--color-border, #eee)",
              }}
            >
              <div style={{ display: "flex", gap: 4 }}>
                <select
                  value={selectedPreset}
                  onChange={(e) => onLoadPreset(e.target.value)}
                  title="Load a saved preset"
                  style={{ flex: 1, font: "inherit" }}
                >
                  {presetOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={onDeletePreset}
                  disabled={selectedPreset === DEFAULT_PRESET_NAME}
                  title="Delete the selected preset"
                >
                  ✕
                </button>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <input
                  value={presetDraft}
                  onChange={(e) => setPresetDraft(e.target.value)}
                  placeholder="Save current as…"
                  style={{ flex: 1, font: "inherit", minWidth: 0 }}
                />
                <button onClick={onSavePreset}>Save</button>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={onCopyJson} style={{ flex: 1 }}>
                  Copy JSON
                </button>
                <button onClick={onCopyShareUrl} style={{ flex: 1 }}>
                  Copy URL
                </button>
              </div>
              <textarea
                value={jsonDraft}
                onChange={(e) => setJsonDraft(e.target.value)}
                placeholder="Paste D3ForceParams JSON…"
                spellCheck={false}
                rows={3}
                style={{
                  width: "100%",
                  font: "11px ui-monospace, monospace",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              <button onClick={onLoadJson}>Load JSON</button>
              {labStatus && (
                <div style={{ fontSize: 10, opacity: 0.7 }}>{labStatus}</div>
              )}
            </div>
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
      <AppearancePanel getField={() => sceneRef.current?.field ?? null} />
    </div>
  );
}
