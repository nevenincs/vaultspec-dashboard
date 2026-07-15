// @vitest-environment happy-dom

import { I18nextProvider } from "react-i18next";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import {
  goToCreateDocDocumentStage,
  openCreateDocDialog,
  resetCreateDocChrome,
  setCreateDocError,
  setCreateDocRelated,
} from "../../stores/view/createDocChrome";
import {
  createMenuTestQueryClient,
  MenuTestProviders,
} from "../../testing/menuQueryClient";
import { CreateDocDialog } from "./CreateDocDialog";

afterEach(() => {
  resetCreateDocChrome();
  cleanup();
});

function renderLocalized(language?: typeof ltrTestLocale | typeof rtlTestLocale) {
  const runtime = createTestLocalizationRuntime(language);
  const view = render(
    <I18nextProvider i18n={runtime}>
      <MenuTestProviders client={createMenuTestQueryClient()}>
        <CreateDocDialog />
      </MenuTestProviders>
    </I18nextProvider>,
  );
  return { runtime, view };
}

describe("localized create document dialog", () => {
  it("renders genuine English, French, and Arabic dialog copy from production keys", () => {
    for (const language of [undefined, ltrTestLocale, rtlTestLocale] as const) {
      const { runtime, view } = renderLocalized(language);
      act(() => openCreateDocDialog("private-feature-value"));

      const featureTitle = runtime.t("documents:createDialog.titles.feature");
      const dialog = screen.getByRole("dialog", { name: featureTitle });
      expect(dialog.textContent).toContain(
        runtime.t("documents:createDialog.descriptions.featureStage"),
      );
      expect(
        screen.getByRole("combobox", {
          name: runtime.t("documents:createDialog.accessibility.feature"),
        }),
      ).toBeTruthy();
      expect(
        screen.getByRole("region", {
          name: runtime.t("documents:createDialog.accessibility.pipelineCoverage"),
        }),
      ).toBeTruthy();
      expect(featureTitle).not.toMatch(/private-feature-value|\b(?:count|id)\b|—/iu);

      fireEvent.click(
        screen.getByRole("button", {
          name: runtime.t("documents:createDialog.actions.continue"),
        }),
      );
      expect(
        screen.getByRole("dialog", {
          name: runtime.t("documents:createDialog.titles.document"),
        }),
      ).toBeTruthy();
      expect(
        screen.getByRole("radiogroup", {
          name: runtime.t("documents:createDialog.accessibility.documentType"),
        }),
      ).toBeTruthy();
      expect(
        screen.getByRole("textbox", {
          name: runtime.t("documents:createDialog.accessibility.title"),
        }),
      ).toBeTruthy();

      resetCreateDocChrome();
      view.unmount();
    }
  });

  it("interpolates only the intended document stem in the remove action", () => {
    const { runtime } = renderLocalized();
    act(() => openCreateDocDialog("feature-value"));
    act(() => setCreateDocRelated(["authored-document-stem"]));
    act(() => goToCreateDocDocumentStage());

    expect(
      screen.getByRole("button", {
        name: runtime.t("documents:createDialog.accessibility.removeLinkedDocument", {
          document: "authored-document-stem",
        }),
      }),
    ).toBeTruthy();
  });

  it("rejects hostile diagnostics and renders only the safe recovery boundary", () => {
    const { runtime } = renderLocalized();
    act(() => openCreateDocDialog("feature-value"));
    act(() =>
      setCreateDocError(
        "EngineError: actor human:private failed at /private/path receipt_123",
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();

    act(() => setCreateDocError("create-failed"));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(
      runtime.t("documents:createDialog.errors.createFailed"),
    );
    expect(alert.textContent).not.toMatch(
      /EngineError|human:private|private\/path|receipt_123/,
    );
  });
});
