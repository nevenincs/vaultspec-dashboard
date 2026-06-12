// Scene state lives OUTSIDE React (gui-spec §5.2, non-negotiable boundary):
// the renderer owns positions, LOD, and per-frame animation. React never
// renders the field's nodes; it sends commands and subscribes to events.
// This module is framework-free by design — no React imports, ever.
//
// Interface shape reviewed by experience-architect (2026-06-12 redline).
// LOCKED (W01.P01.S04, 2026-06-12): the RL-1 to RL-5 fold is final. The
// command, event, and anchor surface below is the seam every consumer
// builds against; the PixiJS v8 field (G6.b verdict: confirmed, S03) plugs
// in behind it, and the sigma.js v3 fallback must keep implementing the
// same surface. Surface changes from here on are ADR-flagged redlines, not
// drive-by edits.

/**
 * Graph data for one node — visual-anatomy inputs only (RL-1).
 *
 * Positions are scene-internal: the FA2 worker computes them inside the
 * scene layer and the warm-start cache restores them. React can never set
 * a position; `seedPosition` is at most an optional warm-start hint.
 */
export interface SceneNodeData {
  id: string;
  /** Node species/doc type — drives the silhouette glyph (gui-spec §3.1). */
  kind: string;
  /** Lifecycle state + progress — drives ring/fill treatment. */
  lifecycle?: { state: string; progress?: { done: number; total: number } };
  /** Per-tier degree counts — drives tier badges (contract §4). */
  degreeByTier?: Partial<
    Record<"declared" | "structural" | "temporal" | "semantic", number>
  >;
  /** Created/modified timestamps — drives the freshness halo. */
  dates?: { created?: string; modified?: string };
  /** Optional warm-start seed only; the renderer owns positions (RL-1). */
  seedPosition?: { x: number; y: number };
}

/**
 * Graph data for one edge — mirrors the contract §4 edge shape (RL-2).
 * The tier encoding is the product's headline; the scene interface must be
 * able to express it from day one.
 */
export interface SceneEdgeData {
  id: string;
  src: string;
  dst: string;
  relation: string;
  tier: "declared" | "structural" | "temporal" | "semantic";
  confidence: number;
  /** Structural tier only. */
  state?: "resolved" | "stale" | "broken";
}

/**
 * RL-3 placeholder: one delta shape shared by the live `graph` SSE channel
 * and `/graph/diff` (contract §5). `set-data` is the keyframe;
 * `apply-deltas` is everything else — scrubbing replays the held delta log.
 */
export interface SceneDelta {
  op: "add" | "remove" | "change";
  node?: SceneNodeData;
  edge?: SceneEdgeData;
  t: number;
  seq: number;
}

export type SceneCommand =
  | { kind: "set-data"; nodes: SceneNodeData[]; edges: SceneEdgeData[] }
  | { kind: "apply-deltas"; deltas: SceneDelta[]; seq: number }
  | { kind: "focus-node"; id: string }
  // RL-5a: filter SEMANTICS live engine/view-side; the scene receives only
  // the computed visibility membership and animates the diff (§3.5 fade).
  | {
      kind: "set-visibility";
      visibleNodeIds: ReadonlySet<string>;
      visibleEdgeIds: ReadonlySet<string>;
    }
  | { kind: "set-time"; at: number | "live" }
  // Pins are layout-fixed and always-labelled (G5.d); the view store owns
  // pin persistence and tells the scene which nodes are fixed.
  | { kind: "set-pinned"; ids: ReadonlySet<string> };

// RL-5c folded at lock time (W01.P01.S04): `expand` (keyboard E / context
// menu, distinct from open) and `pin` are part of the locked union — a
// locked seam cannot carry an "open by design" event set.
export type SceneEvent =
  | { kind: "hover"; id: string | null }
  | { kind: "select"; id: string | null }
  | { kind: "open"; id: string }
  | { kind: "expand"; id: string }
  | { kind: "pin"; id: string; pinned: boolean };

type SceneEventListener = (event: SceneEvent) => void;

/** Screen-space anchor for a DOM island (RL-4). */
export interface SceneAnchor {
  x: number;
  y: number;
  scale: number;
}

type SceneAnchorListener = (anchor: SceneAnchor | null) => void;

/**
 * The renderer-owned scene store, kept renderer-agnostic: the PixiJS v8
 * field (gui-spec §6.1; spike gate closed and verdict confirmed,
 * W01.P01.S03) plugs in behind this surface, and the sigma.js fallback
 * (layers system) must be able to implement the same surface — this
 * interface is what makes the swap cheap.
 */
export class SceneController {
  private listeners = new Set<SceneEventListener>();
  private trackedNodes = new Map<string, Set<SceneAnchorListener>>();
  private nodes: SceneNodeData[] = [];
  private edges: SceneEdgeData[] = [];

  // --- lifecycle (RL-5b) — implemented by the field renderer ---------------

  /** TODO(field): attach the renderer's canvas into the host element. */
  mount(_host: HTMLElement): void {
    // placeholder until the field component lands
  }

  /** TODO(field): propagate host resize to the renderer viewport. */
  resize(_width: number, _height: number): void {
    // placeholder until the field component lands
  }

  /** TODO(field): tear down renderer, workers, and subscriptions. */
  destroy(): void {
    this.listeners.clear();
    this.trackedNodes.clear();
  }

  // --- commands in ----------------------------------------------------------

  /** React (or the spike harness) sends commands; never per-frame state. */
  command(cmd: SceneCommand): void {
    switch (cmd.kind) {
      case "set-data":
        this.nodes = cmd.nodes;
        this.edges = cmd.edges;
        break;
      case "apply-deltas":
        // TODO(field): apply the ordered delta log (RL-3); set-time replays
        // held deltas to T using the same code path as liveness.
        break;
      case "focus-node":
      case "set-visibility":
      case "set-time":
      case "set-pinned":
        // Renderer concerns; wired when the field lands (W01.P03).
        break;
    }
  }

  // --- events out ------------------------------------------------------------

  /** Subscribe to interaction events (hover, select, open). */
  on(listener: SceneEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * RL-4: anchor subscription for DOM islands — fires on camera or position
   * change with the node's screen-space anchor ({x, y, scale}) or null when
   * the node leaves the stage. Subscription form keeps per-frame polling
   * out of React.
   */
  trackNode(id: string, listener: SceneAnchorListener): () => void {
    let set = this.trackedNodes.get(id);
    if (!set) {
      set = new Set();
      this.trackedNodes.set(id, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.trackedNodes.delete(id);
    };
  }

  /** Renderer-side dispatch — exposed for the spike and for tests. */
  emit(event: SceneEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /** Renderer-side anchor dispatch (RL-4) — exposed for tests. */
  emitAnchor(id: string, anchor: SceneAnchor | null): void {
    const set = this.trackedNodes.get(id);
    if (!set) return;
    for (const listener of set) {
      listener(anchor);
    }
  }

  get nodeCount(): number {
    return this.nodes.length;
  }

  get edgeCount(): number {
    return this.edges.length;
  }
}
