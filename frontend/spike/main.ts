// Renderer spike (gui-spec §6.1): PixiJS v8 field + the production d3-force
// layout driver + DOM overlay islands, against a synthetic corpus.
//
// Ported from the original graphology ForceAtlas2 proof to the shipped
// `FieldLayout` (dashboard-node-graph-stability) so the perf harness benchmarks
// the engine we actually ship.
//
// URL params: ?nodes=1000&edges=5000&islands=5&measure=10 (seconds)
// Results land in window.__SPIKE_RESULTS__ and the HUD, so both a human
// and a headless harness can read them.

import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";

import type { LayoutEdgeRef } from "../src/scene/field/forceLayout";
import { FieldLayout } from "../src/scene/field/forceLayout";
import type { NodePosition } from "../src/scene/positionCache";
import { generateCorpus } from "./corpus";
import { createEdgeMeshField } from "./edgeMesh";

interface SpikeResults {
  params: { nodes: number; edges: number; islands: number; measureS: number };
  renderer: string;
  gpu: string;
  phases: Record<
    string,
    { avgFps: number; avgMs: number; p95Ms: number; p99Ms: number; frames: number }
  >;
  done: boolean;
}

declare global {
  interface Window {
    __SPIKE_RESULTS__?: SpikeResults;
  }
}

const params = new URLSearchParams(location.search);
const NODE_COUNT = Number(params.get("nodes") ?? 1000);
const EDGE_COUNT = Number(params.get("edges") ?? 5000);
const ISLAND_COUNT = Number(params.get("islands") ?? 5);
const MEASURE_S = Number(params.get("measure") ?? 10);

const TIER_COLORS = [0x4a4137, 0x2f7d4f, 0x8a6d2f, 0x7d6f9e];
const KIND_COLORS = [0xc46a4a, 0x4a7fc4, 0x4ac49a, 0xc4b04a, 0x9a4ac4, 0x6a6a6a];

const hud = document.getElementById("hud")!;

function log(line: string) {
  hud.textContent += `\n${line}`;
}

async function main() {
  hud.textContent = `spike: ${NODE_COUNT} nodes / ${EDGE_COUNT} edges`;

  // --- corpus + the production d3-force driver ----------------------------
  const corpus = generateCorpus(NODE_COUNT, EDGE_COUNT);
  const nodeIds = corpus.nodes.map((n) => n.id);
  const edgeRefs: LayoutEdgeRef[] = corpus.edges.map((e, i) => ({
    id: `e${i}`,
    src: e.source,
    dst: e.target,
  }));
  const degree = new Map<string, number>();
  for (const e of corpus.edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  // The driver owns positions and emits a frame per tick; the renderer reads
  // the latest snapshot (cold-seeded via d3's phyllotaxis — never the origin).
  let latest: ReadonlyMap<string, NodePosition> = new Map();
  const layout = new FieldLayout();
  layout.onPositions((p) => {
    latest = p;
  });
  layout.init(nodeIds, edgeRefs, new Map());
  const posOf = (id: string): NodePosition => latest.get(id) ?? { x: 0, y: 0 };

  // --- Pixi v8 field --------------------------------------------------------
  const app = new Application();
  await app.init({
    background: 0xfaf9f7,
    resizeTo: window,
    antialias: false,
    preference: "webgl",
  });
  document.body.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);

  // GPU renderer identity, for honest reporting.
  let gpu = "unknown";
  try {
    const gl = app.canvas.getContext("webgl2") ?? app.canvas.getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (gl && ext) {
      gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    }
  } catch {
    /* ignore */
  }

  // Mesh-based edges (W01.P01.S01): static line-list topology built once,
  // position buffer re-uploaded in place per frame — replaces the foundation
  // spike's per-frame Graphics re-tessellation (the named 10k/50k bottleneck).
  const nodeIndex = new Map<string, number>();
  corpus.nodes.forEach((n, i) => nodeIndex.set(n.id, i));
  const nodePositions = new Float32Array(corpus.nodes.length * 2);
  const edgeField = createEdgeMeshField(corpus.edges, nodeIndex, TIER_COLORS);
  for (const mesh of edgeField.meshes) {
    world.addChild(mesh);
  }

  // Node sprites from one shared circle texture per kind — batched draw.
  const circle = new Graphics().circle(0, 0, 4).fill(0xffffff);
  const circleTexture: Texture = app.renderer.generateTexture(circle);
  const sprites = new Map<string, Sprite>();
  for (const n of corpus.nodes) {
    const sprite = new Sprite(circleTexture);
    sprite.anchor.set(0.5);
    sprite.tint = KIND_COLORS[n.kind % KIND_COLORS.length];
    world.addChild(sprite);
    sprites.set(n.id, sprite);
  }

  // --- DOM overlay islands --------------------------------------------------
  // Highest-degree nodes get an "opened node" HTML island, repositioned
  // every frame from the world transform — the hybrid pattern under test.
  const degrees = corpus.nodes
    .map((n) => ({ id: n.id, degree: degree.get(n.id) ?? 0 }))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, ISLAND_COUNT);
  const islands: { id: string; el: HTMLDivElement }[] = [];
  for (const { id, degree } of degrees) {
    const el = document.createElement("div");
    el.className = "island";
    el.textContent = `${id} — degree ${degree}`;
    document.body.appendChild(el);
    islands.push({ id, el });
  }

  // --- per-frame update + measurement ----------------------------------------
  const fit = () => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of latest.values()) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    if (!Number.isFinite(minX)) return;
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    const scale = Math.min(app.screen.width / w, app.screen.height / h) * 0.9;
    world.scale.set(scale);
    world.position.set(
      app.screen.width / 2 - (minX + w / 2) * scale,
      app.screen.height / 2 - (minY + h / 2) * scale,
    );
  };

  // While `dynamic` is true the field re-syncs node positions and re-uploads
  // the edge position buffers per frame (layout running / scrubbing). When
  // false, the scene is static and the ticker only renders — the realistic
  // settled steady-state.
  let dynamic = true;

  app.ticker.add(() => {
    if (!dynamic) return;
    // Sync sprite positions from the driver's latest frame and fill the shared
    // node-position array the edge meshes read from.
    for (const n of corpus.nodes) {
      const sprite = sprites.get(n.id)!;
      const { x, y } = posOf(n.id);
      sprite.position.set(x, y);
      const i = nodeIndex.get(n.id)! * 2;
      nodePositions[i] = x;
      nodePositions[i + 1] = y;
    }
    // Mesh edges: in-place position write + one buffer upload per tier — no
    // per-frame tessellation, no allocation.
    edgeField.update(nodePositions);
    fit();
    // DOM islands track their node through the world transform.
    for (const { id, el } of islands) {
      const p = posOf(id);
      const x = p.x * world.scale.x + world.position.x;
      const y = p.y * world.scale.y + world.position.y;
      el.style.transform = `translate(${x + 8}px, ${y - 8}px)`;
    }
  });

  // --- measurement harness ----------------------------------------------------
  const results: SpikeResults = {
    params: {
      nodes: NODE_COUNT,
      edges: EDGE_COUNT,
      islands: ISLAND_COUNT,
      measureS: MEASURE_S,
    },
    renderer: (app.renderer.name as string | undefined) ?? "unknown",
    gpu,
    phases: {},
    done: false,
  };
  window.__SPIKE_RESULTS__ = results;

  function measure(label: string, seconds: number): Promise<void> {
    return new Promise((resolve) => {
      const samples: number[] = [];
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        samples.push(now - last);
        last = now;
      };
      app.ticker.add(tick);
      setTimeout(() => {
        app.ticker.remove(tick);
        samples.sort((a, b) => a - b);
        const sum = samples.reduce((s, v) => s + v, 0);
        const avgMs = sum / samples.length;
        const at = (q: number) =>
          samples[Math.min(samples.length - 1, Math.floor(samples.length * q))];
        results.phases[label] = {
          avgFps: Math.round((1000 / avgMs) * 10) / 10,
          avgMs: Math.round(avgMs * 100) / 100,
          p95Ms: Math.round(at(0.95) * 100) / 100,
          p99Ms: Math.round(at(0.99) * 100) / 100,
          frames: samples.length,
        };
        log(
          `${label}: avg ${results.phases[label].avgFps} fps · ` +
            `avg ${results.phases[label].avgMs} ms · p95 ${results.phases[label].p95Ms} ms`,
        );
        resolve();
      }, seconds * 1000);
    });
  }

  log(`renderer: ${results.renderer} · gpu: ${gpu}`);

  // Phase 1: layout running (d3-force settling) — positions change per frame.
  layout.start();
  await measure("layout-running", MEASURE_S);
  layout.stop();

  // Phase 2: settled field, still re-uploading every position per frame
  // (worst case for scrub-style interactions where every position changes
  // every frame). Phase key kept from the foundation run for comparability.
  await measure("settled-rebuild", MEASURE_S / 2);

  // Phase 3: static field — geometry uploaded once, ticker renders only.
  // This is the realistic steady-state between interactions.
  dynamic = false;
  await measure("settled-static", MEASURE_S / 2);

  layout.destroy();
  results.done = true;
  log("DONE");
}

void main();
