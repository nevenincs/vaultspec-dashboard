import { afterEach, describe, expect, it } from "vitest";

import { type ChordEvent } from "../../platform/keymap/chord";
import {
  type KeybindingDef,
  resetKeybindings,
  resolveKeybinding,
} from "../../platform/keymap/registry";
import type { GraphWalkHandlers, WalkGraph } from "./graphWalk";
import {
  CANVAS_KEYMAP_CONTEXT,
  GRAPH_CLEAR_ACTION_ID,
  GRAPH_EXPAND_ACTION_ID,
  GRAPH_OPEN_ACTION_ID,
  GRAPH_WALK_BACKWARD_LEFT_ACTION_ID,
  GRAPH_WALK_BACKWARD_UP_ACTION_ID,
  GRAPH_WALK_FORWARD_DOWN_ACTION_ID,
  GRAPH_WALK_FORWARD_RIGHT_ACTION_ID,
  GRAPH_WALK_KEYBINDING_DEFS,
} from "./graphWalkKeybindings";

afterEach(() => resetKeybindings());

function ev(over: Partial<ChordEvent> & { key: string }): ChordEvent {
  return { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over };
}

const GRAPH: WalkGraph = {
  nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
  edges: [
    { src: "a", dst: "b" },
    { src: "a", dst: "c" },
  ],
};

describe("the canvas graph-walk keybinding catalog", () => {
  it("declares every walk verb in the canvas context under the Graph group", () => {
    for (const binding of GRAPH_WALK_KEYBINDING_DEFS) {
      expect(binding.context).toBe(CANVAS_KEYMAP_CONTEXT);
      expect(binding.group).toBe("Graph");
    }
  });

  it("binds the two physical keys per direction to distinct ids (id is unique)", () => {
    const byChord = new Map<string, string[]>();
    for (const binding of GRAPH_WALK_KEYBINDING_DEFS) {
      const ids = byChord.get(binding.defaultChord) ?? [];
      ids.push(binding.id);
      byChord.set(binding.defaultChord, ids);
    }
    // ArrowRight and ArrowDown are SEPARATE bindings (distinct ids), both forward.
    expect(byChord.get("ArrowRight")).toEqual([GRAPH_WALK_FORWARD_RIGHT_ACTION_ID]);
    expect(byChord.get("ArrowDown")).toEqual([GRAPH_WALK_FORWARD_DOWN_ACTION_ID]);
    expect(byChord.get("ArrowLeft")).toEqual([GRAPH_WALK_BACKWARD_LEFT_ACTION_ID]);
    expect(byChord.get("ArrowUp")).toEqual([GRAPH_WALK_BACKWARD_UP_ACTION_ID]);

    const ids = GRAPH_WALK_KEYBINDING_DEFS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length); // every id is unique

    // The forward pair shares the same human label (one logical verb).
    const labels = new Map(GRAPH_WALK_KEYBINDING_DEFS.map((b) => [b.id, b.label]));
    expect(labels.get(GRAPH_WALK_FORWARD_RIGHT_ACTION_ID)).toBe(
      labels.get(GRAPH_WALK_FORWARD_DOWN_ACTION_ID),
    );
  });

  it("does NOT bind Tab — it is left to browser focus traversal (no keyboard trap)", () => {
    const chords = GRAPH_WALK_KEYBINDING_DEFS.map((b) => b.defaultChord);
    expect(chords).not.toContain("Tab");
    expect(chords).toContain("Escape");
  });

  it("enrolls open/expand/clear as canvas bindings", () => {
    const ids = GRAPH_WALK_KEYBINDING_DEFS.map((b) => b.id);
    expect(ids).toContain(GRAPH_OPEN_ACTION_ID);
    expect(ids).toContain(GRAPH_EXPAND_ACTION_ID);
    expect(ids).toContain(GRAPH_CLEAR_ACTION_ID);
  });
});

// The core of the fix: when the canvas is focused, a colliding global ArrowLeft
// (neighbour-cycle) and a canvas ArrowLeft (walk-backward) both match — the
// dispatcher must resolve to the CANVAS one (most-specific context wins), so the
// canvas walk fires and the global binding does NOT double-fire. Off-canvas (only
// the global context active), the SAME key resolves to the global binding.
describe("double-fire resolution: canvas context overrides the colliding global", () => {
  // A global ArrowLeft binding (the keyboardNavigation neighbour-cycle) and the
  // canvas ArrowLeft walk binding, sharing the chord.
  const globalArrowLeft: KeybindingDef = {
    id: "nav:neighbor-previous",
    defaultChord: "ArrowLeft",
    label: "Select previous connected document",
    group: "Navigation",
    context: "global",
  };
  const canvasArrowLeft = GRAPH_WALK_KEYBINDING_DEFS.find(
    (b) => b.id === GRAPH_WALK_BACKWARD_LEFT_ACTION_ID,
  )!;
  const defs = [globalArrowLeft, canvasArrowLeft];

  it("resolves ArrowLeft to the CANVAS binding when the canvas is focused", () => {
    const hit = resolveKeybinding(
      defs,
      {},
      new Set(["global", "canvas"]),
      ev({ key: "ArrowLeft" }),
      false,
    );
    expect(hit?.id).toBe(GRAPH_WALK_BACKWARD_LEFT_ACTION_ID);
  });

  it("resolves ArrowLeft to the GLOBAL binding off-canvas (no canvas context)", () => {
    const hit = resolveKeybinding(
      defs,
      {},
      new Set(["global"]),
      ev({ key: "ArrowLeft" }),
      false,
    );
    expect(hit?.id).toBe("nav:neighbor-previous");
  });
});

// The resolver thunk path: a registered action id resolves to a live descriptor
// whose `run` performs the right walk effect, and returns null when there is
// nothing to do so the dispatcher no-ops.
describe("the live action descriptors run the walk effect", () => {
  function harness(initial: string | null) {
    let selected = initial;
    const selectedCalls: (string | null)[] = [];
    const opened: string[] = [];
    const expanded: string[] = [];
    const calls = {
      select: (id: string | null) => {
        selected = id;
        selectedCalls.push(id);
      },
      open: (id: string) => opened.push(id),
      expand: (id: string) => expanded.push(id),
    };
    const handlers: GraphWalkHandlers = {
      selectedId: () => selected,
      select: calls.select,
      open: calls.open,
      expand: calls.expand,
    };
    return { handlers, selectedCalls, opened, expanded };
  }

  // Re-derive descriptors directly (no React) via the exported binding-to-action
  // mapping the hook uses, by re-importing the internal derive function.
  it("ArrowLeft walk-backward descriptor steps the ego ring backward", async () => {
    const { deriveGraphWalkActionDescriptor } = await import("./graphWalkKeybindings");
    const { handlers, selectedCalls } = harness("b");
    const binding = {
      def: GRAPH_WALK_KEYBINDING_DEFS.find(
        (b) => b.id === GRAPH_WALK_BACKWARD_LEFT_ACTION_ID,
      )!,
      key: "ArrowLeft",
    };
    const descriptor = deriveGraphWalkActionDescriptor(binding, () => GRAPH, handlers);
    expect(descriptor).not.toBeNull();
    const run = descriptor?.run;
    expect(typeof run).toBe("function");
    run?.();
    // b's ego is {a}; backward from b → a.
    expect(selectedCalls).toEqual(["a"]);
  });

  it("the open descriptor opens the focused node, and is inert with no selection", async () => {
    const { deriveGraphWalkActionDescriptor } = await import("./graphWalkKeybindings");
    const focused = harness("a");
    const openBinding = {
      def: GRAPH_WALK_KEYBINDING_DEFS.find((b) => b.id === GRAPH_OPEN_ACTION_ID)!,
      key: "Enter",
    };
    const focusedDescriptor = deriveGraphWalkActionDescriptor(
      openBinding,
      () => GRAPH,
      focused.handlers,
    );
    const focusedRun = focusedDescriptor?.run;
    expect(typeof focusedRun).toBe("function");
    focusedRun?.();
    expect(focused.opened).toEqual(["a"]);

    const empty = harness(null);
    const emptyDescriptor = deriveGraphWalkActionDescriptor(
      openBinding,
      () => GRAPH,
      empty.handlers,
    );
    const emptyRun = emptyDescriptor?.run;
    expect(typeof emptyRun).toBe("function");
    emptyRun?.();
    expect(empty.opened).toEqual([]);
  });
});
