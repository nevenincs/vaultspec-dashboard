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
import {
  DashboardHeaderBar,
  RagJobDashboard,
  type DashboardHeaderBarProps,
} from "./RagJobDashboard";

let activeClient: QueryClient | null = null;

afterEach(() => {
  cleanup();
  activeClient?.clear();
  activeClient = null;
});

function renderHeader(overrides: Partial<DashboardHeaderBarProps> = {}) {
  const runtime = createTestLocalizationRuntime();
  const starts: Array<boolean | undefined> = [];
  const counts = { stop: 0, restart: 0, doctor: 0, reindex: 0 };
  const props: DashboardHeaderBarProps = {
    running: true,
    healthWord: "Running",
    healthTone: "active",
    actionsPending: false,
    doctorPending: false,
    reindexActive: false,
    onStart: (autoProvision) => starts.push(autoProvision),
    onStop: () => {
      counts.stop += 1;
    },
    onRestart: () => {
      counts.restart += 1;
    },
    onDoctor: () => {
      counts.doctor += 1;
    },
    onReindex: () => {
      counts.reindex += 1;
    },
    ...overrides,
  };
  const result = render(
    <I18nextProvider i18n={runtime}>
      <DashboardHeaderBar {...props} />
    </I18nextProvider>,
  );
  return { ...result, runtime, starts, counts };
}

describe("DashboardHeaderBar", () => {
  it("localizes the Search heading in place", async () => {
    const { runtime } = renderHeader();
    const heading = screen.getByText(en.common.controlPanels.labels.search);

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(screen.getByText(ltrTestResources.common.controlPanels.labels.search)).toBe(
      heading,
    );

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(screen.getByText(rtlTestResources.common.controlPanels.labels.search)).toBe(
      heading,
    );
  });

  it("shows running actions and dispatches their callbacks", () => {
    const { counts } = renderHeader();
    const stop = screen.getByRole("button", { name: "Stop" });
    const restart = screen.getByRole("button", { name: "Restart" });
    const doctor = screen.getByRole("button", { name: "Check health" });
    const reindex = screen.getByRole("button", { name: "Reindex documents" });

    expect((reindex as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(stop);
    fireEvent.click(restart);
    fireEvent.click(doctor);
    fireEvent.click(reindex);
    expect(counts).toEqual({ stop: 1, restart: 1, doctor: 1, reindex: 1 });
    expect(screen.getByText("Running")).toBeTruthy();
  });

  it("keeps reindex visible with a reason while Search is stopped", () => {
    renderHeader({
      running: false,
      healthWord: "Not running",
      healthTone: "broken",
    });

    expect(screen.getByRole("button", { name: "Start service" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    const reindex = screen.getByRole("button", {
      name: "Reindex documents",
    }) as HTMLButtonElement;
    expect(reindex.disabled).toBe(true);
    expect(reindex.parentElement?.getAttribute("title")).toContain(
      "Start the search service",
    );
    expect(screen.getByText("Not running")).toBeTruthy();
  });

  it("dispatches the install retry choice", () => {
    const { starts } = renderHeader({
      running: false,
      healthWord: "Not running",
      healthTone: "broken",
      startOutcome: { status: "needs_install", attached: false },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry with auto-provision" }));
    expect(starts).toEqual([true]);
  });

  it("renders the supplied degraded reason", () => {
    renderHeader({
      running: false,
      healthWord: "Not responding",
      healthTone: "stale",
      degradedReason: "Semantic search is offline.",
    });
    expect(screen.getByText("Semantic search is offline.")).toBeTruthy();
  });

  it("renders the unavailable state as a degraded block", () => {
    const { container } = renderHeader({
      running: false,
      healthWord: "Not running",
      healthTone: "broken",
      errored: true,
    });
    expect(container.querySelector('[data-state-block="degraded"]')).toBeTruthy();
  });

  it("shows inline reindex progress while a job is active", () => {
    const { container } = renderHeader({
      reindexActive: true,
      reindexFraction: 0.42,
      reindexLabel: "embedding",
    });
    expect(container.querySelector("[data-rag-reindex-progress]")).toBeTruthy();
    expect(screen.getByText("embedding")).toBeTruthy();
  });
});

describe("RagJobDashboard", () => {
  it("composes the header over both body regions", () => {
    const runtime = createTestLocalizationRuntime();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    activeClient = client;
    const { container } = render(
      <I18nextProvider i18n={runtime}>
        <QueryClientProvider client={client}>
          <RagJobDashboard />
        </QueryClientProvider>
      </I18nextProvider>,
    );
    expect(container.querySelector("[data-rag-job-dashboard]")).toBeTruthy();
    expect(container.querySelector("[data-rag-dashboard-header]")).toBeTruthy();
    const body = container.querySelector("[data-rag-dashboard-body]");
    expect(body).toBeTruthy();
    expect((body as HTMLElement).children.length).toBe(2);
    expect(container.querySelector("[data-rag-dashboard-header] button")).toBeTruthy();
  });
});
