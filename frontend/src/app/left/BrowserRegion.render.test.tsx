// @vitest-environment happy-dom
//
// The browser-region header gains an always-visible create affordance
// (authoring-surface ADR D5, S24): a Plus icon button beside the tree-options button,
// dispatching the ONE shared new-document action. It is VAULT-mode only — the Files
// tree lists source, not authored documents — so it withdraws in code mode. Rendered
// with a no-scope seeded client so the tree children mount without a live fetch.

import { act, cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import {
  createMenuTestQueryClient,
  MenuTestProviders,
} from "../../testing/menuQueryClient";
import { setBrowserMode } from "../../stores/view/browserMode";
import {
  resetCreateDocChrome,
  useCreateDocChromeStore,
} from "../../stores/view/createDocChrome";
import { resetRailSort, useRailSortStore } from "../../stores/view/railSort";
import { BrowserRegion } from "./BrowserRegion";

afterEach(() => {
  act(() => setBrowserMode("vault"));
  resetRailSort();
  resetCreateDocChrome();
  cleanup();
});

function renderRegion(runtime = createTestLocalizationRuntime()) {
  return render(
    <I18nextProvider i18n={runtime}>
      <MenuTestProviders client={createMenuTestQueryClient()}>
        <BrowserRegion />
      </MenuTestProviders>
    </I18nextProvider>,
  );
}

describe("BrowserRegion create affordance", () => {
  it("keeps the same tree-options button across localized sort presentation", async () => {
    const runtime = createTestLocalizationRuntime();
    act(() => setBrowserMode("vault"));
    renderRegion(runtime);
    const rawSort = useRailSortStore.getState().value;
    const button = screen.getByRole("button", {
      name: "Tree options, sorted by latest activity",
    });

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("button", {
        name: ltrTestResources.documents.accessibility
          .treeOptionsSortedByLatestActivity,
      }),
    ).toBe(button);
    expect(useRailSortStore.getState().value).toBe(rawSort);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("button", {
        name: rtlTestResources.documents.accessibility
          .treeOptionsSortedByLatestActivity,
      }),
    ).toBe(button);
    expect(useRailSortStore.getState().value).toBe(rawSort);
  });

  it("fails closed when the persisted sort identity has no presentation", () => {
    act(() => {
      useRailSortStore.setState({
        value: { key: "unknown" as never, direction: "desc" },
      });
      setBrowserMode("vault");
    });
    renderRegion();
    expect(document.querySelector("[data-rail-sort-trigger]")).toBeNull();
  });

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
