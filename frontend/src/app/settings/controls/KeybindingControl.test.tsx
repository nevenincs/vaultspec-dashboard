// @vitest-environment happy-dom
//
// The keybinding chord-recorder control (keyboard-action-system W02.P06), rendered
// as real DOM. It drives the registry (registered/reset per test) and asserts: the
// catalog renders one row per bound action, recording a keystroke calls onChange
// with the SPARSE merged override-map JSON, recording the default DROPS the
// override (sparse), and an existing chord collision surfaces an inline conflict.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setIsMacForTesting } from "../../../platform/keymap/chord";
import {
  registerKeybindings,
  resetKeybindings,
} from "../../../platform/keymap/registry";
import type { SettingDef } from "../../../stores/server/engine";
import { resetSettingsKeybindingRecorder } from "../../../stores/view/settingsControls";
import { KeybindingControl } from "./KeybindingControl";

const def: SettingDef = {
  key: "keybindings",
  value_type: { type: "keybindings", max_entries: 256 },
  default: "{}",
  scope_eligible: false,
  control: "keybinding",
  label: "Keyboard shortcuts",
  description: "",
  group: "Keybindings",
  order: 1,
};

beforeEach(() => {
  resetKeybindings();
  setIsMacForTesting(false); // deterministic: Mod renders "Ctrl"
  registerKeybindings([
    {
      id: "command.palette",
      defaultChord: "Mod+K",
      label: "Open command palette",
      group: "General",
      context: "global",
    },
    {
      id: "help.legend",
      defaultChord: "?",
      label: "Show shortcuts",
      group: "General",
      context: "global",
    },
  ]);
});

afterEach(() => {
  cleanup();
  resetSettingsKeybindingRecorder();
  resetKeybindings();
  setIsMacForTesting(null);
});

describe("KeybindingControl recorder", () => {
  it("renders one row per registered action with its effective keycaps", () => {
    render(<KeybindingControl def={def} value="{}" onChange={vi.fn()} />);
    expect(screen.getByText("Open command palette")).toBeTruthy();
    expect(screen.getByText("Show shortcuts")).toBeTruthy();
    // Mod renders "Ctrl" on non-mac; the chord splits into keycaps.
    expect(screen.getByText("Ctrl")).toBeTruthy();
    expect(screen.getByText("K")).toBeTruthy();
  });

  it("records a captured chord into the sparse override-map JSON", () => {
    const onChange = vi.fn();
    render(<KeybindingControl def={def} value="{}" onChange={onChange} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Record shortcut for Open command palette",
      }),
    );
    // Capturing: a non-default chord assigns an override.
    fireEvent.keyDown(window, { key: "p", metaKey: true });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(JSON.parse(onChange.mock.calls[0]![0] as string)).toEqual({
      "command.palette": "Mod+P",
    });
  });

  it("drops an override when the recorded chord equals the default (sparse)", () => {
    const onChange = vi.fn();
    // Start from an existing override, then re-record the DEFAULT chord.
    render(
      <KeybindingControl
        def={def}
        value='{"command.palette":"Mod+P"}'
        onChange={onChange}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Record shortcut for Open command palette",
      }),
    );
    fireEvent.keyDown(window, { key: "k", metaKey: true }); // == default Mod+K

    expect(JSON.parse(onChange.mock.calls[0]![0] as string)).toEqual({});
  });

  it("surfaces an inline conflict when an override collides with another binding", () => {
    // Override the legend onto Mod+K — collides with command.palette's default.
    render(
      <KeybindingControl
        def={def}
        value='{"help.legend":"Mod+K"}'
        onChange={vi.fn()}
      />,
    );
    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.some((el) => /conflicts with/i.test(el.textContent ?? ""))).toBe(
      true,
    );
  });

  it("escape cancels recording without emitting", () => {
    const onChange = vi.fn();
    render(<KeybindingControl def={def} value="{}" onChange={onChange} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Record shortcut for Show shortcuts",
      }),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
