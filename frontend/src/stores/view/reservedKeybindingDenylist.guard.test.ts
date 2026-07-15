// Platform-reserved denylist guard (keyboard-shortcut-conflict-review ADR D3).
//
// `findConflicts` only sees two in-app bindings collide with EACH OTHER; it can never see
// a single binding collide with the BROWSER or OS (a `Mod+1` binding has no in-app conflict
// yet is completely dead — the browser switches tabs before the page sees the key). This
// guard is the only mechanism that catches that class: it assembles the FULL default binding
// set — every source that calls `registerKeybindings` at app init — and asserts no default
// chord canonicalizes into the platform-reserved denylist (`platform/keymap/reservedChords.ts`).
//
// The assembly mirrors `defaultKeybindingConflicts.guard.test.ts`: kept in lockstep with the
// `registerKeybindings` call sites, so a new binding source added without a line here
// under-covers the guard. The list is the coverage contract.

import { describe, expect, it } from "vitest";

import { canonicalizeChord } from "../../platform/keymap/chord";
import type { KeybindingDef } from "../../platform/keymap/registry";
import { isReservedChord } from "../../platform/keymap/reservedChords";
import { assembleDefaultKeybindings } from "./assembleDefaultKeybindings.testsupport";

describe("platform-reserved keybinding denylist guard (ADR D3)", () => {
  const defaults = assembleDefaultKeybindings();

  it("assembles a non-empty default set (coverage sanity)", () => {
    // A floor so a broken import (empty derive, tree-shaken const) can't make the
    // assertion below pass vacuously over an empty set.
    expect(defaults.length).toBeGreaterThan(20);
  });

  it("has no default chord that canonicalizes to a platform-reserved chord", () => {
    const offenders = defaults
      .filter((def) => isReservedChord(def.defaultChord))
      .map((def) => ({ id: def.id, chord: canonicalizeChord(def.defaultChord) }));
    // Surface offending bindings directly so a failure names the id and chord.
    expect(offenders).toEqual([]);
  });

  it("detects a reserved default when one is injected (guard has teeth)", () => {
    const injected: KeybindingDef = {
      id: "test:injected-reserved",
      defaultChord: "Mod+1", // browser tab switch — hard-reserved
      label: { key: "common:actions.retry" },
      group: { key: "common:shortcutGroups.general" },
      context: "global",
    };
    const withInjected = [...defaults, injected];
    const offenders = withInjected.filter((def) => isReservedChord(def.defaultChord));
    expect(offenders.map((def) => def.id)).toContain("test:injected-reserved");
  });
});
