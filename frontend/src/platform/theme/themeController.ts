// Theme controller (W01.P02.S09, design-language ADR layer 2).
//
// The single mechanism for the theme model: dark and light are equal peers
// with a first-class high-contrast peer, system auto-switch, and a manual
// override. A theme is applied by setting [data-theme] on <html>; the token
// layer remaps the semantic tier under that selector. No component is aware of
// which theme is active, and the `dark:` utility variant is never used.
//
// Framework-free substrate primitive: no React, no app/, no stores imports.
// The chrome consumes it through the thin useTheme() hook (themeHook.ts).
//
// Preference model:
//   - "system" (default): follow prefers-color-scheme, upgrading to
//     high-contrast when prefers-contrast: more is also set.
//   - an explicit theme name: a manual override that pins the theme.
// The resolved theme (what actually lands on <html>) is recomputed whenever
// the preference changes or, under "system", when the OS media queries flip.

export const THEMES = ["light", "dark", "high-contrast"] as const;
export type Theme = (typeof THEMES)[number];

/** A preference is either "system" auto-switch or a pinned theme. */
export type ThemePreference = "system" | Theme;

const STORAGE_KEY = "vaultspec-theme";

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || isTheme(value);
}

/** Resolve a preference to a concrete theme using the OS media queries. */
export function resolveTheme(
  preference: ThemePreference,
  matchMedia: (q: string) => { matches: boolean } = defaultMatchMedia,
): Theme {
  if (preference !== "system") return preference;
  if (matchMedia("(prefers-contrast: more)").matches) return "high-contrast";
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function defaultMatchMedia(q: string): { matches: boolean } {
  if (typeof window === "undefined" || !window.matchMedia) return { matches: false };
  return window.matchMedia(q);
}

/** Read the persisted preference; falls back to "system". */
export function readStoredPreference(): ThemePreference {
  if (typeof localStorage === "undefined") return "system";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isThemePreference(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

function writeStoredPreference(preference: ThemePreference): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // storage may be unavailable (private mode); the in-memory state still holds.
  }
}

/** Apply a resolved theme to <html> and keep color-scheme in sync. */
function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  // color-scheme lets the UA paint native form controls / scrollbars to match.
  root.style.colorScheme = theme === "light" ? "light" : "dark";
}

export interface ThemeController {
  /** The current preference ("system" or a pinned theme). */
  getPreference(): ThemePreference;
  /** The theme currently applied to <html> after resolution. */
  getResolvedTheme(): Theme;
  /** Set the preference, persist it, re-resolve, and apply to <html>. */
  setPreference(preference: ThemePreference): void;
  /** Subscribe to resolved-theme changes; returns an unsubscribe fn. */
  subscribe(listener: (theme: Theme) => void): () => void;
  /** Detach OS media listeners (call on teardown; rarely needed app-lifetime). */
  destroy(): void;
}

/**
 * Create the theme controller, hydrate <html> from the stored preference, and
 * begin listening to the OS media queries while the preference is "system".
 */
export function createThemeController(): ThemeController {
  let preference = readStoredPreference();
  let resolved = resolveTheme(preference);
  const listeners = new Set<(theme: Theme) => void>();

  const colorSchemeMql =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
  const contrastMql =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-contrast: more)")
      : null;

  const recompute = (): boolean => {
    const next = resolveTheme(preference);
    if (next === resolved) return false;
    resolved = next;
    applyTheme(resolved);
    for (const l of listeners) l(resolved);
    return true;
  };

  // Only "system" follows the OS; an explicit override ignores media flips.
  const onSystemChange = (): void => {
    if (preference === "system") recompute();
  };

  colorSchemeMql?.addEventListener("change", onSystemChange);
  contrastMql?.addEventListener("change", onSystemChange);

  applyTheme(resolved);

  return {
    getPreference: () => preference,
    getResolvedTheme: () => resolved,
    setPreference(next: ThemePreference) {
      const previousPreference = preference;
      preference = next;
      writeStoredPreference(next);
      const resolvedChanged = recompute();
      if (!resolvedChanged && next !== previousPreference) {
        for (const l of listeners) l(resolved);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      colorSchemeMql?.removeEventListener("change", onSystemChange);
      contrastMql?.removeEventListener("change", onSystemChange);
      listeners.clear();
    },
  };
}

/** The app-lifetime singleton controller; created lazily on first access. */
let singleton: ThemeController | null = null;

export function getThemeController(): ThemeController {
  if (!singleton) singleton = createThemeController();
  return singleton;
}
