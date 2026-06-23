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
import { registerGlobalTailActions } from "../../platform/actions/registry";
import { refreshDataAction } from "../../stores/view/reloadKeybindings";

/** The global-tail actions, kind-agnostic (the entity is intentionally ignored). The
 *  tail assigns the terminal `global` section here, so the shared builder stays
 *  section-agnostic for the palette and keymap that ignore it. */
export function globalTailActions(): ActionDescriptor[] {
  return [{ ...refreshDataAction(), section: "global" as const }];
}

registerGlobalTailActions(() => globalTailActions());
