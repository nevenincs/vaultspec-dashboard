// @vitest-environment happy-dom
//
// The token-driven control kit (dashboard-settings W03.P07), rendered through
// the SettingControl dispatch as real DOM. Each control's own contract: it
// reflects the current string value, emits the next string value on
// interaction, and exposes the right ARIA role. Core vitest matchers only.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SettingDef } from "../../../stores/server/engine";
import { SettingControl } from "./registry";

afterEach(cleanup);

const enumDef: SettingDef = {
  key: "theme",
  value_type: { type: "enum", members: ["system", "light", "dark"] },
  default: "system",
  scope_eligible: false,
  control: "segmented",
  label: "Theme",
  description: "",
  group: "Appearance",
  order: 1,
};

const boolDef: SettingDef = {
  key: "reduce_motion",
  value_type: { type: "bool" },
  default: "false",
  scope_eligible: false,
  control: "switch",
  label: "Reduce motion",
  description: "",
  group: "Appearance",
  order: 2,
};

const stringDef: SettingDef = {
  key: "label",
  value_type: { type: "string", max_len: 40 },
  default: "",
  scope_eligible: false,
  control: "text",
  label: "Label",
  description: "",
  group: "General",
  order: 1,
};

const intDef: SettingDef = {
  key: "node_label_scale",
  value_type: { type: "integer", min: 50, max: 200 },
  default: "100",
  scope_eligible: true,
  control: "slider",
  label: "Label size",
  description: "",
  group: "Graph",
  order: 2,
  step: 10,
  unit: "%",
};

describe("SettingControl dispatch + control kit", () => {
  it("segmented (enum): marks the active member and emits the next on click", () => {
    const onChange = vi.fn();
    render(<SettingControl def={enumDef} value="dark" onChange={onChange} />);
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(group).toBeTruthy();
    const dark = screen.getByRole("radio", { name: "Dark" });
    expect(dark.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(onChange).toHaveBeenCalledWith("light");
  });

  it("segmented (enum): arrow keys rove and emit", () => {
    const onChange = vi.fn();
    render(<SettingControl def={enumDef} value="system" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "System" }), {
      key: "ArrowRight",
    });
    expect(onChange).toHaveBeenCalledWith("light");
  });

  it("switch (bool): reflects state and toggles the wire value", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SettingControl def={boolDef} value="false" onChange={onChange} />,
    );
    const sw = screen.getByRole("switch", { name: "Reduce motion" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith("true");
    rerender(<SettingControl def={boolDef} value="true" onChange={onChange} />);
    expect(
      screen
        .getByRole("switch", { name: "Reduce motion" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("text (string): reflects value and emits raw input", () => {
    const onChange = vi.fn();
    render(<SettingControl def={stringDef} value="hi" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "Label" }) as HTMLInputElement;
    expect(input.value).toBe("hi");
    expect(input.maxLength).toBe(40);
    fireEvent.change(input, { target: { value: "there" } });
    expect(onChange).toHaveBeenCalledWith("there");
  });

  it("slider (integer): reflects value/bounds and emits a decimal string", () => {
    const changes: string[] = [];
    render(
      <SettingControl
        def={intDef}
        value="120"
        onChange={(next) => changes.push(next)}
      />,
    );
    const slider = screen.getByRole("slider", {
      name: "Label size",
    }) as HTMLInputElement;
    expect(slider.value).toBe("120");
    expect(slider.min).toBe("50");
    expect(slider.max).toBe("200");
    expect(slider.step).toBe("10");
    // The readout shows the value + unit.
    expect(screen.getByText("120%")).toBeTruthy();
    fireEvent.change(slider, { target: { value: "150" } });
    expect(changes).toEqual(["150"]);
  });

  it("disabled: controls do not emit", () => {
    const onChange = vi.fn();
    render(<SettingControl def={enumDef} value="dark" onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
