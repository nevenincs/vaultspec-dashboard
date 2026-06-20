import { describe, expect, it } from "vitest";

import { normalizeThemeSettingPreference } from "./themeSettingIntent";

describe("theme setting intent", () => {
  it("normalizes theme preference writes before settings mutation dispatch", () => {
    expect(normalizeThemeSettingPreference("system")).toBe("system");
    expect(normalizeThemeSettingPreference("light")).toBe("light");
    expect(normalizeThemeSettingPreference("dark")).toBe("dark");
    expect(normalizeThemeSettingPreference("high-contrast")).toBe("high-contrast");
  });

  it("drops malformed theme preference writes before the mutation seam", () => {
    expect(normalizeThemeSettingPreference("chartreuse")).toBeNull();
    expect(normalizeThemeSettingPreference(" dark ")).toBeNull();
    expect(normalizeThemeSettingPreference(null)).toBeNull();
    expect(normalizeThemeSettingPreference({ value: "dark" })).toBeNull();
  });
});
