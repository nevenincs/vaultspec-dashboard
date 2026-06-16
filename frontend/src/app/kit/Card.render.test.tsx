// @vitest-environment happy-dom
//
// Card kit primitive (W01.P02.S05): renders without crashing under the default
// theme, forwards children, and applies the requested elevation token. Core
// vitest matchers only (no jest-dom in this repo).

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Card } from "./Card";

afterEach(cleanup);

describe("Card", () => {
  it("renders children under the default theme", () => {
    render(<Card>panel body</Card>);
    expect(screen.getByText("panel body")).toBeTruthy();
  });

  it("applies the requested elevation shadow token", () => {
    const { container } = render(<Card elevation="popover">x</Card>);
    expect(container.firstElementChild?.className).toContain("shadow-fg-popover");
  });

  it("drops interior padding when padded is false", () => {
    const { container } = render(<Card padded={false}>x</Card>);
    expect(container.firstElementChild?.className).not.toContain("p-fg-3");
  });
});
