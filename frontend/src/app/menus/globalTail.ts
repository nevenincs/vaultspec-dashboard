// The context-menu global tail (global-context-actions ADR D2/D3): the kind-agnostic
// actions appended to EVERY resolved menu under the terminal `global` section. Refresh
// is the SOLE shipped member (D3) — the one universal state control, meaningful no matter
// what was right-clicked because the whole dashboard is a live view of a changing corpus.
// It is composed from the SAME `refreshDataAction()` builder the palette command and the
// Mod+Shift+R chord use (unified-action-plane), so the three planes cannot drift.
//
// Discipline: this tail stays minimal. A second universal verb is a deliberate ADR-level
// decision, not a convenient append — the one-verb cap is the guardrail against the menu
// bloat the `global` section exists to prevent.

import type { ActionDescriptor } from "../../platform/actions/action";
import { chordToKeycaps } from "../../platform/keymap/chord";
import { effectiveChord, getKeybinding } from "../../platform/keymap/registry";
import { registerGlobalTailActions } from "../../platform/actions/registry";
import { getKeymapOverrides } from "../../stores/view/keymapDispatcher";
import {
  RELOAD_REFRESH_DATA_ACTION_ID,
  refreshDataAction,
} from "../../stores/view/reloadKeybindings";

/** The inline accelerator for the Refresh row, DERIVED from the one keymap registry
 *  (palette-command-accelerators-derive-from-the-keymap-registry) so the chord the menu
 *  teaches is exactly the chord that fires, override-aware and never hand-typed. Returns
 *  undefined until the reload binding is registered (e.g. in a bare unit test). */
function refreshAccelerator(): ActionDescriptor["accelerator"] {
  const def = getKeybinding(RELOAD_REFRESH_DATA_ACTION_ID);
  if (def === undefined) return undefined;
  const keycaps = chordToKeycaps(effectiveChord(def, getKeymapOverrides()));
  return keycaps.length > 0 ? keycaps : undefined;
}

/** The global-tail actions, kind-agnostic (the entity is intentionally ignored). The
 *  tail assigns the terminal `global` section here (the standard row style + a surfaced,
 *  registry-derived accelerator — the approved visual treatment), so the shared builder
 *  stays section-agnostic for the palette and keymap that ignore it. */
export function globalTailActions(): ActionDescriptor[] {
  const accelerator = refreshAccelerator();
  return [
    {
      ...refreshDataAction(),
      section: "global" as const,
      ...(accelerator ? { accelerator } : {}),
    },
  ];
}

registerGlobalTailActions(() => globalTailActions());
