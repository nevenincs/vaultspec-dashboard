// @vitest-environment happy-dom
//
// Compact unified-rail composition guard (activity-rail-realignment ADR D6). On the
// compact shell the SAME `FrameworkStatusCluster` the desktop rail pins joins the
// unified rail as its FOOTER: a shrink-0 sibling BELOW the scrolling content region,
// never inside it, so it stays fixed at the rail's bottom edge while the Status/Browse
// stack scrolls. The footer chips grow to the 2.75rem touch floor on coarse pointers.
// Rendered against the REAL engine over the fixture vault (no mocked wire); only
// `matchMedia` is stubbed to force the compact viewport class + a coarse pointer.

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

describe("CompactUnifiedRail composition (live engine, ADR D6)", () => {
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

  it("pins the framework status cluster as the rail FOOTER, outside the scroll region", async () => {
    renderRail();
    const nav = await screen.findByRole("navigation", { name: "Home" }, ENGINE_WAIT);

    const scrollRegion = nav.querySelector("[data-compact-rail-scroll]");
    const cluster = nav.querySelector("[data-framework-status-cluster]");
    expect(scrollRegion).toBeTruthy();
    expect(cluster).toBeTruthy();

    // The cluster is a DIRECT child of the rail (the pinned footer), NOT nested inside
    // the scrolling content region — so it never scrolls with the Status/Browse stack.
    expect(cluster!.parentElement).toBe(nav);
    expect(scrollRegion!.contains(cluster)).toBe(false);
    // Ordered after the scroll region (footer position).
    expect(
      scrollRegion!.compareDocumentPosition(cluster!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders the framework footer chips at the coarse-pointer touch floor", async () => {
    renderRail();
    await screen.findByRole("navigation", { name: "Home" }, ENGINE_WAIT);

    // Three footer chips: Search service, Approvals, Vault health. Backend health was
    // pulled from the footer (user UX decision); it surfaces via the Cmd+K palette.
    const chips = document.querySelectorAll("[data-framework-chip]");
    expect(chips.length).toBe(3);
    // On a coarse primary pointer every chip carries the 2.75rem tap-target floor.
    for (const chip of chips) {
      expect(chip.className).toContain("min-h-[2.75rem]");
    }
  });
});
