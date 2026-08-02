// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nextProvider } from "react-i18next";

import { createTestLocalizationRuntime } from "../../localization/testing";
import type {
  ProviderCatalogRecord,
  ProviderCatalogSelection,
} from "../../stores/server/agent/a2aTeam";
import { ComposerModelPicker } from "./ComposerModelPicker";

const provider: ProviderCatalogRecord = {
  provider_id: "provider-issued-id",
  display_name: "Provider-issued display",
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
    models: [
      {
        entry_id: "entry-issued-id",
        display_name: "Entry-issued display",
        capabilities: [],
        native_control_ids: ["provider-native-control-issued-id"],
      },
    ],
    native_controls: [
      {
        control_id: "provider-native-control-issued-id",
        display_name: "Provider-native control",
        options: [{ option_id: "provider-native-default-issued-id" }],
      },
    ],
  },
};

const selection: ProviderCatalogSelection = {
  provider_id: "provider-issued-id",
  execution_mode: "execution-lane-issued-id",
  catalog_revision: "catalog-revision-issued-id",
  entry_id: "entry-issued-id",
  controls: {},
};

afterEach(cleanup);

describe("ComposerModelPicker dialog focus", () => {
  it("announces its dialog, moves focus to the first model, and restores the trigger", async () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <ComposerModelPicker
          providers={[provider]}
          selection={selection}
          onSelectSelection={() => {}}
          locked={false}
        />
      </I18nextProvider>,
    );

    const trigger = screen.getByRole("button");
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-label")).not.toBeNull();
    const firstModel = within(dialog).getByRole("button", {
      name: /Entry-issued display/,
    });
    await waitFor(() => expect(document.activeElement).toBe(firstModel));

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
