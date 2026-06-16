// @vitest-environment happy-dom
//
// Divider kit primitive (W01.P02.S05): renders Neutral and Accent tones in both
// orientations as an ARIA separator without crashing.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Divider } from "./Divider";

afterEach(cleanup);

describe("Divider", () => {
  it("renders a horizontal neutral separator by default", () => {
    const sep = render(<Divider />).getByRole("separator");
    expect(sep.getAttribute("aria-orientation")).toBe("horizontal");
    expect(sep.className).toContain("bg-rule");
  });

  it("renders the accent tone", () => {
    const sep = render(<Divider tone="accent" />).getByRole("separator");
    expect(sep.className).toContain("bg-accent");
  });

  it("renders a vertical orientation", () => {
    const sep = render(<Divider orientation="vertical" />).getByRole("separator");
    expect(sep.getAttribute("aria-orientation")).toBe("vertical");
    expect(sep.className).toContain("w-px");
    // cleanup handles teardown
    expect(screen.getAllByRole("separator").length).toBeGreaterThan(0);
  });
});
