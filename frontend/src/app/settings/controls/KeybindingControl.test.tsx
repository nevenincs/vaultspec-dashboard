// @vitest-environment happy-dom
//
// The keybinding chord-recorder control (keyboard-action-system W02.P06), rendered
// as real DOM. It drives the registry (registered/reset per test) and asserts: the
// catalog renders one row per bound action, recording a keystroke calls onChange
// with the SPARSE merged override-map JSON, recording the default DROPS the
// override (sparse), and an existing chord collision surfaces an inline conflict.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
} from "../../../localization/testing";
import {
  registerKeybindings,
  resetKeybindings,
} from "../../../platform/keymap/registry";
import type { SettingDef } from "../../../stores/server/engine";
import {
  resetSettingsKeybindingRecorder,
  useSettingsKeybindingRecorderStore,
} from "../../../stores/view/settingsControls";
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
      <div data-testid="keybinding-control">
        <KeybindingControl def={def} value={value} onChange={setValue} />
      </div>
    </>
  );
}

function renderKeybindingControl(initialValue = "{}") {
  const runtime = createTestLocalizationRuntime();
  const result = render(
    <I18nextProvider i18n={runtime}>
      <KeybindingHarness initialValue={initialValue} />
    </I18nextProvider>,
  );
  return { ...result, runtime };
}

beforeEach(() => {
  resetKeybindings();
  registerKeybindings([
    {
      id: "command.palette",
      defaultChord: "Ctrl+K",
      label: { key: "common:actions.retry" },
      group: { key: "common:shortcutDialog.title" },
      context: "global",
    },
    {
      id: "help.legend",
      defaultChord: "ArrowLeft",
      label: { key: "common:actions.showKeyboardShortcuts" },
      group: { key: "common:shortcutDialog.title" },
      context: "global",
    },
  ]);
});

afterEach(() => {
  cleanup();
  resetSettingsKeybindingRecorder();
  resetKeybindings();
});

describe("KeybindingControl recorder", () => {
  it("renders one row per registered action with its effective keycaps", () => {
    renderKeybindingControl();
    expect(screen.getByText("Keyboard shortcuts")).toBeTruthy();
    expect(screen.getByText("Retry")).toBeTruthy();
    expect(screen.getByText("Show keyboard shortcuts")).toBeTruthy();
    expect(screen.getByText("Ctrl")).toBeTruthy();
    expect(screen.getByText("K")).toBeTruthy();
    expect(screen.getByText("Left arrow")).toBeTruthy();
  });

  it("records a captured chord into the sparse override-map JSON", () => {
    renderKeybindingControl();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Record a shortcut for Retry",
      }),
    );
    fireEvent.keyDown(window, { key: "p", ctrlKey: true });

    expect(
      JSON.parse(screen.getByTestId("keybinding-value").textContent ?? ""),
    ).toEqual({
      "command.palette": "Ctrl+P",
    });
  });

  it("drops an override when the recorded chord equals the default (sparse)", () => {
    renderKeybindingControl('{"command.palette":"Ctrl+P"}');
    fireEvent.click(
      screen.getByRole("button", {
        name: "Record a shortcut for Retry",
      }),
    );
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(
      JSON.parse(screen.getByTestId("keybinding-value").textContent ?? ""),
    ).toEqual({});
  });

  it("reactively localizes complete conflicts and recorder accessibility names", async () => {
    const { runtime } = renderKeybindingControl('{"help.legend":"Ctrl+K"}');

    expect(
      screen.getByText(
        "This shortcut is already assigned to Retry. Choose another shortcut.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Record a shortcut for Show keyboard shortcuts",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Reset the shortcut for Show keyboard shortcuts",
      }),
    ).toBeTruthy();
    const control = screen.getByTestId("keybinding-control");
    expect(control.textContent).not.toContain("command.palette");
    expect(control.textContent).not.toContain("help.legend");

    await act(async () => runtime.changeLanguage(ltrTestLocale));

    expect(
      screen.getByText(
        "Ce raccourci est déjà attribué à Réessayer. Choisissez un autre raccourci.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Enregistrer un raccourci pour Afficher les raccourcis clavier",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Réinitialiser le raccourci pour Afficher les raccourcis clavier",
      }),
    ).toBeTruthy();
  });

  it("reactively localizes named keycaps without remounting them", async () => {
    const { runtime } = renderKeybindingControl();
    const sourceKeycap = screen.getByText("Left arrow");

    await act(async () => runtime.changeLanguage(ltrTestLocale));

    expect(screen.getByText(ltrTestResources.common.keycaps.arrowLeft)).toBe(
      sourceKeycap,
    );
  });

  it("escape cancels recording without emitting", () => {
    renderKeybindingControl();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Record a shortcut for Show keyboard shortcuts",
      }),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("keybinding-value").textContent).toBe("{}");
  });

  it("preserves active recording across a locale change and captures the next key", async () => {
    const { runtime } = renderKeybindingControl();
    const sourceButton = screen.getByRole("button", {
      name: "Record a shortcut for Retry",
    });
    const sourceRow = sourceButton.closest("li");
    expect(sourceRow).not.toBeNull();

    fireEvent.click(sourceButton);
    expect(useSettingsKeybindingRecorderStore.getState().recordingId).toBe(
      "command.palette",
    );
    expect(screen.getByText("Press a key…")).toBeTruthy();

    await act(async () => runtime.changeLanguage(ltrTestLocale));

    const translatedButton = screen.getByRole("button", {
      name: "Enregistrer un raccourci pour Réessayer",
    });
    expect(translatedButton).toBe(sourceButton);
    expect(translatedButton.closest("li")).toBe(sourceRow);
    expect(useSettingsKeybindingRecorderStore.getState().recordingId).toBe(
      "command.palette",
    );
    expect(screen.getByText(ltrTestResources.common.shortcutSettings.recording)).toBe(
      translatedButton,
    );

    fireEvent.keyDown(window, { key: "p", ctrlKey: true });
    expect(
      JSON.parse(screen.getByTestId("keybinding-value").textContent ?? ""),
    ).toEqual({ "command.palette": "Ctrl+P" });
    expect(useSettingsKeybindingRecorderStore.getState().recordingId).toBeNull();
  });

  it("uses safe catalog copy when no shortcuts are available", async () => {
    resetKeybindings();
    const { runtime } = renderKeybindingControl();
    expect(screen.getByText("No keyboard shortcuts available")).toBeTruthy();

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByText(ltrTestResources.common.shortcutSettings.empty),
    ).toBeTruthy();
  });
});
