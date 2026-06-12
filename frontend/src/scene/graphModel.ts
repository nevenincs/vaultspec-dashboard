// Renderer-agnostic scene graph model (W01.P02.S05, ADR G3.a).
//
// Holds the contract-shaped graph slice currently materialized on stage,
// keyed by the contract's stable ids (identity guarantees: node ids derive
// from kind + canonical key, edge ids are content hashes — the GUI caches
// and animates by id, never by position). Scene-layer module: framework-free
// by design, no React imports, ever.
//
// This model is pure data + indices. The delta log (S06) mutates it via
// keyframes and ordered deltas; the field renderer (W01.P03) reads it.

import type { SceneDelta, SceneEdgeData, SceneNodeData } from "./sceneController";

export class SceneGraphModel {
  private nodesById = new Map<string, SceneNodeData>();
  private edgesById = new Map<string, SceneEdgeData>();
  /** node id → ids of incident edges (src or dst). */
  private incidence = new Map<string, Set<string>>();

  // --- keyframe ------------------------------------------------------------

  /** Replace the whole slice (the `set-data` keyframe path). */
  setData(nodes: readonly SceneNodeData[], edges: readonly SceneEdgeData[]): void {
    this.nodesById.clear();
    this.edgesById.clear();
    this.incidence.clear();
    for (const n of nodes) {
      this.nodesById.set(n.id, n);
    }
    for (const e of edges) {
      this.insertEdge(e);
    }
  }

  // --- deltas ----------------------------------------------------------------

  /**
   * Apply one ordered delta (the `apply-deltas` path; same shape for
   * `/graph/diff` entries and the live `graph` SSE channel).
   *
   * `add` and `change` upsert — re-deriving the same stable id updates in
   * place. `remove`ing a node also removes its incident edges (the contract
   * orders deltas, but a splice gap repaired by re-keyframe must never leave
   * dangling incidence behind).
   */
  applyDelta(delta: SceneDelta): void {
    if (delta.node) {
      const node = delta.node;
      if (delta.op === "remove") {
        this.nodesById.delete(node.id);
        const incident = this.incidence.get(node.id);
        if (incident) {
          for (const edgeId of [...incident]) {
            this.removeEdge(edgeId);
          }
          this.incidence.delete(node.id);
        }
      } else {
        const prev = this.nodesById.get(node.id);
        this.nodesById.set(node.id, prev ? { ...prev, ...node } : node);
      }
    }
    if (delta.edge) {
      const edge = delta.edge;
      if (delta.op === "remove") {
        this.removeEdge(edge.id);
      } else {
        const prev = this.edgesById.get(edge.id);
        if (prev) {
          this.removeEdge(edge.id);
          this.insertEdge({ ...prev, ...edge });
        } else {
          this.insertEdge(edge);
        }
      }
    }
  }

  // --- reads -------------------------------------------------------------------

  getNode(id: string): SceneNodeData | undefined {
    return this.nodesById.get(id);
  }

  getEdge(id: string): SceneEdgeData | undefined {
    return this.edgesById.get(id);
  }

  get nodes(): IterableIterator<SceneNodeData> {
    return this.nodesById.values();
  }

  get edges(): IterableIterator<SceneEdgeData> {
    return this.edgesById.values();
  }

  get nodeCount(): number {
    return this.nodesById.size;
  }

  get edgeCount(): number {
    return this.edgesById.size;
  }

  /** Ids of edges incident to a node (ego highlight, unfold-on-selection). */
  edgesOf(nodeId: string): readonly string[] {
    const set = this.incidence.get(nodeId);
    return set ? [...set] : [];
  }

  /** 1-hop neighbor node ids (hover ego-highlight per G3.b). */
  neighborsOf(nodeId: string): readonly string[] {
    const out = new Set<string>();
    for (const edgeId of this.edgesOf(nodeId)) {
      const edge = this.edgesById.get(edgeId)!;
      const other = edge.src === nodeId ? edge.dst : edge.src;
      if (other !== nodeId && this.nodesById.has(other)) out.add(other);
    }
    return [...out];
  }

  /**
   * Edges whose endpoints are not both present — tolerated transiently
   * (ordered deltas may interleave), surfaced so consumers can detect a
   * slice that needs re-keyframing rather than silently drawing into the
   * void.
   */
  danglingEdgeIds(): readonly string[] {
    const out: string[] = [];
    for (const e of this.edgesById.values()) {
      if (!this.nodesById.has(e.src) || !this.nodesById.has(e.dst)) out.push(e.id);
    }
    return out;
  }

  // --- internals -------------------------------------------------------------

  private insertEdge(edge: SceneEdgeData): void {
    this.edgesById.set(edge.id, edge);
    this.addIncidence(edge.src, edge.id);
    this.addIncidence(edge.dst, edge.id);
  }

  private removeEdge(edgeId: string): void {
    const edge = this.edgesById.get(edgeId);
    if (!edge) return;
    this.edgesById.delete(edgeId);
    this.dropIncidence(edge.src, edgeId);
    this.dropIncidence(edge.dst, edgeId);
  }

  private addIncidence(nodeId: string, edgeId: string): void {
    let set = this.incidence.get(nodeId);
    if (!set) {
      set = new Set();
      this.incidence.set(nodeId, set);
    }
    set.add(edgeId);
  }

  private dropIncidence(nodeId: string, edgeId: string): void {
    const set = this.incidence.get(nodeId);
    if (!set) return;
    set.delete(edgeId);
    if (set.size === 0) this.incidence.delete(nodeId);
  }
}
