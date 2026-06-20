import { create } from "zustand";
import { useEffect } from "react";

import { chordToKeycaps } from "../../platform/keymap/chord";
import {
  type KeybindingDef,
  type KeybindingOverrides,
  effectiveChord,
  listKeybindings,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { getKeymapOverrides, registerKeyAction } from "./keymapDispatcher";

/** One shortcut legend row: a human label and the ordered keycaps that trigger it. */
export interface KeyboardShortcutRowView {
  label: string;
  keys: readonly string[];
}

/** A named group of shortcuts rendered under one section label. */
export interface KeyboardShortcutGroupView {
  name: string;
  shortcuts: readonly KeyboardShortcutRowView[];
}

interface KeyboardShortcutsState {
  open: boolean;
  setOpen: (open: unknown) => void;
  openDialog: () => void;
  closeDialog: () => void;
  toggleDialog: () => void;
  reset: () => void;
}

export const KEYBOARD_SHORTCUTS_TOGGLE_ACTION_ID = "app:keyboard-shortcuts";
export const KEYBOARD_SHORTCUTS_TOGGLE_LABEL = "Show keyboard shortcuts";
export const KEYBOARD_SHORTCUTS_TOGGLE_BINDING: KeybindingDef = {
  id: KEYBOARD_SHORTCUTS_TOGGLE_ACTION_ID,
  defaultChord: "?",
  label: KEYBOARD_SHORTCUTS_TOGGLE_LABEL,
  group: "General",
  context: "global",
};

/**
 * Derive the shortcut legend from the keybinding registry — the SINGLE source of
 * truth for what the app binds (keyboard-action-system W02.P07). The hand-
 * transcribed list this replaces could drift from the live handlers; deriving from
 * `listKeybindings()` + the effective overrides means the legend is exactly the
 * set of bound command actions and their effective chords, and re-themes/re-binds
 * with the registry. Groups appear in first-seen registry (id-sorted) order; each
 * row's keys are the effective chord split into platform-aware keycaps. The legend
 * is SPARSE until enrollment (W03/W04) registers bindings — an honest empty legend,
 * never an invented one.
 */
export function deriveKeyboardShortcutGroups(
  defs: readonly KeybindingDef[] = listKeybindings(),
  overrides: KeybindingOverrides = getKeymapOverrides(),
): readonly KeyboardShortcutGroupView[] {
  const byGroup = new Map<string, KeyboardShortcutRowView[]>();
  for (const def of defs) {
    const keys = chordToKeycaps(effectiveChord(def, overrides));
    const rows = byGroup.get(def.group) ?? [];
    rows.push({ label: def.label, keys });
    byGroup.set(def.group, rows);
  }
  return [...byGroup.entries()].map(([name, shortcuts]) => ({ name, shortcuts }));
}

export function normalizeKeyboardShortcutsOpen(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export const useKeyboardShortcutsStore = create<KeyboardShortcutsState>((set) => ({
  open: false,
  setOpen: (open) =>
    set((state) => {
      const normalized = normalizeKeyboardShortcutsOpen(open);
      return normalized === null || state.open === normalized
        ? state
        : { open: normalized };
    }),
  openDialog: () => set({ open: true }),
  closeDialog: () => set({ open: false }),
  toggleDialog: () =>
    set((state) => ({
      open: !(normalizeKeyboardShortcutsOpen(state.open) ?? false),
    })),
  reset: () => set({ open: false }),
}));

export function useKeyboardShortcutsOpen(): boolean {
  return useKeyboardShortcutsStore(
    (state) => normalizeKeyboardShortcutsOpen(state.open) ?? false,
  );
}

export function useKeyboardShortcutGroups(): readonly KeyboardShortcutGroupView[] {
  // Derived from the live registry + effective overrides on every render. The
  // legend opens on demand (the `?` toggle), so deriving at read time keeps it
  // current with any rebinding without a subscription.
  return deriveKeyboardShortcutGroups();
}

export function useKeyboardShortcutsGlobalToggle(): void {
  useEffect(() => {
    const disposeBinding = registerKeybindings([KEYBOARD_SHORTCUTS_TOGGLE_BINDING]);
    const disposeAction = registerKeyAction(KEYBOARD_SHORTCUTS_TOGGLE_ACTION_ID, () => {
      return {
        id: KEYBOARD_SHORTCUTS_TOGGLE_ACTION_ID,
        label: KEYBOARD_SHORTCUTS_TOGGLE_LABEL,
        run: toggleKeyboardShortcuts,
      };
    });
    return () => {
      disposeAction();
      disposeBinding();
    };
  }, []);
}

export function setKeyboardShortcutsOpen(open: unknown): void {
  useKeyboardShortcutsStore.getState().setOpen(open);
}

export function openKeyboardShortcuts(): void {
  useKeyboardShortcutsStore.getState().openDialog();
}

export function closeKeyboardShortcuts(): void {
  useKeyboardShortcutsStore.getState().closeDialog();
}

export function toggleKeyboardShortcuts(): void {
  useKeyboardShortcutsStore.getState().toggleDialog();
}

export function resetKeyboardShortcuts(): void {
  useKeyboardShortcutsStore.getState().reset();
}
