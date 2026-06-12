// Scene state lives OUTSIDE React (gui-spec §5.2, non-negotiable boundary):
// the renderer owns positions, LOD, and per-frame animation. React never
// renders the field's nodes; it sends commands and subscribes to events.
// This module is framework-free by design — no React imports, ever.

export interface SceneNode {
  id: string;
  x: number;
  y: number;
}

export type SceneCommand =
  | { kind: "set-data"; nodes: SceneNode[]; edges: [string, string][] }
  | { kind: "focus-node"; id: string }
  | { kind: "set-filter"; filterKey: string }
  | { kind: "set-time"; at: number | "live" };

export type SceneEvent =
  | { kind: "hover"; id: string | null }
  | { kind: "select"; id: string | null }
  | { kind: "open"; id: string };

type SceneEventListener = (event: SceneEvent) => void;

/**
 * The renderer-owned scene store. The foundation scaffold keeps it
 * renderer-agnostic: the PixiJS field (chosen per gui-spec §6.1, gated by
 * the week-one spike) plugs in behind `mount`, and the sigma.js fallback
 * would implement the same surface — this interface is what makes the swap
 * cheap.
 */
export class SceneController {
  private listeners = new Set<SceneEventListener>();
  private nodes: SceneNode[] = [];
  private edges: [string, string][] = [];

  /** React (or the spike harness) sends commands; never per-frame state. */
  command(cmd: SceneCommand): void {
    if (cmd.kind === "set-data") {
      this.nodes = cmd.nodes;
      this.edges = cmd.edges;
    }
    // focus/filter/time are renderer concerns; wired when the field lands.
  }

  /** Subscribe to interaction events (hover, select, open). */
  on(listener: SceneEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Renderer-side dispatch — exposed for the spike and for tests. */
  emit(event: SceneEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  get nodeCount(): number {
    return this.nodes.length;
  }

  get edgeCount(): number {
    return this.edges.length;
  }
}
