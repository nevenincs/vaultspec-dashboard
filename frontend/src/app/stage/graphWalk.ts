// Keyboard graph-walk (W02.P09.S25, node-canvas ADR "Keyboard operability").
//
// The ADR makes the canvas keyboard-operable: a focused node can be moved across
// the graph by WALKING ITS EDGES (arrow over the ego set), and select / open /
// expand carry keyboard equivalents. Every keyboard-initiated selection is
// INSTANT — it is shared-store state, never an animated transition (the base
// motion law: keyboard actions do not animate, and `prefers-reduced-motion` is
// moot here because nothing is tweened on this path).
//
// These are the PURE walk helpers: the ego cohort, the next-focus step, and the
// per-action runner. The keys that drive them are enrolled on the one central
// keymap registry as `context: "canvas"` bindings (see `graphWalkKeybindings.ts`)
// so they resolve through the single global dispatcher and override the colliding
// global navigation bindings when the canvas is focused (most-specific context
// wins) — instead of a second host `keydown` listener that double-fired with the
// global dispatcher (keymap W03.P09).
//
// Layer ownership: these helpers read the held slice the stores own (a projection
// over the one LinkageGraph) and the shared selection, and emit intent back
// through the existing stores/view seams (selection / open-island / working-set).
// They NEVER fetch and NEVER read the raw `tiers` block (dashboard-layer-
// ownership, views-are-projections-of-one-model).

import type { SceneEdgeData, SceneNodeData } from "../../scene/sceneController";
import {
  compareStableIdentifiers,
  stableIdentifier,
} from "../../platform/localization/displayText";

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
  return [...seen].sort((a, b) =>
    compareStableIdentifiers(stableIdentifier(a), stableIdentifier(b)),
  );
}

/**
 * The next focus when walking the ego set in `direction`. With no current
 * selection (or a selection absent from the slice), the first node in id order
 * seeds the walk so the keyboard can enter an unfocused field. Walking from a
 * node with neighbors steps through its ego set, wrapping at the ends so the
 * walk cycles. A node with no neighbors holds focus (nowhere to walk).
 */
export function nextFocus(
  graph: WalkGraph,
  current: string | null,
  direction: "forward" | "backward",
): string | null {
  const ids = graph.nodes.map((n) => n.id);
  if (ids.length === 0) return null;
  if (current === null || !ids.includes(current)) {
    return (
      [...ids].sort((a, b) =>
        compareStableIdentifiers(stableIdentifier(a), stableIdentifier(b)),
      )[0] ?? null
    );
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
 * The keyboard verbs the canvas understands. Tab is intentionally NOT a walk
 * verb: it is left to normal browser focus traversal so the canvas can never
 * trap the keyboard (WCAG 2.1.2, no-keyboard-trap) — arrows are the walk
 * mechanism, Tab always escapes. (The old host-listener path treated Tab as a
 * conditional walk; that was dropped when the walk converged onto the central
 * keymap registry — keymap W03.P09.)
 */
export type WalkAction =
  | { kind: "walk"; direction: "forward" | "backward" }
  | { kind: "open" }
  | { kind: "expand" }
  | { kind: "clear" };

/**
 * Map a key to a canvas verb, or null when the canvas does not handle it.
 * Pure so the binding table is unit-testable. ArrowRight/Down walk forward;
 * ArrowLeft/Up walk backward; Enter opens in place; "e" expands the ego onto
 * the working set; Escape clears the selection. Tab is absent on purpose (no
 * keyboard trap — see `WalkAction`).
 */
export function actionForKey(e: {
  key: string;
  shiftKey?: boolean;
}): WalkAction | null {
  switch (e.key) {
    case "ArrowRight":
    case "ArrowDown":
      return { kind: "walk", direction: "forward" };
    case "ArrowLeft":
    case "ArrowUp":
      return { kind: "walk", direction: "backward" };
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
  select: (id: unknown) => void;
  /** Open a node in place (the DOM island interior). */
  open: (id: unknown) => void;
  /** Expand a node's ego onto the explicit working set. */
  expand: (id: unknown) => void;
}

/**
 * Run one canvas walk verb against the live graph and the shared selection,
 * returning true when it did something (the dispatcher consumes the key) and
 * false when there was nothing to do (the dispatcher no-ops so the key falls
 * through). Pure of the DOM and of React: the central dispatcher already owns
 * the listener, focus/context resolution, and the text-entry gate, so this is
 * just the per-action effect the old `bindGraphWalk` switch performed.
 */
export function runGraphWalkAction(
  action: WalkAction,
  graph: WalkGraph,
  handlers: GraphWalkHandlers,
): boolean {
  const current = handlers.selectedId();
  switch (action.kind) {
    case "walk": {
      const next = nextFocus(graph, current, action.direction);
      if (next === null) return false;
      // Arrow re-seeding onto the same node still consumes the key (the field
      // becomes focused); a true step also consumes it.
      handlers.select(next);
      return true;
    }
    case "open":
      if (current === null) return false;
      handlers.open(current);
      return true;
    case "expand":
      if (current === null) return false;
      handlers.expand(current);
      return true;
    case "clear":
      handlers.select(null);
      return true;
  }
}
