// @vitest-environment happy-dom
//
// The keyboard-shortcuts surface (figma-frontend-rewrite W03.P09.S13). It is a
// self-contained legend: the global "?" key toggles it, it renders the real
// shortcut groups as kit ListRows with Kbd keycaps, and Escape dismisses it
// through the shared Dialog. These assert the open/close contract and that the
// legend names the contract the app actually implements.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { registerKeybindings, resetKeybindings } from "../../platform/keymap/registry";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
} from "../../localization/testing";
import {
  KEYBOARD_SHORTCUTS_TOGGLE_LABEL,
  useKeyboardShortcutsStore,
} from "../../stores/view/keyboardShortcuts";
import {
  resetKeyActions,
  useKeymapDispatcher,
} from "../../stores/view/keymapDispatcher";
import { KeyboardShortcuts } from "./KeyboardShortcuts";

function KeyboardShortcutsHarness() {
  useKeymapDispatcher();
  return <KeyboardShortcuts />;
}

function renderKeyboardShortcuts() {
  const runtime = createTestLocalizationRuntime();
  const result = render(
    <I18nextProvider i18n={runtime}>
      <KeyboardShortcutsHarness />
    </I18nextProvider>,
  );
  return { ...result, runtime };
}

afterEach(() => {
  cleanup();
  resetKeyActions();
  resetKeybindings();
  useKeyboardShortcutsStore.getState().reset();
});

describe("KeyboardShortcuts", () => {
  it("is closed until the global ? key opens it", () => {
    renderKeyboardShortcuts();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(window, { key: "?" });
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("Keyboard shortcuts")).toBeTruthy();
    expect(screen.getByText("Review available keyboard shortcuts.")).toBeTruthy();
  });

  it("renders the real shortcut groups with keycaps", () => {
    renderKeyboardShortcuts();
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByText("General")).toBeTruthy();
    expect(screen.getByText(KEYBOARD_SHORTCUTS_TOGGLE_LABEL)).toBeTruthy();
    const caps = screen.getAllByText("?");
    expect(caps.some((el) => el.tagName.toLowerCase() === "kbd")).toBe(true);
  });

  it("does not open while typing ? inside a form field", () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <input aria-label="query" />
        <KeyboardShortcutsHarness />
      </I18nextProvider>,
    );
    const input = screen.getByLabelText("query");
    input.focus();
    fireEvent.keyDown(input, { key: "?" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape dismisses the legend", () => {
    renderKeyboardShortcuts();
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("updates typed shortcut copy without replacing stable group or row nodes", async () => {
    const dispose = registerKeybindings([
      {
        id: "test.retry",
        defaultChord: "Mod+R",
        label: { key: "common:actions.retry" },
        group: { key: "common:actions.showKeyboardShortcuts" },
        context: "global",
      },
    ]);
    const { runtime } = renderKeyboardShortcuts();
    fireEvent.keyDown(window, { key: "?" });

    const sourceTitle = screen.getByText("Keyboard shortcuts");
    const sourceRow = screen.getByText("Retry").closest("li");
    const sourceGroup = sourceRow?.closest("section") ?? null;
    expect(sourceGroup).not.toBeNull();
    expect(sourceRow).not.toBeNull();

    await act(async () => runtime.changeLanguage(ltrTestLocale));

    expect(screen.getByText(ltrTestResources.common.shortcutDialog.title)).toBe(
      sourceTitle,
    );
    const localizedRow = screen
      .getByText(ltrTestResources.common.actions.retry)
      .closest("li");
    expect(localizedRow).toBe(sourceRow);
    expect(localizedRow?.closest("section")).toBe(sourceGroup);
    expect(sourceGroup?.textContent).toContain(
      ltrTestResources.common.actions.showKeyboardShortcuts,
    );
    dispose();
  });
});
