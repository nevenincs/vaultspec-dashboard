// @vitest-environment happy-dom
//
// Kit SegmentedToggle + Segment render contract: the container mounts under the
// default theme as an ARIA radiogroup, marks the active Segment, emits the next
// value on click, and roves with arrow keys (the segmented-control a11y pattern).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Segment } from "./Segment";
import { SegmentedToggle } from "./SegmentedToggle";

afterEach(cleanup);

function renderToggle(value: string, onChange = vi.fn()) {
  render(
    <SegmentedToggle value={value} onChange={onChange} ariaLabel="browser mode">
      <Segment value="vault">Vault</Segment>
      <Segment value="tree">Tree</Segment>
      <Segment value="code">Code</Segment>
    </SegmentedToggle>,
  );
  return onChange;
}

describe("SegmentedToggle + Segment", () => {
  it("renders the segments inside one radiogroup and marks the active one", () => {
    renderToggle("tree");
    expect(screen.getByRole("radiogroup", { name: "browser mode" })).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "Tree" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("puts only the active segment in the Tab order", () => {
    renderToggle("vault");
    const radios = screen.getAllByRole("radio");
    expect(radios[0]!.getAttribute("tabindex")).toBe("0");
    expect(radios.slice(1).every((r) => r.getAttribute("tabindex") === "-1")).toBe(
      true,
    );
  });

  it("emits the next value on click", () => {
    const onChange = renderToggle("vault");
    fireEvent.click(screen.getByRole("radio", { name: "Code" }));
    expect(onChange).toHaveBeenCalledWith("code");
  });

  it("roves and emits with ArrowRight", () => {
    const onChange = renderToggle("vault");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Vault" }), {
      key: "ArrowRight",
    });
    expect(onChange).toHaveBeenCalledWith("tree");
  });
});
