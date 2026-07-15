import { afterEach, describe, expect, it } from "vitest";

import { type ChordEvent } from "./chord";
import {
  type KeybindingDef,
  MAX_KEYBINDING_ID_LEN,
  conflictsForCandidate,
  contextsOverlap,
  effectiveChord,
  findConflicts,
  listKeybindings,
  normalizeKeybindingGroupPresentation,
  normalizeKeybindingId,
  normalizeKeybindingOverrides,
  normalizeKeybindingPresentation,
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
  label: { key: "common:actions.retry" },
  group: { key: "common:shortcutGroups.general" },
  context: "global",
  ...over,
});

afterEach(() => resetKeybindings());

describe("registerKeybindings", () => {
  it("normalizes binding ids at registration and lookup", () => {
    const dispose = registerKeybindings([
      def({
        id: " palette ",
        defaultChord: " Mod+K ",
        label: { key: "common:actions.openCommandPalette" },
        group: { key: "common:shortcutGroups.general" },
        context: " global " as KeybindingDef["context"],
      }),
    ]);

    expect(normalizeKeybindingId(" palette ")).toBe("palette");
    expect(normalizeKeybindingId("   ")).toBeNull();
    expect(normalizeKeybindingId("x".repeat(MAX_KEYBINDING_ID_LEN + 1))).toBeNull();
    expect(listKeybindings()).toEqual([
      {
        id: "palette",
        defaultChord: "Mod+K",
        label: { key: "common:actions.openCommandPalette" },
        group: { key: "common:shortcutGroups.general" },
        context: "global",
      },
    ]);

    dispose();
    expect(listKeybindings()).toEqual([]);
  });

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

  it("throws on a malformed action id", () => {
    expect(() =>
      registerKeybindings([def({ id: "   ", defaultChord: "Mod+X" })]),
    ).toThrow();
    expect(() =>
      registerKeybindings([
        def({ id: "x".repeat(MAX_KEYBINDING_ID_LEN + 1), defaultChord: "Mod+X" }),
      ]),
    ).toThrow();
  });

  it("throws on malformed binding metadata", () => {
    expect(() =>
      registerKeybindings([
        def({
          id: "x",
          defaultChord: "Mod+X",
          label: "raw source copy" as unknown as KeybindingDef["label"],
        }),
      ]),
    ).toThrow();
    expect(() =>
      registerKeybindings([
        def({
          id: "x",
          defaultChord: "Mod+X",
          context: "bogus" as KeybindingDef["context"],
        }),
      ]),
    ).toThrow();
  });

  it("normalizes typed labels and static group descriptors", () => {
    const dispose = registerKeybindings([
      def({
        id: "typed",
        defaultChord: "Mod+T",
        label: {
          key: "common:accessibility.confirmAction",
          values: { action: "Retry" },
        },
        group: { key: "common:actions.showKeyboardShortcuts" },
      }),
    ]);

    expect(listKeybindings()).toEqual([
      {
        id: "typed",
        defaultChord: "Mod+T",
        label: {
          key: "common:accessibility.confirmAction",
          values: { action: "Retry" },
        },
        group: { key: "common:actions.showKeyboardShortcuts" },
        context: "global",
      },
    ]);
    dispose();
  });

  it("rejects malformed descriptors, interpolated groups, and accessor records", () => {
    expect(() =>
      registerKeybindings([
        def({
          id: "dynamic-group",
          defaultChord: "Mod+D",
          group: {
            key: "common:accessibility.confirmAction",
            values: { action: "Group" },
          } as unknown as KeybindingDef["group"],
        }),
      ]),
    ).toThrowError("keybinding has a malformed id");

    expect(() =>
      registerKeybindings([
        def({
          id: "bad-label",
          defaultChord: "Mod+B",
          label: { key: "missing:label" } as unknown as KeybindingDef["label"],
        }),
      ]),
    ).toThrowError("keybinding has a malformed id");

    const accessor = Object.defineProperty({}, "id", { get: () => "accessor" });
    expect(() => registerKeybindings([accessor as KeybindingDef])).toThrowError(
      "keybinding has a malformed id",
    );
  });
});

describe("keybinding presentation normalization", () => {
  it("accepts typed labels and rejects raw source strings", () => {
    expect(normalizeKeybindingPresentation({ key: "common:actions.retry" })).toEqual({
      key: "common:actions.retry",
    });
    expect(normalizeKeybindingPresentation({ key: "missing:key" })).toBeNull();
    expect(normalizeKeybindingPresentation("Retry")).toBeNull();
  });

  it("requires group descriptors to be static", () => {
    expect(
      normalizeKeybindingGroupPresentation({
        key: "common:accessibility.confirmAction",
        values: { action: "Group" },
      }),
    ).toBeNull();
    expect(
      normalizeKeybindingGroupPresentation({
        key: "common:actions.showKeyboardShortcuts",
      }),
    ).toEqual({ key: "common:actions.showKeyboardShortcuts" });
  });
});

describe("effectiveChord", () => {
  it("normalizes override maps at the platform keymap seam", () => {
    const huge = "x".repeat(65);

    expect(
      normalizeKeybindingOverrides({
        " a ": " Mod+P ",
        b: "",
        c: 42,
        big: huge,
        ["x".repeat(MAX_KEYBINDING_ID_LEN + 1)]: "Mod+B",
      }),
    ).toEqual({ a: "Mod+P" });
    expect(normalizeKeybindingOverrides(null)).toEqual({});
    expect(normalizeKeybindingOverrides(["Mod+P"])).toEqual({});
  });

  it("prefers a well-formed override over the default", () => {
    const d = def({ id: " a ", defaultChord: "Mod+A" });
    expect(effectiveChord(d, {})).toBe("Mod+A");
    expect(effectiveChord(d, { " a ": " Mod+Z " })).toBe("Mod+Z");
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
      [def({ id: " palette ", defaultChord: "Mod+K", context: "global" })],
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
      { " palette ": " Mod+P " },
      new Set(["global"]),
      ev({ key: "p", ctrlKey: true }),
      false,
    );
    expect(hit?.id).toBe("palette");
    const old = resolveKeybinding(
      defs,
      { " palette ": " Mod+P " },
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
  it("reports two actions sharing a chord at equal specificity (both global)", () => {
    const defs = [
      def({ id: "a", defaultChord: "Mod+K", context: "global" }),
      def({ id: "b", defaultChord: "Mod+K", context: "global" }),
    ];
    expect(findConflicts(defs)).toEqual([{ chord: "Mod+K", ids: ["a", "b"] }]);
  });

  it("reports two actions sharing a chord within the same surface context", () => {
    const defs = [
      def({ id: "a", defaultChord: "Enter", context: "canvas" }),
      def({ id: "b", defaultChord: "Enter", context: "canvas" }),
    ];
    expect(findConflicts(defs)).toEqual([{ chord: "Enter", ids: ["a", "b"] }]);
  });

  it("does NOT report a global-vs-surface shadow (unequal specificity)", () => {
    // The deliberate, resolvable shadow: most-specific-active-context wins, so the
    // surface binding fires when focused and the global one otherwise — no ambiguity.
    const defs = [
      def({ id: "a", defaultChord: "Mod+K", context: "global" }),
      def({ id: "b", defaultChord: "Mod+K", context: "canvas" }),
    ];
    expect(findConflicts(defs)).toEqual([]);
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
      def({ id: " a ", defaultChord: "Mod+A", context: "global" }),
      def({ id: "b", defaultChord: "Mod+B", context: "global" }),
    ];
    expect(conflictsForCandidate(defs, {}, " a ", "Mod+B")).toEqual(["b"]);
    expect(conflictsForCandidate(defs, {}, "a", "Mod+Z")).toEqual([]);
    expect(conflictsForCandidate(defs, {}, "a", "Mod+A")).toEqual([]); // self excluded
  });

  it("excludes a candidate that only shadows a binding at a different specificity", () => {
    // A global candidate colliding with a canvas binding is a resolvable shadow, not
    // a conflict; the recorder must not warn on it.
    const defs = [
      def({ id: "global-nav", defaultChord: "ArrowLeft", context: "global" }),
      def({ id: "canvas-walk", defaultChord: "ArrowLeft", context: "canvas" }),
    ];
    expect(conflictsForCandidate(defs, {}, "global-nav", "ArrowLeft")).toEqual([]);
  });
});
