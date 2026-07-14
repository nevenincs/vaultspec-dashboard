// @vitest-environment happy-dom
//
// The three new visible create affordances (authoring-surface ADR D5) each route
// through the ONE shared new-document action — never a bespoke handler. This guard
// asserts each button's observable effect: dispatching the shared action opens the
// create-document chrome store (and the Features-section variant additionally requests
// feature-field focus). WorkspaceGhost is pure chrome; BrowserRegion renders against a
// no-scope seeded client; the Features-section Plus is exercised against the REAL
// engine over the fixture vault, where the Features section actually renders.

import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { queryClient } from "../stores/server/queryClient";
import { useViewStore } from "../stores/view/viewStore";
import { setBrowserMode } from "../stores/view/browserMode";
import {
  resetCreateDocChrome,
  useCreateDocChromeStore,
} from "../stores/view/createDocChrome";
import {
  createMenuTestQueryClient,
  MenuTestProviders,
} from "../testing/menuQueryClient";
import { liveScope } from "../testing/liveClient";
import { ENGINE_WAIT } from "../testing/timing";
import { WorkspaceGhost } from "./stage/WorkspaceGhost";
import { BrowserRegion } from "./left/BrowserRegion";
import { VaultBrowser } from "./left/VaultBrowser";

describe("new-document affordances route through the shared action", () => {
  afterEach(() => {
    resetCreateDocChrome();
    cleanup();
  });

  it("the workspace empty-state button opens the create store", () => {
    render(<WorkspaceGhost />);
    fireEvent.click(screen.getByRole("button", { name: "Add to a feature" }));
    expect(useCreateDocChromeStore.getState().open).toBe(true);
  });

  it("the browser-region Plus opens the create store", () => {
    act(() => setBrowserMode("vault"));
    render(
      <MenuTestProviders client={createMenuTestQueryClient()}>
        <BrowserRegion />
      </MenuTestProviders>,
    );
    act(() => screen.getByRole("button", { name: "Add to a feature" }).click());
    expect(useCreateDocChromeStore.getState().open).toBe(true);
  });
});

describe("the Features-section Plus opens the create store focused on the feature (live engine)", () => {
  let scope: string;
  beforeAll(async () => {
    scope = await liveScope();
  });
  afterEach(async () => {
    resetCreateDocChrome();
    cleanup();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0), ENGINE_WAIT);
    queryClient.clear();
    useViewStore.getState().setScope(null);
  });

  it("dispatches the shared action with the feature-focus request", async () => {
    useViewStore.getState().setScope(scope);
    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(VaultBrowser),
      ),
    );
    const plus = await waitFor(() => {
      const button = document.querySelector<HTMLButtonElement>(
        "[data-new-feature-document]",
      );
      expect(button).toBeTruthy();
      return button!;
    }, ENGINE_WAIT);
    act(() => plus.click());
    const state = useCreateDocChromeStore.getState();
    expect(state.open).toBe(true);
    expect(state.focusFeatureField).toBe(true);
  });
});
