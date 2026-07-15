// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import { queryClient } from "../../stores/server/queryClient";
import {
  resetCompactSurface,
  setCompactSurface,
} from "../../stores/view/compactSurface";
import { useViewStore } from "../../stores/view/viewStore";
import { liveScope } from "../../testing/liveClient";
import { ENGINE_WAIT } from "../../testing/timing";
import { CompactAppShell } from "./CompactAppShell";

function renderShell(runtime = createTestLocalizationRuntime()) {
  const result = render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={queryClient}>
        <CompactAppShell />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { ...result, runtime };
}

describe("CompactAppShell localization", () => {
  let scope: string;
  let worktree: string;

  beforeAll(async () => {
    scope = await liveScope();
    worktree = scope.split(/[\\/]/).pop() ?? scope;
  });

  beforeEach(() => {
    resetCompactSurface();
    useViewStore.getState().setScope(scope);
  });

  afterEach(async () => {
    cleanup();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0), ENGINE_WAIT);
    queryClient.clear();
    resetCompactSurface();
    useViewStore.getState().setScope(null);
  });

  it("localizes skip and workspace guidance while preserving raw workspace data", async () => {
    const { runtime } = renderShell();
    const sourceSkip = screen.getByText("Skip to content");
    const sourceTitle = screen.getByText(worktree);
    const sourceTrigger = screen.getByRole("button", {
      name: `Switch workspace from ${worktree}`,
    });

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(screen.getByText(ltrTestResources.common.accessibility.skipToContent)).toBe(
      sourceSkip,
    );
    expect(
      screen.getByRole("button", {
        name: `Changer d’espace de travail depuis ${worktree}`,
      }),
    ).toBe(sourceTrigger);
    expect(screen.getByText(worktree)).toBe(sourceTitle);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(screen.getByText(rtlTestResources.common.accessibility.skipToContent)).toBe(
      sourceSkip,
    );
    expect(
      screen.getByRole("button", {
        name: `تبديل مساحة العمل من ${worktree}`,
      }),
    ).toBe(sourceTrigger);
    expect(screen.getByText(worktree)).toBe(sourceTitle);
  });

  it("updates the timeline heading without replacing its node", async () => {
    setCompactSurface("timeline");
    const { runtime } = renderShell();
    const heading = screen.getByRole("heading", { name: "Timeline" });

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("heading", {
        name: ltrTestResources.timeline.labels.timeline,
      }),
    ).toBe(heading);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("heading", {
        name: rtlTestResources.timeline.labels.timeline,
      }),
    ).toBe(heading);
  });
});
