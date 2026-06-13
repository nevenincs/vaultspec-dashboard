// ForceAtlas2 web worker body (W01.P03.S13, ADR G3.e).
//
// Runs graphology's synchronous FA2 in tick batches off the main thread and
// posts position frames back. Spawned via a Vite-native worker URL import
// (foundation report rider: prefer Vite worker imports over the library's
// inline-blob worker so production bundling is verifiable).

import Graph from "graphology";
import forceatlas2 from "graphology-layout-forceatlas2";

import { postWorkerLog } from "../../platform/logger/workerBridge";
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

function tick(): void {
  if (!running) return;
  if (graph.order > 1 && graph.size > 0) {
    forceatlas2.assign(graph, {
      iterations: iterationsPerTick,
      settings: currentParams,
    });
    postPositions();
  }
  timer = setTimeout(tick, TICK_MS);
}

onmessage = (event: MessageEvent<LayoutInMessage>) => {
  const msg = event.data;
  switch (msg.kind) {
    case "init":
      graph.clear();
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
      postPositions();
      break;
    case "params": {
      const p = (msg as LayoutParamsMessage).params;
      currentParams = { ...currentParams, ...p };
      if (p.iterationsPerTick !== undefined) iterationsPerTick = p.iterationsPerTick;
      break;
    }
  }
};
