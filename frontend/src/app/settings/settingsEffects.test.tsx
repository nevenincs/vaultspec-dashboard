// @vitest-environment happy-dom
//
// The non-theme settings effects (dashboard-settings W05, review HIGH-1): every
// declared setting is consumed. reduce_motion applies a document attribute the
// stylesheet honors; default_granularity seeds the view granularity a scope
// opens with. Driven against the REAL engine settings store (the app client is
// bound to the live transport in liveSetup) — no doubles.
//
// State note: the engine settings store is shared and persistent across the run,
// so each test writes the explicit value it then observes (never "the default
// because nothing was written" — a prior test or file may have written it).

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useFilterStore } from "../../stores/view/filters";
import { useViewStore } from "../../stores/view/viewStore";
import { liveScope } from "../../testing/liveClient";
import { useSettingsEffects } from "./settingsEffects";

function Harness() {
  useSettingsEffects();
  return null;
}

function renderEffects() {
  return render(
    createElement(QueryClientProvider, { client: queryClient }, createElement(Harness)),
  );
}

describe("useSettingsEffects (consumed settings, live engine)", () => {
  let scope: string;
  beforeAll(async () => {
    scope = await liveScope();
  });
  beforeEach(() => {
    useViewStore.getState().setScope(scope);
  });
  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    useFilterStore.getState().reset();
    document.documentElement.removeAttribute("data-reduce-motion");
  });

  it("applies reduce_motion to a document attribute the stylesheet honors", async () => {
    await engineClient.putSettings({ key: "reduce_motion", value: "true" });
    renderEffects();
    await waitFor(() => {
      expect(document.documentElement.dataset.reduceMotion).toBe("true");
    });
  });

  it("applies reduce_motion off when the setting is false", async () => {
    await engineClient.putSettings({ key: "reduce_motion", value: "false" });
    renderEffects();
    await waitFor(() => {
      expect(document.documentElement.dataset.reduceMotion).toBe("false");
    });
  });

  it("seeds the view granularity from default_granularity for the scope", async () => {
    // A scope override of the open-with detail level.
    await engineClient.putSettings({ scope, key: "default_granularity", value: "document" });
    // Start from the opposite so a real seed is observable.
    useViewStore.getState().setGranularity("feature");
    renderEffects();
    await waitFor(() => {
      expect(useViewStore.getState().granularity).toBe("document");
    });
  });

  it("seeds the temporal+semantic confidence floors from confidence_floor (percent -> 0..1)", async () => {
    // A global confidence floor of 60% must seed both inferred-edge floors at 0.6.
    await engineClient.putSettings({ key: "confidence_floor", value: "60" });
    renderEffects();
    await waitFor(() => {
      const floors = useFilterStore.getState().minConfidence;
      expect(floors.temporal).toBeCloseTo(0.6);
      expect(floors.semantic).toBeCloseTo(0.6);
    });
  });

  it("seeds the node-stem text match from label_filter for the scope", async () => {
    await engineClient.putSettings({ key: "label_filter", value: "adr" });
    expect(useFilterStore.getState().textMatch).toBe("");
    renderEffects();
    await waitFor(() => {
      expect(useFilterStore.getState().textMatch).toBe("adr");
    });
  });
});
