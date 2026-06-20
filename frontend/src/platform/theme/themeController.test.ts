// @vitest-environment happy-dom
//
// The theme controller owns <html> data-theme, localStorage persistence, and
// OS media listening, so it needs a DOM. resolveTheme stays pure (injected
// matchMedia); the controller tests exercise real localStorage + dataset.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createThemeController,
  isThemePreference,
  resolveTheme,
} from "./themeController";

// A controllable matchMedia stub: one MediaQueryList per query string with a
// settable `matches` and real add/removeEventListener so the controller's
// system-follow path is exercised against actual listener semantics.
function makeMatchMedia(initial: Record<string, boolean>) {
  const state: Record<string, boolean> = { ...initial };
  const listeners = new Map<string, Set<() => void>>();
  const mql = (query: string) => ({
    get matches() {
      return state[query] ?? false;
    },
    media: query,
    addEventListener: (_: string, cb: () => void) => {
      if (!listeners.has(query)) listeners.set(query, new Set());
      listeners.get(query)!.add(cb);
    },
    removeEventListener: (_: string, cb: () => void) => {
      listeners.get(query)?.delete(cb);
    },
  });
  const flip = (query: string, value: boolean) => {
    state[query] = value;
    for (const cb of listeners.get(query) ?? []) cb();
  };
  return { mql, flip };
}

describe("resolveTheme", () => {
  it("returns a pinned preference verbatim, ignoring the OS", () => {
    const m = makeMatchMedia({ "(prefers-color-scheme: dark)": true });
    expect(resolveTheme("light", m.mql)).toBe("light");
    expect(resolveTheme("dark", m.mql)).toBe("dark");
    expect(resolveTheme("high-contrast", m.mql)).toBe("high-contrast");
  });

  it("follows prefers-color-scheme under system", () => {
    const dark = makeMatchMedia({ "(prefers-color-scheme: dark)": true });
    const light = makeMatchMedia({ "(prefers-color-scheme: dark)": false });
    expect(resolveTheme("system", dark.mql)).toBe("dark");
    expect(resolveTheme("system", light.mql)).toBe("light");
  });

  it("upgrades to high-contrast when prefers-contrast: more is set", () => {
    const m = makeMatchMedia({
      "(prefers-color-scheme: dark)": false,
      "(prefers-contrast: more)": true,
    });
    expect(resolveTheme("system", m.mql)).toBe("high-contrast");
  });
});

describe("createThemeController", () => {
  const realMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  function install(initial: Record<string, boolean>) {
    const m = makeMatchMedia(initial);
    // @ts-expect-error - assign the stub onto window for the controller to read.
    window.matchMedia = m.mql;
    return m;
  }

  it("applies the resolved system theme to <html> on creation", () => {
    install({ "(prefers-color-scheme: dark)": true });
    const c = createThemeController();
    expect(c.getResolvedTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    c.destroy();
  });

  it("pins a manual override and persists it, ignoring later OS flips", () => {
    const m = install({ "(prefers-color-scheme: dark)": false });
    const c = createThemeController();
    expect(c.getResolvedTheme()).toBe("light");

    c.setPreference("dark");
    expect(c.getPreference()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("vaultspec-theme")).toBe("dark");

    // An OS flip must NOT move a pinned theme.
    m.flip("(prefers-color-scheme: dark)", true);
    expect(c.getResolvedTheme()).toBe("dark");
    c.destroy();
  });

  it("re-resolves on OS change while preference is system", () => {
    const m = install({ "(prefers-color-scheme: dark)": false });
    const c = createThemeController();
    expect(c.getResolvedTheme()).toBe("light");

    const seen: string[] = [];
    c.subscribe((t) => seen.push(t));
    m.flip("(prefers-color-scheme: dark)", true);

    expect(c.getResolvedTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(seen).toEqual(["dark"]);
    c.destroy();
  });

  it("hydrates from a previously stored preference", () => {
    localStorage.setItem("vaultspec-theme", "high-contrast");
    install({ "(prefers-color-scheme: dark)": false });
    const c = createThemeController();
    expect(c.getPreference()).toBe("high-contrast");
    expect(c.getResolvedTheme()).toBe("high-contrast");
    c.destroy();
  });

  it("notifies subscribers on preference changes even when the resolved theme is unchanged", () => {
    install({ "(prefers-color-scheme: dark)": false });
    const c = createThemeController();
    const listener = vi.fn();
    c.subscribe(listener);
    c.setPreference("system"); // already system -> no change -> no notify
    expect(listener).not.toHaveBeenCalled();
    c.setPreference("light"); // resolved stays light, but exposed preference changes
    expect(listener).toHaveBeenCalledWith("light");
    c.setPreference("dark");
    expect(listener).toHaveBeenCalledWith("dark");
    c.destroy();
  });
});

describe("isThemePreference", () => {
  it("owns the platform theme preference vocabulary", () => {
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("high-contrast")).toBe(true);
    expect(isThemePreference("chartreuse")).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });
});
