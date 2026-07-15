// @vitest-environment happy-dom
//
// Compact (touch) inline-metadata guard (mobile-enrichment ADR D2). On a compact
// viewport a document leaf must surface its review state INLINE — the plain-language
// ADR acceptance WORD and the authored date, and a plan's done-of-total — under the
// title, NOT hidden in the desktop hover tooltip (which is unreachable on touch).
// This is the regression the ADR names: on desktop the status is a shape+tone mark
// with the word on the tooltip, so a compact regression back to tooltip-only would be
// silent without this guard. Rendered against the REAL engine over the fixture vault
// (no mocked wire); only `matchMedia` is stubbed to force the compact class.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { dashboardDocumentStateResetPatch } from "../../stores/server/dashboardState";
import { queryClient } from "../../stores/server/queryClient";
import { useBrowserTreeExpansionStore } from "../../stores/view/browserTreeExpansion";
import { setFollowMode } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { ENGINE_WAIT } from "../../testing/timing";
import { VaultBrowser } from "./VaultBrowser";

function renderBrowser() {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(VaultBrowser),
    ),
  );
}

/** Stub `matchMedia` so the ONE compact breakpoint query
 *  (`viewportClass.ts` max-width) matches → `useViewportClass()` reads "compact".
 *  Every other query (e.g. prefers-reduced-motion) stays unmatched. */
function stubCompactMatchMedia(): MediaQueryList {
  return {
    matches: true,
    media: "(max-width: 39.99rem)",
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}

describe("VaultBrowser compact inline metadata (live engine, ADR D2)", () => {
  let scope: string;
  const realMatchMedia = window.matchMedia;
  beforeAll(async () => {
    scope = await liveScope();
  });
  beforeEach(async () => {
    window.matchMedia = ((query: string) =>
      query.includes("max-width")
        ? stubCompactMatchMedia()
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
    setFollowMode(false);
    localStorage.clear();
    useBrowserTreeExpansionStore.getState().reset();
    useViewStore.getState().setScope(scope);
  });
  afterEach(async () => {
    cleanup();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0), ENGINE_WAIT);
    queryClient.clear();
    useViewStore.getState().setScope(null);
    setFollowMode(true);
    window.matchMedia = realMatchMedia;
  });

  it("surfaces the ADR acceptance WORD + authored date and the plan progress inline (not tooltip-only)", async () => {
    renderBrowser();
    await screen.findByRole("navigation", { name: "Vault browser" }, ENGINE_WAIT);
    // Open Documents, then every category folder, so the beta ADR + alpha plan
    // leaves mount.
    const documentsHeader = await waitFor(() => {
      const button = screen.getAllByRole("button").find((b) => {
        const label = b.querySelector("[data-vault-section]");
        return label?.getAttribute("data-vault-section") === "documents";
      });
      expect(button).toBeTruthy();
      return button!;
    }, ENGINE_WAIT);
    if (documentsHeader.getAttribute("aria-expanded") === "false") {
      fireEvent.click(documentsHeader);
    }
    const body = document.getElementById(
      documentsHeader.getAttribute("aria-controls")!,
    )!;
    await waitFor(() => {
      expect(
        body.querySelectorAll("[data-vault-folder] > button[aria-expanded]").length,
      ).toBeGreaterThan(0);
    }, ENGINE_WAIT);
    for (const folder of body.querySelectorAll<HTMLButtonElement>(
      "[data-vault-folder] > button[aria-expanded='false']",
    )) {
      fireEvent.click(folder);
    }

    // ADR leaf: the acceptance status renders as the plain-language WORD "Accepted"
    // INLINE (not the desktop shape-only mark whose word rides the tooltip), plus the
    // authored date "Jan 5" on the same inline meta line.
    const adrStatus = await waitFor(() => {
      const el = body.querySelector("[data-adr-status]");
      expect(el).toBeTruthy();
      return el!;
    }, ENGINE_WAIT);
    expect(adrStatus.getAttribute("data-adr-status")).toBe("accepted");
    expect(adrStatus.textContent).toBe("Accepted");
    const adrLeaf = adrStatus.closest("button")!;
    const adrDate = adrLeaf.querySelector("[data-doc-date]");
    expect(adrDate?.textContent).toBe("Jan 5");

    // Plan leaf: the done-of-total progress renders inline as a plain-language count.
    const planStatus = body.querySelector("[data-plan-status]");
    expect(planStatus).toBeTruthy();
    expect(planStatus!.textContent).toContain("1 of 2");
  });
});
