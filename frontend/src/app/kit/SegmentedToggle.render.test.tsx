// @vitest-environment happy-dom
//
// Kit SegmentedToggle + Segment render contract: the container mounts under the
// default theme as an ARIA radiogroup, marks the active Segment, emits the next
// value on click, and roves with arrow keys (the segmented-control a11y pattern).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { Segment } from "./Segment";
import { SegmentedToggle } from "./SegmentedToggle";

afterEach(cleanup);

function ToggleHarness({
  initialValue = "vault",
  className,
  disabledValues = [],
}: {
  initialValue?: string;
  className?: string;
  disabledValues?: readonly string[];
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <SegmentedToggle
      value={value}
      onChange={setValue}
      ariaLabel="browser mode"
      className={className}
    >
      <Segment value="vault">Vault</Segment>
      <Segment disabled={disabledValues.includes("tree")} value="tree">
        Tree
      </Segment>
      <Segment value="code">Code</Segment>
    </SegmentedToggle>
  );
}

function renderToggle(options: Parameters<typeof ToggleHarness>[0] = {}) {
  render(<ToggleHarness {...options} />);
}

describe("SegmentedToggle + Segment", () => {
  it("renders the segments inside one radiogroup and marks the active one", () => {
    renderToggle({ initialValue: "tree" });
    expect(screen.getByRole("radiogroup", { name: "browser mode" })).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "Tree" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("accepts surface-owned placement classes without changing segment state", () => {
    renderToggle({ className: "w-full" });

    expect(
      screen.getByRole("radiogroup", { name: "browser mode" }).className,
    ).toContain("w-full");
    expect(
      screen.getByRole("radio", { name: "Vault" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("puts only the active segment in the Tab order", () => {
    renderToggle({ initialValue: "vault" });
    const radios = screen.getAllByRole("radio");
    expect(radios[0]!.getAttribute("tabindex")).toBe("0");
    expect(radios.slice(1).every((r) => r.getAttribute("tabindex") === "-1")).toBe(
      true,
    );
  });

  it("emits the next value on click", () => {
    renderToggle();
    fireEvent.click(screen.getByRole("radio", { name: "Code" }));
    expect(
      screen.getByRole("radio", { name: "Code" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("roves, selects, and moves DOM focus with ArrowRight", () => {
    renderToggle();
    const vault = screen.getByRole("radio", { name: "Vault" });
    vault.focus();
    fireEvent.keyDown(vault, {
      key: "ArrowRight",
    });
    const tree = screen.getByRole("radio", { name: "Tree" });
    expect(document.activeElement).toBe(tree);
    expect(tree.getAttribute("aria-checked")).toBe("true");
    expect(tree.getAttribute("tabindex")).toBe("0");
  });

  it("skips disabled segments while retaining one enabled tab stop", () => {
    renderToggle({ disabledValues: ["tree"] });
    const vault = screen.getByRole("radio", { name: "Vault" });
    vault.focus();
    fireEvent.keyDown(vault, { key: "ArrowRight" });

    const tree = screen.getByRole("radio", { name: "Tree" });
    const code = screen.getByRole("radio", { name: "Code" });
    expect(tree.hasAttribute("disabled")).toBe(true);
    expect(tree.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(code);
    expect(code.getAttribute("aria-checked")).toBe("true");
  });
});
