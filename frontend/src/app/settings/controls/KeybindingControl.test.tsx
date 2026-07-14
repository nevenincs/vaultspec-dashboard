// @vitest-environment happy-dom
//
// The keybinding chord-recorder control (keyboard-action-system W02.P06), rendered
// as real DOM. It drives the registry (registered/reset per test) and asserts: the
// catalog renders one row per bound action, recording a keystroke calls onChange
// with the SPARSE merged override-map JSON, recording the default DROPS the
// override (sparse), and an existing chord collision surfaces an inline conflict.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setIsMacForTesting } from "../../../platform/keymap/chord";
import {
  legacyKeybindingPresentation,
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

function KeybindingHarness({ initialValue = "{}" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return (
    <>
      <output data-testid="keybinding-value">{value}</output>
      <KeybindingControl def={def} value={value} onChange={setValue} />
    </>
  );
}

beforeEach(() => {
  resetKeybindings();
  setIsMacForTesting(false); // deterministic: Mod renders "Ctrl"
  registerKeybindings([
    {
      id: "command.palette",
      defaultChord: "Mod+K",
      label: legacyKeybindingPresentation("Open command palette"),
      group: legacyKeybindingPresentation("General"),
      context: "global",
    },
    {
      id: "help.legend",
      defaultChord: "?",
      label: legacyKeybindingPresentation("Show shortcuts"),
      group: legacyKeybindingPresentation("General"),
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
    render(<KeybindingHarness />);
    expect(screen.getByText("Open command palette")).toBeTruthy();
    expect(screen.getByText("Show shortcuts")).toBeTruthy();
    // Mod renders "Ctrl" on non-mac; the chord splits into keycaps.
    expect(screen.getByText("Ctrl")).toBeTruthy();
    expect(screen.getByText("K")).toBeTruthy();
  });

  it("records a captured chord into the sparse override-map JSON", () => {
    render(<KeybindingHarness />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Record shortcut for Open command palette",
      }),
    );
    // Capturing: a non-default chord assigns an override.
    fireEvent.keyDown(window, { key: "p", metaKey: true });

    expect(
      JSON.parse(screen.getByTestId("keybinding-value").textContent ?? ""),
    ).toEqual({
      "command.palette": "Mod+P",
    });
  });

  it("drops an override when the recorded chord equals the default (sparse)", () => {
    // Start from an existing override, then re-record the DEFAULT chord.
    render(<KeybindingHarness initialValue='{"command.palette":"Mod+P"}' />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Record shortcut for Open command palette",
      }),
    );
    fireEvent.keyDown(window, { key: "k", metaKey: true }); // == default Mod+K

    expect(
      JSON.parse(screen.getByTestId("keybinding-value").textContent ?? ""),
    ).toEqual({});
  });

  it("surfaces an inline conflict when an override collides with another binding", () => {
    // Override the legend onto Mod+K — collides with command.palette's default.
    render(<KeybindingHarness initialValue='{"help.legend":"Mod+K"}' />);
    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.some((el) => /conflicts with/i.test(el.textContent ?? ""))).toBe(
      true,
    );
  });

  it("escape cancels recording without emitting", () => {
    render(<KeybindingHarness />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Record shortcut for Show shortcuts",
      }),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("keybinding-value").textContent).toBe("{}");
  });
});
