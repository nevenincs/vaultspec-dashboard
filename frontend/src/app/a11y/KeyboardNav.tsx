// Keyboard operability (W03.P12.S48, ADR G7.d): the accessibility floor —
// arrow-walk the graph (left/right cycles the selection's neighbors,
// up/down cycles the feature constellation) and bracket-step the playhead.
// Form fields keep their keys; everything routes through the same shared
// primitives the pointer paths use.

import { useEffect } from "react";

import { useActiveScope } from "../../stores/server/queries";
import { timelineViewSnapshot } from "../../stores/view/timeline";
import { movePlayhead } from "../../stores/view/timelineIntent";
import { visibleRange } from "../timeline/scrollStrip";
import { useDashboardNodeSelection } from "../../stores/view/selection";
import {
  deriveKeyboardNavigationKeyIntent,
  useKeyboardNavigationView,
} from "../../stores/view/keyboardNavigation";
import { useKeymapDispatcher } from "../../stores/view/keymapDispatcher";

function isFormTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && /^(input|textarea|select)$/i.test(target.tagName)
  );
}

// --- the global handler ------------------------------------------------------------------

export function KeyboardNav() {
  const scope = useActiveScope();
  const navigation = useKeyboardNavigationView(scope);
  const selectDashboardNode = useDashboardNodeSelection(scope);

  // The single global keymap listener (keyboard-action-system W01.P03). It is
  // inert until surfaces register Class-A bindings + action resolvers during
  // enrollment, at which point the legacy handler below is retired in favor of
  // it - so the two coexist harmlessly in the interim.
  useKeymapDispatcher();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isFormTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const { playheadT, pxPerMs, scrollOffset, viewportWidth } =
        timelineViewSnapshot();
      const intent = deriveKeyboardNavigationKeyIntent(
        e.key,
        navigation,
        playheadT,
        visibleRange(scrollOffset, viewportWidth, pxPerMs, 0),
        Date.now(),
      );
      if (intent === null) return;
      if (intent.kind === "select-node") {
        e.preventDefault();
        void selectDashboardNode(intent.id).catch(() => undefined);
        return;
      }
      if (intent.kind === "move-playhead") {
        e.preventDefault();
        movePlayhead(intent.playhead, scope);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigation, scope, selectDashboardNode]);

  // Live region (038): arrow-walk selection changes are announced to
  // assistive tech; visually hidden, polite.
  return (
    <div aria-live="polite" className="sr-only">
      {navigation.announcement}
    </div>
  );
}
