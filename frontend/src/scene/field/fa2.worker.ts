// ForceAtlas2 web worker body (W01.P03.S13, ADR G3.e).
//
// Runs graphology's synchronous FA2 in tick batches off the main thread and
// posts position frames back. Spawned via a Vite-native worker URL import
// (foundation report rider: prefer Vite worker imports over the library's
// inline-blob worker so production bundling is verifiable).

import Graph from "graphology";
import forceatlas2 from "graphology-layout-forceatlas2";

import { postWorkerLog } from "../../platform/logger/workerBridge";
import { ConvergenceDetector } from "./fa2Convergence";
import type {
  LayoutChangeMessage,
  LayoutInMessage,
  LayoutNodeSeed,
  LayoutParamsMessage,
  LayoutPositionsMessage,
} from "./layoutWorker";
import type { LayoutParams } from "./layoutWorker";

const graph = new Graph({ type: "undirected", multi: true });
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let iterationsPerTick = 4;
const TICK_MS = 16;
const convergence = new ConvergenceDetector();

// Spread-optimised defaults — strong repulsion, low gravity — so the initial
// layout fills 70–80% of the stage. The AlgorithmPanel exposes all four params
// so users can tighten the layout if needed. Values were calibrated against a
// 12-node feature constellation: scalingRatio=25 produces ~70% fill at 1400px
// wide; gravity=0.5 prevents the dense central cluster seen at 0.8.
// Consumers tune via the "params" message (set-layout-params command).
let currentParams: Required<Omit<LayoutParams, "iterationsPerTick">> = {
  scalingRatio: 25,
  gravity: 0.5,
  slowDown: 1,
  barnesHutOptimize: true,
};

function addNode(seed: LayoutNodeSeed): void {
  if (graph.hasNode(seed.id)) return;
  graph.addNode(seed.id, { x: seed.x, y: seed.y });
}

function applyChanges(msg: LayoutChangeMessage): void {
  for (const id of msg.removeNodeIds ?? []) {
    if (graph.hasNode(id)) graph.dropNode(id);
  }
  for (const seed of msg.addNodes ?? []) {
    addNode(seed);
  }
  for (const e of msg.addEdges ?? []) {
    if (!graph.hasNode(e.src) || !graph.hasNode(e.dst)) continue;
    if (e.id && graph.hasEdge(e.id)) continue;
    graph.addEdgeWithKey(e.id, e.src, e.dst);
  }
  for (const id of msg.removeEdgeIds ?? []) {
    if (graph.hasEdge(id)) graph.dropEdge(id);
  }
}

function postPositions(): void {
  const ids: string[] = [];
  const coords: number[] = [];
  graph.forEachNode((id, attrs) => {
    ids.push(id);
    coords.push(attrs.x as number, attrs.y as number);
  });
  const buffer = Float32Array.from(coords);
  const out: LayoutPositionsMessage = { kind: "positions", ids, coords: buffer };
  postMessage(out, { transfer: [buffer.buffer] });
}

/** Max displacement of any node between the two position snapshots (in world units). */
function computeMaxDisplacement(before: Map<string, { x: number; y: number }>): number {
  let maxSq = 0;
  graph.forEachNode((id, attrs) => {
    const prev = before.get(id);
    if (!prev) return;
    const dx = (attrs.x as number) - prev.x;
    const dy = (attrs.y as number) - prev.y;
    const sq = dx * dx + dy * dy;
    if (sq > maxSq) maxSq = sq;
  });
  return Math.sqrt(maxSq);
}

function tick(): void {
  if (!running) return;
  if (graph.order > 1 && graph.size > 0) {
    // Snapshot positions before the FA2 step so we can measure displacement.
    const before = new Map<string, { x: number; y: number }>();
    graph.forEachNode((id, attrs) => {
      before.set(id, { x: attrs.x as number, y: attrs.y as number });
    });
    forceatlas2.assign(graph, {
      iterations: iterationsPerTick,
      settings: currentParams,
    });
    postPositions();
    // Convergence check: stop when the layout has settled (S05).
    if (convergence.tick(computeMaxDisplacement(before))) {
      running = false;
      return; // layout converged — do not reschedule
    }
  }
  timer = setTimeout(tick, TICK_MS);
}

onmessage = (event: MessageEvent<LayoutInMessage>) => {
  const msg = event.data;
  switch (msg.kind) {
    case "init":
      graph.clear();
      convergence.reset();
      for (const seed of msg.nodes) addNode(seed);
      for (const e of msg.edges) {
        // Guard duplicates exactly like `change` does: a malformed keyframe
        // must degrade to a surfaced diagnostic, never a silently dead
        // worker (audit finding fa2-init-collision-006).
        if (!graph.hasNode(e.src) || !graph.hasNode(e.dst)) continue;
        if (graph.hasEdge(e.id)) {
          postWorkerLog(
            (m) => postMessage(m),
            "scene.fa2-worker",
            "error",
            `duplicate edge id in keyframe: ${e.id}`,
          );
          continue;
        }
        graph.addEdgeWithKey(e.id, e.src, e.dst);
      }
      postPositions();
      break;
    case "start":
      convergence.reset();
      if (!running) {
        running = true;
        tick();
      }
      break;
    case "stop":
      running = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      break;
    case "change":
      applyChanges(msg);
      convergence.reset();
      // If the layout had converged, new graph data means positions need to
      // re-settle — restart the tick loop.
      if (!running) {
        running = true;
        tick();
      }
      postPositions();
      break;
    case "params": {
      const p = (msg as LayoutParamsMessage).params;
      currentParams = { ...currentParams, ...p };
      if (p.iterationsPerTick !== undefined) iterationsPerTick = p.iterationsPerTick;
      convergence.reset();
      // If the layout had converged, new params likely mean the user wants to
      // see a fresh settle — restart the tick loop.
      if (!running) {
        running = true;
        tick();
      }
      break;
    }
  }
};
