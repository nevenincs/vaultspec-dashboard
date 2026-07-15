// @vitest-environment happy-dom
//
// Verifies current-location semantics and ancestor selection.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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
    let selections = 0;
    const onSelect = () => {
      selections += 1;
    };
    render(<Breadcrumb items={[{ label: "vault", onSelect }, { label: "here" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "vault" }));
    expect(selections).toBe(1);
  });

  it("exposes a disabled ancestor and prevents its selection", () => {
    let selections = 0;
    render(
      <Breadcrumb
        items={[
          {
            label: "vault",
            disabled: true,
            onSelect: () => {
              selections += 1;
            },
          },
          { label: "here" },
        ]}
      />,
    );

    const ancestor = screen.getByRole("button", { name: "vault" }) as HTMLButtonElement;
    expect(ancestor.disabled).toBe(true);
    fireEvent.click(ancestor);
    expect(selections).toBe(0);
  });
});
