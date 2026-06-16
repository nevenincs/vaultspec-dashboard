// @vitest-environment happy-dom
//
// Breadcrumb kit primitive (W01.P02.S05): renders the path trail without
// crashing, marks the final segment as the current page, and fires onSelect from
// a preceding segment.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Breadcrumb } from "./Breadcrumb";

afterEach(cleanup);

describe("Breadcrumb", () => {
  it("renders segments and marks the last as the current page", () => {
    render(
      <Breadcrumb
        items={[{ label: "vault" }, { label: "plans" }, { label: "rewrite-plan" }]}
      />,
    );
    const current = screen.getByText("rewrite-plan");
    expect(current.getAttribute("aria-current")).toBe("page");
  });

  it("fires onSelect from a preceding (interactive) segment", () => {
    const onSelect = vi.fn();
    render(<Breadcrumb items={[{ label: "vault", onSelect }, { label: "here" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "vault" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
