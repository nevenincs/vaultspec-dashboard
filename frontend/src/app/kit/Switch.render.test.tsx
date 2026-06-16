// @vitest-environment happy-dom
//
// Kit Switch render contract: it mounts under the default theme as an ARIA switch,
// reflects the controlled checked state, and emits the inverted boolean on click.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Switch } from "./Switch";

afterEach(cleanup);

describe("Switch", () => {
  it("renders an ARIA switch reflecting checked state", () => {
    render(<Switch checked onChange={() => {}} label="Steps & summaries" />);
    const sw = screen.getByRole("switch", { name: "Steps & summaries" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("emits the inverted boolean on click", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Toggle" />);
    fireEvent.click(screen.getByRole("switch", { name: "Toggle" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
