// The background context-menu host helper (background-context-menus ADR D4): builds an
// onContextMenu handler for a rail/timeline background container. It fires the `background`
// entity ONLY when the right-click target IS the background element itself
// (target === currentTarget), so a right-click on a row/mark has a deeper target and is
// handled by that row's own resolver — never shadowed by the background menu. The `open`
// callback is injected so the helper is a pure, unit-testable function.

import type { MouseEvent } from "react";

import type { BackgroundRegion } from "../../platform/actions/entity";
import type { MenuAnchor } from "../../stores/view/contextMenu";

type OpenContextMenu = (entity: unknown, anchor: MenuAnchor) => void;

/** True when a right-click counts as an empty-space (background) click. The default —
 *  `target === currentTarget` — suits a container whose own area shows through between its
 *  rows (the rails). A filled surface (the timeline SVG, fully covered by children) passes a
 *  custom predicate that instead asks "is this NOT on any element with its own menu/gesture".
 */
type BackgroundTargetPredicate = (event: MouseEvent) => boolean;

export function backgroundContextMenuHandler(
  region: BackgroundRegion,
  open: OpenContextMenu,
  isBackgroundTarget?: BackgroundTargetPredicate,
): (event: MouseEvent) => void {
  return (event: MouseEvent) => {
    const isBackground = isBackgroundTarget
      ? isBackgroundTarget(event)
      : event.target === event.currentTarget;
    if (!isBackground) return;
    event.preventDefault();
    open(
      { kind: "background", id: "background", region },
      { x: event.clientX, y: event.clientY },
    );
  };
}

/** The selector for timeline elements that own their own menu/gesture (marks, hotspots,
 *  the playhead grip, range band, form controls). A right-click OUTSIDE all of these — the
 *  empty SVG lane/axis — is a timeline-background click. Uses `Element.closest` (not
 *  `HTMLElement`) so SVG marks are matched too (the gap the gesture guard left). */
const TIMELINE_NON_BACKGROUND_SELECTOR =
  "button,a,input,textarea,select,[role='slider'],[data-playhead-grip],[data-range-band],[data-timeline-dot],[data-timeline-hotspot]";

export function isTimelineBackgroundTarget(event: MouseEvent): boolean {
  const target = event.target as Element | null;
  if (target === null || typeof target.closest !== "function") return false;
  return target.closest(TIMELINE_NON_BACKGROUND_SELECTOR) === null;
}
