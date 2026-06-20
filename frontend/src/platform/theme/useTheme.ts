// useTheme (W01.P02.S09) - the chrome's read/write seam onto the theme
// controller. The app layer cycles or pins the theme through this hook and
// never touches document.documentElement.dataset.theme directly; the
// controller owns <html>, persistence, and OS media listening.

import { useSyncExternalStore } from "react";

import {
  getThemeController,
  type Theme,
  type ThemePreference,
} from "./themeController";

export interface UseThemeResult {
  /** Current preference ("system" or a pinned theme). */
  preference: ThemePreference;
  /** Resolved theme currently applied to <html>. */
  theme: Theme;
  /** Pin a theme or return to "system" auto-switch. */
  setPreference: (preference: ThemePreference) => void;
}

/** Subscribe to the controller's preference + resolved-theme state (Strict-Mode safe). */
export function useTheme(): UseThemeResult {
  const controller = getThemeController();
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    () => `${controller.getPreference()}:${controller.getResolvedTheme()}`,
    () => `${controller.getPreference()}:${controller.getResolvedTheme()}`,
  );
  const [preference, theme] = snapshot.split(":") as [ThemePreference, Theme];
  return {
    preference,
    theme,
    setPreference: controller.setPreference,
  };
}
