// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import {
  normalizeThemeSettingPreference,
  useThemeSettingIntent,
} from "./themeSettingIntent";

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
}

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

  it("keeps theme-setting intent callbacks stable across rerenders", () => {
    const client = testQueryClient();
    const { result, rerender } = renderHook(() => useThemeSettingIntent(), {
      wrapper: wrapper(client),
    });

    const firstIntent = result.current;
    const firstSetThemePreference = result.current.setThemePreference;

    rerender();

    expect(result.current).toBe(firstIntent);
    expect(result.current.setThemePreference).toBe(firstSetThemePreference);
  });
});
