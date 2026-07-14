// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
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
});
