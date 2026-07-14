// Default-chord conflict guard (KAR-008, keyboard-action-correctness-review).
//
// The one keymap registry resolves a keystroke to at most one action, breaking a
// same-specificity tie by id order (registry.ts `resolveKeybinding`). That tie-break
// is a SILENT shadow: two commands sharing a chord in overlapping contexts at the SAME
// specificity means one never fires and the user cannot tell which. This guard assembles
// the FULL default binding set — every source that calls `registerKeybindings` at app
// init — and asserts it is free of such same-specificity collisions.
//
// A global-vs-surface pair sharing a chord is NOT a conflict: it is the deliberate,
// resolvable shadow (`specificity` ranks a focused surface above global, so the surface
// binding wins when focused and the global one wins otherwise). Only pairs at EQUAL
// specificity — two globals, or two bindings of the same surface context — are ambiguous.
// So the guard filters `findConflicts` (which flags every overlapping-context collision,
// the recorder's superset) down to the equal-specificity subset.

import { describe, expect, it } from "vitest";

import {
  findConflicts,
  legacyKeybindingPresentation,
  type BindingContext,
  type KeybindingDef,
} from "../../platform/keymap/registry";

// Every binding source registered at app init (each `registerKeybindings` call site).
import {
  COMMAND_PALETTE_KEYBINDING,
  DOCUMENT_SEARCH_KEYBINDING,
  SEARCH_PALETTE_KEYBINDING,
} from "./commandPalette";
import { deriveDocTabKeybindings } from "./docTabKeybindings";
import { deriveEditorKeybindings } from "./editorKeybindings";
import { deriveGraphToggleKeybindings } from "./graphToggleKeybindings";
import { KEYBOARD_NAVIGATION_BINDINGS } from "./keyboardNavigation";
import { KEYBOARD_SHORTCUTS_TOGGLE_BINDING } from "./keyboardShortcuts";
import { deriveLeftRailKeybindings } from "./leftRailKeybindings";
import { deriveProjectKeybindings } from "./projectActions";
import { deriveReloadKeybindings } from "./reloadKeybindings";
import { deriveRightRailKeybindings } from "./rightRailKeybindings";
import { WORKING_SET_KEYBINDINGS } from "./workingSet";
import { deriveRegionCycleKeybindings } from "../../app/chrome/regionCycleKeybindings";
import { GRAPH_WALK_KEYBINDING_DEFS } from "../../app/stage/graphWalkKeybindings";

/** The full default keybinding set: every source that self-registers at app init.
 *  Kept in lockstep with the `registerKeybindings` call sites — a new source added
 *  without a line here under-covers the guard, so the list is the coverage contract. */
function assembleDefaultKeybindings(): KeybindingDef[] {
  return [
    COMMAND_PALETTE_KEYBINDING,
    SEARCH_PALETTE_KEYBINDING,
    DOCUMENT_SEARCH_KEYBINDING,
    KEYBOARD_SHORTCUTS_TOGGLE_BINDING,
    ...deriveDocTabKeybindings(),
    ...deriveEditorKeybindings(),
    ...deriveGraphToggleKeybindings(),
    ...KEYBOARD_NAVIGATION_BINDINGS,
    ...deriveLeftRailKeybindings(),
    ...deriveProjectKeybindings(),
    ...deriveReloadKeybindings(),
    ...deriveRightRailKeybindings(),
    ...WORKING_SET_KEYBINDINGS,
    ...deriveRegionCycleKeybindings(),
    ...GRAPH_WALK_KEYBINDING_DEFS,
  ];
}

/** A focused surface (1) outranks global (0); mirrors registry.ts `specificity`. */
function specificityRank(context: BindingContext): number {
  return context === "global" ? 0 : 1;
}

describe("default keybinding conflict guard (KAR-008)", () => {
  const defaults = assembleDefaultKeybindings();
  const contextById = new Map(defaults.map((b) => [b.id, b.context]));

  it("registers at least the known static + derived sources (coverage sanity)", () => {
    // A floor so a broken import (empty derive, tree-shaken const) can't make the
    // conflict assertion below pass vacuously over an empty set.
    expect(defaults.length).toBeGreaterThan(20);
    expect(new Set(defaults.map((b) => b.id)).size).toBe(defaults.length); // ids unique
  });

  it("has no same-specificity chord collision (global-vs-surface shadows excepted)", () => {
    // `findConflicts` flags EVERY overlapping-context collision — the recorder's
    // superset, which includes the deliberate global-vs-surface shadows. Keep only
    // the equal-specificity pairs: those are the genuinely ambiguous ones where the
    // id-order tie-break silently shadows one binding.
    const genuine = findConflicts(defaults).filter((c) => {
      const [idA, idB] = c.ids;
      const ctxA = contextById.get(idA);
      const ctxB = contextById.get(idB);
      if (ctxA === undefined || ctxB === undefined) return true; // unclassifiable → surface it
      return specificityRank(ctxA) === specificityRank(ctxB);
    });

    // Surface the offending pairs directly so a failure names them.
    expect(genuine).toEqual([]);
  });

  it("still detects a same-specificity collision when one is injected (guard has teeth)", () => {
    const collidingDefault = defaults[0].defaultChord;
    const injected: KeybindingDef = {
      id: "test:injected-collision",
      context: defaults[0].context,
      defaultChord: collidingDefault,
      label: legacyKeybindingPresentation("synthetic collision"),
      group: legacyKeybindingPresentation("test"),
    };
    const conflicts = findConflicts([...defaults, injected]);
    expect(conflicts.some((c) => c.ids.includes("test:injected-collision"))).toBe(true);
  });
});
