// @vitest-environment happy-dom
//
// TreeRow kit primitive (W01.P02.S05): renders Collapsed / Expanded / Leaf states
// without crashing, exposes the disclosure twisty with aria-expanded for the
// branch states (and none for a leaf), and routes onToggle / onSelect.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TreeRow } from "./TreeRow";

afterEach(cleanup);

describe("TreeRow", () => {
  it("renders a collapsed branch with a collapsed disclosure twisty", () => {
    render(<TreeRow state="collapsed" label="research" />);
    const twisty = screen.getByRole("button", { name: "Expand" });
    expect(twisty.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("research")).toBeTruthy();
  });

  it("renders an expanded branch and routes onToggle", () => {
    const onToggle = vi.fn();
    render(<TreeRow state="expanded" label="plans" onToggle={onToggle} />);
    const twisty = screen.getByRole("button", { name: "Collapse" });
    expect(twisty.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(twisty);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("renders a leaf with no disclosure twisty and routes onSelect", () => {
    const onSelect = vi.fn();
    render(<TreeRow state="leaf" label="a-doc.md" onSelect={onSelect} />);
    expect(screen.queryByRole("button", { name: /Expand|Collapse/ })).toBeNull();
    fireEvent.click(screen.getByText("a-doc.md"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
