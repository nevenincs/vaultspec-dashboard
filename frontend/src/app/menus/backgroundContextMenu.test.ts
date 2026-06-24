// The background host guard (background-context-menus P02.S11): an empty-space right-click
// (target === the background element) opens the background menu; a right-click whose target
// is a child (a row/mark with its own resolver) is ignored, so the row menu always wins.

import type { MouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { backgroundContextMenuHandler } from "./backgroundContextMenu";

function contextMenuEvent(targetIsBackground: boolean): MouseEvent {
  const background = { tag: "background" };
  return {
    target: targetIsBackground ? background : { tag: "row" },
    currentTarget: background,
    clientX: 12,
    clientY: 34,
    preventDefault: vi.fn(),
  } as unknown as MouseEvent;
}

describe("backgroundContextMenuHandler", () => {
  it("opens the background entity for its region on an empty-space click", () => {
    const open = vi.fn();
    backgroundContextMenuHandler("left-rail", open)(contextMenuEvent(true));
    expect(open).toHaveBeenCalledWith(
      { kind: "background", id: "background", region: "left-rail" },
      { x: 12, y: 34 },
    );
  });

  it("does NOT fire when the target is a child row/mark - the row menu wins", () => {
    const open = vi.fn();
    const event = contextMenuEvent(false);
    backgroundContextMenuHandler("right-rail", open)(event);
    expect(open).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("carries the publishing region through to the entity", () => {
    const open = vi.fn();
    backgroundContextMenuHandler("timeline", open)(contextMenuEvent(true));
    expect(open.mock.calls[0][0]).toMatchObject({ region: "timeline" });
  });
});
