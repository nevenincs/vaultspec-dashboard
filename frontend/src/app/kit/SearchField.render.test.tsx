// @vitest-environment happy-dom
//
// Kit SearchField render contract: it mounts under the default theme, reflects the
// controlled value, emits the next string on edit, and surfaces the clear control
// only when non-empty AND a handler is supplied.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SearchField } from "./SearchField";

afterEach(cleanup);

describe("SearchField", () => {
  it("renders the controlled value with its placeholder name", () => {
    render(
      <SearchField value="adr" onChange={() => {}} placeholder="Search documents…" />,
    );
    const input = screen.getByRole("textbox", {
      name: "Search documents…",
    }) as HTMLInputElement;
    expect(input.value).toBe("adr");
  });

  it("emits the next string on edit", () => {
    const changes: string[] = [];
    render(
      <SearchField
        value=""
        onChange={(value) => changes.push(value)}
        placeholder="Search…"
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Search…" }), {
      target: { value: "graph" },
    });
    expect(changes).toEqual(["graph"]);
  });

  it("shows the clear control only when non-empty and onClear is given", () => {
    let clearCount = 0;
    const onClear = () => {
      clearCount += 1;
    };
    const { rerender } = render(
      <SearchField value="" onChange={() => {}} onClear={onClear} />,
    );
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    rerender(<SearchField value="x" onChange={() => {}} onClear={onClear} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(clearCount).toBe(1);
  });
});
