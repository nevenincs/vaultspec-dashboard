// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import { resetShellLayout } from "../../stores/view/shellLayout";
import { useViewStore } from "../../stores/view/viewStore";
import { ShellResizeHandle } from "./ShellResizeHandle";

beforeEach(resetShellLayout);
afterEach(() => {
  cleanup();
  resetShellLayout();
});

describe("ShellResizeHandle", () => {
  it("localizes the accessible name without replacing the separator or resize behavior", async () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <ShellResizeHandle side="right" axis="left" current={300} />
      </I18nextProvider>,
    );

    const separator = screen.getByRole("separator", {
      name: "Resize navigation panel",
    });
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(useViewStore.getState().leftRailWidth).toBe(316);

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("separator", {
        name: ltrTestResources.common.accessibility.resizeNavigationPanel,
      }),
    ).toBe(separator);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("separator", {
        name: rtlTestResources.common.accessibility.resizeNavigationPanel,
      }),
    ).toBe(separator);
  });
});
