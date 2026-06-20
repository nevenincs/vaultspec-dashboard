import { useEffect } from "react";
import { create } from "zustand";

import type { ChordEvent } from "../../platform/keymap/chord";
import {
  canonicalizeChord,
  chordStringFromEvent,
  chordToKeycaps,
} from "../../platform/keymap/chord";
import {
  type KeybindingDef,
  type KeybindingOverrides,
  conflictsForCandidate,
  effectiveChord,
  listKeybindings,
  normalizeKeybindingId,
  normalizeKeybindingOverrides,
} from "../../platform/keymap/registry";
import type { SettingDef } from "../server/engine";
import {
  decodeBool,
  decodeInt,
  parseKeybindingOverrides,
} from "../server/settingsSelectors";

export interface SettingsEnumControlOptionView {
  value: string;
  active: boolean;
  tabIndex: 0 | -1;
  className: string;
}

export interface SettingsEnumControlView {
  rootClassName: string;
  options: SettingsEnumControlOptionView[];
}

export function deriveSettingsEnumControlView(
  def: SettingDef,
  value: string,
): SettingsEnumControlView {
  const members = def.value_type.type === "enum" ? def.value_type.members : [];
  const activeValue = members.includes(value)
    ? value
    : members.includes(def.default)
      ? def.default
      : members[0];
  return {
    rootClassName:
      "flex shrink-0 flex-wrap gap-fg-0-5 rounded-fg-xs border border-rule bg-paper-sunken p-fg-0-5",
    options: members.map((member) => {
      const active = member === activeValue;
      return {
        value: member,
        active,
        tabIndex: active ? 0 : -1,
        className: `rounded-fg-xs px-fg-2 py-fg-0-5 text-label transition-colors duration-ui-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50 ${
          active
            ? "bg-paper-raised font-medium text-ink shadow-fg-raised"
            : "text-ink-faint hover:text-ink-muted"
        }`,
      };
    }),
  };
}

export function settingsEnumKeyboardTarget(
  options: readonly SettingsEnumControlOptionView[],
  index: number,
  key: string,
): string | null {
  if (
    key !== "ArrowRight" &&
    key !== "ArrowDown" &&
    key !== "ArrowLeft" &&
    key !== "ArrowUp"
  ) {
    return null;
  }
  if (options.length === 0) return null;
  const forward = key === "ArrowRight" || key === "ArrowDown";
  return options[(index + (forward ? 1 : options.length - 1)) % options.length]!.value;
}

export interface SettingsSwitchControlView {
  checked: boolean;
  nextValue: string;
  buttonClassName: string;
  knobClassName: string;
}

export function deriveSettingsSwitchControlView(
  value: string,
): SettingsSwitchControlView {
  const checked = decodeBool(value);
  return {
    checked,
    nextValue: checked ? "false" : "true",
    buttonClassName: `relative inline-flex h-5 w-9 shrink-0 items-center rounded-fg-pill border transition-colors duration-ui-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50 ${
      checked ? "border-accent bg-accent" : "border-rule bg-paper-sunken"
    }`,
    knobClassName: `inline-block size-3.5 rounded-full bg-paper shadow-fg-raised transition-transform duration-ui-fast ${
      checked ? "translate-x-4" : "translate-x-0.5"
    }`,
  };
}

export interface SettingsNumberControlView {
  min: number;
  max: number;
  step: number;
  current: number;
  readout: string;
  ariaValueText: string;
}

export function deriveSettingsNumberControlView(
  def: SettingDef,
  value: string,
): SettingsNumberControlView {
  const range =
    def.value_type.type === "integer" ? def.value_type : { min: 0, max: 100 };
  const fallback = decodeInt(def.default, range.min);
  const decoded = decodeInt(value, fallback);
  const current = Math.min(range.max, Math.max(range.min, decoded));
  const unit = def.unit ?? "";
  return {
    min: range.min,
    max: range.max,
    step: def.step ?? 1,
    current,
    readout: `${current}${unit}`,
    ariaValueText: `${current}${unit}`,
  };
}

export function settingsNumberControlCommitValue(
  def: SettingDef,
  value: unknown,
): string | null {
  const raw =
    typeof value === "number"
      ? Number.isFinite(value)
        ? String(Math.trunc(value))
        : null
      : typeof value === "string"
        ? value.trim()
        : null;
  if (raw === null || !/^-?\d+$/.test(raw)) return null;
  return String(deriveSettingsNumberControlView(def, raw).current);
}

// --- keybinding control view (keyboard-action-system W02.P06) ------------------
//
// The chord-recorder catalog derivation. The component stays thin: this builds
// the grouped rows (label + effective keycaps + override/default state) from the
// pure registry + the parsed override map, and exposes the sparse-map mutations
// (record / reset) and the conflict check so all the keymap logic is unit-testable
// off the DOM. Keeping the override map SPARSE (an entry equal to the default is
// dropped) mirrors the engine's sparse persistence and the registry's
// `effectiveChord` fallback.

export interface SettingsKeybindingRowView {
  /** Stable action id (the override-map key). */
  id: string;
  /** Human label for the row. */
  label: string;
  /** The effective chord string (override when present, else default). */
  chord: string;
  /** The effective chord split into platform-aware display keycaps. */
  keycaps: string[];
  /** True when a user override is in effect (differs from the default). */
  overridden: boolean;
}

export interface SettingsKeybindingGroupView {
  name: string;
  rows: SettingsKeybindingRowView[];
}

export interface SettingsKeybindingControlView {
  /** The decoded current override map (the parsed `value`). */
  overrides: KeybindingOverrides;
  /** The catalog grouped by `def.group`, groups in first-seen registry order. */
  groups: SettingsKeybindingGroupView[];
  /** True when no bindings are registered yet (enrollment not converged). */
  empty: boolean;
}

/**
 * Derive the keybinding recorder catalog from the registry and the current
 * override-map JSON `value`. Pure: reads `listKeybindings()` + the parsed map and
 * produces grouped display rows. Groups preserve the order their first member
 * appears in the id-sorted registry list, so the catalog is stable.
 */
export function deriveSettingsKeybindingControlView(
  value: string,
  defs: readonly KeybindingDef[] = listKeybindings(),
): SettingsKeybindingControlView {
  const overrides = parseKeybindingOverrides(value);
  const byGroup = new Map<string, SettingsKeybindingRowView[]>();
  for (const def of defs) {
    const chord = effectiveChord(def, overrides);
    const row: SettingsKeybindingRowView = {
      id: def.id,
      label: def.label,
      chord,
      keycaps: chordToKeycaps(chord),
      overridden: chord !== def.defaultChord,
    };
    const list = byGroup.get(def.group) ?? [];
    list.push(row);
    byGroup.set(def.group, list);
  }
  const groups: SettingsKeybindingGroupView[] = [...byGroup.entries()].map(
    ([name, rows]) => ({ name, rows }),
  );
  return { overrides, groups, empty: defs.length === 0 };
}

/**
 * The next sparse override map after assigning `rawChord` to `id`. The chord is
 * canonicalized; an unparseable chord is rejected (returns the map unchanged). An
 * assignment equal to the action's default DROPS the override (keeps the map
 * sparse), so resetting-to-default and recording-the-default converge. Returns a
 * NEW object — never mutates the input.
 */
export function nextKeybindingOverrides(
  current: KeybindingOverrides,
  id: unknown,
  rawChord: unknown,
  defs: readonly KeybindingDef[] = listKeybindings(),
): KeybindingOverrides {
  const normalizedId = normalizeSettingsKeybindingId(id);
  if (normalizedId === null) return current;
  const def = defs.find((d) => d.id === normalizedId);
  if (!def || typeof rawChord !== "string") return current;
  const canonical = canonicalizeChord(rawChord);
  if (canonical === null) return current;
  const next: Record<string, string> = {
    ...normalizeKeybindingOverrides(current),
  };
  if (canonical === def.defaultChord) {
    delete next[normalizedId];
  } else {
    next[normalizedId] = canonical;
  }
  return next;
}

/** The next sparse map with `id`'s override removed (reset to default). */
export function clearKeybindingOverride(
  current: KeybindingOverrides,
  id: unknown,
): KeybindingOverrides {
  const normalizedId = normalizeSettingsKeybindingId(id);
  const normalizedCurrent = normalizeKeybindingOverrides(current);
  if (normalizedId === null || !(normalizedId in normalizedCurrent)) {
    return normalizedCurrent;
  }
  const next: Record<string, string> = { ...normalizedCurrent };
  delete next[normalizedId];
  return next;
}

/** Serialize a sparse override map back to the wire JSON object string. */
export function serializeKeybindingOverrides(overrides: KeybindingOverrides): string {
  return JSON.stringify(normalizeKeybindingOverrides(overrides));
}

/** The ids a candidate chord would collide with for `id` (the recorder's
 *  pre-commit warning), under the current overrides. Empty when no conflict. */
export function keybindingConflictIds(
  current: KeybindingOverrides,
  id: unknown,
  rawChord: unknown,
  defs: readonly KeybindingDef[] = listKeybindings(),
): string[] {
  const normalizedId = normalizeSettingsKeybindingId(id);
  const canonical = typeof rawChord === "string" ? canonicalizeChord(rawChord) : null;
  if (normalizedId === null || canonical === null) return [];
  return conflictsForCandidate(
    defs,
    normalizeKeybindingOverrides(current),
    normalizedId,
    canonical,
  );
}

export function keybindingConflictLabels(
  current: KeybindingOverrides,
  id: unknown,
  rawChord: unknown,
  defs: readonly KeybindingDef[] = listKeybindings(),
): string[] {
  const normalizedId = normalizeSettingsKeybindingId(id);
  if (normalizedId === null) return [];
  return keybindingConflictIds(current, normalizedId, rawChord, defs)
    .filter((conflictId) => conflictId !== normalizedId)
    .map((conflictId) => {
      const label = defs.find(
        (def) => normalizeSettingsKeybindingId(def.id) === conflictId,
      )?.label;
      return typeof label === "string" && label.trim().length > 0
        ? label
        : conflictId;
    });
}

export function normalizeSettingsKeybindingId(id: unknown): string | null {
  return normalizeKeybindingId(id);
}

interface SettingsKeybindingRecorderState {
  recordingId: string | null;
  setRecordingId: (id: unknown) => void;
  toggleRecordingId: (id: unknown) => void;
  reset: () => void;
}

export const useSettingsKeybindingRecorderStore =
  create<SettingsKeybindingRecorderState>((set) => ({
    recordingId: null,
    setRecordingId: (id) => set({ recordingId: normalizeSettingsKeybindingId(id) }),
    toggleRecordingId: (id) =>
      set((state) => {
        const normalizedId = normalizeSettingsKeybindingId(id);
        if (normalizedId === null) return state;
        return {
          recordingId: state.recordingId === normalizedId ? null : normalizedId,
        };
      }),
    reset: () => set({ recordingId: null }),
  }));

export function useSettingsKeybindingRecordingId(): string | null {
  return useSettingsKeybindingRecorderStore((state) => state.recordingId);
}

export function toggleSettingsKeybindingRecording(id: unknown): void {
  useSettingsKeybindingRecorderStore.getState().toggleRecordingId(id);
}

export function stopSettingsKeybindingRecording(): void {
  useSettingsKeybindingRecorderStore.getState().setRecordingId(null);
}

export function resetSettingsKeybindingRecorder(): void {
  useSettingsKeybindingRecorderStore.getState().reset();
}

export function settingsKeybindingChordFromEvent(event: ChordEvent): string | null {
  return chordStringFromEvent(event);
}

export interface SettingsKeybindingRecorderInput {
  overrides: KeybindingOverrides;
  commit: (next: KeybindingOverrides) => void;
}

export function useSettingsKeybindingRecorder({
  overrides,
  commit,
}: SettingsKeybindingRecorderInput): string | null {
  const recordingId = useSettingsKeybindingRecordingId();

  useEffect(() => {
    if (recordingId === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        stopSettingsKeybindingRecording();
        return;
      }
      const raw = settingsKeybindingChordFromEvent(event);
      if (raw === null) return;
      event.preventDefault();
      commit(nextKeybindingOverrides(overrides, recordingId, raw));
      stopSettingsKeybindingRecording();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [commit, overrides, recordingId]);

  return recordingId;
}

export interface SettingsTextControlView {
  maxLength: number | undefined;
  className: string;
}

export function deriveSettingsTextControlView(
  def: SettingDef,
): SettingsTextControlView {
  return {
    maxLength: def.value_type.type === "string" ? def.value_type.max_len : undefined,
    className:
      "w-48 rounded-fg-xs border border-rule bg-paper-sunken px-fg-2 py-fg-1 text-body text-ink outline-none transition-colors duration-ui-fast focus-within:border-rule-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50 placeholder:text-ink-faint",
  };
}
