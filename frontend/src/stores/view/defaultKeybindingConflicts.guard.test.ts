// Default-chord conflict guard (KAR-008, keyboard-action-correctness-review;
// scope-aware per keyboard-shortcut-conflict-review ADR D1/D2/D8).
//
// The one keymap registry resolves a keystroke to at most one action, breaking a
// same-specificity tie by id order (registry.ts `resolveKeybinding`). That tie-break
// is a SILENT shadow: two commands sharing a chord in overlapping contexts at the SAME
// specificity means one never fires and the user cannot tell which. This guard assembles
// the FULL default binding set — every source that calls `registerKeybindings` at app
// init — and asserts it is free of such same-specificity collisions.
//
// A global-vs-surface pair sharing a chord is NOT a conflict: it is the deliberate,
// resolvable shadow (a focused surface outranks global, so the surface binding wins when
// focused and the global one wins otherwise). Only pairs at EQUAL specificity — two
// globals, or two bindings of the same surface context — are ambiguous. That narrowing
// now lives in production (`findConflicts` applies it directly, ADR D1), so this guard no
// longer re-implements a local specificity filter; it asserts against the shared predicate
// and additionally proves the settings recorder (`keybindingConflictPresentations`) shows
// zero false positives on the ten previously-flagged stock rows while still warning on a
// genuine same-specificity user-override collision (ADR D2).

import { describe, expect, it } from "vitest";

import { findConflicts, type KeybindingDef } from "../../platform/keymap/registry";
import { assembleDefaultKeybindings } from "./assembleDefaultKeybindings.testsupport";
import { keybindingConflictPresentations } from "./settingsControls";

// The five deliberate global-vs-canvas shadow pairs the recorder used to flag on a
// stock install (ten rows). Each id below has a same-chord partner at a DIFFERENT
// specificity, so it is a resolvable shadow, never a conflict (ADR D2).
const PREVIOUSLY_FLAGGED_ROW_IDS = [
  "nav:neighbor-previous", // ArrowLeft (global) vs graph:walk-backward-arrow-left (canvas)
  "nav:neighbor-next", // ArrowRight (global) vs graph:walk-forward-arrow-right (canvas)
  "nav:feature-previous", // ArrowUp (global) vs graph:walk-backward-arrow-up (canvas)
  "nav:feature-next", // ArrowDown (global) vs graph:walk-forward-arrow-down (canvas)
  "working-set:expand-selection", // E (global) vs graph:expand (canvas)
  "graph:walk-backward-arrow-left",
  "graph:walk-forward-arrow-right",
  "graph:walk-backward-arrow-up",
  "graph:walk-forward-arrow-down",
  "graph:expand",
] as const;

describe("default keybinding conflict guard (KAR-008)", () => {
  const defaults = assembleDefaultKeybindings();
  const defById = new Map(defaults.map((b) => [b.id, b]));

  it("registers at least the known static + derived sources (coverage sanity)", () => {
    // A floor so a broken import (empty derive, tree-shaken const) can't make the
    // conflict assertion below pass vacuously over an empty set.
    expect(defaults.length).toBeGreaterThan(20);
    expect(new Set(defaults.map((b) => b.id)).size).toBe(defaults.length); // ids unique
  });

  it("has no same-specificity chord collision (global-vs-surface shadows excepted)", () => {
    // `findConflicts` now applies the ADR-D1 scope-aware definition directly: it
    // reports only equal-specificity collisions, so the deliberate global-vs-surface
    // shadows are already excluded. Surface any offending pair directly so a failure
    // names it.
    expect(findConflicts(defaults)).toEqual([]);
  });

  it("still detects a same-specificity collision when one is injected (guard has teeth)", () => {
    const collidingDefault = defaults[0].defaultChord;
    const injected: KeybindingDef = {
      id: "test:injected-collision",
      context: defaults[0].context, // matches defaults[0] (global) → equal specificity
      defaultChord: collidingDefault,
      label: { key: "common:actions.retry" },
      group: { key: "common:shortcutGroups.general" },
    };
    const conflicts = findConflicts([...defaults, injected]);
    expect(conflicts.some((c) => c.ids.includes("test:injected-collision"))).toBe(true);
  });

  it("shows no recorder warning for the ten previously-flagged stock rows (ADR D2)", () => {
    // The Settings recorder calls `keybindingConflictPresentations` on each row's
    // effective chord. On a stock install (no overrides) every one of the ten
    // global-vs-canvas shadow rows must now present ZERO conflicts.
    for (const id of PREVIOUSLY_FLAGGED_ROW_IDS) {
      const def = defById.get(id);
      expect(def, `default set must contain ${id}`).toBeDefined();
      expect(
        keybindingConflictPresentations({}, id, def!.defaultChord, defaults),
        `row ${id} should present no conflict on a stock install`,
      ).toEqual([]);
    }
  });

  it("still warns on a same-specificity user-override collision (ADR D2)", () => {
    // Rebind one global action onto another global action's chord: two globals on one
    // chord is a genuine ambiguity the recorder must still surface. `app:document-search`
    // rebound to `Mod+K` collides with the global `app:command-palette` default.
    const collision = keybindingConflictPresentations(
      { "app:document-search": "Mod+K" },
      "app:document-search",
      "Mod+K",
      defaults,
    );
    expect(collision.map((c) => c.id)).toEqual(["app:command-palette"]);
  });
});
