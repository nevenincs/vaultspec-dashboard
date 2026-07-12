// @vitest-environment happy-dom
//
// Render test for the compact bottom tab bar (mobile-unified-rail ADR): exactly three
// surfaces — Home · Timeline · Search — with the retired Browse and Status tabs folded
// into Home. The active surface carries `aria-current="page"` (a non-colour-only cue),
// and tapping a tab reports its surface id through the `onSelect` callback. The spy is
// the caller's own callback, not an engine/store stub.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BottomTabBar } from "./BottomTabBar";

afterEach(cleanup);

describe("BottomTabBar", () => {
  it("renders exactly the three surface tabs (no Browse, no Status)", () => {
    render(<BottomTabBar active="home" onSelect={() => undefined} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(3);
    expect(screen.getByRole("button", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Timeline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Browse" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Status" })).toBeNull();
  });

  it("marks only the active tab with aria-current=page", () => {
    render(<BottomTabBar active="home" onSelect={() => undefined} />);

    const home = screen.getByRole("button", { name: "Home" });
    const timeline = screen.getByRole("button", { name: "Timeline" });
    const search = screen.getByRole("button", { name: "Search" });

    expect(home.getAttribute("aria-current")).toBe("page");
    expect(timeline.getAttribute("aria-current")).toBeNull();
    expect(search.getAttribute("aria-current")).toBeNull();
    expect(timeline.getAttribute("data-active")).toBe("false");
    expect(search.getAttribute("data-active")).toBe("false");
  });

  it("reports the selected surface id through onSelect", () => {
    const onSelect = vi.fn();
    render(<BottomTabBar active="home" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(onSelect).toHaveBeenNthCalledWith(1, "timeline");
    expect(onSelect).toHaveBeenNthCalledWith(2, "search");
  });
});
