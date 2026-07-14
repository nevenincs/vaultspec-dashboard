// Canvas graph-walk keybinding enrollment (keymap W03.P09).
//
// The graph canvas's keyboard walk used to self-bind its OWN host `keydown`
// listener (`bindGraphWalk`/`useGraphWalkKeyboard`). Meanwhile the global
// navigation bindings (`keyboardNavigation.ts`) already enrolled ArrowLeft/Right/
// Up/Down as `context: "global"` neighbour/feature cycling on the one global
// dispatcher — so with the canvas focused, an arrow DOUBLE-FIRED: the host
// listener AND the global dispatcher both ran (the host listener called only
// `preventDefault`, never `stopPropagation`, so the bubbling window dispatcher
// still fired).
//
// The fix is context-precedence convergence: register the walk verbs as
// `context: "canvas"` bindings. `resolveKeybinding` already does most-specific-
// context-wins, so when the canvas is focused a canvas binding overrides the
// colliding global one (ego-walk wins on canvas; neighbour/feature cycle still
// works everywhere else), and the host listener is gone — nothing fires twice.
//
// Two physical keys per logical action (ArrowRight + ArrowDown both walk
// forward) cannot share one `KeybindingDef` id (the id is the override-map key
// and must be unique), so each physical key gets its OWN id resolving to the
// SAME walk descriptor (the `-arrow-right` / `-arrow-down` suffixes).
//
// Layer ownership: this enrolls onto the platform keymap registry and the stores
// dispatcher and reuses the existing store intents through the injected handlers;
// it NEVER fetches and NEVER reads the raw `tiers` block (dashboard-layer-
// ownership, views-are-projections-of-one-model).

import { legacyActionPresentation } from "../../platform/actions/action";
import { useEffect } from "react";

import type { ActionDescriptor } from "../../platform/actions/action";
import {
  type KeybindingDef,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { registerKeyAction } from "../../stores/view/keymapDispatcher";
import {
  actionForKey,
  runGraphWalkAction,
  type GraphWalkHandlers,
  type WalkAction,
  type WalkGraph,
} from "./graphWalk";

/** The canvas surface context the stage host declares via `data-keymap-context`. */
export const CANVAS_KEYMAP_CONTEXT = "canvas";

export const GRAPH_WALK_FORWARD_RIGHT_ACTION_ID = "graph:walk-forward-arrow-right";
export const GRAPH_WALK_FORWARD_DOWN_ACTION_ID = "graph:walk-forward-arrow-down";
export const GRAPH_WALK_BACKWARD_LEFT_ACTION_ID = "graph:walk-backward-arrow-left";
export const GRAPH_WALK_BACKWARD_UP_ACTION_ID = "graph:walk-backward-arrow-up";
export const GRAPH_OPEN_ACTION_ID = "graph:open";
export const GRAPH_EXPAND_ACTION_ID = "graph:expand";
export const GRAPH_CLEAR_ACTION_ID = "graph:clear";

const GRAPH_GROUP = "Graph";

/**
 * The canvas-context bindings. Each entry pairs an action id with the physical
 * key that drives it; `actionForKey` maps that key to the same `WalkAction` the
 * resolver runs, so the legend chord and the runtime effect can never drift.
 *
 * Tab is intentionally absent: it is left to normal browser focus traversal so
 * the canvas can never trap the keyboard (WCAG 2.1.2, no-keyboard-trap). Arrows
 * are the walk mechanism.
 */
interface GraphWalkBinding {
  readonly def: KeybindingDef;
  /** The physical key, fed through `actionForKey` to the shared runner. */
  readonly key: string;
}

const GRAPH_WALK_BINDINGS: readonly GraphWalkBinding[] = [
  {
    def: {
      id: GRAPH_WALK_FORWARD_RIGHT_ACTION_ID,
      defaultChord: "ArrowRight",
      label: legacyActionPresentation("Walk to the next connected node"),
      group: GRAPH_GROUP,
      context: CANVAS_KEYMAP_CONTEXT,
    },
    key: "ArrowRight",
  },
  {
    def: {
      id: GRAPH_WALK_FORWARD_DOWN_ACTION_ID,
      defaultChord: "ArrowDown",
      label: legacyActionPresentation("Walk to the next connected node"),
      group: GRAPH_GROUP,
      context: CANVAS_KEYMAP_CONTEXT,
    },
    key: "ArrowDown",
  },
  {
    def: {
      id: GRAPH_WALK_BACKWARD_LEFT_ACTION_ID,
      defaultChord: "ArrowLeft",
      label: legacyActionPresentation("Walk to the previous connected node"),
      group: GRAPH_GROUP,
      context: CANVAS_KEYMAP_CONTEXT,
    },
    key: "ArrowLeft",
  },
  {
    def: {
      id: GRAPH_WALK_BACKWARD_UP_ACTION_ID,
      defaultChord: "ArrowUp",
      label: legacyActionPresentation("Walk to the previous connected node"),
      group: GRAPH_GROUP,
      context: CANVAS_KEYMAP_CONTEXT,
    },
    key: "ArrowUp",
  },
  {
    def: {
      id: GRAPH_OPEN_ACTION_ID,
      defaultChord: "Enter",
      label: legacyActionPresentation("Open the focused node"),
      group: GRAPH_GROUP,
      context: CANVAS_KEYMAP_CONTEXT,
    },
    key: "Enter",
  },
  {
    def: {
      id: GRAPH_EXPAND_ACTION_ID,
      defaultChord: "e",
      label: legacyActionPresentation("Expand the focused node onto the working set"),
      group: GRAPH_GROUP,
      context: CANVAS_KEYMAP_CONTEXT,
    },
    key: "e",
  },
  {
    def: {
      id: GRAPH_CLEAR_ACTION_ID,
      defaultChord: "Escape",
      label: legacyActionPresentation("Clear the canvas selection"),
      group: GRAPH_GROUP,
      context: CANVAS_KEYMAP_CONTEXT,
    },
    key: "Escape",
  },
];

/** The bindable defs the registry/legend enrol — exported for tests. */
export const GRAPH_WALK_KEYBINDING_DEFS: readonly KeybindingDef[] =
  GRAPH_WALK_BINDINGS.map((binding) => binding.def);

/**
 * The live descriptor for one walk binding: it runs the SAME per-action logic
 * the old host listener did, reading the live graph through the getter and
 * emitting intent through the handlers. Returns null when there is nothing to do
 * (e.g. open with no selection) so the dispatcher no-ops and the key falls
 * through.
 */
export function deriveGraphWalkActionDescriptor(
  binding: GraphWalkBinding,
  graph: () => WalkGraph,
  handlers: GraphWalkHandlers,
): ActionDescriptor | null {
  const action: WalkAction | null = actionForKey({ key: binding.key });
  if (action === null) return null;
  return {
    id: binding.def.id,
    label: legacyActionPresentation(binding.def.label),
    run: () => {
      runGraphWalkAction(action, graph(), handlers);
    },
  };
}

/**
 * Enrol the canvas graph-walk verbs on the central keymap registry and the
 * dispatcher's action-resolver registry, with disposers. `graph` and `handlers`
 * are stable refs (closures over store getters) so the effect mounts once and
 * the resolvers read live state at call time.
 */
export function useGraphWalkKeybindings(
  graph: () => WalkGraph,
  handlers: GraphWalkHandlers,
): void {
  useEffect(() => {
    const disposeBindings = registerKeybindings(GRAPH_WALK_KEYBINDING_DEFS);
    const disposeActions = GRAPH_WALK_BINDINGS.map((binding) =>
      registerKeyAction(binding.def.id, () =>
        deriveGraphWalkActionDescriptor(binding, graph, handlers),
      ),
    );
    return () => {
      for (const dispose of disposeActions) dispose();
      disposeBindings();
    };
  }, [graph, handlers]);
}
