// @vitest-environment happy-dom
//
// Document chrome keeps shortcut hints out of the visible UI. The View/Edit toggle
// exposes its registry-derived chord only through its native hover tooltip.

import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
} from "../../localization/testing";
import { defaultIsMac } from "../../platform/keymap/chord";
import { DocChrome } from "./DocChrome";

afterEach(cleanup);

function renderChrome(mode: "view" | "edit" = "view") {
  const runtime = createTestLocalizationRuntime();
  function ChromeHarness() {
    const [currentMode, setCurrentMode] = useState(mode);
    return (
      <DocChrome
        trail={[{ label: "doc" }]}
        mode={currentMode}
        onModeChange={setCurrentMode}
        canEdit
      />
    );
  }
  const result = render(
    <I18nextProvider i18n={runtime}>
      <ChromeHarness />
    </I18nextProvider>,
  );
  return { ...result, runtime };
}

describe("DocChrome accelerator hints", () => {
  it.each(["view", "edit"] as const)(
    "does not render inline shortcut hints in %s mode",
    (mode) => {
      renderChrome(mode);
      expect(document.querySelector("[data-doc-chrome-accelerators]")).toBeNull();
      expect(document.querySelector("kbd")).toBeNull();
    },
  );

  it.each(["view", "edit"] as const)(
    "keeps the registry-derived shortcut in hover tooltips in %s mode",
    (mode) => {
      renderChrome(mode);
      const primary = defaultIsMac() ? "⌘" : "Ctrl";
      expect(screen.getByRole("radio", { name: "View" }).getAttribute("title")).toBe(
        `Switch between reading and editing (${primary} E)`,
      );
      expect(screen.getByRole("radio", { name: "Edit" }).getAttribute("title")).toBe(
        `Switch between reading and editing (${primary} E)`,
      );
    },
  );

  it("reactively localizes the complete shortcut tooltip", async () => {
    const { runtime } = renderChrome();
    const view = screen.getByRole("radio", { name: "View" });
    const primary = defaultIsMac() ? "⌘" : "Ctrl";

    await act(async () => runtime.changeLanguage(ltrTestLocale));

    expect(view.getAttribute("title")).toBe(
      `Basculer entre la lecture et la modification (${primary} E)`,
    );
  });
});
