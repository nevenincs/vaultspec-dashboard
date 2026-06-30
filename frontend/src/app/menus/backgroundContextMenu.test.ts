// The background host guard (background-context-menus P02.S11): an empty-space right-click
// (target === the background element) opens the background menu; a right-click whose target
// is a child (a row/mark with its own resolver) is ignored, so the row menu always wins.

import type { MouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  backgroundContextMenuHandler,
  isRailBackgroundTarget,
  isTimelineBackgroundTarget,
} from "./backgroundContextMenu";

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

  it("with a custom predicate, fires by predicate not by target identity", () => {
    const open = vi.fn();
    // A filled surface where target !== currentTarget but the predicate says background.
    backgroundContextMenuHandler("timeline", open, () => true)(contextMenuEvent(false));
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe("isTimelineBackgroundTarget", () => {
  // A fake element whose `closest` reports whether an interactive ancestor exists —
  // exercises the predicate logic without a DOM environment. `matched` is what the
  // interactive-selector closest() would return.
  const target = (matched: object | null) =>
    ({ target: { closest: () => matched } }) as unknown as MouseEvent;

  it("treats an empty lane (no interactive ancestor) as background", () => {
    expect(isTimelineBackgroundTarget(target(null))).toBe(true);
  });

  it("does NOT treat an interactive element (mark/grip/control) as background", () => {
    expect(isTimelineBackgroundTarget(target({ tag: "dot" }))).toBe(false);
  });

  it("treats a null / closest-less target as not background", () => {
    expect(isTimelineBackgroundTarget({ target: null } as unknown as MouseEvent)).toBe(
      false,
    );
  });
});

describe("isRailBackgroundTarget", () => {
  // The rail predicate is background when NO interactive ancestor (button / input /
  // option / etc.) is found via closest() — so empty rail padding opens the chrome
  // menu while a row (a <button>) keeps its own resolver.
  const target = (matched: object | null) =>
    ({ target: { closest: () => matched } }) as unknown as MouseEvent;

  it("treats empty rail space (no interactive ancestor) as background", () => {
    expect(isRailBackgroundTarget(target(null))).toBe(true);
  });

  it("does NOT treat a row/control (interactive ancestor) as background", () => {
    expect(isRailBackgroundTarget(target({ tag: "button" }))).toBe(false);
  });

  it("treats a null / closest-less target as not background", () => {
    expect(isRailBackgroundTarget({ target: null } as unknown as MouseEvent)).toBe(
      false,
    );
  });
});
