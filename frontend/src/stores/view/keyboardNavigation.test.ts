import { describe, expect, it } from "vitest";

import type { EngineNode } from "../server/engine";
import {
  KEYBOARD_NAVIGATION_BINDINGS,
  cycleKeyboardList,
  deriveKeyboardNavigationActionDescriptor,
  deriveKeyboardNavigationKeyIntent,
  deriveKeyboardNavigationView,
  keyboardNavigationKeyForAction,
  keyboardBracketStep,
  steppedKeyboardPlayhead,
} from "./keyboardNavigation";
import { selectNode } from "./selection";
import { setTimelinePlayhead, timelineViewSnapshot } from "./timeline";

const node = (id: string): EngineNode => ({ id, kind: "doc" });

describe("deriveKeyboardNavigationView", () => {
  it("projects neighbors, feature ids, and announcement from stores data", () => {
    expect(
      deriveKeyboardNavigationView(
        "doc:a",
        [node("doc:b"), node("doc:a"), node("doc:c")],
        ["design", "runtime"],
      ),
    ).toEqual({
      selectedId: "doc:a",
      neighborIds: ["doc:b", "doc:c"],
      featureIds: ["feature:design", "feature:runtime"],
      announcement: "selected a",
    });
  });

  it("falls back to empty lists and no announcement without selection data", () => {
    expect(deriveKeyboardNavigationView(null, undefined, [])).toEqual({
      selectedId: null,
      neighborIds: [],
      featureIds: [],
      announcement: "",
    });
  });
});

describe("cycleKeyboardList (arrow-walk, G7.d)", () => {
  it("cycles forward and backward with wraparound", () => {
    expect(cycleKeyboardList(["a", "b", "c"], "a", 1)).toBe("b");
    expect(cycleKeyboardList(["a", "b", "c"], "c", 1)).toBe("a");
    expect(cycleKeyboardList(["a", "b", "c"], "a", -1)).toBe("c");
  });

  it("starts at the first entry without a current and handles empties", () => {
    expect(cycleKeyboardList(["a", "b"], null, 1)).toBe("a");
    expect(cycleKeyboardList(["a", "b"], "missing", 1)).toBe("a");
    expect(cycleKeyboardList([], null, 1)).toBeNull();
  });
});

describe("keyboard playhead stepping (G7.d)", () => {
  const range = { fromMs: 0, toMs: 100 * 60_000 };

  it("steps by 2% of the visible range with a one-minute floor", () => {
    expect(keyboardBracketStep(range.toMs - range.fromMs)).toBe(2 * 60_000);
    expect(keyboardBracketStep(1000)).toBe(60_000);
  });

  it("steps back from LIVE into time travel and clamps at the visible range", () => {
    const now = range.toMs;
    const back = steppedKeyboardPlayhead("live", -1, range, now);
    expect(back).toBe(now - 2 * 60_000);
    expect(steppedKeyboardPlayhead(range.fromMs + 1000, -1, range, now)).toBe(
      range.fromMs,
    );
  });

  it("steps forward to LIVE when reaching now", () => {
    const now = range.toMs;
    expect(steppedKeyboardPlayhead(now - 60_000, 1, range, now)).toBe("live");
    expect(steppedKeyboardPlayhead(now / 2, 1, range, now)).toBe(now / 2 + 2 * 60_000);
  });
});

describe("deriveKeyboardNavigationKeyIntent", () => {
  const navigation = {
    selectedId: "feature:runtime",
    neighborIds: ["doc:a", "doc:b"],
    featureIds: ["feature:design", "feature:runtime", "feature:search"],
    announcement: "selected runtime",
  };
  const range = { fromMs: 0, toMs: 100 * 60_000 };

  it("projects arrow keys to canonical node-selection intents", () => {
    expect(
      deriveKeyboardNavigationKeyIntent("ArrowRight", navigation, "live", range, 10),
    ).toEqual({ kind: "select-node", id: "doc:a" });
    expect(
      deriveKeyboardNavigationKeyIntent("ArrowDown", navigation, "live", range, 10),
    ).toEqual({ kind: "select-node", id: "feature:search" });
  });

  it("projects bracket keys to playhead movement intents", () => {
    expect(
      deriveKeyboardNavigationKeyIntent(
        "]",
        navigation,
        50 * 60_000,
        range,
        100_000_000,
      ),
    ).toEqual({ kind: "move-playhead", playhead: 52 * 60_000 });
  });

  it("ignores unrelated keys and empty selection cycles", () => {
    expect(
      deriveKeyboardNavigationKeyIntent("Escape", navigation, "live", range, 10),
    ).toBeNull();
    expect(
      deriveKeyboardNavigationKeyIntent(
        "ArrowRight",
        { ...navigation, neighborIds: [] },
        "live",
        range,
        10,
      ),
    ).toBeNull();
  });
});

describe("keyboard navigation keybinding catalog", () => {
  it("declares every arrow-walk and bracket-step action as a bindable command", () => {
    expect(
      KEYBOARD_NAVIGATION_BINDINGS.map((binding) => [
        binding.id,
        binding.defaultChord,
        binding.key,
        binding.context,
      ]),
    ).toEqual([
      ["nav:neighbor-previous", "ArrowLeft", "ArrowLeft", "global"],
      ["nav:neighbor-next", "ArrowRight", "ArrowRight", "global"],
      ["nav:feature-previous", "ArrowUp", "ArrowUp", "global"],
      ["nav:feature-next", "ArrowDown", "ArrowDown", "global"],
      ["timeline:playhead-previous", "[", "[", "global"],
      ["timeline:playhead-next", "]", "]", "global"],
    ]);
  });

  it("maps registered action ids back to the canonical key-intent input", () => {
    expect(keyboardNavigationKeyForAction("nav:neighbor-next")).toBe("ArrowRight");
    expect(keyboardNavigationKeyForAction("timeline:playhead-previous")).toBe("[");
    expect(keyboardNavigationKeyForAction("missing")).toBeNull();
  });
});

describe("deriveKeyboardNavigationActionDescriptor", () => {
  it("does not create local playhead state for malformed runtime scope", () => {
    setTimelinePlayhead("live");
    const binding = KEYBOARD_NAVIGATION_BINDINGS.find(
      (candidate) => candidate.id === "timeline:playhead-previous",
    );
    if (!binding) throw new Error("missing timeline playhead keybinding");

    const action = deriveKeyboardNavigationActionDescriptor(
      binding,
      {
        selectedId: null,
        neighborIds: [],
        featureIds: [],
        announcement: "",
      },
      { scope: "scope-a" },
      selectNode,
      100 * 60_000,
    );
    if (!action?.run) throw new Error("missing keyboard playhead action");

    action.run();

    expect(timelineViewSnapshot().playheadT).toBe("live");
  });
});
