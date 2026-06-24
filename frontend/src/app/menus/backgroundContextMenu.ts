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

export function backgroundContextMenuHandler(
  region: BackgroundRegion,
  open: OpenContextMenu,
): (event: MouseEvent) => void {
  return (event: MouseEvent) => {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    open(
      { kind: "background", id: "background", region },
      { x: event.clientX, y: event.clientY },
    );
  };
}
