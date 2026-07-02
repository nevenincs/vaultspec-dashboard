// @vitest-environment happy-dom
//
// GS-003 reveal-on-selection: an OFF-CANVAS selection (rail row, search hit, menu
// Open — activateEntity `frame:true`, which calls requestSelectionReveal) must SCROLL
// the selected document's row into view, expanding its ancestor folders first so it
// works even when the row was collapsed out of sight and follow mode is OFF. Rendered
// against the REAL engine over the fixture vault (no mock transport), consistent with
// the sibling VaultBrowser render tests.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { queryClient } from "../../stores/server/queryClient";
import { useBrowserTreeExpansionStore } from "../../stores/view/browserTreeExpansion";
import { selectNode, setFollowMode } from "../../stores/view/selection";
import { requestSelectionReveal } from "../../stores/view/selectionReveal";
import { useViewStore } from "../../stores/view/viewStore";
import { liveScope } from "../../testing/liveClient";
import { pathToNodeId } from "./browserSelection";
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

async function expandDocumentsSection(): Promise<HTMLElement> {
  const header = await waitFor(() => {
    const button = screen.getAllByRole("button").find((b) => {
      const label = b.querySelector("[data-vault-section]");
      return label?.getAttribute("data-vault-section") === "documents";
    });
    expect(button).toBeTruthy();
    return button!;
  });
  if (header.getAttribute("aria-expanded") === "false") fireEvent.click(header);
  await waitFor(() => expect(header.getAttribute("aria-expanded")).toBe("true"));
  return header;
}

function docRows(): HTMLButtonElement[] {
  return screen
    .getAllByRole("button")
    .filter((b) =>
      b.getAttribute("title")?.startsWith(".vault/"),
    ) as HTMLButtonElement[];
}

describe("TreeBrowser reveal-on-selection scroll (GS-003, live engine)", () => {
  let scope: string;
  beforeAll(async () => {
    scope = await liveScope();
  });
  beforeEach(() => {
    localStorage.clear();
    useBrowserTreeExpansionStore.getState().reset();
    useViewStore.getState().setScope(scope);
  });
  afterEach(async () => {
    cleanup();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    queryClient.clear();
    useViewStore.getState().setScope(null);
    setFollowMode(true); // restore the view-local default so it can't leak across files
    vi.restoreAllMocks();
  });

  it("scrolls a collapsed-away selected document into view (ancestor-expanded, follow mode OFF)", async () => {
    renderBrowser();
    await screen.findByRole("navigation", { name: "vault browser" });

    // Discover a REAL document path from the live vault: open the Documents section and
    // a category folder, then read a document row's `.vault/` title.
    const documentsHeader = await expandDocumentsSection();
    const folder = await waitFor(() => {
      const body = document.getElementById(
        documentsHeader.getAttribute("aria-controls")!,
      );
      const button = body?.querySelector<HTMLButtonElement>(
        "[data-vault-folder] > button[aria-expanded='false']",
      );
      expect(button).toBeTruthy();
      return button!;
    });
    fireEvent.click(folder);
    const path = await waitFor(() => {
      const row = docRows()[0];
      expect(row).toBeTruthy();
      return row.getAttribute("title")!;
    });
    const nodeId = pathToNodeId(path);

    // Collapse everything and turn follow mode OFF: now NOTHING would re-mount that row
    // except the reveal reaction under test.
    setFollowMode(false);
    useBrowserTreeExpansionStore.getState().reset();
    await waitFor(() => expect(docRows().length).toBe(0));

    const scrollSpy = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});

    // Exactly what an off-canvas activation does: canonical select + reveal request.
    await selectNode(nodeId, scope);
    requestSelectionReveal(nodeId);

    // The reveal expands the Documents ancestor (follow mode is OFF, so only the reveal
    // could have re-mounted it) and the selected leaf appears with aria-current…
    const revealed = await waitFor(() => {
      const current = document.querySelector('[aria-current="page"]');
      expect(current).toBeTruthy();
      expect(current!.getAttribute("title")).toBe(path);
      return current!;
    });
    // …and it is scrolled into view.
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(revealed.getAttribute("aria-current")).toBe("page");
  });
});
