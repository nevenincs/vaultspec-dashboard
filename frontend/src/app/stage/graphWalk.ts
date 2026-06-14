// Keyboard graph-walk (W02.P09.S25, node-canvas ADR "Keyboard operability").
//
// The ADR makes the canvas keyboard-operable: a focused node can be moved across
// the graph by WALKING ITS EDGES (arrow/Tab over the ego set), and select / open
// / expand carry keyboard equivalents. Every keyboard-initiated selection is
// INSTANT — it is shared-store state, never an animated transition (the base
// motion law: keyboard actions do not animate, and `prefers-reduced-motion` is
// moot here because nothing is tweened on this path).
//
// Layer ownership: this hook reads the held slice the stores own (a projection
// over the one LinkageGraph) and the shared selection, and emits intent back
// through the existing view-store actions (select / openNode / addToWorkingSet)
// and the seam-bound selection. It NEVER fetches and NEVER reads the raw `tiers`
// block (dashboard-layer-ownership, views-are-projections-of-one-model).

import { useEffect } from "react";

import type { SceneEdgeData, SceneNodeData } from "../../scene/sceneController";

/** The minimal graph shape the walk needs — nodes + the edge adjacency. */
export interface WalkGraph {
  nodes: readonly Pick<SceneNodeData, "id">[];
  edges: readonly Pick<SceneEdgeData, "src" | "dst">[];
}

/**
 * The ordered ego set of `id`: its 1-hop neighbors, deduplicated, in stable id
 * order. This is the cohort the focused node walks across — "move the focus by
 * walking its edges". Self-loops and dangling endpoints are dropped. Returns []
 * when the node has no neighbors in the held slice.
 */
export function egoNeighbors(graph: WalkGraph, id: string): string[] {
  const present = new Set(graph.nodes.map((n) => n.id));
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.src === id && edge.dst !== id && present.has(edge.dst)) seen.add(edge.dst);
    if (edge.dst === id && edge.src !== id && present.has(edge.src)) seen.add(edge.src);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/**
 * The next focus when walking the ego set in `direction`. With no current
 * selection (or a selection absent from the slice), the first node in id order
 * seeds the walk so the keyboard can enter an unfocused field. Walking from a
 * node with neighbors steps through its ego set, wrapping at the ends so Tab
 * cycles. A node with no neighbors holds focus (nowhere to walk).
 */
export function nextFocus(
  graph: WalkGraph,
  current: string | null,
  direction: "forward" | "backward",
): string | null {
  const ids = graph.nodes.map((n) => n.id);
  if (ids.length === 0) return null;
  if (current === null || !ids.includes(current)) {
    return [...ids].sort((a, b) => a.localeCompare(b))[0] ?? null;
  }
  const ego = egoNeighbors(graph, current);
  if (ego.length === 0) return current;
  // Where in the ego ring are we? A fresh walk starts at index -1 so forward
  // lands on the first neighbor and backward on the last.
  const here = ego.indexOf(current);
  const len = ego.length;
  const step = direction === "forward" ? 1 : -1;
  const start = here === -1 ? (direction === "forward" ? -1 : 0) : here;
  return ego[(start + step + len) % len] ?? current;
}

/**
 * The keyboard verbs the canvas understands — derived from a KeyboardEvent.
 * A `walk` carries `via` so the binding can keep Tab a non-trapping escape key
 * (no-keyboard-trap) while still letting Tab step the ego ring once focused.
 */
export type WalkAction =
  | { kind: "walk"; direction: "forward" | "backward"; via: "arrow" | "tab" }
  | { kind: "open" }
  | { kind: "expand" }
  | { kind: "clear" };

/**
 * Map a key to a canvas verb, or null when the canvas does not handle it.
 * Pure so the binding table is unit-testable. ArrowRight/Down + Tab walk
 * forward; ArrowLeft/Up + Shift+Tab walk backward; Enter opens in place; "e"
 * expands the ego onto the working set; Escape clears the selection.
 */
export function actionForKey(e: { key: string; shiftKey: boolean }): WalkAction | null {
  switch (e.key) {
    case "ArrowRight":
    case "ArrowDown":
      return { kind: "walk", direction: "forward", via: "arrow" };
    case "ArrowLeft":
    case "ArrowUp":
      return { kind: "walk", direction: "backward", via: "arrow" };
    case "Tab":
      return {
        kind: "walk",
        direction: e.shiftKey ? "backward" : "forward",
        via: "tab",
      };
    case "Enter":
      return { kind: "open" };
    case "e":
    case "E":
      return { kind: "expand" };
    case "Escape":
      return { kind: "clear" };
    default:
      return null;
  }
}

export interface GraphWalkHandlers {
  /** Read the current shared selection's node id (null when none/non-node). */
  selectedId: () => string | null;
  /** Select a node — INSTANT shared-store state, never an animation. */
  select: (id: string | null) => void;
  /** Open a node in place (the DOM island interior). */
  open: (id: string) => void;
  /** Expand a node's ego onto the explicit working set. */
  expand: (id: string) => void;
}

/**
 * Bind keyboard graph-walk to a host element. Returns a teardown. Kept as a
 * plain function (not a hook) so it is exercised in tests against a synthetic
 * host and a static graph, with no React or DOM-renderer dependency.
 */
export function bindGraphWalk(
  host: HTMLElement,
  graph: () => WalkGraph,
  handlers: GraphWalkHandlers,
): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const action = actionForKey(e);
    if (!action) return;
    // Only handle when the canvas host (not a focused input/island) owns focus,
    // so typing in a filter field or island never hijacks a graph-walk key.
    const active = document.activeElement;
    if (active && active !== host && host.contains(active)) {
      const tag = active.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      if ((active as HTMLElement).isContentEditable) return;
    }
    const current = handlers.selectedId();
    const seeding = current === null;
    switch (action.kind) {
      case "walk": {
        // No-keyboard-trap (WCAG 2.1.2): Tab must always be able to leave the
        // canvas widget. We only swallow Tab when a walk genuinely advances
        // WITHIN the ego ring (a selection is present and steps to a neighbor);
        // when there is no selection to walk from, Tab is left to bubble so
        // focus escapes to the next control. Arrow keys seed/walk freely (they
        // are not focus-traversal keys), so the field stays arrow-navigable.
        if (action.via === "tab" && seeding) return;
        const next = nextFocus(graph(), current, action.direction);
        if (next !== null && next !== current) {
          e.preventDefault();
          handlers.select(next);
        } else if (next !== null && action.via !== "tab") {
          // Arrow re-seeding onto the same node still consumes the key.
          e.preventDefault();
          handlers.select(next);
        }
        return;
      }
      case "open":
        if (current) {
          e.preventDefault();
          handlers.open(current);
        }
        return;
      case "expand":
        if (current) {
          e.preventDefault();
          handlers.expand(current);
        }
        return;
      case "clear":
        e.preventDefault();
        handlers.select(null);
        return;
    }
  };
  host.addEventListener("keydown", onKeyDown);
  return () => host.removeEventListener("keydown", onKeyDown);
}

/**
 * React face of the graph-walk binding. Mounted by Stage against the canvas
 * host ref. `graphRef` is read lazily on each keypress so the walk always sees
 * the latest held slice without re-binding the listener every render.
 */
export function useGraphWalkKeyboard(
  host: HTMLElement | null,
  graph: () => WalkGraph,
  handlers: GraphWalkHandlers,
): void {
  // `graph` and `handlers` are stable refs (closures over store getters), so the
  // binding is intentionally keyed on `host` alone — the listener is not torn
  // down each render, and the closures read live state at call time.
  useEffect(() => {
    if (!host) return;
    return bindGraphWalk(host, graph, handlers);
  }, [host, graph, handlers]);
}
