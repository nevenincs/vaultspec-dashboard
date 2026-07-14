// @vitest-environment happy-dom
//
// The browser-region header gains an always-visible create affordance
// (authoring-surface ADR D5, S24): a Plus icon button beside the tree-options button,
// dispatching the ONE shared new-document action. It is VAULT-mode only — the Files
// tree lists source, not authored documents — so it withdraws in code mode. Rendered
// with a no-scope seeded client so the tree children mount without a live fetch.

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  createMenuTestQueryClient,
  MenuTestProviders,
} from "../../testing/menuQueryClient";
import { setBrowserMode } from "../../stores/view/browserMode";
import {
  resetCreateDocChrome,
  useCreateDocChromeStore,
} from "../../stores/view/createDocChrome";
import { BrowserRegion } from "./BrowserRegion";

afterEach(() => {
  act(() => setBrowserMode("vault"));
  resetCreateDocChrome();
  cleanup();
});

function renderRegion() {
  return render(
    <MenuTestProviders client={createMenuTestQueryClient()}>
      <BrowserRegion />
    </MenuTestProviders>,
  );
}

describe("BrowserRegion create affordance", () => {
  it("shows the Plus create button in vault mode and dispatches the shared action", () => {
    act(() => setBrowserMode("vault"));
    renderRegion();
    const plus = screen.getByRole("button", { name: "Add to a feature" });
    expect(plus).toBeTruthy();
    act(() => plus.click());
    expect(useCreateDocChromeStore.getState().open).toBe(true);
  });

  it("hides the Plus create button in code mode", () => {
    act(() => setBrowserMode("code"));
    renderRegion();
    expect(screen.queryByRole("button", { name: "Add to a feature" })).toBeNull();
  });
});
