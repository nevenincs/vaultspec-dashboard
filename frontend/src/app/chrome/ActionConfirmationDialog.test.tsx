// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { ActionConfirmationDialog } from "./ActionConfirmationDialog";

const confirmation = {
  kind: "destructive" as const,
  title: {
    key: "features:confirmations.archive.title" as const,
    values: { feature: "Search" },
  },
  body: { key: "features:confirmations.archive.body" as const },
  confirmLabel: { key: "features:destructiveActions.archive" as const },
  cancelLabel: { key: "common:actions.cancel" as const },
};

afterEach(cleanup);

describe("ActionConfirmationDialog", () => {
  it("resolves catalog content and confirms through the shared dialog", () => {
    let confirmations = 0;
    render(
      <I18nextProvider i18n={createTestLocalizationRuntime()}>
        <ActionConfirmationDialog
          open
          confirmation={confirmation}
          onConfirm={() => {
            confirmations += 1;
          }}
          onCancel={() => undefined}
        />
      </I18nextProvider>,
    );

    expect(screen.getByRole("dialog").textContent).toContain("Archive Search?");
    expect(screen.getByRole("dialog").textContent).toContain(
      "This removes the feature and its documents from active work.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive feature" }));
    expect(confirmations).toBe(1);
  });

  it("cancels without confirming", () => {
    let cancellations = 0;
    render(
      <I18nextProvider i18n={createTestLocalizationRuntime()}>
        <ActionConfirmationDialog
          open
          confirmation={confirmation}
          onConfirm={() => undefined}
          onCancel={() => {
            cancellations += 1;
          }}
        />
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancellations).toBe(1);
  });
});
