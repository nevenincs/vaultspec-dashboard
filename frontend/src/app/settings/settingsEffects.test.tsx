// @vitest-environment happy-dom
//
// The non-theme settings effects (dashboard-settings W05, review HIGH-1): every
// reduce_motion applies a document attribute the stylesheet honors. Graph and
// filter defaults are dashboard-state concerns now, so this effect must not
// seed legacy view/filter stores. Driven against the REAL engine settings store
// (the app client is bound to the live transport in liveSetup) — no doubles.
//
// State note: the engine settings store is shared and persistent across the run,
// so each test writes the explicit value it then observes (never "the default
// because nothing was written" — a prior test or file may have written it).

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { engineClient, type SettingsState } from "../../stores/server/engine";
import { sourceLocale } from "../../locales/en";
import { LOCALE_PREFERENCE_CACHE_KEY } from "../../platform/localization/localeController";
import { localization, localeController } from "../../platform/localization/runtime";
import { queryClient } from "../../stores/server/queryClient";
import { dashboardStateSessionIdentity, engineKeys } from "../../stores/server/queries";
import { resetSettingsGraphDefaultsInitializationGuard } from "../../stores/server/settingsEffectsIntent";
import { CONSUMED_SETTING_KEYS } from "../../stores/server/settingsSelectors";
import { useViewStore } from "../../stores/view/viewStore";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { useSettingsEffects } from "./settingsEffects";
import { ENGINE_WAIT } from "../../testing/timing";

function Harness({ scope }: { scope: unknown }) {
  useSettingsEffects(scope);
  return null;
}

function renderEffects(scope: unknown = null) {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(Harness, { scope }),
    ),
  );
}

// TIH-004 (write hygiene): the global settings store is shared across the whole
// run, so this suite snapshots every key it mutates before touching it and
// restores the snapshot at teardown — a later suite must never inherit this
// suite's writes. `reduceMotion` (global) is the key the per-test `finally`
// blocks below never covered; the scoped `defaultGranularity` + global
// `confidenceFloor`/`labelFilter` are restored to their captured values too.
const SETTINGS_DEFAULTS: Record<string, string> = {
  [CONSUMED_SETTING_KEYS.reduceMotion]: "false",
  [CONSUMED_SETTING_KEYS.confidenceFloor]: "0",
  [CONSUMED_SETTING_KEYS.labelFilter]: "",
};

describe("useSettingsEffects (consumed settings, live engine)", () => {
  let scope: string;
  let settingsSnapshot: Awaited<ReturnType<typeof engineClient.settings>>;
  beforeAll(async () => {
    scope = await liveScope();
    settingsSnapshot = await engineClient.settings();
  });
  afterAll(async () => {
    for (const key of [
      CONSUMED_SETTING_KEYS.reduceMotion,
      CONSUMED_SETTING_KEYS.confidenceFloor,
      CONSUMED_SETTING_KEYS.labelFilter,
    ]) {
      await engineClient
        .putSettings({
          key,
          value: settingsSnapshot.global[key] ?? SETTINGS_DEFAULTS[key],
        })
        .catch(() => undefined);
    }
    await engineClient
      .putSettings({
        scope,
        key: CONSUMED_SETTING_KEYS.defaultGranularity,
        value:
          settingsSnapshot.scoped[scope]?.[CONSUMED_SETTING_KEYS.defaultGranularity] ??
          "feature",
      })
      .catch(() => undefined);
  });
  beforeEach(() => {
    useViewStore.getState().setScope(scope);
  });
  afterEach(() => {
    cleanup();
    queryClient.clear();
    resetSettingsGraphDefaultsInitializationGuard();
    useViewStore.getState().setScope(null);
    document.documentElement.removeAttribute("data-reduce-motion");
  });

  it("reconciles engine-owned system language over the synchronous cache hint", async () => {
    const settingsBefore = await engineClient.settings();
    const preferenceBefore = localeController.getPreference();
    const cacheBefore = localStorage.getItem(LOCALE_PREFERENCE_CACHE_KEY);
    let mounted: ReturnType<typeof renderEffects> | undefined;

    try {
      await engineClient.putSettings({
        key: CONSUMED_SETTING_KEYS.language,
        value: "system",
      });
      await localeController.reconcilePreference("en");
      expect(localeController.getPreference()).toBe("en");
      expect(localStorage.getItem(LOCALE_PREFERENCE_CACHE_KEY)).toBe("en");

      queryClient.clear();
      mounted = renderEffects();

      await waitFor(() => {
        const queried = queryClient.getQueryData<SettingsState>(engineKeys.settings());
        expect(queried?.global[CONSUMED_SETTING_KEYS.language]).toBe("system");
        expect(localeController.getPreference()).toBe("system");
        expect(localeController.getResolvedLocale()).toBe(sourceLocale);
        expect(localization.resolvedLanguage ?? localization.language).toBe(
          sourceLocale,
        );
        expect(localStorage.getItem(LOCALE_PREFERENCE_CACHE_KEY)).toBe("system");
      }, ENGINE_WAIT);
    } finally {
      mounted?.unmount();
      queryClient.clear();
      await engineClient.putSettings({
        key: CONSUMED_SETTING_KEYS.language,
        value: settingsBefore.global[CONSUMED_SETTING_KEYS.language] ?? "system",
      });
      await localeController.reconcilePreference(preferenceBefore, { cache: false });
      if (cacheBefore === null) {
        localStorage.removeItem(LOCALE_PREFERENCE_CACHE_KEY);
      } else {
        localStorage.setItem(LOCALE_PREFERENCE_CACHE_KEY, cacheBefore);
      }
    }
  });

  it("applies reduce_motion to a document attribute the stylesheet honors", async () => {
    await engineClient.putSettings({
      key: CONSUMED_SETTING_KEYS.reduceMotion,
      value: "true",
    });
    renderEffects();
    await waitFor(() => {
      expect(document.documentElement.dataset.reduceMotion).toBe("true");
    }, ENGINE_WAIT);
  });

  it("applies reduce_motion off when the setting is false", async () => {
    await engineClient.putSettings({
      key: CONSUMED_SETTING_KEYS.reduceMotion,
      value: "false",
    });
    renderEffects();
    await waitFor(() => {
      expect(document.documentElement.dataset.reduceMotion).toBe("false");
    }, ENGINE_WAIT);
  });

  it("initializes fresh dashboard graph intent from schema settings once", async () => {
    const client = createLiveClient();
    await engineClient.putSettings({
      scope,
      key: CONSUMED_SETTING_KEYS.defaultGranularity,
      value: "document",
    });
    await engineClient.putSettings({
      key: CONSUMED_SETTING_KEYS.confidenceFloor,
      value: "60",
    });
    await engineClient.putSettings({
      key: CONSUMED_SETTING_KEYS.labelFilter,
      value: "adr",
    });
    await client.patchDashboardState({
      scope,
      graph_granularity: "feature",
      filters: {},
    });
    queryClient.clear();

    try {
      renderEffects(` ${scope} `);

      await waitFor(async () => {
        const state = await client.dashboardState(scope);
        expect(state.graph_granularity).toBe("document");
        expect(state.filters.text).toBe("adr");
        expect(state.filters.min_confidence?.temporal).toBeCloseTo(0.6);
      }, ENGINE_WAIT);
    } finally {
      await engineClient.putSettings({
        scope,
        key: CONSUMED_SETTING_KEYS.defaultGranularity,
        value: "feature",
      });
      await engineClient.putSettings({
        key: CONSUMED_SETTING_KEYS.confidenceFloor,
        value: "0",
      });
      await engineClient.putSettings({
        key: CONSUMED_SETTING_KEYS.labelFilter,
        value: "",
      });
      await client
        .patchDashboardState({ scope, graph_granularity: "feature", filters: {} })
        .catch(() => undefined);
    }
  });

  it("does not consume graph-default initialization on an existing dashboard intent", async () => {
    const client = createLiveClient();
    const session = await client.session();
    const sessionIdentity = dashboardStateSessionIdentity(session);
    await engineClient.putSettings({
      scope,
      key: CONSUMED_SETTING_KEYS.defaultGranularity,
      value: "document",
    });
    await engineClient.putSettings({
      key: CONSUMED_SETTING_KEYS.confidenceFloor,
      value: "60",
    });
    await engineClient.putSettings({
      key: CONSUMED_SETTING_KEYS.labelFilter,
      value: "adr",
    });
    const existingIntent = await client.patchDashboardState({
      scope,
      graph_granularity: "feature",
      filters: { text: "user-owned filter" },
    });
    queryClient.clear();
    queryClient.setQueryData(engineKeys.session(), session);
    queryClient.setQueryData(
      engineKeys.dashboardState(scope, sessionIdentity),
      existingIntent,
    );

    try {
      renderEffects(scope);

      await waitFor(async () => {
        const state = await client.dashboardState(scope);
        expect(state.graph_granularity).toBe("feature");
        expect(state.filters.text).toBe("user-owned filter");
      }, ENGINE_WAIT);

      const freshState = await client.patchDashboardState({
        scope,
        graph_granularity: "feature",
        filters: {},
      });
      queryClient.setQueryData(
        engineKeys.dashboardState(scope, sessionIdentity),
        freshState,
      );

      await waitFor(async () => {
        const state = await client.dashboardState(scope);
        expect(state.graph_granularity).toBe("document");
        expect(state.filters.text).toBe("adr");
        expect(state.filters.min_confidence?.temporal).toBeCloseTo(0.6);
      }, ENGINE_WAIT);
    } finally {
      await engineClient.putSettings({
        scope,
        key: CONSUMED_SETTING_KEYS.defaultGranularity,
        value: "feature",
      });
      await engineClient.putSettings({
        key: CONSUMED_SETTING_KEYS.confidenceFloor,
        value: "0",
      });
      await engineClient.putSettings({
        key: CONSUMED_SETTING_KEYS.labelFilter,
        value: "",
      });
      await client
        .patchDashboardState({ scope, graph_granularity: "feature", filters: {} })
        .catch(() => undefined);
    }
  });
});
