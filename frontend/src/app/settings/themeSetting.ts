// Theme migrated into the settings model (dashboard-settings W05). The engine
// settings registry is now the AUTHORITATIVE home of the theme preference; the
// framework-free platform controller stays the pre-paint localStorage CACHE and
// the <html> applier (no-FOUC guarantee preserved). This app-layer bridge is the
// only place that knows both — it never lives in the platform substrate (which
// must stay wire-free, dashboard-layer-ownership).

import { useEffect } from "react";

import type { ThemePreference } from "../../platform/theme/themeController";
import { useTheme } from "../../platform/theme/useTheme";
import { usePutSettings, useSettings } from "../../stores/server/queries";

const THEME_KEY = "theme";
const THEME_VALUES: readonly ThemePreference[] = [
  "system",
  "light",
  "dark",
  "high-contrast",
];

function isThemePreference(v: string | undefined): v is ThemePreference {
  return v !== undefined && (THEME_VALUES as readonly string[]).includes(v);
}

export interface UseThemeSettingResult {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
}

/**
 * Bridge the theme controller to the engine settings model. Mounted once at the
 * shell top so the reconcile effect always runs (independent of rail state).
 *
 * - On load: when the server carries a theme that differs from the cached
 *   preference, apply it — the server wins; localStorage was only the no-FOUC
 *   pre-paint cache. An absent server theme leaves the cached preference intact.
 * - On change: apply optimistically through the controller (instant, no flash)
 *   AND persist to the server. A theme change made through the settings dialog's
 *   generic control lands on the server, invalidates, and the reconcile effect
 *   applies it here — one authoritative model, two entry points.
 */
export function useThemeSetting(): UseThemeSettingResult {
  const { preference, setPreference: applyLocal } = useTheme();
  const settings = useSettings();
  const putSettings = usePutSettings();
  const serverTheme = settings.data?.global?.[THEME_KEY];

  // Keyed on the server value only: applying updates `preference`, so depending
  // on it would loop. The server value is the reconcile trigger.
  useEffect(() => {
    if (isThemePreference(serverTheme) && serverTheme !== preference) {
      applyLocal(serverTheme);
    }
  }, [serverTheme, preference, applyLocal]);

  const setPreference = (next: ThemePreference) => {
    applyLocal(next); // optimistic apply + localStorage cache (no FOUC, instant)
    putSettings.mutate({ key: THEME_KEY, value: next });
  };

  return { preference, setPreference };
}
