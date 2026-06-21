// Dev-only degradation override state. The degradation matrix itself is a pure
// app projection, but the override toggles are shared chrome state, so the
// mutable store lives in stores/view.

import { create } from "zustand";

import type { DegradationInputs } from "../server/degradationInputs";

interface DegradationState {
  /** Dev overrides — null means "use the real condition". */
  overrides: Partial<DegradationInputs> | null;
  /** Whether the dev-only degradation switch panel is expanded. */
  open: boolean;
  setOpen: (open: unknown) => void;
  setOverride: (key: unknown, value: unknown) => void;
  clearOverrides: () => void;
  /** Combine real inputs with any debug overrides. */
  resolve: (real: DegradationInputs) => DegradationInputs;
}

const DEGRADATION_BOOLEAN_KEYS = new Set<keyof DegradationInputs>([
  "ragDown",
  "dateMandateMissing",
  "streamLost",
  "noVault",
]);

const DEGRADATION_NUMBER_KEYS = new Set<keyof DegradationInputs>(["brokenLinkCount"]);

export function normalizeDegradationDebugOpen(open: unknown): boolean | null {
  return typeof open === "boolean" ? open : null;
}

export function normalizeDegradationOverrideKey(
  key: unknown,
): keyof DegradationInputs | null {
  return typeof key === "string" &&
    (DEGRADATION_BOOLEAN_KEYS.has(key as keyof DegradationInputs) ||
      DEGRADATION_NUMBER_KEYS.has(key as keyof DegradationInputs))
    ? (key as keyof DegradationInputs)
    : null;
}

export function normalizeDegradationOverrideValue(
  key: keyof DegradationInputs,
  value: unknown,
): boolean | number | null | undefined {
  if (value === null) return null;
  if (DEGRADATION_BOOLEAN_KEYS.has(key)) {
    return typeof value === "boolean" ? value : undefined;
  }
  if (DEGRADATION_NUMBER_KEYS.has(key)) {
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, Math.floor(value))
      : undefined;
  }
  return undefined;
}

export const useDegradationStore = create<DegradationState>((set, get) => ({
  overrides: null,
  open: false,
  setOpen: (open) =>
    set((state) => {
      const normalized = normalizeDegradationDebugOpen(open);
      return normalized === null || state.open === normalized
        ? state
        : { open: normalized };
    }),
  setOverride: (key, value) =>
    set((state) => {
      const overrideKey = normalizeDegradationOverrideKey(key);
      if (overrideKey === null) return state;
      const overrideValue = normalizeDegradationOverrideValue(overrideKey, value);
      if (overrideValue === undefined) return state;
      const overrides = { ...(state.overrides ?? {}) };
      if (overrideValue === null) delete overrides[overrideKey];
      else (overrides as Record<string, boolean | number>)[overrideKey] = overrideValue;
      return { overrides: Object.keys(overrides).length > 0 ? overrides : null };
    }),
  clearOverrides: () => set({ overrides: null }),
  resolve: (real) => ({ ...real, ...(get().overrides ?? {}) }),
}));

export function useDegradationOverrides(): Partial<DegradationInputs> | null {
  return useDegradationStore((state) => state.overrides);
}

export function useDegradationDebugOpen(): boolean {
  return useDegradationStore((state) => state.open);
}

export function openDegradationDebug(): void {
  useDegradationStore.getState().setOpen(true);
}

export function closeDegradationDebug(): void {
  useDegradationStore.getState().setOpen(false);
}

export function setDegradationOverride(key: unknown, value: unknown): void {
  useDegradationStore.getState().setOverride(key, value);
}

export function clearDegradationOverrides(): void {
  useDegradationStore.getState().clearOverrides();
}

export function resolveDegradationInputs(real: DegradationInputs): DegradationInputs {
  return useDegradationStore.getState().resolve(real);
}
