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
import type { BrowserMode } from "../../stores/view/browserMode";
import { IconRail } from "./IconRail";

afterEach(cleanup);

describe("IconRail", () => {
  it("localizes browser modes without changing raw callbacks or button identity", async () => {
    const selected: BrowserMode[] = [];
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <IconRail active="vault" onSelect={(mode) => selected.push(mode)} />
      </I18nextProvider>,
    );

    const nav = screen.getByRole("navigation", { name: "Collapsed navigation" });
    const documents = screen.getByRole("button", { name: "Documents" });
    const files = screen.getByRole("button", { name: "Files" });
    const expectNoRawModeCopy = () => {
      for (const button of nav.querySelectorAll("button")) {
        expect(button.getAttribute("aria-label")).not.toMatch(
          /\b(?:Vault|vault|code)\b/u,
        );
      }
    };
    expectNoRawModeCopy();

    fireEvent.click(files);
    expect(selected).toEqual(["code"]);

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("navigation", {
        name: ltrTestResources.common.shell.accessibility.collapsedNavigation,
      }),
    ).toBe(nav);
    expect(
      screen.getByRole("button", {
        name: ltrTestResources.documents.browserModes.documents,
      }),
    ).toBe(documents);
    expect(
      screen.getByRole("button", {
        name: ltrTestResources.documents.browserModes.files,
      }),
    ).toBe(files);
    expectNoRawModeCopy();

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("navigation", {
        name: rtlTestResources.common.shell.accessibility.collapsedNavigation,
      }),
    ).toBe(nav);
    expect(
      screen.getByRole("button", {
        name: rtlTestResources.documents.browserModes.documents,
      }),
    ).toBe(documents);
    expect(
      screen.getByRole("button", {
        name: rtlTestResources.documents.browserModes.files,
      }),
    ).toBe(files);
    expectNoRawModeCopy();
  });
});
