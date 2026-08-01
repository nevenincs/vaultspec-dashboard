// @vitest-environment happy-dom
//
// Compact unified-rail composition guard. The Home pane is the Status + Browse scroll
// and NOTHING else: the framework status cluster (Search service / Review / Vault
// health) was pulled from compact by owner review — it reports development-framework
// health, not the corpus state a phone-sized Home pane exists to show. These tests pin
// that removal so the strip cannot drift back in, and pin the scroll region that
// remains. Rendered against the REAL engine over the fixture vault (no mocked wire);
// only `matchMedia` is stubbed to force the compact viewport class + a coarse pointer.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { dashboardDocumentStateResetPatch } from "../../stores/server/dashboardState";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { ENGINE_WAIT } from "../../testing/timing";
import { CompactUnifiedRail } from "./CompactUnifiedRail";

function renderRail() {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(CompactUnifiedRail),
    ),
  );
}

/** A matched `MediaQueryList` for the compact + coarse-pointer queries. */
function matched(media: string): MediaQueryList {
  return {
    matches: true,
    media,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}

describe("CompactUnifiedRail composition (live engine)", () => {
  let scope: string;
  const realMatchMedia = window.matchMedia;
  beforeAll(async () => {
    scope = await liveScope();
  });
  beforeEach(async () => {
    // Force the compact viewport class (max-width) AND a coarse primary pointer so
    // the shared cluster reports touch and sizes its chips to the tap floor.
    window.matchMedia = ((query: string) =>
      query.includes("max-width") || query.includes("pointer: coarse")
        ? matched(query)
        : ({
            matches: false,
            media: query,
            onchange: null,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
            dispatchEvent: () => false,
          } as unknown as MediaQueryList)) as typeof window.matchMedia;
    await createLiveClient().patchDashboardState(
      dashboardDocumentStateResetPatch(scope),
    );
    localStorage.clear();
    useViewStore.getState().setScope(scope);
  });
  afterEach(async () => {
    cleanup();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0), ENGINE_WAIT);
    queryClient.clear();
    useViewStore.getState().setScope(null);
    window.matchMedia = realMatchMedia;
  });

  it("owns the Status/Browse scroll region", async () => {
    renderRail();
    const nav = await screen.findByRole("navigation", { name: "Home" }, ENGINE_WAIT);

    const scrollRegion = nav.querySelector("[data-compact-rail-scroll]");
    expect(scrollRegion).toBeTruthy();
    expect(scrollRegion!.parentElement).toBe(nav);
  });

  it("carries NO framework status cluster — the strip is desktop-only", async () => {
    renderRail();
    await screen.findByRole("navigation", { name: "Home" }, ENGINE_WAIT);

    // Neither the cluster nor any of its chips (Search service, Review, Vault health)
    // may reappear on compact; their panels stay reachable through the palette.
    expect(document.querySelector("[data-framework-status-cluster]")).toBeNull();
    expect(document.querySelectorAll("[data-framework-chip]").length).toBe(0);
  });
});
