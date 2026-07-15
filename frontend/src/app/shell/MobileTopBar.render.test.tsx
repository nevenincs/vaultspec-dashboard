// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import { MobileTopBar } from "./MobileTopBar";
import { SAFE_FALLBACK_SOURCE_MESSAGE } from "../../platform/localization/fallback";

afterEach(cleanup);

describe("MobileTopBar localized actions", () => {
  it("updates a typed accessible label without replacing the stable action node", async () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <MobileTopBar
          title="Workspace"
          actions={[
            {
              id: "action:retry",
              label: { key: "common:actions.retry" },
              text: { key: "common:actions.retry" },
              onClick: () => undefined,
            },
          ]}
        />
      </I18nextProvider>,
    );

    const sourceButton = screen.getByRole("button", { name: "Retry" });
    await act(async () => runtime.changeLanguage(ltrTestLocale));
    const localizedButton = screen.getByRole("button", {
      name: ltrTestResources.common.actions.retry,
    });

    expect(localizedButton).toBe(sourceButton);
    expect(localizedButton.textContent).toBe(ltrTestResources.common.actions.retry);
  });

  it("keeps a fallback action visible by id but disables its callback", () => {
    const runtime = createTestLocalizationRuntime();
    runtime.removeResourceBundle("en", "common");
    let activations = 0;
    render(
      <I18nextProvider i18n={runtime}>
        <MobileTopBar
          title="Workspace"
          actions={[
            {
              id: "action:retry",
              label: { key: "common:actions.retry" },
              text: { key: "common:actions.retry" },
              onClick: () => {
                activations += 1;
              },
            },
          ]}
        />
      </I18nextProvider>,
    );

    const button = screen.getByRole("button", {
      name: SAFE_FALLBACK_SOURCE_MESSAGE,
    });
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
    expect(activations).toBe(0);
  });

  it("localizes back and workspace controls without replacing their nodes", async () => {
    const runtime = createTestLocalizationRuntime();
    let backActivations = 0;
    let titleActivations = 0;
    render(
      <I18nextProvider i18n={runtime}>
        <MobileTopBar
          title="main"
          onBack={() => {
            backActivations += 1;
          }}
          onTitleActivate={() => {
            titleActivations += 1;
          }}
        />
      </I18nextProvider>,
    );

    const back = screen.getByRole("button", { name: "Back" });
    const title = screen.getByRole("button", {
      name: "Switch workspace from main",
    });

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("button", {
        name: ltrTestResources.common.accessibility.back,
      }),
    ).toBe(back);
    expect(
      screen.getByRole("button", {
        name: "Changer d’espace de travail depuis main",
      }),
    ).toBe(title);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("button", {
        name: rtlTestResources.common.accessibility.back,
      }),
    ).toBe(back);
    expect(screen.getByRole("button", { name: "تبديل مساحة العمل من main" })).toBe(
      title,
    );

    fireEvent.click(back);
    fireEvent.click(title);
    expect(backActivations).toBe(1);
    expect(titleActivations).toBe(1);
  });

  it("keeps Back operable with safe fallback while other controls fail closed", () => {
    const runtime = createTestLocalizationRuntime();
    runtime.removeResourceBundle("en", "common");
    let activations = 0;
    render(
      <I18nextProvider i18n={runtime}>
        <MobileTopBar
          title="main"
          onBack={() => {
            activations += 1;
          }}
          onTitleActivate={() => {
            activations += 1;
          }}
        />
      </I18nextProvider>,
    );

    const controls = screen.getAllByRole("button", {
      name: SAFE_FALLBACK_SOURCE_MESSAGE,
    });
    expect(controls).toHaveLength(2);
    const back = controls.find(
      (control) => control.getAttribute("aria-pressed") === "false",
    );
    const title = controls.find((control) => control.hasAttribute("aria-haspopup"));
    expect(back?.hasAttribute("disabled")).toBe(false);
    expect(title?.hasAttribute("disabled")).toBe(true);
    if (back) fireEvent.click(back);
    if (title) fireEvent.click(title);
    expect(activations).toBe(1);
  });
});
