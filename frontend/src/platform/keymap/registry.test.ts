import { afterEach, describe, expect, it } from "vitest";

import { type ChordEvent } from "./chord";
import {
  type KeybindingDef,
  conflictsForCandidate,
  contextsOverlap,
  effectiveChord,
  findConflicts,
  listKeybindings,
  registerKeybindings,
  resetKeybindings,
  resolveKeybinding,
} from "./registry";

function ev(over: Partial<ChordEvent> & { key: string }): ChordEvent {
  return { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over };
}

const def = (
  over: Partial<KeybindingDef> & Pick<KeybindingDef, "id" | "defaultChord">,
): KeybindingDef => ({
  label: over.id,
  group: "Test",
  context: "global",
  ...over,
});

afterEach(() => resetKeybindings());

describe("registerKeybindings", () => {
  it("registers and lists bindings in id order, and the disposer removes them", () => {
    const dispose = registerKeybindings([
      def({ id: "b", defaultChord: "Mod+B" }),
      def({ id: "a", defaultChord: "Mod+A" }),
    ]);
    expect(listKeybindings().map((d) => d.id)).toEqual(["a", "b"]);
    dispose();
    expect(listKeybindings()).toEqual([]);
  });

  it("throws on a malformed default chord", () => {
    expect(() =>
      registerKeybindings([def({ id: "x", defaultChord: "Mod+" })]),
    ).toThrow();
  });
});

describe("effectiveChord", () => {
  it("prefers a well-formed override over the default", () => {
    const d = def({ id: "a", defaultChord: "Mod+A" });
    expect(effectiveChord(d, {})).toBe("Mod+A");
    expect(effectiveChord(d, { a: "Mod+Z" })).toBe("Mod+Z");
  });

  it("ignores a corrupt override and falls back to the default", () => {
    const d = def({ id: "a", defaultChord: "Mod+A" });
    expect(effectiveChord(d, { a: "garbage++nonsense+" })).toBe("Mod+A");
  });
});

describe("resolveKeybinding", () => {
  const defs = [
    def({ id: "palette", defaultChord: "Mod+K", context: "global" }),
    def({ id: "graph.open", defaultChord: "Enter", context: "canvas" }),
    def({ id: "timeline.live", defaultChord: "Home", context: "timeline" }),
  ];

  it("matches a global binding from any active context", () => {
    const hit = resolveKeybinding(
      defs,
      {},
      new Set(["global"]),
      ev({ key: "k", ctrlKey: true }),
      false,
    );
    expect(hit?.id).toBe("palette");
  });

  it("only matches a surface binding when its context is active", () => {
    const inactive = resolveKeybinding(
      defs,
      {},
      new Set(["global"]),
      ev({ key: "Enter" }),
      false,
    );
    expect(inactive).toBeNull();
    const active = resolveKeybinding(
      defs,
      {},
      new Set(["global", "canvas"]),
      ev({ key: "Enter" }),
      false,
    );
    expect(active?.id).toBe("graph.open");
  });

  it("prefers the surface binding over a colliding global one", () => {
    const collide = [
      def({ id: "global.x", defaultChord: "Mod+E", context: "global" }),
      def({ id: "canvas.x", defaultChord: "Mod+E", context: "canvas" }),
    ];
    const hit = resolveKeybinding(
      collide,
      {},
      new Set(["global", "canvas"]),
      ev({ key: "e", ctrlKey: true }),
      false,
    );
    expect(hit?.id).toBe("canvas.x");
  });

  it("honors a user override when resolving", () => {
    const hit = resolveKeybinding(
      defs,
      { palette: "Mod+P" },
      new Set(["global"]),
      ev({ key: "p", ctrlKey: true }),
      false,
    );
    expect(hit?.id).toBe("palette");
    const old = resolveKeybinding(
      defs,
      { palette: "Mod+P" },
      new Set(["global"]),
      ev({ key: "k", ctrlKey: true }),
      false,
    );
    expect(old).toBeNull();
  });
});

describe("contextsOverlap", () => {
  it("global overlaps everything; distinct surfaces do not", () => {
    expect(contextsOverlap("global", "canvas")).toBe(true);
    expect(contextsOverlap("canvas", "canvas")).toBe(true);
    expect(contextsOverlap("canvas", "timeline")).toBe(false);
  });
});

describe("findConflicts / conflictsForCandidate", () => {
  it("reports two actions sharing a chord in overlapping contexts", () => {
    const defs = [
      def({ id: "a", defaultChord: "Mod+K", context: "global" }),
      def({ id: "b", defaultChord: "Mod+K", context: "canvas" }),
    ];
    expect(findConflicts(defs)).toEqual([{ chord: "Mod+K", ids: ["a", "b"] }]);
  });

  it("does not report a shared chord across non-overlapping surfaces", () => {
    const defs = [
      def({ id: "a", defaultChord: "Enter", context: "canvas" }),
      def({ id: "b", defaultChord: "Enter", context: "timeline" }),
    ];
    expect(findConflicts(defs)).toEqual([]);
  });

  it("checks a candidate chord against existing bindings, excluding the target", () => {
    const defs = [
      def({ id: "a", defaultChord: "Mod+A", context: "global" }),
      def({ id: "b", defaultChord: "Mod+B", context: "global" }),
    ];
    expect(conflictsForCandidate(defs, {}, "a", "Mod+B")).toEqual(["b"]);
    expect(conflictsForCandidate(defs, {}, "a", "Mod+Z")).toEqual([]);
    expect(conflictsForCandidate(defs, {}, "a", "Mod+A")).toEqual([]); // self excluded
  });
});
