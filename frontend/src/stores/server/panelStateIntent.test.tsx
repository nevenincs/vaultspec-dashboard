// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { createLiveClient, liveScope } from "../../testing/liveClient";
import { dashboardDocumentStateResetPatch } from "./dashboardState";
import {
  normalizeShellPanelCollapsed,
  normalizeShellPanelIntentScope,
  normalizeShellPanelRightTab,
  useShellPanelIntent,
} from "./panelStateIntent";

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
}

let cleanupScope: string | null = null;

afterEach(async () => {
  cleanup();
  if (cleanupScope) {
    await createLiveClient()
      .patchDashboardState(dashboardDocumentStateResetPatch(cleanupScope))
      .catch(() => undefined);
    cleanupScope = null;
  }
});

describe("useShellPanelIntent", () => {
  it("normalizes runtime scope values", () => {
    expect(normalizeShellPanelIntentScope(" scope-a ")).toBe("scope-a");
    expect(normalizeShellPanelIntentScope("   ")).toBeNull();
    expect(normalizeShellPanelIntentScope({ scope: "scope-a" })).toBeNull();
  });

  it("normalizes runtime panel intent values", () => {
    expect(normalizeShellPanelCollapsed(true)).toBe(true);
    expect(normalizeShellPanelCollapsed(false)).toBe(false);
    expect(normalizeShellPanelCollapsed("true")).toBeNull();
    expect(normalizeShellPanelCollapsed(1)).toBeNull();
    expect(normalizeShellPanelRightTab(" changes ")).toBe("changes");
    expect(normalizeShellPanelRightTab("missing")).toBeNull();
    expect(normalizeShellPanelRightTab("search")).toBeNull();
    expect(normalizeShellPanelRightTab({ tab: "changes" })).toBeNull();
  });

  it("is inert without a scope", async () => {
    const client = testQueryClient();
    const { result } = renderHook(() => useShellPanelIntent(null), {
      wrapper: wrapper(client),
    });

    await expect(result.current.setLeftCollapsed(true)).resolves.toBeNull();
    await expect(result.current.setRightCollapsed(true)).resolves.toBeNull();
    await expect(result.current.setRightTab("changes")).resolves.toBeNull();
  });

  it("keeps panel intent callbacks stable across unchanged-scope rerenders", () => {
    const client = testQueryClient();
    const { result, rerender } = renderHook(({ scope }) => useShellPanelIntent(scope), {
      initialProps: { scope: " scope-a " },
      wrapper: wrapper(client),
    });
    const first = result.current;

    rerender({ scope: "scope-a" });

    expect(result.current).toBe(first);
    expect(result.current.setLeftCollapsed).toBe(first.setLeftCollapsed);
    expect(result.current.setRightCollapsed).toBe(first.setRightCollapsed);
    expect(result.current.setRightTab).toBe(first.setRightTab);
  });

  it("accepts trimmed scopes for canonical dashboard panel-state writes", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState(
      dashboardDocumentStateResetPatch(scope),
    );

    const client = testQueryClient();
    const { result } = renderHook(() => useShellPanelIntent(` ${scope} `), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current.setLeftCollapsed(true);
      await result.current.setRightCollapsed(true);
      await result.current.setRightTab("changes");
    });

    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      panel_state: {
        left_collapsed: true,
        right_collapsed: true,
        right_tab: "changes",
      },
    });
  });

  it("rejects malformed runtime panel values before panel-state writes", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      panel_state: {
        left_collapsed: false,
        right_collapsed: false,
        right_tab: "status",
      },
    });

    const client = testQueryClient();
    const { result } = renderHook(() => useShellPanelIntent(scope), {
      wrapper: wrapper(client),
    });

    await expect(result.current.setLeftCollapsed("true")).resolves.toBeNull();
    await expect(result.current.setRightCollapsed(1)).resolves.toBeNull();
    await expect(result.current.setRightTab("missing")).resolves.toBeNull();
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      panel_state: {
        left_collapsed: false,
        right_collapsed: false,
        right_tab: "status",
      },
    });
  });

  it("rejects malformed runtime scope objects before panel-state writes", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      panel_state: {
        left_collapsed: false,
        right_collapsed: false,
        right_tab: "status",
      },
    });

    const client = testQueryClient();
    const { result } = renderHook(() => useShellPanelIntent({ scope }), {
      wrapper: wrapper(client),
    });

    await expect(result.current.setLeftCollapsed(true)).resolves.toBeNull();
    await expect(result.current.setRightCollapsed(true)).resolves.toBeNull();
    await expect(result.current.setRightTab("changes")).resolves.toBeNull();
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      panel_state: {
        left_collapsed: false,
        right_collapsed: false,
        right_tab: "status",
      },
    });
  });
});
