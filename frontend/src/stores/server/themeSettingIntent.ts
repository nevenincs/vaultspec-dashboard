import { useCallback, useMemo, useRef } from "react";

import { isThemePreference } from "../../platform/theme/themeController";
import { usePutSettings } from "./queries";
import { CONSUMED_SETTING_KEYS } from "./settingsSelectors";

export interface ThemeSettingIntent {
  writePending: boolean;
  setThemePreference: (value: unknown) => void;
}

export function normalizeThemeSettingPreference(value: unknown): string | null {
  return isThemePreference(value) ? value : null;
}

/**
 * Stores-owned write seam for the platform theme bridge. App chrome may apply
 * the local no-FOUC theme cache, but the engine setting key and settings mutation
 * stay in the stores layer.
 */
export function useThemeSettingIntent(): ThemeSettingIntent {
  const putSettings = usePutSettings();
  const mutateRef = useRef(putSettings.mutate);
  mutateRef.current = putSettings.mutate;

  const setThemePreference = useCallback((value: unknown) => {
    const normalized = normalizeThemeSettingPreference(value);
    if (normalized === null) return;
    mutateRef.current({ key: CONSUMED_SETTING_KEYS.theme, value: normalized });
  }, []);

  return useMemo(
    () => ({ writePending: putSettings.isPending, setThemePreference }),
    [putSettings.isPending, setThemePreference],
  );
}
