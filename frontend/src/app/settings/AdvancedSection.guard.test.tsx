// @vitest-environment happy-dom
//
// The Advanced section guard (advanced-service-console ADR D1/D2). It pins the
// truth that replaced the retired modal `ControlPanels` host:
//   - a COLLAPSED console mounts nothing and reads nothing (the accordion is the
//     mount gate — data-loading-activity);
//   - at most ONE console is expanded, so opening a second closes the first;
//   - every operational console lives HERE and nowhere else — the retired modal
//     panel ids resolve to nothing at the boundary (no legacy alias);
//   - the agent LIFECYCLE console is retired outright: `agent` is not a console
//     id, nothing mounts it, and no `/a2a/lifecycle/*` read is registered from
//     anywhere in this section;
//   - the fold labels re-render in place across locales.

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
  collapseAdvancedConsoles,
  expandAdvancedConsole,
  normalizeAdvancedConsoleId,
  useAdvancedConsole,
} from "../../stores/view/advancedConsole";
import { AdvancedSection } from "./AdvancedSection";

let activeClient: QueryClient | null = null;

afterEach(() => {
  collapseAdvancedConsoles();
  cleanup();
  activeClient?.clear();
  activeClient = null;
});

function renderSection() {
  const runtime = createTestLocalizationRuntime();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  activeClient = client;
  const result = render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={client}>
        <AdvancedSection />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { ...result, runtime, client };
}

function hasQueryPart(client: QueryClient, part: string): boolean {
  return client
    .getQueryCache()
    .getAll()
    .some((query) => query.queryKey.includes(part));
}

describe("Settings ▸ Advanced", () => {
  it("mounts nothing and reads nothing while every console is collapsed", () => {
    const { container, client } = renderSection();
    expect(container.querySelector("[data-advanced-section]")).toBeTruthy();
    expect(container.querySelector("[data-index-console]")).toBeNull();
    expect(container.querySelector("[data-backend-health-panel]")).toBeNull();
    expect(container.querySelector("[data-vault-health-panel]")).toBeNull();
    expect(hasQueryPart(client, "logs")).toBe(false);
  });

  it("mounts the whole index console — identity, updates, log, storage — when expanded", () => {
    expandAdvancedConsole("index");
    const { container, client } = renderSection();
    expect(container.querySelector("[data-index-console]")).toBeTruthy();
    expect(container.querySelector("[data-index-console-header]")).toBeTruthy();
    expect(container.querySelector("[data-index-identity]")).toBeTruthy();
    expect(container.querySelector("[data-rag-jobs-region]")).toBeTruthy();
    // The log tail is part of THIS console now (the owner's log ask), so its
    // bounded window read registers with the console rather than nowhere.
    expect(container.querySelector("[data-index-log-region]")).toBeTruthy();
    expect(hasQueryPart(client, "logs")).toBe(true);
    expect(container.querySelector("[data-rag-footer-region]")).toBeTruthy();
  });

  it("hosts no agent lifecycle console — the id is retired, not aliased", () => {
    // The install / start / stop / repair / update / rollback / remove / doctor
    // surface is gone. `agent` is no longer a console id, so the deep-link path
    // cannot revive it, and nothing under this section reads `/a2a/lifecycle/*`.
    expect(normalizeAdvancedConsoleId("agent")).toBeNull();
    expandAdvancedConsole("agent");
    expect(useAdvancedConsole.getState().expanded).toBeNull();
    const { container, client } = renderSection();
    expect(container.querySelector("[data-a2a-lifecycle-panel]")).toBeNull();
    expect(hasQueryPart(client, "a2a-lifecycle")).toBe(false);
  });

  it("keeps one console expanded at a time", () => {
    const { container } = renderSection();
    const foldFor = (id: string) =>
      container
        .querySelector(`[data-advanced-console="${id}"]`)
        ?.querySelector("[data-fold-toggle]") as HTMLElement;

    fireEvent.click(foldFor("system"));
    expect(container.querySelector("[data-backend-health-panel]")).toBeTruthy();
    expect(useAdvancedConsole.getState().expanded).toBe("system");

    fireEvent.click(foldFor("project"));
    expect(container.querySelector("[data-backend-health-panel]")).toBeNull();
    expect(container.querySelector("[data-vault-health-panel]")).toBeTruthy();
    expect(useAdvancedConsole.getState().expanded).toBe("project");

    fireEvent.click(foldFor("project"));
    expect(container.querySelector("[data-vault-health-panel]")).toBeNull();
    expect(useAdvancedConsole.getState().expanded).toBeNull();
  });

  it("hosts no legacy panel identity — the retired modal ids resolve to nothing", () => {
    for (const retired of [
      "search-service",
      "backend-health",
      "vault-health",
      "agent-service",
      "approvals",
    ]) {
      expect(normalizeAdvancedConsoleId(retired)).toBeNull();
    }
    expandAdvancedConsole("search-service");
    expect(useAdvancedConsole.getState().expanded).toBeNull();
    const { container } = renderSection();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector("[data-index-console]")).toBeNull();
  });

  it("localizes the section and its console labels in place", async () => {
    const { runtime } = renderSection();
    const title = screen.getByText(en.common.advanced.title);
    const systemLabel = screen.getByText(en.common.advanced.labels.systemStatus);

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(screen.getByText(ltrTestResources.common.advanced.title)).toBe(title);
    expect(screen.getByText(ltrTestResources.common.advanced.labels.systemStatus)).toBe(
      systemLabel,
    );

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(screen.getByText(rtlTestResources.common.advanced.title)).toBe(title);
    expect(screen.getByText(rtlTestResources.common.advanced.labels.systemStatus)).toBe(
      systemLabel,
    );
  });
});
