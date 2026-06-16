// @vitest-environment happy-dom
//
// Kit Chip / Badge render contract: a Chip resolves its category to the canonical
// scene/category token (data-category) and renders its label; a Badge renders its
// tone and label. Core vitest matchers only (no jest-dom in this repo).

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Badge, Chip } from "./Chip";

afterEach(cleanup);

describe("Chip", () => {
  it("renders the label and resolves the canonical category token", () => {
    render(<Chip category="decision">#editor</Chip>);
    const chip = screen.getByText("#editor").closest("[data-kit='chip']");
    // "decision" is the Figma label for the canonical "adr" token.
    expect(chip?.getAttribute("data-category")).toBe("adr");
  });

  it("passes a canonical token through unchanged", () => {
    render(<Chip category="plan">plan</Chip>);
    expect(
      screen
        .getByText("plan")
        .closest("[data-kit='chip']")
        ?.getAttribute("data-category"),
    ).toBe("plan");
  });
});

describe("Badge", () => {
  it("renders its label with the requested tone", () => {
    render(<Badge tone="accent">L3</Badge>);
    const badge = screen.getByText("L3");
    expect(badge.getAttribute("data-tone")).toBe("accent");
  });
});
