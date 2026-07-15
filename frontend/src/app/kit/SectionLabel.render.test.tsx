// @vitest-environment happy-dom
//
// SectionLabel kit primitive (W01.P02.S05): renders without crashing under the
// default theme, shows its label, and renders the optional tabular count.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SectionLabel } from "./SectionLabel";

afterEach(cleanup);

describe("SectionLabel", () => {
  it("preserves authored label casing and eyebrow spacing", () => {
    const { container } = render(<SectionLabel>Decisions</SectionLabel>);
    expect(screen.getByText("Decisions")).toBeTruthy();
    const className = container.firstElementChild?.className ?? "";
    expect(className).toContain("font-medium");
    expect(className).toContain("tracking-[0.025rem]");
    expect(className).not.toMatch(
      /(?:^|\s)(?:uppercase|lowercase|capitalize)(?:\s|$)/u,
    );
  });

  it("renders the optional count as a tabular figure", () => {
    render(<SectionLabel count={4}>Open plans</SectionLabel>);
    const count = screen.getByText("4");
    expect(count.hasAttribute("data-tabular")).toBe(true);
  });

  it("omits the count when not provided", () => {
    render(<SectionLabel>Plans</SectionLabel>);
    expect(screen.queryByText(/^\d+$/)).toBeNull();
  });
});
