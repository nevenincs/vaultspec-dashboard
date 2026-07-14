// F6 / Shift+F6 region cycling, bound through the ONE keymap registry
// (keyboard-navigation W01.P02; keyboard-shortcuts-bind-through-the-one-keymap-
// registry). Region cycling is a Class-A command, so it is a registry binding
// fired by the single global dispatcher — NOT a private window listener. The
// within-region arrow navigation it complements is Class-B and lives in
// `useFocusZone`. This hook also mounts the focusin tracker that feeds the
// per-region entry memory.
//
// Layer: app/chrome — imports the keymap registry (platform) and the action
// resolver registrar (stores) downward, mirroring `app/left/leftRailActions`.

import { legacyActionPresentation } from "../../platform/actions/action";
import { useEffect } from "react";

import type { ActionDescriptor } from "../../platform/actions/action";
import {
  type KeybindingDef,
  legacyKeybindingPresentation,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { registerKeyAction } from "../../stores/view/keymapDispatcher";
import { cycleFocusRegion, rememberRegionFocus } from "./focusRegions";

export const REGION_CYCLE_NEXT_ACTION_ID = "shell:cycle-region-next";
export const REGION_CYCLE_PREV_ACTION_ID = "shell:cycle-region-previous";

export const REGION_CYCLE_NEXT_LABEL = legacyKeybindingPresentation(
  "Move to the next panel",
);
export const REGION_CYCLE_PREV_LABEL = legacyKeybindingPresentation(
  "Move to the previous panel",
);

const REGION_CYCLE_GROUP = legacyKeybindingPresentation("Navigation");

export function deriveRegionCycleKeybindings(): KeybindingDef[] {
  return [
    {
      id: REGION_CYCLE_NEXT_ACTION_ID,
      defaultChord: "F6",
      label: REGION_CYCLE_NEXT_LABEL,
      group: REGION_CYCLE_GROUP,
      context: "global",
    },
    {
      id: REGION_CYCLE_PREV_ACTION_ID,
      defaultChord: "Shift+F6",
      label: REGION_CYCLE_PREV_LABEL,
      group: REGION_CYCLE_GROUP,
      context: "global",
    },
  ];
}

/**
 * Register the F6/Shift+F6 region-cycle bindings and their action resolvers on
 * the one registry, and mount the focusin tracker that feeds region entry
 * memory. Mounted once at the shell top; disposes everything on unmount.
 */
export function useRegionCycleKeybindings(): void {
  useEffect(() => {
    const disposeBindings = registerKeybindings(deriveRegionCycleKeybindings());
    const disposeNext = registerKeyAction(
      REGION_CYCLE_NEXT_ACTION_ID,
      (): ActionDescriptor => ({
        id: REGION_CYCLE_NEXT_ACTION_ID,
        label: legacyActionPresentation(REGION_CYCLE_NEXT_LABEL),
        run: () => void cycleFocusRegion(1),
      }),
    );
    const disposePrev = registerKeyAction(
      REGION_CYCLE_PREV_ACTION_ID,
      (): ActionDescriptor => ({
        id: REGION_CYCLE_PREV_ACTION_ID,
        label: legacyActionPresentation(REGION_CYCLE_PREV_LABEL),
        run: () => void cycleFocusRegion(-1),
      }),
    );

    const onFocusIn = (event: FocusEvent) => rememberRegionFocus(event.target);
    document.addEventListener("focusin", onFocusIn, true);

    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      disposePrev();
      disposeNext();
      disposeBindings();
    };
  }, []);
}
