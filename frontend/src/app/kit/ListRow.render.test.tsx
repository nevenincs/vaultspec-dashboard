// @vitest-environment happy-dom
//
// ListRow kit primitive (W01.P02.S05): renders Default and Selected states
// without crashing, forwards leading/trailing slots, and marks the Selected
// state through aria-selected + the accent treatment. Core vitest matchers only.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ListRow } from "./ListRow";

afterEach(cleanup);

describe("ListRow", () => {
  it("renders the default state with its label and slots", () => {
    render(
      <ListRow leading={<span>dot</span>} trailing={<span>3d</span>}>
        a decision
      </ListRow>,
    );
    expect(screen.getByText("a decision")).toBeTruthy();
    expect(screen.getByText("dot")).toBeTruthy();
    expect(screen.getByText("3d")).toBeTruthy();
  });

  it("marks the Selected state via aria-selected and the accent tint", () => {
    const { container } = render(<ListRow selected>chosen</ListRow>);
    const row = container.firstElementChild as HTMLElement;
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(row.className).toContain("bg-accent-subtle");
    expect(row.className).toContain("border-l-accent");
  });
});
