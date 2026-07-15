import { create } from "zustand";
import { useEffect } from "react";

import {
  chordToKeycaps,
  defaultIsMac,
  type KeycapPresentation,
} from "../../platform/keymap/chord";
import {
  type KeybindingDef,
  type KeybindingGroupPresentation,
  type KeybindingOverrides,
  type KeybindingPresentation,
  effectiveChord,
  listKeybindings,
  normalizeKeybindingGroupPresentation,
  normalizeKeybindingPresentation,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { getKeymapOverrides, registerKeyAction } from "./keymapDispatcher";

/** One shortcut legend row: a human label and the ordered keycaps that trigger it. */
export interface KeyboardShortcutRowView {
  id: string;
  label: KeybindingPresentation;
  keys: readonly KeycapPresentation[];
}

/** A named group of shortcuts rendered under one section label. */
export interface KeyboardShortcutGroupView {
  id: string;
  label: KeybindingGroupPresentation;
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
export const KEYBOARD_SHORTCUTS_TOGGLE_LABEL = {
  key: "common:actions.showKeyboardShortcuts",
} as const;
const GENERAL_KEYBINDING_GROUP = {
  key: "common:shortcutGroups.general",
} as const;
export const KEYBOARD_SHORTCUTS_TOGGLE_BINDING: KeybindingDef = {
  id: KEYBOARD_SHORTCUTS_TOGGLE_ACTION_ID,
  defaultChord: "?",
  label: KEYBOARD_SHORTCUTS_TOGGLE_LABEL,
  group: GENERAL_KEYBINDING_GROUP,
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
  isMac: boolean = defaultIsMac(),
): readonly KeyboardShortcutGroupView[] {
  const byGroup = new Map<
    string,
    {
      id: string;
      label: KeybindingGroupPresentation;
      shortcuts: KeyboardShortcutRowView[];
    }
  >();
  for (const def of defs) {
    const label = normalizeKeybindingPresentation(def.label);
    const group = normalizeKeybindingGroupPresentation(def.group);
    if (label === null || group === null) continue;
    const groupId = `message:${group.key}`;
    const keys = chordToKeycaps(effectiveChord(def, overrides), isMac);
    const row = { id: def.id, label, keys };
    const existing = byGroup.get(groupId);
    if (existing !== undefined) {
      existing.shortcuts.push(row);
      continue;
    }
    byGroup.set(groupId, {
      id: groupId,
      label: group,
      shortcuts: [row],
    });
  }
  return [...byGroup.values()];
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
