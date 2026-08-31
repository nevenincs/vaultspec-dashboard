// @vitest-environment happy-dom

import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import { engineClient } from "../../stores/server/engine";
import {
  openAddProjectDialog,
  resetAddProjectChrome,
  setAddProjectIssue,
} from "../../stores/view/addProjectChrome";
import { liveTransport } from "../../testing/liveClient";
import {
  createMenuTestQueryClient,
  MenuTestProviders,
} from "../../testing/menuQueryClient";
import { ENGINE_WAIT } from "../../testing/timing";
import { AddProjectDialog } from "./AddProjectDialog";

beforeEach(() => engineClient.useTransport(liveTransport));
afterEach(() => {
  engineClient.useTransport(liveTransport);
  resetAddProjectChrome();
  cleanup();
});

describe("localized add project dialog", () => {
  it("reacts to English, French, and Arabic without replacing authored path data", async () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <MenuTestProviders client={createMenuTestQueryClient()}>
          <AddProjectDialog />
        </MenuTestProviders>
      </I18nextProvider>,
    );
    act(openAddProjectDialog);

    const dialog = screen.getByRole("dialog", {
      name: runtime.t("projects:addDialog.title"),
    });
    const input = screen.getByRole("textbox", {
      name: runtime.t("projects:addDialog.accessibility.folderPath"),
    }) as HTMLInputElement;
    const authoredPath = "C:\\مجلد\\API-v2";
    fireEvent.change(input, { target: { value: authoredPath } });
    expect(input.value).toBe(authoredPath);
    const confirm = screen.getByRole("button", {
      name: runtime.t("projects:addDialog.actions.pickFolder"),
    });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("dialog", {
        name: ltrTestResources.projects.addDialog.title,
      }),
    ).toBe(dialog);
    expect(input.value).toBe(authoredPath);
    expect(
      screen.getByRole("button", {
        name: runtime.t("projects:addDialog.actions.pickFolder"),
      }),
    ).toBe(confirm);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("dialog", {
        name: rtlTestResources.projects.addDialog.title,
      }),
    ).toBe(dialog);
    expect(input.value).toBe(authoredPath);
    expect(
      screen.getByRole("button", {
        name: runtime.t("projects:addDialog.actions.pickFolder"),
      }),
    ).toBe(confirm);
    expect(dialog.textContent).not.toMatch(/projects:addDialog|error_kind|—/u);
  });

  it("disables the confirm with nothing to add and renders only closed localized issues", () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <MenuTestProviders client={createMenuTestQueryClient()}>
          <AddProjectDialog />
        </MenuTestProviders>
      </I18nextProvider>,
    );
    act(openAddProjectDialog);

    // The confirm stays disabled until a folder is selected or entered.
    expect(
      (
        screen.getByRole("button", {
          name: runtime.t("projects:addDialog.actions.pickFolder"),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    // Only supported issue messages render.
    act(() => setAddProjectIssue("unrecognized issue"));
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => setAddProjectIssue("notGitProject"));
    expect(screen.getByRole("alert").textContent).toBe(
      runtime.t("projects:addDialog.errors.notGitProject"),
    );
    act(() => setAddProjectIssue("alreadyAdded"));
    expect(screen.getByRole("alert").textContent).toBe(
      runtime.t("projects:addDialog.errors.alreadyAdded"),
    );
    expect(screen.getByRole("alert").textContent).not.toContain("already_registered");
  });

  it("wraps the longest localized recovery in the compact footer", async () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <MenuTestProviders client={createMenuTestQueryClient()}>
          <AddProjectDialog />
        </MenuTestProviders>
      </I18nextProvider>,
    );
    act(openAddProjectDialog);
    await act(async () => runtime.changeLanguage(ltrTestLocale));
    act(() => setAddProjectIssue("folderUnavailable"));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(
      ltrTestResources.projects.addDialog.errors.folderUnavailable,
    );
    expect(alert.className).toContain("break-words");
    expect(alert.className).not.toContain("truncate");
    expect(alert.parentElement?.parentElement?.className).toContain("flex-col");
    expect(alert.parentElement?.parentElement?.className).toContain("sm:flex-row");
  });

  it("keeps pending copy active through a real rejected registration", async () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <MenuTestProviders client={createMenuTestQueryClient()}>
          <AddProjectDialog />
        </MenuTestProviders>
      </I18nextProvider>,
    );
    act(openAddProjectDialog);
    const availablePath = resolve(tmpdir());
    const confirmName = runtime.t("projects:addDialog.actions.pickFolder");
    const pathInput = screen.getByRole("textbox", {
      name: runtime.t("projects:addDialog.accessibility.folderPath"),
    });
    fireEvent.change(pathInput, { target: { value: availablePath } });
    fireEvent.keyDown(pathInput, { key: "Enter" });
    // The confirm label is static ("Pick folder"); the typed path resolving is
    // signalled by the button becoming enabled, so wait on that before clicking.
    await waitFor(
      () =>
        expect(
          (screen.getByRole("button", { name: confirmName }) as HTMLButtonElement)
            .disabled,
        ).toBe(false),
      ENGINE_WAIT,
    );
    fireEvent.click(screen.getByRole("button", { name: confirmName }));
    const dialog = screen.getByRole("dialog");
    const adding = screen.getByRole("button", {
      name: runtime.t("projects:addDialog.actions.adding"),
    }) as HTMLButtonElement;
    const cancel = screen.getByRole("button", {
      name: runtime.t("common:actions.cancel"),
    }) as HTMLButtonElement;
    const close = screen.getByRole("button", {
      name: runtime.t("common:actions.close"),
    }) as HTMLButtonElement;
    const filter = screen.getByRole("textbox", {
      name: runtime.t("projects:folderBrowser.accessibility.filterFolders"),
    }) as HTMLInputElement;
    const hidden = screen.getByRole("switch", {
      name: runtime.t("projects:folderBrowser.accessibility.showHiddenFolders"),
    }) as HTMLButtonElement;
    const submittedPath = (pathInput as HTMLInputElement).value;

    expect(adding.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
    expect(close.disabled).toBe(true);
    expect((pathInput as HTMLInputElement).disabled).toBe(true);
    expect(filter.disabled).toBe(true);
    expect(hidden.disabled).toBe(true);
    const places = dialog.querySelectorAll<HTMLButtonElement>(
      "[data-picker-places-rail] button",
    );
    expect(places.length).toBeGreaterThan(0);
    for (const place of places) {
      expect(place.disabled).toBe(true);
      fireEvent.click(place);
    }
    for (const row of screen.queryAllByRole("option")) {
      expect((row as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(row);
    }
    const ancestors = dialog.querySelectorAll<HTMLButtonElement>(
      "nav[aria-label='Breadcrumb'] button",
    );
    expect(ancestors.length).toBeGreaterThan(0);
    for (const ancestor of ancestors) {
      expect(ancestor.disabled).toBe(true);
      fireEvent.click(ancestor);
    }
    fireEvent.change(pathInput, { target: { value: "C:/changed" } });
    fireEvent.change(filter, { target: { value: "changed" } });
    fireEvent.click(hidden);
    fireEvent.click(adding);
    fireEvent.click(cancel);
    fireEvent.click(close);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect((pathInput as HTMLInputElement).value).toBe(submittedPath);
    expect(adding.disabled).toBe(true);
    await waitFor(
      () =>
        expect(screen.getByRole("alert").textContent).toBe(
          runtime.t("projects:addDialog.errors.notGitProject"),
        ),
      ENGINE_WAIT,
    );
    expect(
      (screen.getByRole("button", { name: confirmName }) as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: runtime.t("common:actions.cancel") }),
    );
    act(openAddProjectDialog);
    // Reopening starts with no folder selected or entered.
    expect(
      (
        screen.getByRole("button", {
          name: runtime.t("projects:addDialog.actions.pickFolder"),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
