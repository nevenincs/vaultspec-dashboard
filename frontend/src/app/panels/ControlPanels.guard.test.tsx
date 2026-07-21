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
  return { ...result, runtime, client };
}

describe("ControlPanels", () => {
  it("mounts the complete Search dashboard only while its dialog is open", () => {
    openControlPanel("search-service");
    const { container, client } = renderPanels();
    const dialog = screen.getByRole("dialog", {
      name: en.common.controlPanels.labels.search,
    });

    expect(dialog.classList.contains("w-[52rem]")).toBe(true);
    expect(container.querySelector("[data-rag-job-dashboard]")).toBeTruthy();
    expect(container.querySelector("[data-rag-dashboard-header]")).toBeTruthy();
    expect(container.querySelector("[data-rag-jobs-region]")).toBeTruthy();
    expect(container.querySelector("[data-rag-log-region]")).toBeNull();
    expect(
      client
        .getQueryCache()
        .getAll()
        .some((query) => query.queryKey.includes("logs")),
    ).toBe(false);
    expect(container.querySelector("[data-rag-footer-region]")).toBeTruthy();
    expect(container.querySelector("#rag-ops-details")).toBeNull();
  });

  it("does not mount Search dashboard reads while every panel is closed", () => {
    const { container } = renderPanels();
    expect(container.querySelector("[data-rag-job-dashboard]")).toBeNull();
    expect(container.querySelector("[data-rag-footer-region]")).toBeNull();
  });

  it("reacts in place for localized system-status row copy", async () => {
    openControlPanel("backend-health");
    const { runtime, container } = renderPanels();
    const row = container.querySelector('[data-backend-row="application"]');
    const label = row?.querySelector(".text-body");
    expect(label?.textContent).toBe(en.common.systemStatus.labels.application);

    await act(() => runtime.changeLanguage(ltrTestLocale));
    expect(container.querySelector('[data-backend-row="application"]')).toBe(row);
    expect(label?.textContent).toBe(
      ltrTestResources.common.systemStatus.labels.application,
    );

    await act(() => runtime.changeLanguage(rtlTestLocale));
    expect(container.querySelector('[data-backend-row="application"]')).toBe(row);
    expect(label?.textContent).toBe(
      rtlTestResources.common.systemStatus.labels.application,
    );
  });

  it.each([
    [
      "search-service",
      en.common.controlPanels.labels.search,
      ltrTestResources.common.controlPanels.labels.search,
      rtlTestResources.common.controlPanels.labels.search,
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
    [
      "agent-service",
      en.common.controlPanels.labels.agentService,
      ltrTestResources.common.controlPanels.labels.agentService,
      rtlTestResources.common.controlPanels.labels.agentService,
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

  it("does not read agent lifecycle state while every panel is closed", () => {
    const { container, client } = renderPanels();
    expect(container.querySelector("[data-a2a-lifecycle-panel]")).toBeNull();
    expect(
      client
        .getQueryCache()
        .getAll()
        .some((query) => query.queryKey.includes("a2a-lifecycle")),
    ).toBe(false);
  });

  it("mounts the agent lifecycle panel and its status read only while its dialog is open", () => {
    openControlPanel("agent-service");
    const { container, client } = renderPanels();
    // The panel body mounts under the open dialog.
    expect(container.querySelector("[data-a2a-lifecycle-panel]")).toBeTruthy();
    // Its machine-global lifecycle status read is registered (mount-gated), so a
    // closed panel performs no service read (data-loading-activity).
    expect(
      client
        .getQueryCache()
        .getAll()
        .some((query) => query.queryKey.includes("a2a-lifecycle")),
    ).toBe(true);
  });

  it("no longer hosts an approvals modal (review folded into the Agent panel)", () => {
    // The retired approvals id is not a modal ControlPanelId: opening it is a no-op
    // at the boundary, so no dialog can be summoned and the review station never
    // mounts in this host (review-surface-flow ADR F1).
    openControlPanel("approvals");
    expect(useControlPanels.getState().open).toBeNull();
    renderPanels();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector("[data-review-station]")).toBeNull();
    expect(document.querySelector("[data-proposal-list]")).toBeNull();
  });

  it("uses safe fallback copy when the common bundle is unavailable", () => {
    openControlPanel("backend-health");
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
