// @vitest-environment happy-dom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { en, sourceLocale } from "../../locales/en";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import {
  setFilterSidebarOpen,
  useFilterSidebarStore,
} from "../../stores/view/filterSidebar";
import { CanvasStateOverlay, type CanvasOverlayView } from "./CanvasStateOverlay";

afterEach(() => {
  cleanup();
  setFilterSidebarOpen(false);
});

const localeExpectations = [
  {
    locale: sourceLocale,
    canvas: en.graph.canvas,
    fallback: en.errors.fallback.contentUnavailable,
    openFilters: en.common.actions.openFilters,
  },
  {
    locale: ltrTestLocale,
    canvas: ltrTestResources.graph.canvas,
    fallback: ltrTestResources.errors.fallback.contentUnavailable,
    openFilters: ltrTestResources.common.actions.openFilters,
  },
  {
    locale: rtlTestLocale,
    canvas: rtlTestResources.graph.canvas,
    fallback: rtlTestResources.errors.fallback.contentUnavailable,
    openFilters: rtlTestResources.common.actions.openFilters,
  },
] as const;

function renderOverlay(state: CanvasOverlayView) {
  const runtime = createTestLocalizationRuntime();
  const result = render(
    <I18nextProvider i18n={runtime}>
      <CanvasStateOverlay state={state} />
    </I18nextProvider>,
  );
  return { ...result, runtime };
}

describe("CanvasStateOverlay localization", () => {
  it("updates loading and restoration statuses without remounting or duplicate announcements", async () => {
    const loadingState: CanvasOverlayView = {
      primary: { kind: "loading-document" },
      annotations: [],
    };
    const { runtime, rerender } = renderOverlay(loadingState);
    const loader = document.querySelector<HTMLElement>(
      '[data-canvas-state="loading-document"]',
    );
    const loaderStatus = within(loader!).getByRole("status");

    for (const expectation of localeExpectations) {
      await act(async () => runtime.changeLanguage(expectation.locale));
      expect(document.querySelector('[data-canvas-state="loading-document"]')).toBe(
        loader,
      );
      expect(within(loader!).getByRole("status")).toBe(loaderStatus);
      expect(loader?.querySelector(".sr-only")?.textContent).toBe(
        expectation.canvas.states.loading,
      );
    }

    rerender(
      <I18nextProvider i18n={runtime}>
        <CanvasStateOverlay
          state={{ primary: { kind: "context-lost" }, annotations: [] }}
        />
      </I18nextProvider>,
    );
    const restoring = document.querySelector<HTMLElement>(
      '[data-canvas-state="context-lost"]',
    );
    const restoringStatus = screen.getByRole("status");

    for (const expectation of localeExpectations) {
      await act(async () => runtime.changeLanguage(expectation.locale));
      expect(document.querySelector('[data-canvas-state="context-lost"]')).toBe(
        restoring,
      );
      expect(screen.getAllByRole("status")).toEqual([restoringStatus]);
      expect(restoring?.querySelector("p")?.textContent).toBe(
        expectation.canvas.states.restoring,
      );
    }
  });

  it("localizes every annotation in place and keeps raw metadata out of the interface", async () => {
    const internalTier = "engine:tier.quantum";
    const internalReason = "backend unavailable at http://127.0.0.1:4173";
    const state: CanvasOverlayView = {
      primary: { kind: "ok" },
      annotations: [
        { kind: "unknown-tier", tiers: [internalTier] },
        {
          kind: "degraded",
          tiers: ["structural"],
          reasons: { structural: `${internalReason} building` },
        },
        { kind: "links-building" },
        {
          kind: "truncated",
          returned: 5_000,
          total: 8_700,
          reason: internalReason,
        },
        { kind: "links-refreshing" },
        { kind: "refreshing" },
      ],
    };
    const { runtime } = renderOverlay(state);
    const unknown = document.querySelector<HTMLElement>(
      '[data-canvas-state="unknown-tier"]',
    );
    const degraded = document.querySelector<HTMLElement>(
      '[data-canvas-state="degraded"]',
    );
    const linksBuilding = document.querySelector<HTMLElement>(
      '[data-canvas-state="links-building"]',
    );
    const truncated = document.querySelector<HTMLElement>(
      '[data-canvas-state="truncated"]',
    );
    const linksRefreshing = document.querySelector<HTMLElement>(
      '[data-canvas-state="links-refreshing"]',
    );
    const refreshing = document.querySelector<HTMLElement>(
      '[data-canvas-state="refreshing"]',
    );
    const openFilters = within(truncated!).getByRole("button");

    openFilters.focus();
    for (const expectation of localeExpectations) {
      await act(async () => runtime.changeLanguage(expectation.locale));
      expect(document.querySelector('[data-canvas-state="unknown-tier"]')).toBe(
        unknown,
      );
      expect(document.querySelector('[data-canvas-state="degraded"]')).toBe(degraded);
      expect(document.querySelector('[data-canvas-state="links-building"]')).toBe(
        linksBuilding,
      );
      expect(document.querySelector('[data-canvas-state="truncated"]')).toBe(truncated);
      expect(document.querySelector('[data-canvas-state="links-refreshing"]')).toBe(
        linksRefreshing,
      );
      expect(document.querySelector('[data-canvas-state="refreshing"]')).toBe(
        refreshing,
      );
      expect(within(truncated!).getByRole("button")).toBe(openFilters);
      expect(document.activeElement).toBe(openFilters);

      expect(unknown?.textContent).toBe(expectation.canvas.errors.partialUnavailable);
      expect(degraded?.textContent).toBe(expectation.canvas.states.loadingDetails);
      expect(linksBuilding?.textContent).toBe(
        expectation.canvas.states.loadingDocumentLinks,
      );
      expect(linksRefreshing?.textContent).toBe(
        expectation.canvas.states.refreshingDocumentLinks,
      );
      expect(refreshing?.textContent).toBe(expectation.canvas.states.refreshing);
      expect(openFilters.textContent).toBe(expectation.openFilters);
      expect(truncated?.textContent).toContain(
        new Intl.NumberFormat(expectation.locale).format(5_000),
      );
      expect(truncated?.textContent).toContain(
        new Intl.NumberFormat(expectation.locale).format(8_700),
      );

      const output = document.body.textContent ?? "";
      expect(output).not.toContain(internalTier);
      expect(output).not.toContain(internalReason);
      expect(output).not.toContain("graph:canvas");
      expect(output).not.toContain("—");
    }

    expect(useFilterSidebarStore.getState().open).toBe(false);
    fireEvent.click(openFilters);
    expect(useFilterSidebarStore.getState().open).toBe(true);
    expect(document.activeElement).toBe(openFilters);
  });

  it("uses the safe localized fallback for malformed count data", async () => {
    const { runtime } = renderOverlay({
      primary: { kind: "ok" },
      annotations: [
        {
          kind: "truncated",
          returned: Number.NaN,
          total: 8_700,
          reason: "engine diagnostic",
        },
      ],
    });
    const summary = document.querySelector<HTMLElement>("[data-tabular]");

    for (const expectation of localeExpectations) {
      await act(async () => runtime.changeLanguage(expectation.locale));
      expect(summary?.textContent).toBe(expectation.fallback);
      expect(document.body.textContent).not.toContain("NaN");
      expect(document.body.textContent).not.toContain("graph:canvas.states.truncated");
      expect(screen.getByRole("button").textContent).toBe(expectation.openFilters);
    }
  });
});
