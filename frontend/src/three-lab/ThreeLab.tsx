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
  const sceneRef = useRef<{ controller: SceneController } | null>(null);
  const [fps, setFps] = useState(0);
  const [status, setStatus] = useState("loading…");
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

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
    </div>
  );
}
