import { useEffect } from "react";
import { create } from "zustand";

import {
  type KeybindingDef,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { SEARCH_QUERY_MAX_CHARS, normalizeSearchQuery } from "../searchQuery";
import { registerKeyAction } from "./keymapDispatcher";
import { normalizeViewStoreSessionString } from "./scopeIdentity";

export const COMMAND_PALETTE_OPS_MESSAGE_CAP = 240;
export const COMMAND_PALETTE_QUERY_MAX_CHARS = SEARCH_QUERY_MAX_CHARS;
export const COMMAND_PALETTE_ARMED_COMMAND_ID_MAX_CHARS = 512;
export const COMMAND_PALETTE_ACTION_ID = "app:command-palette";
export const COMMAND_PALETTE_SHORTCUT_LABEL = "Open the command palette";
export const COMMAND_PALETTE_KEYBINDING: KeybindingDef = {
  id: COMMAND_PALETTE_ACTION_ID,
  defaultChord: "Mod+K",
  label: COMMAND_PALETTE_SHORTCUT_LABEL,
  group: "General",
  context: "global",
};

export function normalizeCommandPaletteOpsMessage(message: unknown): string | null {
  if (typeof message !== "string") return null;
  const trimmed = message.trim();
  if (!trimmed) return null;
  return trimmed.length > COMMAND_PALETTE_OPS_MESSAGE_CAP
    ? `${trimmed.slice(0, COMMAND_PALETTE_OPS_MESSAGE_CAP - 1)}…`
    : trimmed;
}

export function normalizeCommandPaletteQuery(query: unknown): string {
  return normalizeSearchQuery(query);
}

export function normalizeCommandPaletteCursor(cursor: unknown): number {
  return typeof cursor === "number" && Number.isFinite(cursor)
    ? Math.max(0, Math.trunc(cursor))
    : 0;
}

export function normalizeCommandPaletteArmedCommandId(
  commandId: unknown,
): string | null {
  if (typeof commandId !== "string") return null;
  const normalized = commandId.trim();
  return normalized.length > 0 &&
    normalized.length <= COMMAND_PALETTE_ARMED_COMMAND_ID_MAX_CHARS
    ? normalized
    : null;
}

export function normalizeCommandPaletteOpsEpoch(epoch: unknown): number | null {
  return typeof epoch === "number" && Number.isSafeInteger(epoch) && epoch >= 0
    ? epoch
    : null;
}

export const normalizeCommandPaletteFeedbackScope = normalizeViewStoreSessionString;

export function normalizeCommandPaletteFeedbackTimeTravel(value: unknown): boolean {
  return value === true;
}

interface CommandPaletteState {
  open: boolean;
  query: string;
  cursor: number;
  armedCommandId: string | null;
  opsMessage: string | null;
  opsEpoch: number;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  setQuery: (query: unknown) => void;
  setCursor: (cursor: unknown) => void;
  setArmedCommandId: (commandId: unknown) => void;
  resetSurfaceState: () => void;
  resetOpsFeedback: () => void;
  beginOpsFeedback: (message: unknown) => number;
  setOpsFeedbackForEpoch: (epoch: unknown, message: unknown) => void;
  reset: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set, get) => ({
  open: false,
  query: "",
  cursor: 0,
  armedCommandId: null,
  opsMessage: null,
  opsEpoch: 0,
  openPalette: () =>
    set((state) => ({
      open: true,
      query: "",
      cursor: 0,
      armedCommandId: null,
      opsMessage: null,
      opsEpoch: state.opsEpoch + 1,
    })),
  closePalette: () =>
    set((state) => ({
      open: false,
      query: "",
      cursor: 0,
      armedCommandId: null,
      opsMessage: null,
      opsEpoch: state.opsEpoch + 1,
    })),
  togglePalette: () =>
    set((state) => ({
      open: !state.open,
      query: "",
      cursor: 0,
      armedCommandId: null,
      opsMessage: null,
      opsEpoch: state.opsEpoch + 1,
    })),
  setQuery: (query) => set({ query: normalizeCommandPaletteQuery(query) }),
  setCursor: (cursor) => set({ cursor: normalizeCommandPaletteCursor(cursor) }),
  setArmedCommandId: (commandId) =>
    set({ armedCommandId: normalizeCommandPaletteArmedCommandId(commandId) }),
  resetSurfaceState: () => set({ query: "", cursor: 0, armedCommandId: null }),
  resetOpsFeedback: () =>
    set((state) => ({ opsMessage: null, opsEpoch: state.opsEpoch + 1 })),
  beginOpsFeedback: (message) => {
    const epoch = get().opsEpoch + 1;
    set({
      opsMessage: normalizeCommandPaletteOpsMessage(message),
      opsEpoch: epoch,
    });
    return epoch;
  },
  setOpsFeedbackForEpoch: (epoch, message) =>
    set((state) => {
      const normalizedEpoch = normalizeCommandPaletteOpsEpoch(epoch);
      const normalizedMessage = normalizeCommandPaletteOpsMessage(message);
      return state.open &&
        normalizedEpoch !== null &&
        normalizedMessage !== null &&
        state.opsEpoch === normalizedEpoch
        ? { opsMessage: normalizedMessage }
        : state;
    }),
  reset: () =>
    set((state) => ({
      open: false,
      query: "",
      cursor: 0,
      armedCommandId: null,
      opsMessage: null,
      opsEpoch: state.opsEpoch + 1,
    })),
}));

export function useCommandPaletteOpen(): boolean {
  return useCommandPaletteStore((state) => state.open);
}

export function useCommandPaletteOpsMessage(): string | null {
  return useCommandPaletteStore((state) => state.opsMessage);
}

export function useCommandPaletteQuery(): string {
  return useCommandPaletteStore((state) => state.query);
}

export function useCommandPaletteCursor(): number {
  return useCommandPaletteStore((state) => state.cursor);
}

export function useCommandPaletteArmedCommandId(): string | null {
  return useCommandPaletteStore((state) => state.armedCommandId);
}

export function openCommandPalette(): void {
  useCommandPaletteStore.getState().openPalette();
}

export function closeCommandPalette(): void {
  useCommandPaletteStore.getState().closePalette();
}

export function toggleCommandPalette(): void {
  useCommandPaletteStore.getState().togglePalette();
}

export function setCommandPaletteQuery(query: unknown): void {
  useCommandPaletteStore.getState().setQuery(query);
}

export function setCommandPaletteCursor(cursor: unknown): void {
  useCommandPaletteStore.getState().setCursor(cursor);
}

export function setCommandPaletteArmedCommandId(commandId: unknown): void {
  useCommandPaletteStore.getState().setArmedCommandId(commandId);
}

export function resetCommandPaletteSurfaceState(): void {
  useCommandPaletteStore.getState().resetSurfaceState();
}

export function resetCommandPaletteOpsFeedback(): void {
  useCommandPaletteStore.getState().resetOpsFeedback();
}

export function beginCommandPaletteOpsFeedback(message: unknown): number {
  return useCommandPaletteStore.getState().beginOpsFeedback(message);
}

export function setCommandPaletteOpsFeedbackForEpoch(
  epoch: unknown,
  message: unknown,
): void {
  useCommandPaletteStore.getState().setOpsFeedbackForEpoch(epoch, message);
}

export function resetCommandPalette(): void {
  useCommandPaletteStore.getState().reset();
}

export function useCommandPaletteGlobalToggle(cancelConfirm: () => void): void {
  const open = useCommandPaletteOpen();
  useEffect(() => {
    const disposeBinding = registerKeybindings([COMMAND_PALETTE_KEYBINDING]);
    const disposeAction = registerKeyAction(COMMAND_PALETTE_ACTION_ID, () => ({
      id: COMMAND_PALETTE_ACTION_ID,
      label: COMMAND_PALETTE_SHORTCUT_LABEL,
      run: () => {
        cancelConfirm();
        resetCommandPaletteOpsFeedback();
        if (open) {
          closeCommandPalette();
          return;
        }
        openCommandPalette();
      },
    }));
    return () => {
      disposeAction();
      disposeBinding();
    };
  }, [cancelConfirm, open]);
}

/**
 * Reset transient command-palette operation feedback when its validity context
 * changes. The feedback line describes one op outcome in one corpus/mode; a
 * scope swap or live/time-travel transition must also bump the epoch so late
 * callbacks cannot resurrect stale text.
 */
export function useCommandPaletteOpsFeedbackBoundary(
  scope: unknown,
  timeTravel: unknown,
): void {
  const normalizedScope = normalizeCommandPaletteFeedbackScope(scope);
  const normalizedTimeTravel = normalizeCommandPaletteFeedbackTimeTravel(timeTravel);
  useEffect(() => {
    resetCommandPaletteOpsFeedback();
  }, [normalizedScope, normalizedTimeTravel]);
}
