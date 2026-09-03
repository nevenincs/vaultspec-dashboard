// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nextProvider } from "react-i18next";

import { createTestLocalizationRuntime } from "../../localization/testing";
import type { ProviderCatalogRecord } from "../../stores/server/agent/a2aTeam";
import {
  formatProviderHealthTimestamp,
  ProviderHealthStatus,
} from "./ProviderHealthStatus";

const provider: ProviderCatalogRecord = {
  provider_id: "provider-issued-id",
  display_name: "Provider-issued display",
  execution_mode: "execution-lane-issued-id",
  health: {
    configured: "available",
    transport: "unavailable",
    authentication: "unauthenticated",
    catalog: "available",
    admission: "not_admitted",
    selectable: false,
    reasons: ["A2A-issued transport reason"],
    checked_at: "2026-08-02T08:30:00Z",
  },
  catalog: {
    state: {
      status: "stale",
      checked_at: "2026-08-02T09:30:00Z",
      expires_at: "2026-08-02T10:30:00Z",
      reason: "A2A-issued catalog reason",
    },
    models: [],
    native_controls: [],
  },
};

afterEach(cleanup);

describe("ProviderHealthStatus", () => {
  it("renders every served health fact, freshness timestamp, and safe reason without inference", () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <ProviderHealthStatus providers={[provider]} />
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Model source health" }));

    const lane = document.querySelector<HTMLElement>(
      '[data-provider-health-provider="provider-issued-id"]',
    );
    expect(lane).toBeTruthy();
    const view = within(lane!);
    expect(view.getByText("Not selectable")).toBeTruthy();
    expect(view.getAllByText("Available")).toHaveLength(2);
    expect(view.getByText("Unavailable")).toBeTruthy();
    expect(view.getByText("Unauthenticated")).toBeTruthy();
    expect(view.getByText("Stale")).toBeTruthy();
    expect(view.getByText("Not admitted")).toBeTruthy();
    expect(view.getByText("A2A-issued transport reason")).toBeTruthy();
    expect(view.getByText("A2A-issued catalog reason")).toBeTruthy();
    expect(
      lane?.querySelector('[data-provider-health-axis="catalog"]')?.textContent,
    ).toContain("Available");
    expect(
      lane?.querySelector('[data-provider-health-axis="catalog-freshness"]')
        ?.textContent,
    ).toContain("Stale");

    const healthCheckedAt = formatProviderHealthTimestamp("en", "2026-08-02T08:30:00Z");
    const catalogCheckedAt = formatProviderHealthTimestamp(
      "en",
      "2026-08-02T09:30:00Z",
    );
    const expiresAt = formatProviderHealthTimestamp("en", "2026-08-02T10:30:00Z");
    expect(healthCheckedAt).not.toBeNull();
    expect(catalogCheckedAt).not.toBeNull();
    expect(expiresAt).not.toBeNull();
    expect(view.getByText(`Health checked ${healthCheckedAt}`)).toBeTruthy();
    expect(view.getByText(`Catalog checked ${catalogCheckedAt}`)).toBeTruthy();
    expect(view.getByText(`Expires ${expiresAt}`)).toBeTruthy();
  });

  it("omits malformed timestamp evidence rather than formatting a browser-authored value", () => {
    expect(formatProviderHealthTimestamp("en", "not-an-instant")).toBeNull();
    expect(formatProviderHealthTimestamp("en", undefined)).toBeNull();
  });
});
