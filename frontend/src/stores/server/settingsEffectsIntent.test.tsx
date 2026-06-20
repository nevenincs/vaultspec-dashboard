// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { createLiveClient, liveScope } from "../../testing/liveClient";
import { dashboardDocumentStateResetPatch } from "./dashboardState";
import {
  isFreshSettingsGraphDefaultsInitialization,
  rememberSettingsGraphDefaultsInitializedIdentity,
  normalizeSettingsGraphDefaultsInitializationIdentity,
  normalizeSettingsEffectsGraphDefaults,
  normalizeSettingsEffectsScope,
  releaseSettingsGraphDefaultsPendingIdentity,
  reserveSettingsGraphDefaultsPendingIdentity,
  resetSettingsGraphDefaultsInitializationGuard,
  SETTINGS_GRAPH_DEFAULTS_IDENTITY_GUARD_CAP,
  SETTINGS_GRAPH_DEFAULTS_IDENTITY_MAX_CHARS,
  settingsGraphDefaultsInitializationGuardSizes,
  useSettingsEffectsIntent,
} from "./settingsEffectsIntent";

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

let cleanupScope: string | null = null;

afterEach(async () => {
  cleanup();
  resetSettingsGraphDefaultsInitializationGuard();
  if (cleanupScope) {
    await createLiveClient()
      .patchDashboardState(dashboardDocumentStateResetPatch(cleanupScope))
      .catch(() => undefined);
    cleanupScope = null;
  }
});

describe("useSettingsEffectsIntent", () => {
  it("normalizes runtime scope values", () => {
    expect(normalizeSettingsEffectsScope(" scope-a ")).toBe("scope-a");
    expect(normalizeSettingsEffectsScope("   ")).toBeNull();
    expect(normalizeSettingsEffectsScope({ scope: "scope-a" })).toBeNull();
    expect(normalizeSettingsGraphDefaultsInitializationIdentity(" identity-a ")).toBe(
      "identity-a",
    );
    expect(normalizeSettingsGraphDefaultsInitializationIdentity("   ")).toBeNull();
    expect(
      normalizeSettingsGraphDefaultsInitializationIdentity({ identity: "a" }),
    ).toBeNull();
    expect(
      normalizeSettingsGraphDefaultsInitializationIdentity(
        "x".repeat(SETTINGS_GRAPH_DEFAULTS_IDENTITY_MAX_CHARS + 1),
      ),
    ).toBeNull();
    expect(
      normalizeSettingsEffectsGraphDefaults({
        defaultGranularity: " feature ",
        confidenceFloor: 60,
        labelFilter: " adr ",
      }),
    ).toEqual({
      defaultGranularity: "feature",
      confidenceFloor: 60,
      labelFilter: "adr",
    });
    expect(
      normalizeSettingsEffectsGraphDefaults({
        defaultGranularity: "radial",
        confidenceFloor: 60,
        labelFilter: "adr",
      }),
    ).toBeNull();
    expect(
      normalizeSettingsEffectsGraphDefaults({
        defaultGranularity: "document",
        confidenceFloor: Number.POSITIVE_INFINITY,
        labelFilter: "adr",
      }),
    ).toBeNull();
    expect(
      normalizeSettingsEffectsGraphDefaults({
        defaultGranularity: "document",
        confidenceFloor: 60,
        labelFilter: { text: "adr" },
      }),
    ).toBeNull();
    expect(isFreshSettingsGraphDefaultsInitialization({ fresh: true })).toBe(true);
    expect(isFreshSettingsGraphDefaultsInitialization({ fresh: "true" })).toBe(false);
  });

  it("bounds graph-default initialization guard identities", () => {
    for (let i = 0; i < SETTINGS_GRAPH_DEFAULTS_IDENTITY_GUARD_CAP + 3; i += 1) {
      expect(rememberSettingsGraphDefaultsInitializedIdentity(`identity:${i}`)).toBe(
        true,
      );
    }

    expect(settingsGraphDefaultsInitializationGuardSizes()).toEqual({
      initialized: SETTINGS_GRAPH_DEFAULTS_IDENTITY_GUARD_CAP,
      pending: 0,
    });
    expect(rememberSettingsGraphDefaultsInitializedIdentity("   ")).toBe(false);
  });

  it("bounds pending graph-default initialization reservations", () => {
    for (let i = 0; i < SETTINGS_GRAPH_DEFAULTS_IDENTITY_GUARD_CAP; i += 1) {
      expect(reserveSettingsGraphDefaultsPendingIdentity(`pending:${i}`)).toBe(true);
    }

    expect(reserveSettingsGraphDefaultsPendingIdentity("pending:overflow")).toBe(false);
    expect(reserveSettingsGraphDefaultsPendingIdentity("pending:0")).toBe(false);
    expect(settingsGraphDefaultsInitializationGuardSizes()).toEqual({
      initialized: 0,
      pending: SETTINGS_GRAPH_DEFAULTS_IDENTITY_GUARD_CAP,
    });

    releaseSettingsGraphDefaultsPendingIdentity("pending:0");

    expect(reserveSettingsGraphDefaultsPendingIdentity("pending:overflow")).toBe(true);
    expect(settingsGraphDefaultsInitializationGuardSizes()).toEqual({
      initialized: 0,
      pending: SETTINGS_GRAPH_DEFAULTS_IDENTITY_GUARD_CAP,
    });
  });

  it("is inert without a scope", async () => {
    const client = testQueryClient();
    const { result } = renderHook(() => useSettingsEffectsIntent(null), {
      wrapper: wrapper(client),
    });

    await expect(
      result.current.applyGraphDefaults({
        defaultGranularity: "document",
        confidenceFloor: 60,
        labelFilter: "adr",
      }),
    ).resolves.toBeNull();
  });

  it("keeps settings effects intent callbacks stable across unchanged-scope rerenders", () => {
    const client = testQueryClient();
    const { result, rerender } = renderHook(
      ({ scope }) => useSettingsEffectsIntent(scope),
      {
        initialProps: { scope: " scope-a " },
        wrapper: wrapper(client),
      },
    );
    const first = result.current;

    rerender({ scope: "scope-a" });

    expect(result.current).toBe(first);
    expect(result.current.applyGraphDefaults).toBe(first.applyGraphDefaults);
    expect(result.current.applyFreshGraphDefaults).toBe(first.applyFreshGraphDefaults);
  });

  it("accepts trimmed scopes for canonical dashboard graph-default writes", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState(
      dashboardDocumentStateResetPatch(scope),
    );

    const client = testQueryClient();
    const { result } = renderHook(() => useSettingsEffectsIntent(` ${scope} `), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current.applyGraphDefaults({
        defaultGranularity: "document",
        confidenceFloor: 60,
        labelFilter: " adr ",
      });
    });

    const state = await createLiveClient().dashboardState(scope);
    expect(state.graph_granularity).toBe("document");
    expect(state.filters.text).toBe("adr");
    expect(state.filters.min_confidence?.temporal).toBeCloseTo(0.6);
  });

  it("rejects malformed runtime graph defaults before dashboard writes", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      graph_granularity: "feature",
      filters: { text: "user-owned" },
    });

    const client = testQueryClient();
    const { result } = renderHook(() => useSettingsEffectsIntent(scope), {
      wrapper: wrapper(client),
    });

    await expect(
      result.current.applyGraphDefaults({
        defaultGranularity: " radial ",
        confidenceFloor: Number.POSITIVE_INFINITY,
        labelFilter: { text: "adr" },
      }),
    ).resolves.toBeNull();

    const state = await createLiveClient().dashboardState(scope);
    expect(state.graph_granularity).toBe("feature");
    expect(state.filters.text).toBe("user-owned");
    expect(state.filters.min_confidence).toBeUndefined();
  });

  it("rejects malformed runtime scope objects before graph-default writes", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      graph_granularity: "feature",
      filters: { text: "user-owned" },
    });

    const client = testQueryClient();
    const { result } = renderHook(() => useSettingsEffectsIntent({ scope }), {
      wrapper: wrapper(client),
    });

    await expect(
      result.current.applyGraphDefaults({
        defaultGranularity: "document",
        confidenceFloor: 60,
        labelFilter: "adr",
      }),
    ).resolves.toBeNull();

    const state = await createLiveClient().dashboardState(scope);
    expect(state.graph_granularity).toBe("feature");
    expect(state.filters.text).toBe("user-owned");
    expect(state.filters.min_confidence).toBeUndefined();
  });

  it("applies fresh graph defaults only once per initialization identity", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState(
      dashboardDocumentStateResetPatch(scope),
    );

    const client = testQueryClient();
    const { result } = renderHook(() => useSettingsEffectsIntent(scope), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current.applyFreshGraphDefaults(
        {
          defaultGranularity: "document",
          confidenceFloor: 60,
          labelFilter: "first",
        },
        { fresh: true, identity: "settings-defaults:scope-a" },
      );
      await result.current.applyFreshGraphDefaults(
        {
          defaultGranularity: "feature",
          confidenceFloor: 20,
          labelFilter: "second",
        },
        { fresh: true, identity: "settings-defaults:scope-a" },
      );
    });

    const state = await createLiveClient().dashboardState(scope);
    expect(state.graph_granularity).toBe("document");
    expect(state.filters.text).toBe("first");
    expect(state.filters.min_confidence?.temporal).toBeCloseTo(0.6);
  });

  it("does not apply graph defaults without a fresh initialization identity", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      graph_granularity: "feature",
      filters: { text: "user-owned" },
    });

    const client = testQueryClient();
    const { result } = renderHook(() => useSettingsEffectsIntent(scope), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current.applyFreshGraphDefaults(
        {
          defaultGranularity: "document",
          confidenceFloor: 60,
          labelFilter: "adr",
        },
        { fresh: false, identity: "settings-defaults:not-fresh" },
      );
      await result.current.applyFreshGraphDefaults(
        {
          defaultGranularity: "document",
          confidenceFloor: 60,
          labelFilter: "adr",
        },
        { fresh: true, identity: "   " },
      );
    });

    const state = await createLiveClient().dashboardState(scope);
    expect(state.graph_granularity).toBe("feature");
    expect(state.filters.text).toBe("user-owned");
    expect(state.filters.min_confidence).toBeUndefined();
  });
});
