import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const SETTINGS_CONTINUOUS_COMMIT_MS = 250;
export const SETTINGS_CONTROL_DRAFT_MAX_CHARS = 4096;

interface SettingsControlDraftOptions {
  controlValue: unknown;
  continuous: unknown;
  maxLength?: unknown;
  commit: (next: unknown) => void;
  onCancelPending?: () => void;
}

export interface SettingsControlDraft {
  value: string;
  change: (next: unknown) => void;
  clearPending: () => void;
}

export function normalizeSettingsControlDraftMaxLength(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return SETTINGS_CONTROL_DRAFT_MAX_CHARS;
  }
  return Math.min(Math.floor(value), SETTINGS_CONTROL_DRAFT_MAX_CHARS);
}

export function normalizeSettingsControlDraftValue(
  value: unknown,
  maxLength?: unknown,
): string {
  const normalized = typeof value === "string" ? value : "";
  const normalizedMaxLength = normalizeSettingsControlDraftMaxLength(maxLength);
  return normalized.slice(0, normalizedMaxLength);
}

export function normalizeSettingsControlDraftContinuous(value: unknown): boolean {
  return value === true;
}

/**
 * Shared draft protocol for schema-driven settings controls.
 *
 * Discrete controls commit immediately. Continuous controls (text/slider) keep a
 * local string draft for immediate feedback and debounce the write-through. When
 * the canonical server value moves underneath a pending draft, the draft is
 * cancelled so a stale delayed PUT cannot resurrect the old value.
 */
export function useSettingsControlDraft({
  controlValue,
  continuous,
  maxLength,
  commit,
  onCancelPending,
}: SettingsControlDraftOptions): SettingsControlDraft {
  const normalizedMaxLength = normalizeSettingsControlDraftMaxLength(maxLength);
  const normalizedControlValue = normalizeSettingsControlDraftValue(
    controlValue,
    normalizedMaxLength,
  );
  const isContinuous = normalizeSettingsControlDraftContinuous(continuous);
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousControlValue = useRef(normalizedControlValue);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const onCancelPendingRef = useRef(onCancelPending);
  onCancelPendingRef.current = onCancelPending;

  const clearPending = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setDraft(null);
  }, []);

  const change = useCallback(
    (next: unknown) => {
      const normalized = normalizeSettingsControlDraftValue(next, normalizedMaxLength);
      if (!isContinuous) {
        commitRef.current(normalized);
        return;
      }
      setDraft(normalized);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(
        () => commitRef.current(normalized),
        SETTINGS_CONTINUOUS_COMMIT_MS,
      );
    },
    [isContinuous, normalizedMaxLength],
  );

  useEffect(() => {
    if (draft !== null && draft === normalizedControlValue) setDraft(null);
  }, [draft, normalizedControlValue]);

  useEffect(() => {
    const previous = previousControlValue.current;
    previousControlValue.current = normalizedControlValue;
    if (
      draft !== null &&
      previous !== normalizedControlValue &&
      draft !== normalizedControlValue
    ) {
      clearPending();
      onCancelPendingRef.current?.();
    }
  }, [clearPending, normalizedControlValue, draft]);

  useEffect(() => () => clearPending(), [clearPending]);

  const value = draft ?? normalizedControlValue;

  return useMemo(
    () => ({
      value,
      change,
      clearPending,
    }),
    [change, clearPending, value],
  );
}
