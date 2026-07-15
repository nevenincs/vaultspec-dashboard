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
import { BrowserModeToggle } from "./BrowserModeToggle";

afterEach(cleanup);

describe("BrowserModeToggle", () => {
  it("localizes presentation while preserving raw ids, callbacks, and DOM identity", async () => {
    const selected: BrowserMode[] = [];
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <BrowserModeToggle mode="vault" onModeChange={(mode) => selected.push(mode)} />
      </I18nextProvider>,
    );

    const group = screen.getByRole("radiogroup", { name: "Browser view" });
    const documents = screen.getByRole("radio", { name: "Documents" });
    const files = screen.getByRole("radio", { name: "Files" });
    const expectNoRawModeCopy = () => {
      expect(group.textContent).not.toMatch(/\b(?:Vault|vault|code)\b/u);
      expect(group.getAttribute("aria-label")).not.toMatch(/\b(?:Vault|vault|code)\b/u);
    };
    expectNoRawModeCopy();
    expect(
      documents.querySelector("[data-browser-mode]")?.getAttribute("data-browser-mode"),
    ).toBe("vault");
    expect(
      files.querySelector("[data-browser-mode]")?.getAttribute("data-browser-mode"),
    ).toBe("code");
    fireEvent.click(files);
    expect(selected).toEqual(["code"]);

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("radiogroup", {
        name: ltrTestResources.documents.accessibility.browserView,
      }),
    ).toBe(group);
    expect(
      screen.getByRole("radio", {
        name: ltrTestResources.documents.browserModes.documents,
      }),
    ).toBe(documents);
    expect(
      screen.getByRole("radio", {
        name: ltrTestResources.documents.browserModes.files,
      }),
    ).toBe(files);
    expectNoRawModeCopy();

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("radiogroup", {
        name: rtlTestResources.documents.accessibility.browserView,
      }),
    ).toBe(group);
    expect(
      screen.getByRole("radio", {
        name: rtlTestResources.documents.browserModes.documents,
      }),
    ).toBe(documents);
    expect(
      screen.getByRole("radio", {
        name: rtlTestResources.documents.browserModes.files,
      }),
    ).toBe(files);
    expectNoRawModeCopy();
  });
});
