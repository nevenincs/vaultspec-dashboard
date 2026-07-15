// @vitest-environment happy-dom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { en } from "../../locales/en";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import { defaultIsMac } from "../../platform/keymap/chord";
import { DocChrome } from "./DocChrome";

afterEach(cleanup);

function renderChrome(mode: "view" | "edit" = "view") {
  const runtime = createTestLocalizationRuntime();
  const selections: Array<"view" | "edit"> = [];

  function ChromeHarness() {
    const [currentMode, setCurrentMode] = useState(mode);
    return (
      <DocChrome
        trail={[{ label: "doc" }]}
        mode={currentMode}
        onModeChange={(next) => {
          selections.push(next);
          setCurrentMode(next);
        }}
        canEdit
      />
    );
  }

  const result = render(
    <I18nextProvider i18n={runtime}>
      <ChromeHarness />
    </I18nextProvider>,
  );
  return { ...result, runtime, selections };
}

describe("DocChrome", () => {
  it.each(["view", "edit"] as const)(
    "keeps shortcut hints in hover tooltips in %s mode",
    (mode) => {
      renderChrome(mode);
      const primary = defaultIsMac() ? "⌘" : "Ctrl";
      const group = screen.getByRole("radiogroup", {
        name: en.documents.viewer.accessibility.documentMode,
      });

      expect(document.querySelector("[data-doc-chrome-accelerators]")).toBeNull();
      expect(document.querySelector("kbd")).toBeNull();
      expect(
        within(group).getByRole("radio", { name: en.documents.viewer.modes.view })
          .title,
      ).toBe(`Switch between reading and editing (${primary} E)`);
      expect(
        within(group).getByRole("radio", { name: en.documents.viewer.modes.edit })
          .title,
      ).toBe(`Switch between reading and editing (${primary} E)`);
    },
  );

  it("localizes the mode controls in place without changing their behavior", async () => {
    const { runtime, selections } = renderChrome();
    const primary = defaultIsMac() ? "⌘" : "Ctrl";
    const group = screen.getByRole("radiogroup", {
      name: en.documents.viewer.accessibility.documentMode,
    });
    const view = within(group).getByRole("radio", {
      name: en.documents.viewer.modes.view,
    });
    const edit = within(group).getByRole("radio", {
      name: en.documents.viewer.modes.edit,
    });

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("radiogroup", {
        name: ltrTestResources.documents.viewer.accessibility.documentMode,
      }),
    ).toBe(group);
    expect(
      within(group).getByRole("radio", {
        name: ltrTestResources.documents.viewer.modes.view,
      }),
    ).toBe(view);
    expect(
      within(group).getByRole("radio", {
        name: ltrTestResources.documents.viewer.modes.edit,
      }),
    ).toBe(edit);
    expect(view.title).toBe(
      `Basculer entre la lecture et la modification (${primary} E)`,
    );

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("radiogroup", {
        name: rtlTestResources.documents.viewer.accessibility.documentMode,
      }),
    ).toBe(group);
    expect(
      within(group).getByRole("radio", {
        name: rtlTestResources.documents.viewer.modes.view,
      }),
    ).toBe(view);
    expect(
      within(group).getByRole("radio", {
        name: rtlTestResources.documents.viewer.modes.edit,
      }),
    ).toBe(edit);

    fireEvent.click(edit);
    expect(selections).toEqual(["edit"]);
    expect(edit.getAttribute("aria-checked")).toBe("true");
  });
});
