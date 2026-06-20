// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActionDescriptor } from "../../platform/actions/action";
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

function keyEvent(
  over: Partial<ChordEvent> & { key: string; target?: EventTarget | null },
): ChordEvent & { target: EventTarget | null; preventDefault: () => void } {
  return {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
    preventDefault: vi.fn(),
    ...over,
  };
}

const def = (
  over: Partial<KeybindingDef> & Pick<KeybindingDef, "id" | "defaultChord">,
): KeybindingDef => ({
  label: over.id,
  group: "Test",
  context: "global",
  ...over,
});

const runAction = (run: () => void): ActionDescriptor => ({ id: "x", label: "x", run });

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
    const fired = vi.fn();
    const action = runAction(fired);
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
    expect(fired).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("does nothing for an unbound chord", () => {
    const event = keyEvent({ key: "j", ctrlKey: true });
    const consumed = handleKeymapEvent(
      event,
      deps({ getDefs: () => [def({ id: "palette", defaultChord: "Mod+K" })] }),
    );
    expect(consumed).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
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

  it("applies the time-travel gate to a mutating action", () => {
    const mutating: ActionDescriptor = {
      id: "m",
      label: "m",
      dispatch: { type: "noop" },
      disabledInTimeTravel: true,
    };
    const base = {
      getDefs: () => [def({ id: "m", defaultChord: "Mod+M" })],
      resolveAction: () => mutating,
      fire: vi.fn(),
    };
    const event = keyEvent({ key: "m", ctrlKey: true });
    expect(handleKeymapEvent(event, deps({ ...base, isTimeTravel: () => true }))).toBe(
      false,
    );
    expect(handleKeymapEvent(event, deps({ ...base, isTimeTravel: () => false }))).toBe(
      true,
    );
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
    const fire = vi.fn();
    const event = keyEvent({ key: "k", ctrlKey: true });

    const consumed = handleKeymapEvent(
      event,
      deps({
        getDefs: () => [def({ id: "palette", defaultChord: "Mod+K" })],
        resolveAction: () => ({
          id: " palette ",
          label: " Palette ",
          dispatch: { type: " ui:palette " },
          rogue: "local payload",
        }),
        fire,
      }),
    );

    expect(consumed).toBe(true);
    expect(fire).toHaveBeenCalledWith({
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
      label: " Palette ",
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
