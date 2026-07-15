// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { en } from "../../locales/en";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import { SAFE_FALLBACK_SOURCE_MESSAGE } from "../../platform/localization/fallback";
import {
  closeControlPanel,
  openControlPanel,
  useControlPanels,
  type ControlPanelId,
} from "../../stores/view/controlPanels";
import { ControlPanels } from "./ControlPanels";

let activeClient: QueryClient | null = null;

afterEach(() => {
  closeControlPanel();
  cleanup();
  activeClient?.clear();
  activeClient = null;
});

function renderPanels() {
  const runtime = createTestLocalizationRuntime();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  activeClient = client;
  const result = render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={client}>
        <ControlPanels />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { ...result, runtime };
}

describe("ControlPanels", () => {
  it("mounts the complete Search dashboard only while its dialog is open", () => {
    openControlPanel("search-service");
    const { container } = renderPanels();
    const dialog = screen.getByRole("dialog", {
      name: en.common.controlPanels.labels.search,
    });

    expect(dialog.classList.contains("w-[52rem]")).toBe(true);
    expect(container.querySelector("[data-rag-job-dashboard]")).toBeTruthy();
    expect(container.querySelector("[data-rag-dashboard-header]")).toBeTruthy();
    expect(container.querySelector("[data-rag-jobs-region]")).toBeTruthy();
    expect(container.querySelector("[data-rag-log-region]")).toBeTruthy();
    expect(container.querySelector("[data-rag-footer-region]")).toBeTruthy();
    expect(container.querySelector("#rag-ops-details")).toBeNull();
  });

  it("does not mount Search dashboard reads while every panel is closed", () => {
    const { container } = renderPanels();
    expect(container.querySelector("[data-rag-job-dashboard]")).toBeNull();
    expect(container.querySelector("[data-rag-footer-region]")).toBeNull();
  });

  it.each([
    [
      "search-service",
      en.common.controlPanels.labels.search,
      ltrTestResources.common.controlPanels.labels.search,
      rtlTestResources.common.controlPanels.labels.search,
    ],
    [
      "approvals",
      en.common.controlPanels.labels.approvals,
      ltrTestResources.common.controlPanels.labels.approvals,
      rtlTestResources.common.controlPanels.labels.approvals,
    ],
    [
      "backend-health",
      en.common.controlPanels.labels.systemStatus,
      ltrTestResources.common.controlPanels.labels.systemStatus,
      rtlTestResources.common.controlPanels.labels.systemStatus,
    ],
    [
      "vault-health",
      en.common.controlPanels.labels.projectHealth,
      ltrTestResources.common.controlPanels.labels.projectHealth,
      rtlTestResources.common.controlPanels.labels.projectHealth,
    ],
  ] as const)(
    "localizes the %s dialog in place",
    async (id: ControlPanelId, source, ltr, rtl) => {
      openControlPanel(id);
      const { runtime } = renderPanels();
      const dialog = screen.getByRole("dialog", { name: source });
      const heading = screen.getByRole("heading", { name: source });

      await act(async () => runtime.changeLanguage(ltrTestLocale));
      expect(screen.getByRole("dialog", { name: ltr })).toBe(dialog);
      expect(screen.getByRole("heading", { name: ltr })).toBe(heading);

      await act(async () => runtime.changeLanguage(rtlTestLocale));
      expect(screen.getByRole("dialog", { name: rtl })).toBe(dialog);
      expect(screen.getByRole("heading", { name: rtl })).toBe(heading);

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(useControlPanels.getState().open).toBeNull();
    },
  );

  it("uses safe fallback copy when the common bundle is unavailable", () => {
    openControlPanel("approvals");
    const runtime = createTestLocalizationRuntime();
    runtime.removeResourceBundle("en", "common");
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    activeClient = client;
    render(
      <I18nextProvider i18n={runtime}>
        <QueryClientProvider client={client}>
          <ControlPanels />
        </QueryClientProvider>
      </I18nextProvider>,
    );

    expect(
      screen.getByRole("dialog", { name: SAFE_FALLBACK_SOURCE_MESSAGE }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: SAFE_FALLBACK_SOURCE_MESSAGE }),
    ).toBeTruthy();
  });
});
