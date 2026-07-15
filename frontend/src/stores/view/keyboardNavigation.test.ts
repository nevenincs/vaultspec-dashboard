import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import type { EngineNode } from "../server/engine";
import {
  KEYBOARD_NAVIGATION_BINDINGS,
  cycleKeyboardList,
  deriveKeyboardNavigationActionDescriptor,
  deriveKeyboardNavigationKeyIntent,
  deriveKeyboardNavigationView,
  keyboardNavigationKeyForAction,
} from "./keyboardNavigation";

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
      announcement: {
        key: "graph:accessibility.selectedItem",
        values: { item: "a" },
      },
    });
  });

  it("falls back to empty lists and no announcement without selection data", () => {
    expect(deriveKeyboardNavigationView(null, undefined, [])).toEqual({
      selectedId: null,
      neighborIds: [],
      featureIds: [],
      announcement: null,
    });
  });

  it("announces bounded display labels without exposing unsupported stable ids", () => {
    const code = deriveKeyboardNavigationView("code:src/app.ts", undefined, []);
    expect(code.announcement).toEqual({
      key: "graph:accessibility.selectedItem",
      values: { item: "src/app.ts" },
    });
    const unsupported = deriveKeyboardNavigationView(
      "commit:0123456789abcdef",
      undefined,
      [],
    );
    expect(unsupported.announcement).toEqual({
      key: "graph:accessibility.selectedItemGeneric",
    });

    for (const locale of [undefined, ltrTestLocale, rtlTestLocale] as const) {
      const runtime = createTestLocalizationRuntime(locale);
      const codeMessage = resolveMessageResult(runtime, code.announcement);
      const genericMessage = resolveMessageResult(runtime, unsupported.announcement);
      expect(codeMessage.usedFallback).toBe(false);
      expect(codeMessage.message).toContain("src/app.ts");
      expect(codeMessage.message).not.toContain("code:");
      expect(genericMessage.usedFallback).toBe(false);
      expect(genericMessage.message).not.toContain("0123456789abcdef");
    }
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

describe("deriveKeyboardNavigationKeyIntent", () => {
  const navigation = {
    selectedId: "feature:runtime",
    neighborIds: ["doc:a", "doc:b"],
    featureIds: ["feature:design", "feature:runtime", "feature:search"],
    announcement: null,
  };

  it("projects arrow keys to canonical node-selection intents", () => {
    expect(deriveKeyboardNavigationKeyIntent("ArrowRight", navigation)).toEqual({
      kind: "select-node",
      id: "doc:a",
    });
    expect(deriveKeyboardNavigationKeyIntent("ArrowDown", navigation)).toEqual({
      kind: "select-node",
      id: "feature:search",
    });
  });

  it("ignores unrelated keys and empty selection cycles", () => {
    // The retired bracket (playhead) chords are no longer navigation intents
    // (TTR-006): they fall through like any other unhandled key.
    expect(deriveKeyboardNavigationKeyIntent("[", navigation)).toBeNull();
    expect(deriveKeyboardNavigationKeyIntent("Escape", navigation)).toBeNull();
    expect(
      deriveKeyboardNavigationKeyIntent("ArrowRight", {
        ...navigation,
        neighborIds: [],
      }),
    ).toBeNull();
  });
});

describe("keyboard navigation keybinding catalog", () => {
  it("declares every arrow-walk action as a bindable command (no playhead chords)", () => {
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
    ]);
    expect(KEYBOARD_NAVIGATION_BINDINGS.map(({ label }) => label)).toEqual([
      { key: "graph:actions.moveToPreviousConnectedItem" },
      { key: "graph:actions.moveToNextConnectedItem" },
      { key: "features:actions.moveToPreviousFeature" },
      { key: "features:actions.moveToNextFeature" },
    ]);
    expect(
      KEYBOARD_NAVIGATION_BINDINGS.every(
        ({ group }) => group === KEYBOARD_NAVIGATION_BINDINGS[0]?.group,
      ),
    ).toBe(true);
    expect(KEYBOARD_NAVIGATION_BINDINGS[0]?.group).toEqual({
      key: "common:shortcutGroups.navigation",
    });
  });

  it("resolves every binding through genuine English, French, and Arabic resources", () => {
    const runtimes = [
      createTestLocalizationRuntime(),
      createTestLocalizationRuntime(ltrTestLocale),
      createTestLocalizationRuntime(rtlTestLocale),
    ] as const;
    for (const binding of KEYBOARD_NAVIGATION_BINDINGS) {
      const messages = runtimes.map(
        (runtime) => resolveMessageResult(runtime, binding.label).message,
      );
      expect(new Set(messages).size).toBe(3);
      expect(
        runtimes.every(
          (runtime) => !resolveMessageResult(runtime, binding.label).usedFallback,
        ),
      ).toBe(true);
    }
  });

  it("maps registered action ids back to the canonical key-intent input", () => {
    expect(keyboardNavigationKeyForAction("nav:neighbor-next")).toBe("ArrowRight");
    expect(keyboardNavigationKeyForAction("timeline:playhead-previous")).toBeNull();
    expect(keyboardNavigationKeyForAction("missing")).toBeNull();
  });
});

describe("deriveKeyboardNavigationActionDescriptor", () => {
  it("builds a select-node run that routes the cycled id through the selection intent", () => {
    const binding = KEYBOARD_NAVIGATION_BINDINGS.find(
      (candidate) => candidate.id === "nav:neighbor-next",
    );
    if (!binding) throw new Error("missing neighbor-next keybinding");
    const selected: string[] = [];
    const action = deriveKeyboardNavigationActionDescriptor(
      binding,
      {
        selectedId: null,
        neighborIds: ["doc:a", "doc:b"],
        featureIds: [],
        announcement: null,
      },
      async (id: string) => {
        selected.push(id);
      },
    );
    if (!action?.run) throw new Error("missing keyboard navigation action");
    expect(action.label).toBe(binding.label);

    action.run();

    expect(selected).toEqual(["doc:a"]);
  });

  it("returns null when the navigation cycle yields no target", () => {
    const binding = KEYBOARD_NAVIGATION_BINDINGS.find(
      (candidate) => candidate.id === "nav:neighbor-next",
    );
    if (!binding) throw new Error("missing neighbor-next keybinding");
    expect(
      deriveKeyboardNavigationActionDescriptor(
        binding,
        { selectedId: null, neighborIds: [], featureIds: [], announcement: null },
        async () => undefined,
      ),
    ).toBeNull();
  });
});
