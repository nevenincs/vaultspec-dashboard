// Shared app-chrome builders (background-context-menus): the escape-hatch set, the
// reset-layout time-travel gate + bridge wiring (review #4 residual — proving "Reset
// layout" runs the registered FULL-reset runner, not a no-op), and registry-derived
// accelerators.

import { afterEach, describe, expect, it, vi } from "vitest";

import { registerKeybindings, resetKeybindings } from "../../platform/keymap/registry";
import {
  RESET_LAYOUT_ACTION_ID,
  SETTINGS_ACTION_ID,
  chromeEscapeHatchActions,
  openCommandPaletteAction,
  resetLayoutAction,
  showKeyboardShortcutsAction,
} from "./chromeActions";
import { COMMAND_PALETTE_KEYBINDING } from "./commandPalette";
import { KEYBOARD_SHORTCUTS_TOGGLE_BINDING } from "./keyboardShortcuts";
import { runResetLayout, setResetLayoutRunner } from "./resetLayoutBridge";

afterEach(() => {
  setResetLayoutRunner(null);
  resetKeybindings();
});

describe("chromeEscapeHatchActions", () => {
  it("is the four escape hatches in order", () => {
    expect(chromeEscapeHatchActions().map((a) => a.id)).toEqual([
      "app:command-palette",
      SETTINGS_ACTION_ID,
      "app:keyboard-shortcuts",
      RESET_LAYOUT_ACTION_ID,
    ]);
  });

  it("time-travel gates ONLY reset-layout (the lone mutation)", () => {
    const gated = chromeEscapeHatchActions().filter(
      (a) => a.disabledInTimeTravel === true,
    );
    expect(gated.map((a) => a.id)).toEqual([RESET_LAYOUT_ACTION_ID]);
  });
});

describe("resetLayoutAction <-> reset-layout bridge (review #4)", () => {
  it("its run() invokes the registered FULL-reset runner (not a no-op)", () => {
    const fullReset = vi.fn();
    setResetLayoutRunner(fullReset); // AppShell registers shellActions.resetLayout here
    const action = resetLayoutAction();
    expect(action.run).toBeTypeOf("function");
    action.run!();
    expect(fullReset).toHaveBeenCalledTimes(1);
  });

  it("is inert (no throw) before the shell registers a runner", () => {
    expect(() => resetLayoutAction().run!()).not.toThrow();
    expect(() => runResetLayout()).not.toThrow();
  });

  it("the disposer unregisters the runner", () => {
    const runner = vi.fn();
    setResetLayoutRunner(runner);
    setResetLayoutRunner(null);
    resetLayoutAction().run!();
    expect(runner).not.toHaveBeenCalled();
  });
});

describe("registry-derived accelerators", () => {
  it("derives the chord once the binding is registered, omits it otherwise", () => {
    expect(openCommandPaletteAction().accelerator).toBeUndefined();
    const dispose = registerKeybindings([
      COMMAND_PALETTE_KEYBINDING,
      KEYBOARD_SHORTCUTS_TOGGLE_BINDING,
    ]);
    expect(openCommandPaletteAction().accelerator).toMatch(/K$/); // Ctrl+K / ⌘+K
    expect(showKeyboardShortcutsAction().accelerator).toBe("?");
    dispose();
    expect(openCommandPaletteAction().accelerator).toBeUndefined();
  });
});
