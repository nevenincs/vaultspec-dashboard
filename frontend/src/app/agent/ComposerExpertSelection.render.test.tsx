// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nextProvider } from "react-i18next";

import { createTestLocalizationRuntime } from "../../localization/testing";
import type {
  ProviderCatalogRecord,
  ProviderCatalogSelection,
} from "../../stores/server/agent/a2aTeam";
import { ComposerExpertSelection } from "./ComposerExpertSelection";

const provider: ProviderCatalogRecord = {
  provider_id: "provider-issued-id",
  execution_mode: "execution-lane-issued-id",
  health: {
    configured: "available",
    transport: "available",
    authentication: "authenticated",
    catalog: "available",
    admission: "admitted",
    selectable: true,
    reasons: [],
  },
  catalog: {
    state: { status: "available", revision: "catalog-revision-issued-id" },
    models: [{ entry_id: "entry-issued-id", capabilities: [] }],
    native_controls: [],
  },
};

const selection: ProviderCatalogSelection = {
  provider_id: "provider-issued-id",
  execution_mode: "execution-lane-issued-id",
  catalog_revision: "catalog-revision-issued-id",
  entry_id: "entry-issued-id",
  controls: {},
};

function renderSelection(labels: Readonly<Record<string, string>>) {
  const runtime = createTestLocalizationRuntime();
  render(
    <I18nextProvider i18n={runtime}>
      <ComposerExpertSelection
        requiredRoles={["internal-role-issued-id"]}
        requiredRoleLabels={labels}
        providers={[provider]}
        selection={selection}
        overrides={{}}
        fallbacks={[]}
        onChangeOverrides={() => {}}
        onChangeFallbacks={() => {}}
        locked={false}
      />
    </I18nextProvider>,
  );
  fireEvent.click(screen.getByRole("button"));
}

afterEach(cleanup);

describe("ComposerExpertSelection role labels", () => {
  it("renders the served display label rather than its internal role id", () => {
    renderSelection({ "internal-role-issued-id": "Research specialist" });

    expect(screen.getByText("Research specialist")).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Research specialist/ })).toBeTruthy();
    expect(screen.queryByText("internal-role-issued-id")).toBeNull();
  });

  it("falls back to a localized ordinal rather than exposing an internal role id", () => {
    renderSelection({});

    expect(screen.getByText(/Agent 1/)).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Agent 1/ })).toBeTruthy();
    expect(screen.queryByText("internal-role-issued-id")).toBeNull();
  });
});
