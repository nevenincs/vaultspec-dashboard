// ForceAtlas2 web worker body (W01.P03.S13, ADR G3.e).
//
// Runs graphology's synchronous FA2 in tick batches off the main thread and
// posts position frames back. Spawned via a Vite-native worker URL import
// (foundation report rider: prefer Vite worker imports over the library's
// inline-blob worker so production bundling is verifiable).

import Graph from "graphology";
import forceatlas2 from "graphology-layout-forceatlas2";

import type {
  LayoutChangeMessage,
  LayoutInMessage,
  LayoutNodeSeed,
  LayoutPositionsMessage,
} from "./layoutWorker";

const graph = new Graph({ type: "undirected", multi: true });
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const ITERATIONS_PER_TICK = 4;
const TICK_MS = 16;

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
    const settings = forceatlas2.inferSettings(graph);
    forceatlas2.assign(graph, {
      iterations: ITERATIONS_PER_TICK,
      settings: { ...settings, barnesHutOptimize: true },
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
        if (graph.hasNode(e.src) && graph.hasNode(e.dst)) {
          graph.addEdgeWithKey(e.id, e.src, e.dst);
        }
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
  }
};
