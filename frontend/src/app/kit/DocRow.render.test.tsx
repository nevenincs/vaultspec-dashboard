// @vitest-environment happy-dom
//
// DocRow kit component (binding board 135:2 DocRow / 244:750 rows): the centralized
// document-list row. These assertions pin the board contract the surfaces rely on:
// the title/tag/age render, the tag is PLAIN text (not a pill), and the Selected
// state carries the accent ground + the centered accent bar (not a full border).

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DocRow } from "./DocRow";
import { StatusDot } from "./StatusDot";

afterEach(() => cleanup());

describe("DocRow (kit, board 135:2 / 244:750)", () => {
  it("renders the leading mark, title, plain tag, and age", () => {
    render(
      <DocRow
        leading={<StatusDot category="research" />}
        title="Live delta sync"
        tag="#delta-sync"
        age="now"
      />,
    );
    expect(screen.getByText("Live delta sync")).toBeTruthy();
    // The tag is plain text beside the title — NOT a kit Chip pill (the board draws
    // "#topic" as faint text, never a chip).
    const tag = screen.getByText("#delta-sync");
    expect(tag.getAttribute("data-kit")).toBeNull();
    expect(tag.tagName).toBe("SPAN");
    expect(screen.getByText("now")).toBeTruthy();
  });

  it("is not selected by default and carries no selection bar", () => {
    const { container } = render(<DocRow title="Text layout" />);
    const row = container.querySelector('[data-kit="doc-row"]')!;
    expect(row.getAttribute("data-selected")).toBeNull();
    // No centered accent bar element when unselected.
    expect(row.querySelector("span.bg-accent")).toBeNull();
  });

  it("selected applies the accent ground + the centered accent bar", () => {
    const { container } = render(<DocRow title="Live delta sync" selected />);
    const row = container.querySelector('[data-kit="doc-row"]')!;
    expect(row.getAttribute("data-selected")).toBe("");
    expect(row.className).toContain("bg-accent-subtle");
    // The selection bar is a short centered accent bar (inset, not a full border).
    const bar = row.querySelector("span.bg-accent");
    expect(bar).toBeTruthy();
    expect(bar!.className).toContain("h-4");
    expect(bar!.className).toContain("-translate-y-1/2");
  });
});
