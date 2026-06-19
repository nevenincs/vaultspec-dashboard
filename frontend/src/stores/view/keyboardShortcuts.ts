import { create } from "zustand";
import { useEffect } from "react";

import { chordToKeycaps } from "../../platform/keymap/chord";
import {
  type KeybindingDef,
  type KeybindingOverrides,
  effectiveChord,
  listKeybindings,
} from "../../platform/keymap/registry";
import { getKeymapOverrides } from "./keymapDispatcher";

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
  openDialog: () => void;
  closeDialog: () => void;
  toggleDialog: () => void;
  reset: () => void;
}

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

export const useKeyboardShortcutsStore = create<KeyboardShortcutsState>((set) => ({
  open: false,
  openDialog: () => set({ open: true }),
  closeDialog: () => set({ open: false }),
  toggleDialog: () => set((state) => ({ open: !state.open })),
  reset: () => set({ open: false }),
}));

export function useKeyboardShortcutsOpen(): boolean {
  return useKeyboardShortcutsStore((state) => state.open);
}

export function useKeyboardShortcutGroups(): readonly KeyboardShortcutGroupView[] {
  // Derived from the live registry + effective overrides on every render. The
  // legend opens on demand (the `?` toggle), so deriving at read time keeps it
  // current with any rebinding without a subscription.
  return deriveKeyboardShortcutGroups();
}

function isKeyboardShortcutsFormTarget(target: EventTarget | null): boolean {
  return (
    typeof HTMLElement !== "undefined" &&
    target instanceof HTMLElement &&
    /^(input|textarea|select)$/i.test(target.tagName)
  );
}

export interface KeyboardShortcutsKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

export function shouldToggleKeyboardShortcuts(
  event: KeyboardShortcutsKeyEvent,
): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (isKeyboardShortcutsFormTarget(event.target)) return false;
  return event.key === "?";
}

export function useKeyboardShortcutsGlobalToggle(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!shouldToggleKeyboardShortcuts(event)) return;
      event.preventDefault();
      toggleKeyboardShortcuts();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
