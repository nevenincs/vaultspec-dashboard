// @vitest-environment happy-dom
//
// Tooltip kit primitive (W01.P02.S05): renders the trigger without crashing,
// keeps the bubble out of the DOM at rest, and reveals the role=tooltip bubble on
// hover, dismissing it on leave.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Tooltip } from "./Tooltip";

afterEach(cleanup);

describe("Tooltip", () => {
  it("renders the trigger with no bubble at rest", () => {
    render(
      <Tooltip label="Zoom in">
        <button type="button">+</button>
      </Tooltip>,
    );
    expect(screen.getByRole("button", { name: "+" })).toBeTruthy();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("reveals and hides the bubble on hover/leave", () => {
    const { container } = render(
      <Tooltip label="Zoom in">
        <button type="button">+</button>
      </Tooltip>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    fireEvent.mouseEnter(wrapper);
    expect(screen.getByRole("tooltip").textContent).toBe("Zoom in");
    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
