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
import { SHELL_MESSAGES } from "../../stores/view/shellLayout";
import { DockActivityPanelToggle } from "./DockWorkspace";

afterEach(cleanup);

describe("DockActivityPanelToggle", () => {
  it("localizes the toggle without replacing its node or changing its callback", async () => {
    const toggles: string[] = [];
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <DockActivityPanelToggle
          label={SHELL_MESSAGES.showActivityPanel}
          active={false}
          onToggle={() => toggles.push("activity")}
        />
      </I18nextProvider>,
    );

    const button = screen.getByRole("button", { name: "Show activity panel" });
    fireEvent.click(button);
    expect(toggles).toEqual(["activity"]);

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("button", {
        name: ltrTestResources.common.actions.showActivityPanel,
      }),
    ).toBe(button);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("button", {
        name: rtlTestResources.common.actions.showActivityPanel,
      }),
    ).toBe(button);
    expect(button.getAttribute("aria-label")).not.toMatch(/right rail|internal/iu);
  });
});
