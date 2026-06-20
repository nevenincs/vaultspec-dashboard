// Theme migrated into the settings model (dashboard-settings W05). The engine
// settings registry is now the AUTHORITATIVE home of the theme preference; the
// framework-free platform controller stays the pre-paint localStorage CACHE and
// the <html> applier (no-FOUC guarantee preserved). This app-layer bridge is the
// only place that knows both — it never lives in the platform substrate (which
// must stay wire-free, dashboard-layer-ownership).

import { useEffect } from "react";

import {
  isThemePreference,
  type ThemePreference,
} from "../../platform/theme/themeController";
import { useTheme } from "../../platform/theme/useTheme";
import { useThemeSettingView } from "../../stores/server/queries";
import { useThemeSettingIntent } from "../../stores/server/themeSettingIntent";

function schemaAllowsThemePreference(
  value: string | undefined,
  members: readonly string[],
): value is ThemePreference {
  return isThemePreference(value) && members.includes(value);
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
  const { loading, serverTheme, themeMembers } = useThemeSettingView();
  const themeIntent = useThemeSettingIntent();

  // Reconcile the server value onto the controller, but NEVER while a theme
  // write is in flight: an optimistic change updates `preference` immediately,
  // and reconciling against the still-stale server value would flash the old
  // theme back for a frame (the FOUC-class revert this design exists to prevent,
  // review MEDIUM). The stores intent seeds the cache on success, so once the
  // write settles `serverTheme` already equals `preference` and this is a no-op.
  useEffect(() => {
    if (loading) return;
    if (themeIntent.writePending) return;
    if (
      schemaAllowsThemePreference(serverTheme, themeMembers) &&
      serverTheme !== preference
    ) {
      applyLocal(serverTheme);
    }
  }, [
    loading,
    serverTheme,
    themeMembers,
    preference,
    applyLocal,
    themeIntent.writePending,
  ]);

  const setPreference = (next: ThemePreference) => {
    if (loading) return;
    if (!schemaAllowsThemePreference(next, themeMembers)) return;
    applyLocal(next); // optimistic apply + localStorage cache (no FOUC, instant)
    themeIntent.setThemePreference(next);
  };

  return { preference, setPreference };
}
