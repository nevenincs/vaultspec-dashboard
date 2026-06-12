// ForceAtlas2 layout worker integration (W01.P03.S13, ADR G3.e).
//
// Warm-start + local perturbation: expanding or filtering perturbs only the
// local neighborhood — mental-map preservation beats layout optimality for
// the product's dominant task (re-finding the same document across
// interactions and scrubs). New nodes seed at their known neighbors'
// centroid plus jitter (or near the field centroid when unconnected);
// existing nodes keep their positions, warm-started from the position
// cache (S08) or the contract's seedPosition hint.
//
// The worker is spawned via the Vite-native URL pattern (foundation report
// rider) so the production-bundle worker path is verifiable, unlike the
// library's inline-blob worker. Scene-layer module: framework-free.

import type { NodePosition } from "../positionCache";

// --- worker protocol (shared with fa2.worker.ts) ------------------------------

export interface LayoutNodeSeed {
  id: string;
  x: number;
  y: number;
}

export interface LayoutEdgeRef {
  id: string;
  src: string;
  dst: string;
}

export interface LayoutInitMessage {
  kind: "init";
  nodes: LayoutNodeSeed[];
  edges: LayoutEdgeRef[];
}

export interface LayoutChangeMessage {
  kind: "change";
  addNodes?: LayoutNodeSeed[];
  removeNodeIds?: string[];
  addEdges?: LayoutEdgeRef[];
  removeEdgeIds?: string[];
}

export type LayoutInMessage =
  | LayoutInitMessage
  | { kind: "start" }
  | { kind: "stop" }
  | LayoutChangeMessage;

export interface LayoutPositionsMessage {
  kind: "positions";
  ids: string[];
  coords: Float32Array;
}

// --- pure warm-start seeding (unit-tested) -------------------------------------

export const SEED_JITTER = 24;
export const COLD_START_RADIUS = 400;

/**
 * Seed positions for nodes entering the layout. Priority: a known position
 * (cache / contract seedPosition hint) verbatim; else the centroid of
 * already-positioned neighbors plus deterministic-jitter (local
 * perturbation, not global reflow); else a spot near the field centroid.
 */
export function seedPositions(
  nodeIds: readonly string[],
  edges: readonly LayoutEdgeRef[],
  known: ReadonlyMap<string, NodePosition>,
  rand: () => number = Math.random,
): Map<string, NodePosition> {
  const out = new Map<string, NodePosition>();
  let cx = 0;
  let cy = 0;
  if (known.size > 0) {
    for (const p of known.values()) {
      cx += p.x;
      cy += p.y;
    }
    cx /= known.size;
    cy /= known.size;
  }
  const jitter = () => (rand() * 2 - 1) * SEED_JITTER;
  for (const id of nodeIds) {
    const existing = known.get(id);
    if (existing) {
      out.set(id, existing);
      continue;
    }
    let nx = 0;
    let ny = 0;
    let n = 0;
    for (const e of edges) {
      const other = e.src === id ? e.dst : e.dst === id ? e.src : null;
      if (!other) continue;
      const p = known.get(other) ?? out.get(other);
      if (!p) continue;
      nx += p.x;
      ny += p.y;
      n += 1;
    }
    if (n > 0) {
      out.set(id, { x: nx / n + jitter(), y: ny / n + jitter() });
    } else if (known.size > 0) {
      out.set(id, { x: cx + jitter() * 4, y: cy + jitter() * 4 });
    } else {
      out.set(id, {
        x: (rand() * 2 - 1) * COLD_START_RADIUS,
        y: (rand() * 2 - 1) * COLD_START_RADIUS,
      });
    }
  }
  return out;
}

// --- the main-thread wrapper -----------------------------------------------------

/** The slice of Worker the wrapper uses — injectable for tests. */
export interface WorkerLike {
  postMessage(message: unknown, options?: { transfer?: Transferable[] }): void;
  onmessage: ((event: MessageEvent) => void) | null;
  terminate(): void;
}

export type PositionsListener = (positions: ReadonlyMap<string, NodePosition>) => void;

export function createFa2Worker(): WorkerLike {
  return new Worker(new URL("./fa2.worker.ts", import.meta.url), {
    type: "module",
  });
}

export class FieldLayout {
  private worker: WorkerLike;
  private listeners = new Set<PositionsListener>();
  private latest = new Map<string, NodePosition>();

  constructor(worker: WorkerLike = createFa2Worker()) {
    this.worker = worker;
    this.worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as LayoutPositionsMessage;
      if (msg?.kind !== "positions") return;
      this.latest = new Map();
      for (let i = 0; i < msg.ids.length; i++) {
        this.latest.set(msg.ids[i], { x: msg.coords[i * 2], y: msg.coords[i * 2 + 1] });
      }
      for (const listener of this.listeners) {
        listener(this.latest);
      }
    };
  }

  /** Initialize the layout graph with warm-start seeds already applied. */
  init(
    nodeIds: readonly string[],
    edges: readonly LayoutEdgeRef[],
    warmStart: ReadonlyMap<string, NodePosition>,
    rand?: () => number,
  ): void {
    const seeds = seedPositions(nodeIds, edges, warmStart, rand);
    this.worker.postMessage({
      kind: "init",
      nodes: nodeIds.map((id) => ({ id, ...seeds.get(id)! })),
      edges: [...edges],
    } satisfies LayoutInitMessage);
  }

  /** Graph changes with local perturbation: only new nodes get seeded. */
  applyChanges(
    change: Omit<LayoutChangeMessage, "kind" | "addNodes"> & {
      addNodeIds?: readonly string[];
      addEdges?: LayoutEdgeRef[];
    },
    rand?: () => number,
  ): void {
    const addIds = change.addNodeIds ?? [];
    const seeds = seedPositions(addIds, change.addEdges ?? [], this.latest, rand);
    this.worker.postMessage({
      kind: "change",
      addNodes: addIds.map((id) => ({ id, ...seeds.get(id)! })),
      removeNodeIds: change.removeNodeIds,
      addEdges: change.addEdges,
      removeEdgeIds: change.removeEdgeIds,
    } satisfies LayoutChangeMessage);
  }

  start(): void {
    this.worker.postMessage({ kind: "start" });
  }

  stop(): void {
    this.worker.postMessage({ kind: "stop" });
  }

  /** Latest position frame (for saving back to the position cache). */
  get positions(): ReadonlyMap<string, NodePosition> {
    return this.latest;
  }

  onPositions(listener: PositionsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    this.worker.postMessage({ kind: "stop" });
    this.worker.terminate();
    this.listeners.clear();
  }
}
