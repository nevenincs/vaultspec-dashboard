// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import {
  handleKeyboardContextMenu,
  isKeyboardContextMenuEvent,
  keyboardContextMenuAnchor,
} from "./keyboardContextMenu";

describe("keyboard context menu chrome seam", () => {
  it("recognizes the platform keyboard menu gestures", () => {
    expect(isKeyboardContextMenuEvent({ key: "ContextMenu", shiftKey: false })).toBe(
      true,
    );
    expect(isKeyboardContextMenuEvent({ key: "F10", shiftKey: true })).toBe(true);
    expect(isKeyboardContextMenuEvent({ key: "F10", shiftKey: false })).toBe(false);
    expect(isKeyboardContextMenuEvent({ key: "Enter", shiftKey: false })).toBe(false);
  });

  it("anchors keyboard menus to the current target bottom-left", () => {
    const row = document.createElement("button");

    expect(keyboardContextMenuAnchor(row)).toEqual({ x: 0, y: 0 });
  });

  it("prevents default and opens only for keyboard menu gestures", () => {
    const row = document.createElement("button");
    const opened: { x: number; y: number }[] = [];
    let prevented = 0;

    expect(
      handleKeyboardContextMenu(
        {
          key: "ArrowDown",
          shiftKey: false,
          currentTarget: row,
          preventDefault: () => {
            prevented += 1;
          },
        },
        (anchor) => opened.push(anchor),
      ),
    ).toBe(false);
    expect(opened).toEqual([]);
    expect(prevented).toBe(0);

    expect(
      handleKeyboardContextMenu(
        {
          key: "ContextMenu",
          shiftKey: false,
          currentTarget: row,
          preventDefault: () => {
            prevented += 1;
          },
        },
        (anchor) => opened.push(anchor),
      ),
    ).toBe(true);
    expect(opened).toEqual([{ x: 0, y: 0 }]);
    expect(prevented).toBe(1);
  });
});
