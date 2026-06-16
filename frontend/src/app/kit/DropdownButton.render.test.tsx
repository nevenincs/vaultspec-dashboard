// @vitest-environment happy-dom
//
// Kit DropdownButton render contract: it mounts under the default theme as a
// menu-trigger button, reflects the caller-owned open flag via aria-expanded, and
// emits the toggle intent on click.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DropdownButton } from "./DropdownButton";

afterEach(cleanup);

describe("DropdownButton", () => {
  it("renders the label as a menu trigger reflecting the closed state", () => {
    render(<DropdownButton label="Layout: Free" onClick={() => {}} />);
    const btn = screen.getByRole("button", { name: "Layout: Free" });
    expect(btn.getAttribute("aria-haspopup")).toBe("menu");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("reflects the open flag via aria-expanded", () => {
    render(<DropdownButton label="Layout: Free" onClick={() => {}} open />);
    expect(
      screen
        .getByRole("button", { name: "Layout: Free" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("emits the toggle intent on click", () => {
    const onClick = vi.fn();
    render(<DropdownButton label="Menu" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
