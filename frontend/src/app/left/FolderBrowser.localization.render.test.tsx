// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import type { FsListResponse } from "../../stores/server/engine";
import { deriveFolderBrowserView, FolderBrowser } from "./FolderBrowser";

afterEach(() => cleanup());

const level: FsListResponse = {
  path: "C:/code",
  parent: "C:/",
  is_registered: false,
  entries: [
    {
      name: "Authored folder",
      path: "C:/code/Authored folder",
      is_managed: false,
      is_git: true,
      is_hidden: false,
      is_registered: false,
    },
    {
      name: "plain",
      path: "C:/code/plain",
      is_managed: false,
      is_git: false,
      is_hidden: false,
      is_registered: false,
    },
  ],
  places: [],
  truncated: true,
  tiers: {},
};

function renderBrowser(runtime: ReturnType<typeof createTestLocalizationRuntime>) {
  const view = deriveFolderBrowserView({
    data: level,
    loading: false,
    errored: false,
    filtered: false,
  });
  return render(
    <I18nextProvider i18n={runtime}>
      <FolderBrowser
        view={view}
        selectedPath={null}
        onSelect={() => {}}
        onNavigate={() => {}}
        query=""
        onQueryChange={() => {}}
        showHidden={false}
        onShowHiddenChange={() => {}}
      />
    </I18nextProvider>,
  );
}

describe("rendered FolderBrowser localization", () => {
  it("switches English to French to Arabic while preserving filesystem data", async () => {
    const runtime = createTestLocalizationRuntime();
    renderBrowser(runtime);

    const listbox = screen.getByRole("listbox", { name: "Folders" });
    const options = screen.getAllByRole("option");
    const folderNames = options.map(
      (option) => option.querySelector("span")?.textContent ?? "",
    );
    expect(folderNames).toEqual(["Authored folder", "plain"]);
    // The trail renders the localized roots crumb plus the path segments.
    expect(screen.getByText("This computer")).toBeTruthy();
    expect(screen.getByText("code")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Show hidden folders" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/256/u);

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("listbox", {
        name: ltrTestResources.projects.folderBrowser.accessibility.folders,
      }),
    ).toBe(listbox);
    expect(
      screen.getByText(ltrTestResources.projects.folderBrowser.labels.roots),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("option")
        .map((option) => option.querySelector("span")?.textContent ?? ""),
    ).toEqual(folderNames);
    // The git-repository row's accessible name is localized around the name.
    expect(
      screen.getByRole("option", { name: "Authored folder, dépôt Git" }),
    ).toBeTruthy();

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("listbox", {
        name: rtlTestResources.projects.folderBrowser.accessibility.folders,
      }),
    ).toBe(listbox);
    expect(
      screen.getByText(rtlTestResources.projects.folderBrowser.labels.roots),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("option")
        .map((option) => option.querySelector("span")?.textContent ?? ""),
    ).toEqual(folderNames);
    expect(document.body.textContent).not.toMatch(
      /projects:folderBrowser|git-repository|GET \/fs\/list|—/u,
    );
  });
});
