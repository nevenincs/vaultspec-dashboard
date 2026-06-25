// @vitest-environment happy-dom
//
// Render-level reachability for the background context menu (background-context-menus,
// reviewer LOW finding on right-rail content-fill). The pure handler test exercises the
// predicate with synthetic events; THIS test mounts real DOM and dispatches REAL
// `contextmenu` events so target/currentTarget are set by the renderer, not mocked —
// proving the empty-space click opens the menu and a child-row click is left to the
// row's own resolver, end to end through React.

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  backgroundContextMenuHandler,
  isTimelineBackgroundTarget,
} from "./backgroundContextMenu";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("background reachability (real DOM)", () => {
  it("opens the region's background menu on an empty-space right-click", () => {
    const open = vi.fn();
    const { getByTestId } = render(
      <div
        data-testid="panel"
        onContextMenu={backgroundContextMenuHandler("right-rail", open)}
      >
        <button data-testid="row">a status row</button>
      </div>,
    );
    fireEvent.contextMenu(getByTestId("panel"));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toEqual({
      kind: "background",
      id: "background",
      region: "right-rail",
    });
  });

  it("does NOT open when the right-click lands on a child row — the row resolver wins", () => {
    const open = vi.fn();
    const { getByTestId } = render(
      <div onContextMenu={backgroundContextMenuHandler("right-rail", open)}>
        <button data-testid="row">a status row</button>
      </div>,
    );
    fireEvent.contextMenu(getByTestId("row"));
    expect(open).not.toHaveBeenCalled();
  });

  it("the timeline predicate opens on an empty lane but not on an interactive mark", () => {
    const open = vi.fn();
    const handler = backgroundContextMenuHandler(
      "timeline",
      open,
      isTimelineBackgroundTarget,
    );
    const { getByTestId } = render(
      <div data-testid="lane" onContextMenu={handler}>
        <span data-testid="empty">lane</span>
        <button data-testid="dot" data-timeline-dot>
          mark
        </button>
      </div>,
    );
    fireEvent.contextMenu(getByTestId("empty")); // not inside an interactive ancestor
    expect(open).toHaveBeenCalledTimes(1);
    fireEvent.contextMenu(getByTestId("dot")); // a timeline mark owns its own gesture
    expect(open).toHaveBeenCalledTimes(1); // unchanged — predicate excluded it
  });
});
