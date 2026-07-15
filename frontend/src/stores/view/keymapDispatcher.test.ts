// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import {
  legacyActionPresentation,
  type ActionDescriptor,
} from "../../platform/actions/action";
import { type ChordEvent } from "../../platform/keymap/chord";
import { type KeybindingDef, resetKeybindings } from "../../platform/keymap/registry";
import {
  type KeymapDeps,
  activeContextsFromElement,
  handleKeymapEvent,
  isTextEntryTarget,
  normalizeActiveKeymapContexts,
  registerKeyAction,
  resetKeyActions,
  resolveKeyAction,
} from "./keymapDispatcher";

function keyEvent(over: Partial<ChordEvent> & { key: string }): KeyboardEvent {
  return new KeyboardEvent("keydown", { cancelable: true, ...over });
}

const def = (
  over: Partial<KeybindingDef> & Pick<KeybindingDef, "id" | "defaultChord">,
): KeybindingDef => ({
  label: { key: "common:actions.retry" },
  group: { key: "common:shortcutGroups.general" },
  context: "global",
  ...over,
});

const runAction = (run: () => void): ActionDescriptor => ({
  id: "x",
  label: legacyActionPresentation("x"),
  run,
});

function deps(over: Partial<KeymapDeps>): KeymapDeps {
  return {
    getDefs: () => [],
    getOverrides: () => ({}),
    getActiveContexts: () => new Set(["global"]),
    isTextEntry: () => false,
    isTimeTravel: () => false,
    resolveAction: () => null,
    fire: () => undefined,
    isMac: false,
    ...over,
  };
}

afterEach(() => {
  resetKeybindings();
  resetKeyActions();
});

describe("handleKeymapEvent", () => {
  it("resolves a bound chord, fires its action, and consumes the event", () => {
    let runCount = 0;
    const action = runAction(() => {
      runCount += 1;
    });
    const event = keyEvent({ key: "k", ctrlKey: true });
    const consumed = handleKeymapEvent(
      event,
      deps({
        getDefs: () => [def({ id: "palette", defaultChord: "Mod+K" })],
        resolveAction: (id) => (id === "palette" ? action : null),
        fire: (a) => a.run?.(),
      }),
    );
    expect(consumed).toBe(true);
    expect(runCount).toBe(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does nothing for an unbound chord", () => {
    const event = keyEvent({ key: "j", ctrlKey: true });
    const consumed = handleKeymapEvent(
      event,
      deps({ getDefs: () => [def({ id: "palette", defaultChord: "Mod+K" })] }),
    );
    expect(consumed).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it("blocks an unmodified chord while typing but allows a modified one", () => {
    const defs = [
      def({ id: "help", defaultChord: "?", context: "global" }),
      def({ id: "palette", defaultChord: "Mod+K", context: "global" }),
    ];
    const action = runAction(() => undefined);
    const base = {
      getDefs: () => defs,
      isTextEntry: () => true,
      resolveAction: () => action,
    };
    expect(handleKeymapEvent(keyEvent({ key: "?", shiftKey: true }), deps(base))).toBe(
      false,
    );
    expect(handleKeymapEvent(keyEvent({ key: "k", ctrlKey: true }), deps(base))).toBe(
      true,
    );
  });

  it("does not fire a bound bare-key chord while an IME composition is active", () => {
    let runCount = 0;
    const action = runAction(() => {
      runCount += 1;
    });
    const base = {
      getDefs: () => [def({ id: "expand", defaultChord: "e", context: "global" })],
      resolveAction: (id: unknown) => (id === "expand" ? action : null),
      fire: (a: ActionDescriptor) => a.run?.(),
    };

    // Sanity: the same bare-key chord fires when NOT composing.
    const plain = keyEvent({ key: "e" });
    expect(handleKeymapEvent(plain, deps(base))).toBe(true);
    expect(runCount).toBe(1);

    // isComposing true: the keystroke belongs to the input method — no action, not consumed.
    const composing = new KeyboardEvent("keydown", {
      key: "e",
      cancelable: true,
      isComposing: true,
    });
    expect(handleKeymapEvent(composing, deps(base))).toBe(false);
    expect(composing.defaultPrevented).toBe(false);
    expect(runCount).toBe(1);

    // Legacy keyCode === 229 fallback for engines that still emit it while composing.
    const legacy = new KeyboardEvent("keydown", {
      key: "e",
      cancelable: true,
      keyCode: 229,
    });
    expect(handleKeymapEvent(legacy, deps(base))).toBe(false);
    expect(legacy.defaultPrevented).toBe(false);
    expect(runCount).toBe(1);
  });

  it("applies the time-travel gate to a mutating action", () => {
    let fireCount = 0;
    const mutating: ActionDescriptor = {
      id: "m",
      label: legacyActionPresentation("m"),
      dispatch: { type: "noop" },
      disabledInTimeTravel: true,
    };
    const base = {
      getDefs: () => [def({ id: "m", defaultChord: "Mod+M" })],
      resolveAction: () => mutating,
      fire: () => {
        fireCount += 1;
      },
    };
    const event = keyEvent({ key: "m", ctrlKey: true });
    expect(handleKeymapEvent(event, deps({ ...base, isTimeTravel: () => true }))).toBe(
      false,
    );
    expect(handleKeymapEvent(event, deps({ ...base, isTimeTravel: () => false }))).toBe(
      true,
    );
    expect(fireCount).toBe(1);
  });

  it("normalizes injected active contexts before keybinding resolution", () => {
    const event = keyEvent({ key: "Enter" });

    expect(
      handleKeymapEvent(
        event,
        deps({
          getDefs: () => [
            def({ id: "graph.open", defaultChord: "Enter", context: "canvas" }),
          ],
          getActiveContexts: () => new Set([" canvas ", "bogus"]),
          resolveAction: () => runAction(() => undefined),
        }),
      ),
    ).toBe(true);
  });

  it("normalizes resolved key actions before gating and firing", () => {
    let firedAction: ActionDescriptor | null = null;
    const event = keyEvent({ key: "k", ctrlKey: true });

    const consumed = handleKeymapEvent(
      event,
      deps({
        getDefs: () => [def({ id: "palette", defaultChord: "Mod+K" })],
        resolveAction: () => ({
          id: " palette ",
          label: legacyActionPresentation(" Palette "),
          dispatch: { type: " ui:palette " },
          rogue: "local payload",
        }),
        fire: (action) => {
          firedAction = action;
        },
      }),
    );

    expect(consumed).toBe(true);
    expect(firedAction).toEqual({
      id: "palette",
      label: "Palette",
      dispatch: { type: "ui:palette" },
    });
  });

  it("ignores a binding whose action is not registered", () => {
    const consumed = handleKeymapEvent(
      keyEvent({ key: "k", ctrlKey: true }),
      deps({
        getDefs: () => [def({ id: "palette", defaultChord: "Mod+K" })],
        resolveAction: () => null,
      }),
    );
    expect(consumed).toBe(false);
  });
});

describe("registerKeyAction / resolveKeyAction", () => {
  it("registers and resolves a live descriptor, and disposes", () => {
    const action = runAction(() => undefined);
    const dispose = registerKeyAction(" palette ", () => action);
    expect(resolveKeyAction("palette")).toEqual(action);
    expect(resolveKeyAction(" palette ")).toEqual(action);
    dispose();
    expect(resolveKeyAction("palette")).toBeNull();
  });

  it("normalizes registered live descriptors at the key action seam", () => {
    const dispose = registerKeyAction(" palette ", () => ({
      id: " palette ",
      label: legacyActionPresentation(" Palette "),
      dispatch: { type: " ui:palette " },
      rogue: "local payload",
    }));

    expect(resolveKeyAction("palette")).toEqual({
      id: "palette",
      label: "Palette",
      dispatch: { type: "ui:palette" },
    });

    dispose();
  });

  it("ignores malformed action ids at the live resolver seam", () => {
    const action = runAction(() => undefined);
    const dispose = registerKeyAction("   ", () => action);

    expect(resolveKeyAction("")).toBeNull();
    expect(resolveKeyAction(null)).toBeNull();

    dispose();
  });

  it("ignores malformed live descriptor resolvers at the key action seam", () => {
    const dispose = registerKeyAction("palette", { id: "palette" });

    expect(resolveKeyAction("palette")).toBeNull();

    dispose();
  });
});

describe("activeContextsFromElement", () => {
  it("always includes global and adds the nearest declared surface context", () => {
    const region = document.createElement("div");
    region.setAttribute("data-keymap-context", " canvas ");
    const child = document.createElement("button");
    region.appendChild(child);
    document.body.appendChild(region);

    expect([...activeContextsFromElement(child)].sort()).toEqual(["canvas", "global"]);
    expect([...activeContextsFromElement(null)]).toEqual(["global"]);
    document.body.removeChild(region);
  });

  it("ignores an unknown context value", () => {
    const region = document.createElement("div");
    region.setAttribute("data-keymap-context", "bogus");
    expect([...activeContextsFromElement(region)]).toEqual(["global"]);
  });

  it("normalizes injected active context sets before resolving", () => {
    expect([...normalizeActiveKeymapContexts([" canvas ", "bogus"])].sort()).toEqual([
      "canvas",
      "global",
    ]);
  });
});

describe("isTextEntryTarget", () => {
  it("detects inputs, textareas, selects, and contenteditable", () => {
    expect(isTextEntryTarget(document.createElement("input"))).toBe(true);
    expect(isTextEntryTarget(document.createElement("textarea"))).toBe(true);
    expect(isTextEntryTarget(document.createElement("select"))).toBe(true);
    expect(isTextEntryTarget(document.createElement("div"))).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});
