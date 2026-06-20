import { EngineError } from "./engine";
import { normalizeSettingUpdate, usePutSettings } from "./queries";
import type { SettingsEditTarget } from "./settingsSelectors";

export const DEFAULT_SETTINGS_WRITE_ERROR = "Settings update failed";
export const SETTINGS_WRITE_ERROR_MESSAGE_CAP = 240;

export interface SettingsRowWrite {
  key: string;
  value: string;
  target: SettingsEditTarget;
  activeScope: unknown;
}

export interface SettingsRowWriteIntent {
  write: (update: unknown, handlers?: { onError?: (message: string) => void }) => void;
}

export interface NormalizedSettingsRowWrite {
  key: string;
  value: string;
  scope?: string;
}

function settingsRowWriteRecord(update: unknown): Record<string, unknown> {
  return update !== null && typeof update === "object"
    ? (update as Record<string, unknown>)
    : {};
}

export function normalizeSettingsWriteErrorText(message: unknown): string | null {
  if (typeof message !== "string") return null;
  const normalized = message.trim();
  if (normalized.length === 0) return null;
  return normalized.length > SETTINGS_WRITE_ERROR_MESSAGE_CAP
    ? `${normalized.slice(0, SETTINGS_WRITE_ERROR_MESSAGE_CAP - 1)}…`
    : normalized;
}

export function normalizeSettingsRowWrite(
  update: unknown,
): NormalizedSettingsRowWrite | null {
  const row = settingsRowWriteRecord(update);
  return normalizeSettingUpdate({
    key: row.key,
    value: row.value,
    scope: row.target === "scope" ? row.activeScope : undefined,
  });
}

export function settingsWriteErrorMessage(error: unknown): string {
  const engineMessage =
    error instanceof EngineError
      ? normalizeSettingsWriteErrorText(error.errorMessage)
      : null;
  if (engineMessage !== null) return engineMessage;
  const record = settingsRowWriteRecord(error);
  const explicitMessage = normalizeSettingsWriteErrorText(record.errorMessage);
  if (explicitMessage !== null) return explicitMessage;
  const thrownMessage =
    error instanceof Error ? normalizeSettingsWriteErrorText(error.message) : null;
  if (thrownMessage !== null) return thrownMessage;
  const objectMessage = normalizeSettingsWriteErrorText(record.message);
  return objectMessage ?? DEFAULT_SETTINGS_WRITE_ERROR;
}

/**
 * Stores-owned settings row write seam. The view controller owns row target,
 * draft, and error lifecycle; this seam owns the settings mutation payload and
 * typed error-message extraction.
 */
export function useSettingsRowWriteIntent(): SettingsRowWriteIntent {
  const putSettings = usePutSettings();
  return {
    write: (update, handlers) => {
      const normalized = normalizeSettingsRowWrite(update);
      if (normalized === null) return;
      putSettings.mutate(normalized, {
        onError: (error) => {
          handlers?.onError?.(settingsWriteErrorMessage(error));
        },
      });
    },
  };
}
