// @vitest-environment happy-dom
//
// The non-theme settings effects (dashboard-settings W05, review HIGH-1): every
// declared setting is consumed. reduce_motion applies a document attribute the
// stylesheet honors; default_granularity seeds the view granularity a scope
// opens with. Driven against the real stores client transport (mockEngine).

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { MOCK_SCOPE, MockEngine } from "../../testing/mockEngine";
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

describe("useSettingsEffects (consumed settings)", () => {
  beforeEach(() => {
    useViewStore.getState().setScope(MOCK_SCOPE);
    engineClient.useTransport(new MockEngine().fetchImpl);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    document.documentElement.removeAttribute("data-reduce-motion");
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("applies reduce_motion to a document attribute the stylesheet honors", async () => {
    const mock = new MockEngine();
    engineClient.useTransport(mock.fetchImpl);
    await engineClient.putSettings({ key: "reduce_motion", value: "true" });
    renderEffects();
    await waitFor(() => {
      expect(document.documentElement.dataset.reduceMotion).toBe("true");
    });
  });

  it("defaults reduce_motion off when unset", async () => {
    renderEffects();
    await waitFor(() => {
      expect(document.documentElement.dataset.reduceMotion).toBe("false");
    });
  });

  it("seeds the view granularity from default_granularity for the scope", async () => {
    const mock = new MockEngine();
    engineClient.useTransport(mock.fetchImpl);
    // A scope override of the open-with detail level.
    await engineClient.putSettings({
      scope: MOCK_SCOPE,
      key: "default_granularity",
      value: "document",
    });
    // Start from the opposite so a real seed is observable.
    useViewStore.getState().setGranularity("feature");
    renderEffects();
    await waitFor(() => {
      expect(useViewStore.getState().granularity).toBe("document");
    });
  });
});
