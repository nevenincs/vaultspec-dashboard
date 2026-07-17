// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
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
import { VaultHealthPanel } from "./VaultHealthPanel";

let activeClient: QueryClient | null = null;

afterEach(() => {
  cleanup();
  activeClient?.clear();
  activeClient = null;
});

function renderPanel() {
  const runtime = createTestLocalizationRuntime();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  activeClient = client;
  const result = render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={client}>
        <VaultHealthPanel />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { ...result, runtime };
}

describe("VaultHealthPanel localization", () => {
  it("localizes the Project health heading in place", async () => {
    const { runtime } = renderPanel();
    const heading = screen.getByText(en.common.controlPanels.labels.projectHealth);

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByText(ltrTestResources.common.controlPanels.labels.projectHealth),
    ).toBe(heading);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByText(rtlTestResources.common.controlPanels.labels.projectHealth),
    ).toBe(heading);
  });

  it("uses safe fallback copy when the common bundle is unavailable", () => {
    const runtime = createTestLocalizationRuntime();
    runtime.removeResourceBundle("en", "common");
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    activeClient = client;
    render(
      <I18nextProvider i18n={runtime}>
        <QueryClientProvider client={client}>
          <VaultHealthPanel />
        </QueryClientProvider>
      </I18nextProvider>,
    );
    // Both the panel heading and the fail-closed health word are common-bundle
    // keys, so with the bundle removed each renders the safe fallback copy.
    expect(screen.getAllByText(SAFE_FALLBACK_SOURCE_MESSAGE).length).toBeGreaterThan(0);
  });
});
