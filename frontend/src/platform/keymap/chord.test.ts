import { describe, expect, it } from "vitest";

import {
  type Chord,
  type ChordEvent,
  canonicalizeChord,
  chordStringFromEvent,
  chordToKeycaps,
  formatChord,
  matchesChord,
  normalizeKey,
  parseChord,
} from "./chord";

function ev(over: Partial<ChordEvent> & { key: string }): ChordEvent {
  return {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...over,
  };
}

describe("parseChord", () => {
  it("parses modifiers case-insensitively in any order into canonical form", () => {
    const a = parseChord("Mod+Shift+K");
    const b = parseChord("shift+mod+k");
    expect(a).toEqual<Chord>({
      mod: true,
      ctrl: false,
      alt: false,
      shift: true,
      key: "k",
    });
    expect(b).toEqual(a);
  });

  it("accepts cmd/command/meta and option as modifier aliases", () => {
    expect(parseChord("Cmd+K")?.mod).toBe(true);
    expect(parseChord("Command+K")?.mod).toBe(true);
    expect(parseChord("Option+E")?.alt).toBe(true);
  });

  it("normalizes a bare named key and a bare symbol key", () => {
    expect(parseChord("ArrowLeft")).toEqual<Chord>({
      mod: false,
      ctrl: false,
      alt: false,
      shift: false,
      key: "ArrowLeft",
    });
    expect(parseChord("?")?.key).toBe("?");
    expect(parseChord("[")?.key).toBe("[");
  });

  it("maps the space bar to the canonical Space key", () => {
    expect(parseChord(" ")?.key).toBe("Space");
    expect(parseChord("Mod+Space")?.key).toBe("Space");
    expect(parseChord("mod+space")?.key).toBe("Space");
  });

  it("rejects malformed chords (empty, modifier-only, empty segment, two keys)", () => {
    expect(parseChord("")).toBeNull();
    expect(parseChord("   ")).toBeNull();
    expect(parseChord("Mod")).toBeNull();
    expect(parseChord("Mod+Shift")).toBeNull();
    expect(parseChord("Mod+")).toBeNull();
    expect(parseChord("K+J")).toBeNull();
  });
});

describe("formatChord / canonicalizeChord", () => {
  it("renders modifiers in fixed order regardless of author order", () => {
    expect(formatChord(parseChord("shift+alt+mod+k")!)).toBe("Mod+Alt+Shift+K");
  });

  it("upper-cases single letters for display but lower-cases on parse", () => {
    expect(canonicalizeChord("mod+k")).toBe("Mod+K");
    expect(canonicalizeChord("Mod+K")).toBe("Mod+K");
  });

  it("round-trips: parse then format then parse yields the same chord", () => {
    for (const s of ["Mod+K", "Ctrl+Alt+Shift+ArrowLeft", "?", "[", "Space", "Enter"]) {
      const chord = parseChord(s)!;
      expect(parseChord(formatChord(chord))).toEqual(chord);
    }
  });

  it("canonicalize rejects keyless or empty-segment input", () => {
    expect(canonicalizeChord("Mod+")).toBeNull();
    expect(canonicalizeChord("Mod+Ctrl")).toBeNull();
  });
});

describe("localized keycap presentations", () => {
  it("separates canonical chord identity from catalog-owned display names", () => {
    expect(canonicalizeChord("shift+alt+mod+arrowleft")).toBe(
      "Mod+Alt+Shift+arrowleft",
    );
    expect(chordToKeycaps("Mod+Alt+Shift+ArrowLeft", false)).toEqual([
      { key: "common:keycaps.control" },
      { key: "common:keycaps.alt" },
      { key: "common:keycaps.shift" },
      { key: "common:keycaps.arrowLeft" },
    ]);
    expect(chordToKeycaps("Mod+K", true)).toEqual([
      { kind: "literal", value: "⌘" },
      { kind: "literal", value: "K" },
    ]);
  });

  it("preserves printable international keyboard graphemes", () => {
    expect(chordToKeycaps("É", false)).toEqual([{ kind: "literal", value: "é" }]);
    expect(chordToKeycaps("Ñ", false)).toEqual([{ kind: "literal", value: "ñ" }]);
    expect(chordToKeycaps("ß", false)).toEqual([{ kind: "literal", value: "ß" }]);
    expect(chordToKeycaps("ش", false)).toEqual([{ kind: "literal", value: "ش" }]);
    expect(chordToKeycaps("٣", false)).toEqual([{ kind: "literal", value: "٣" }]);
    expect(chordToKeycaps("e\u0301", false)).toEqual([{ kind: "literal", value: "é" }]);
    expect(chordToKeycaps("👩‍💻", false)).toEqual([{ kind: "literal", value: "👩‍💻" }]);
  });

  it("fails closed for malformed, invisible, and unknown display tokens", () => {
    expect(chordToKeycaps("Mod+", false)).toEqual([]);
    expect(chordToKeycaps("LaunchMail", false)).toEqual([]);
    expect(chordToKeycaps("\u200f", false)).toEqual([]);
    expect(chordToKeycaps("two keys", false)).toEqual([]);
  });
});

describe("non-ASCII canonical identity compatibility", () => {
  it("keeps legacy canonical bytes and Shift stripping for single-code-unit keys", () => {
    expect(canonicalizeChord("É")).toBe("é");
    expect(canonicalizeChord("Shift+É")).toBe("é");
    expect(canonicalizeChord("Ñ")).toBe("ñ");
    expect(canonicalizeChord("Shift+ß")).toBe("ß");
    expect(canonicalizeChord("Shift+ش")).toBe("ش");
  });

  it("keeps legacy matching behavior for shifted non-ASCII keys", () => {
    const accented = parseChord("Shift+É")!;
    expect(accented.shift).toBe(false);
    expect(matchesChord(accented, ev({ key: "É", shiftKey: true }), false)).toBe(true);
    expect(matchesChord(accented, ev({ key: "é" }), false)).toBe(true);
  });

  it("keeps multi-code-unit keys distinct from legacy symbol handling", () => {
    expect(canonicalizeChord("Shift+e\u0301")).toBe("Shift+é");
    expect(parseChord("Shift+👩‍💻")?.shift).toBe(true);
  });
});

describe("chordStringFromEvent", () => {
  it("records key events as canonical chord strings", () => {
    expect(chordStringFromEvent(ev({ key: "p", metaKey: true, shiftKey: true }))).toBe(
      "Mod+Shift+P",
    );
  });

  it("ignores modifier-only key presses", () => {
    expect(chordStringFromEvent(ev({ key: "Control", ctrlKey: true }))).toBeNull();
    expect(chordStringFromEvent(ev({ key: "Shift", shiftKey: true }))).toBeNull();
  });

  it("uses the same shifted-symbol identity as parsing and matching", () => {
    expect(chordStringFromEvent(ev({ key: "?", shiftKey: true }))).toBe("?");
  });
});

describe("normalizeKey", () => {
  it("lower-cases single characters and preserves named keys", () => {
    expect(normalizeKey("K")).toBe("k");
    expect(normalizeKey("ArrowDown")).toBe("ArrowDown");
    expect(normalizeKey(" ")).toBe("Space");
  });
});

describe("matchesChord", () => {
  it("matches Mod+K as Ctrl on non-mac and Cmd on mac", () => {
    const chord = parseChord("Mod+K")!;
    expect(matchesChord(chord, ev({ key: "k", ctrlKey: true }), false)).toBe(true);
    expect(matchesChord(chord, ev({ key: "k", metaKey: true }), false)).toBe(false);
    expect(matchesChord(chord, ev({ key: "k", metaKey: true }), true)).toBe(true);
    expect(matchesChord(chord, ev({ key: "k", ctrlKey: true }), true)).toBe(false);
  });

  it("distinguishes explicit Ctrl from Mod on mac", () => {
    const ctrlChord = parseChord("Ctrl+K")!;
    expect(matchesChord(ctrlChord, ev({ key: "k", ctrlKey: true }), true)).toBe(true);
    expect(matchesChord(ctrlChord, ev({ key: "k", metaKey: true }), true)).toBe(false);
  });

  it("requires exact modifier state (no stray modifiers)", () => {
    const chord = parseChord("ArrowLeft")!;
    expect(matchesChord(chord, ev({ key: "ArrowLeft" }), false)).toBe(true);
    expect(matchesChord(chord, ev({ key: "ArrowLeft", ctrlKey: true }), false)).toBe(
      false,
    );
    expect(matchesChord(chord, ev({ key: "ArrowLeft", altKey: true }), false)).toBe(
      false,
    );
  });

  it("matches a shifted letter binding exactly", () => {
    const chord = parseChord("Shift+A")!;
    expect(matchesChord(chord, ev({ key: "A", shiftKey: true }), false)).toBe(true);
    expect(matchesChord(chord, ev({ key: "a" }), false)).toBe(false);
  });

  it("ignores shift for symbol keys so ? matches its shifted event", () => {
    const chord = parseChord("?")!;
    // The browser reports "?" with shiftKey true on a US layout; we must match.
    expect(matchesChord(chord, ev({ key: "?", shiftKey: true }), false)).toBe(true);
    expect(matchesChord(chord, ev({ key: "?", shiftKey: false }), false)).toBe(true);
  });

  it("matches the bracket-step keys", () => {
    expect(matchesChord(parseChord("[")!, ev({ key: "[" }), false)).toBe(true);
    expect(matchesChord(parseChord("]")!, ev({ key: "]" }), false)).toBe(true);
  });
});

describe("symbol-key shift identity (H1)", () => {
  it("strips shift from a symbol-key chord at parse so it has one identity", () => {
    expect(parseChord("Shift+?")).toEqual<Chord>({
      mod: false,
      ctrl: false,
      alt: false,
      shift: false,
      key: "?",
    });
    expect(canonicalizeChord("Shift+?")).toBe("?");
    expect(canonicalizeChord("?")).toBe("?");
  });

  it("keeps shift on a letter/named-key chord", () => {
    expect(parseChord("Shift+A")?.shift).toBe(true);
    expect(parseChord("Shift+Enter")?.shift).toBe(true);
  });

  it("a recorded Shift+symbol and a bare symbol are the same chord", () => {
    // The recorder may capture shiftKey true for a shifted symbol; both must
    // canonicalize identically so the matcher (which skips shift for symbols)
    // never silently double-resolves.
    expect(canonicalizeChord("Shift+?")).toBe(canonicalizeChord("?"));
    expect(
      matchesChord(parseChord("Shift+?")!, ev({ key: "?", shiftKey: true }), false),
    ).toBe(true);
  });
});
